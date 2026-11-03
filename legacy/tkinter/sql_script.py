# sql_script.py
"""
Split a MySQL script into individual statements the way the `mysql` command-line client does.

Handles `DELIMITER` directives, quoted strings and identifiers, and `--`, `#` and `/* */`
comments, so trigger and routine bodies containing `;` stay intact.
"""


def split_mysql_script(text):
    """Return the list of statements in `text`, without their delimiters."""
    statements = []
    delimiter = ";"
    buf = []
    i = 0
    n = len(text)
    at_line_start = True

    while i < n:
        # DELIMITER directive: only recognised at the start of a line
        if at_line_start:
            j = i
            while j < n and text[j] in " \t":
                j += 1
            if text[j:j + 9].upper() == "DELIMITER" and j + 9 < n and text[j + 9] in " \t":
                end = text.find("\n", j)
                end = n if end == -1 else end
                delimiter = text[j + 9:end].strip()
                i = end + 1
                continue

        ch = text[i]
        at_line_start = ch == "\n"

        # Comments
        if text.startswith("--", i) and (i + 2 >= n or text[i + 2] in " \t\r\n"):
            end = text.find("\n", i)
            i = n if end == -1 else end
            continue
        if ch == "#":
            end = text.find("\n", i)
            i = n if end == -1 else end
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue

        # Quoted strings and identifiers
        if ch in ("'", '"', "`"):
            j = i + 1
            while j < n:
                if text[j] == "\\" and ch != "`":
                    j += 2
                    continue
                if text[j] == ch:
                    if j + 1 < n and text[j + 1] == ch:  # doubled quote
                        j += 2
                        continue
                    break
                j += 1
            buf.append(text[i:j + 1])
            i = j + 1
            continue

        # Delimiter
        if text.startswith(delimiter, i):
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += len(delimiter)
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements
