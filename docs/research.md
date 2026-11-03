# Research and Gap Analysis

_Researched 2026-11-02. GitHub numbers were pulled from the GitHub API that day._

VaMusic sits between two groups of projects, and is a weak member of both today:

1. **Sample and teaching databases** (Chinook, Sakila/Pagila, the MySQL Employees DB): schemas
   people use to learn and demo SQL.
2. **Self-hosted music servers** (Navidrome, Koel, Ampache, gonic, Jellyfin, Funkwhale): apps
   people use to stream their own libraries.

The goal is for it to be the best project in a category neither group covers: **a modern,
production-shaped database for a streaming product, with an interface that shows how the
database works.**

## 1. Comparison

| Project | What it is | License | Stars | Last push | Database story | Weakness for our purpose |
| :-- | :-- | :-- | --: | :-- | :-- | :-- |
| [Chinook](https://github.com/lerocha/chinook-database) | Digital media store sample DB | Custom (NOASSERTION) | 2,629 | 2025-10 | 11 tables, no procedural logic | Dated 2008 design, no events or time series, no app, no modern features |
| [Pagila](https://github.com/devrimgunduz/pagila) | Postgres port of Sakila (DVD rental) | PostgreSQL | 1,141 | 2026-11 | Partitioning, FTS, triggers | DVD-rental domain; no app or UI; nothing on vectors or security |
| [jOOQ/sakila](https://github.com/jOOQ/sakila) | Sakila for many engines | BSD-2 | 543 | 2026-04 | Multi-engine DDL | 2005 domain, no UI |
| [datacharmer/test_db](https://github.com/datacharmer/test_db) | MySQL Employees DB | none | 4,449 | 2026-04 | Large data volume | HR domain, no app, no license |
| [Navidrome](https://github.com/navidrome/navidrome) | Self-hosted music server | GPL-3.0 | 24,488 | 2026-11 | SQLite, hidden behind the app | Not designed to teach or expose its data model |
| [Koel](https://github.com/koel/koel) | Self-hosted music server, polished web UI | MIT | 17,327 | 2026-11 | MySQL/Postgres via Laravel ORM | ORM-centric; database features aren't the point |
| [Ampache](https://github.com/ampache/ampache) | Long-running music server | AGPL-3.0 | 3,842 | 2026-11 | MySQL | Dated UI |
| [gonic](https://github.com/sentriz/gonic) | Lightweight Subsonic server | GPL-3.0 | 2,643 | 2026-11 | SQLite | Headless; no UI of its own |
| [Jellyfin](https://github.com/jellyfin/jellyfin) | Full media server | GPL-2.0 | 58,929 | 2026-11 | SQLite | Huge scope; music is secondary |
| [Funkwhale](https://www.funkwhale.audio/) | Federated (ActivityPub) audio platform | AGPL-3.0 | (GitLab) | active | Postgres via Django | Heavy to run (2–4 GB RAM), federation focus |

What the comparison shows:

- **The teaching databases are old.** Chinook dates from 2008 and Sakila from 2005. Neither
  models event streams, time series, recommendations, search relevance, row-level security or
  vectors, which is what streaming products run on today
  ([mindweave](https://mindweave-tech.pages.dev/blog/best-sample-databases-for-learning-sql),
  [Dataedo](https://dataedo.com/kb/databases/postgresql/sample-databases)).
- **None of the teaching databases ships with an app**, so learners can't see how a real UI
  action becomes SQL.
- **The music servers are good products, but their databases are hidden.** Navidrome is praised
  for being a light Go binary on SQLite, and Koel for its web UI
  ([selfhosting.sh](https://dev.to/selfhostingsh/navidrome-vs-funkwhale-which-music-server-1k79),
  [Quick Picks](https://dev.to/selfhostingsh/music-streaming-3ghb)). Nobody learns database
  design from them, and VaMusic shouldn't try to out-feature them as a music server.

## 2. Unmet needs

| # | Need | Evidence | How VaMusic can answer it |
| :-- | :-- | :-- | :-- |
| N1 | A sample database that looks like a 2026 product, not a 2005 store | Sakila 2005, Chinook 2008; people building their own replacements ("Bluebox") | Streaming domain with events, rollups, search, recommendations and security |
| N2 | Seeing what SQL a UI action runs, and how the planner executes it | No teaching DB ships an app | A "SQL Lens" panel showing the statement, the triggers that fired and the `EXPLAIN ANALYZE` plan |
| N3 | Trying a schema without installing a database | Every sample DB needs a local server | Run the real schema in the browser with [PGlite](https://github.com/electric-sql/pglite) (Postgres compiled to WASM, 16k★, Apache-2.0, supports pgvector) |
| N4 | Learning vector search next to relational data, not in a separate vector DB | pgvector has 23.6k★; hybrid filter + similarity queries are a known pain that 0.8's iterative scans address ([Crunchy Data](https://www.crunchydata.com/blog/hybrid-vector-search), [PGXN](https://pgxn.org/dist/vector/0.8.0/README.html)) | "Sounds like" recommendations and hybrid search in plain SQL |
| N5 | Worked examples of row-level security done right | Common mistakes: running as table owner, missing `WITH CHECK`, stale session settings under pooling ([AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html), [Substack deep dive](https://skylinecodes.substack.com/p/how-to-architect-a-multi-tenant-saas)) | Per-listener RLS on playlists, likes and history, with tests that prove isolation |
| N6 | Realistic data volume for index and plan experiments | Small seeds make every plan a sequential scan | Deterministic generator: thousands of tracks, ~1M listening events |

## 3. Current database practice that's worth showing

| Technology | Status (Nov 2026) | Use in VaMusic | Source |
| :-- | :-- | :-- | :-- |
| **PostgreSQL 18** | Released Sept 2025 | Target engine | [Neon](https://neon.com/postgresql/postgresql-18-new-features), [Better Stack](https://betterstack.com/community/guides/databases/postgresql-18-new-features/) |
| ↳ Asynchronous I/O (`io_method`) | New in 18; reported 2–3× faster reads from storage | Benchmark section in docs | [Pulse](https://pulse.support/kb/postgresql-18-release-notes) |
| ↳ `uuidv7()` | Native in 18; time-ordered, index-friendly | Public IDs for tracks, playlists, users | [Neon](https://neon.com/postgresql/18-new-features) |
| ↳ Virtual generated columns | Default kind in 18 | e.g. derived duration labels; stored columns for indexed `tsvector` | [Neon](https://neon.com/postgresql/postgresql-18-new-features) |
| Declarative partitioning + BRIN | Mature | Monthly partitions for listening events | Postgres docs |
| Materialized views, `REFRESH … CONCURRENTLY` | Mature | Trending and analytics rollups instead of per-insert trigger scans | Postgres docs |
| **pgvector 0.8** (HNSW, iterative scans) | Mature, widely hosted | Track similarity and hybrid search | [PGXN](https://pgxn.org/dist/vector/0.8.0/), [ClickHouse guide](https://clickhouse.com/resources/engineering/scale-vector-search-postgres) |
| Full-text search + `pg_trgm` | Mature | Typo-tolerant search across tracks, artists, albums | Postgres docs |
| Row-level security | Mature | Listener data isolation | [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html) |
| **PGlite** | Alpha, single connection, IndexedDB persistence | Zero-install demo on GitHub Pages | [GitHub](https://github.com/electric-sql/pglite), [Lantern](https://lantern.dev/blog/pglite-lantern) |
| Transformers.js embeddings | Runs `all-MiniLM-L6-v2` in the browser, no API key | Optional semantic search over titles and descriptions | [LangChain](https://docs.langchain.com/oss/javascript/integrations/embeddings/transformers), [HF forum](https://discuss.huggingface.co/t/different-embeddings-when-using-sentence-transformers-and-transformers-js/73345/5) |
| pg_duckdb (DuckDB inside Postgres) | 3.3k★, MIT, early (0.x) | Stretch goal only: columnar analytics; not available in PGlite | [GitHub](https://github.com/duckdb/pg_duckdb), [i-programmer](https://www.i-programmer.info/news/84-database/17611-duckdb-and-hydra-partner-to-get-duckdb-into-postgresql-.html) |
| TimescaleDB | Continuous aggregates are under the source-available TSL license | **Not used**: license restricts hosting, and plain partitioning + materialized views teach the same ideas | [Tiger Data](https://www.tigerdata.com/docs/get-started/choose-your-path/timescaledb-editions), [DEV](https://dev.to/okedialf/what-the-timescale-license-means-for-database-administrators-in-the-cloud-era-1h82) |

### MySQL vs PostgreSQL for this project

The project is MySQL today. MySQL 9 added a `VECTOR` type, but it's described as a
first-generation implementation: vectors can't be keys, many functions aren't allowed, and 9.0.0
was pulled for a critical bug ([Bytebase](https://www.bytebase.com/blog/what-is-new-in-mysql-9/),
[Heise](https://heise.de/en/news/MySQL-9-0-JavaScript-commands-and-a-new-vector-type-9789785.html),
[Kitemetric](https://kitemetric.com/blogs/what-s-new-in-mysql-9-a-dba-s-deep-dive)).
There is no MySQL engine that runs in a browser.

PostgreSQL 18 covers every item in the table above, and PGlite means the same SQL files can power
both the Docker setup and a zero-install web demo. **Recommendation: move to PostgreSQL 18** and
keep the original MySQL schema, with its bugs fixed, under `legacy/mysql/` so the course
submission stays runnable.

## 4. How well-loved projects present themselves

- **Koel**: a polished screenshot first, then a one-line pitch, a live demo link, and a short
  install section.
- **Navidrome**: a docs site separate from the README, a features grid, and a demo server.
- **PGlite and pgvector**: the README gets to a working code snippet within the first screen.
- **Common pattern**: one-sentence pitch → hero image or GIF → "try it now" link → three to six
  feature bullets → quickstart under a minute → links out to docs.

VaMusic should follow the same shape: hero GIF of the UI, a "Try it in your browser" link (PGlite
demo), a feature grid that leads with database features, and a `docker compose up` quickstart.

## 5. Sources

- Neon, "PostgreSQL 18 new features": https://neon.com/postgresql/postgresql-18-new-features
- Neon, PG18 features index: https://neon.com/postgresql/18-new-features
- Better Stack, "PostgreSQL 18 new features": https://betterstack.com/community/guides/databases/postgresql-18-new-features/
- Pulse, "PostgreSQL 18 release notes": https://pulse.support/kb/postgresql-18-release-notes
- PGXN, pgvector 0.8.0: https://pgxn.org/dist/vector/0.8.0/ and https://pgxn.org/dist/vector/0.8.0/README.html
- Crunchy Data, "Hybrid search patterns with Postgres and pgvector": https://www.crunchydata.com/blog/hybrid-vector-search
- ClickHouse, "How to scale vector search in Postgres": https://clickhouse.com/resources/engineering/scale-vector-search-postgres
- ElectricSQL, PGlite: https://github.com/electric-sql/pglite
- Lantern, "PGlite + Lantern": https://lantern.dev/blog/pglite-lantern
- Bytebase, "What's new in MySQL 9": https://www.bytebase.com/blog/what-is-new-in-mysql-9/
- Heise, "MySQL 9.0: JavaScript commands and a new vector type": https://heise.de/en/news/MySQL-9-0-JavaScript-commands-and-a-new-vector-type-9789785.html
- Kitemetric, "What's new in MySQL 9 – a DBA's deep dive": https://kitemetric.com/blogs/what-s-new-in-mysql-9-a-dba-s-deep-dive
- Mindweave, "The 7 best sample databases for learning SQL in 2026": https://mindweave-tech.pages.dev/blog/best-sample-databases-for-learning-sql
- Dataedo, "Sample PostgreSQL databases": https://dataedo.com/kb/databases/postgresql/sample-databases
- selfhosting.sh, "Navidrome vs Funkwhale": https://dev.to/selfhostingsh/navidrome-vs-funkwhale-which-music-server-1k79
- selfhosting.sh, "Music streaming quick picks": https://dev.to/selfhostingsh/music-streaming-3ghb
- AWS Prescriptive Guidance, RLS recommendations: https://docs.aws.amazon.com/prescriptive-guidance/latest/saas-multitenant-managed-postgresql/rls.html
- Skyline Codes, "Multi-tenant SaaS with PostgreSQL RLS": https://skylinecodes.substack.com/p/how-to-architect-a-multi-tenant-saas
- DuckDB, pg_duckdb: https://github.com/duckdb/pg_duckdb
- i-programmer, "DuckDB and Hydra partner": https://www.i-programmer.info/news/84-database/17611-duckdb-and-hydra-partner-to-get-duckdb-into-postgresql-.html
- Tiger Data, TimescaleDB editions: https://www.tigerdata.com/docs/get-started/choose-your-path/timescaledb-editions
- DEV, "What the Timescale license means": https://dev.to/okedialf/what-the-timescale-license-means-for-database-administrators-in-the-cloud-era-1h82
- LangChain, Transformers.js embeddings: https://docs.langchain.com/oss/javascript/integrations/embeddings/transformers
- Hugging Face forum, JS vs Python embeddings: https://discuss.huggingface.co/t/different-embeddings-when-using-sentence-transformers-and-transformers-js/73345/5
- GitHub API repository metadata for every project in §1 (stars, license, last push), fetched 2026-11-02.
