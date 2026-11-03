# Show HN draft

_Post from the author's account. Show HN rules: it must be something people can
try, and the author should be around to answer comments._

---

**Title** (80 characters max):

> Show HN: A music streaming app built in PostgreSQL 18 that shows its SQL

**URL:** https://manvgit17.github.io/Music-Streaming-Application-Database/

**Text:**

> I rebuilt my database project, a MySQL music streaming app, on
> PostgreSQL 18. The demo runs the real database in your browser with PGlite (Postgres compiled
> to WebAssembly), using the same migration and query files as the FastAPI server.
>
> The part I think is most useful is the SQL Lens: a drawer that shows every statement the
> current screen ran, with parameters, timings, the EXPLAIN ANALYZE plan and the triggers that
> fired. The API returns the same with ?lens=plan.
>
> Database features doing real work: a monthly-partitioned event table with BRIN, play counters
> kept by statement-level triggers over transition tables (73x faster than the old row triggers
> for a 10k insert into a 1M-row history), hybrid search (full text + trigram, fused with RRF),
> pgvector HNSW recommendations, and row-level security on every per-user table.
>
> Things I learned the hard way: ALTER DEFAULT PRIVILEGES IN SCHEMA can't revoke from PUBLIC,
> cosine similarity on all-positive feature vectors makes every neighbour look 99% similar, and
> word_similarity matches fragments in ways that surprise you.
>
> It's a student project, not a production service, and I'd like to hear what I got wrong.
> Code (MIT): https://github.com/ManvGit17/Music-Streaming-Application-Database
