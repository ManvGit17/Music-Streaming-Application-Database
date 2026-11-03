# VaMusic v1 (legacy)

This folder holds the original 2025 DBMS mini project (PES University, UE23CS351A) by
**Manit V Urs** and **Lohith Anand**: a MySQL schema and two Tkinter desktop apps.

It is kept so the course submission still runs. Bugs that stopped it from working were fixed and
are covered by tests in [`tests/legacy`](../tests/legacy); nothing else about its design changed.
The modern version of the project lives in the repository root and runs on PostgreSQL 18.

| Path | What it is |
| :-- | :-- |
| `mysql/vamusic_v2.sql` | Schema, 8 triggers, 5 procedures, 4 functions, 3 views and sample data |
| `tkinter/vamusic_user_ui.py` | Listener app: browse, search, like, playlists, library |
| `tkinter/vamusic_admin_ui.py` | Admin app: CRUD and schema import |
| `tkinter/db_utils.py` | Shared connection and password helpers |
| `tkinter/sql_script.py` | `DELIMITER`-aware MySQL script splitter used by Import SQL |
| `VAMusic_Report.docx` | The course report |

## Running it

You need Python 3.12+ and MySQL 8.4 (or Docker).

```bash
docker run -d --name vamusic-mysql -e MYSQL_ROOT_PASSWORD=change-me -p 3306:3306 mysql:8.4
```

```bash
docker exec -i vamusic-mysql mysql -uroot -pchange-me < legacy/mysql/vamusic_v2.sql
```

```bash
pip install mysql-connector-python bcrypt
```

Set the connection through environment variables (PowerShell shown; use `export` on macOS/Linux):

```powershell
$env:VAMUSIC_DB_PASSWORD = "change-me"
python legacy/tkinter/vamusic_user_ui.py
```

Other variables: `VAMUSIC_DB_HOST` (default `localhost`), `VAMUSIC_DB_PORT` (`3306`),
`VAMUSIC_DB_USER` (`root`), `VAMUSIC_DB_NAME` (`vamusic`).

Every sample account (for example `john_doe`) uses the password **`vamusic`**.

## What was fixed

| Audit item | Fix |
| :-- | :-- |
| A1 | The listener app had a syntax error and didn't start. |
| A2 | Seed users had placeholder password hashes, so nobody could log in. |
| A3 | Import SQL cut every trigger and routine apart and reported success. |
| A4 | The MySQL password was hard-coded in the repository. |
| A6 | Adding a track to a playlist twice crashed the action. |
| A7 | Recommendations always showed tracks as liked. |
| D2 | New listeners were reported as "Music Master". |
| D3 | Monthly revenue was wrong after a year boundary. |
| D6 | Table-reading functions were declared `DETERMINISTIC`. |
| D8 | `create_helper_tables.py` was removed: the schema already creates those tables, and the script defined `PlaylistTrack` with a conflicting shape. |

Known limitations that were **not** changed here (they are addressed in the PostgreSQL version):
duplicate like/follow tables (D1), trending going empty after a week (D4), trigger write cost (D5),
no follow button in the UI (A9), no real audio (A10), and no admin login (A5). See
[`docs/audit.md`](../docs/audit.md) for the full list.
