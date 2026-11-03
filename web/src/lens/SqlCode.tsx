import { Fragment, type ReactNode } from "react";

const KEYWORDS = new Set(
  `select from where and or not in is null as join left right inner full cross lateral on using
  group by order limit offset having with union all distinct insert into values update set delete
  returning case when then else end exists cast coalesce array unnest ordinality conflict do nothing
  begin commit rollback savepoint release role local true false asc desc nulls last first over
  partition filter within explain analyze buffers format json`
    .split(/\s+/)
    .filter(Boolean),
);

const TOKEN =
  /(--[^\n]*)|('(?:[^']|'')*')|(\$\d+|%\([a-z_]+\)s)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_.]*)|(\s+|.)/g;

/** Minimal SQL highlighting: keywords, strings, parameters, numbers and comments. */
export function SqlCode({ sql, className }: { sql: string; className?: string }) {
  const parts: ReactNode[] = [];
  let key = 0;
  for (const m of sql.matchAll(TOKEN)) {
    const [text, comment, str, param, num, word] = m;
    if (comment)
      parts.push(
        <span key={key++} className="text-faint italic">
          {comment}
        </span>,
      );
    else if (str)
      parts.push(
        <span key={key++} className="text-good">
          {str}
        </span>,
      );
    else if (param)
      parts.push(
        <span key={key++} className="rounded bg-accent-soft px-0.5 text-accent">
          {param}
        </span>,
      );
    else if (num)
      parts.push(
        <span key={key++} className="text-warn">
          {num}
        </span>,
      );
    else if (word && KEYWORDS.has(word.toLowerCase()))
      parts.push(
        <span key={key++} className="font-semibold text-accent">
          {word}
        </span>,
      );
    else parts.push(<Fragment key={key++}>{text}</Fragment>);
  }
  return (
    <pre
      className={`overflow-x-auto rounded-xl bg-sunk p-3 font-mono text-[0.75rem] leading-relaxed text-ink ${className ?? ""}`}
    >
      <code>{parts}</code>
    </pre>
  );
}
