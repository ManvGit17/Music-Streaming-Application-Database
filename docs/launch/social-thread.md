# X and LinkedIn drafts

_Attach `docs/assets/demo.webp` (convert to MP4 or GIF if the platform needs it) to the first
post, and screenshots to the others where noted._

---

## X thread

**1/**
I rebuilt my university database project, a music streaming app, on PostgreSQL 18.

The demo runs the real database in your browser, and every screen shows you the SQL behind it.

https://manvgit17.github.io/Music-Streaming-Application-Database/

[demo animation]

**2/**
The SQL Lens lists every statement a screen ran: parameters, timing, the EXPLAIN ANALYZE plan,
and the triggers that fired.

Play a song and watch the counter trigger. Search "midnite tran" and see which ranking found
"Midnight Train".

[lens.webp]

**3/**
Play counts used to be row triggers that re-scanned history on every insert.

Now they're statement-level triggers over transition tables. A 10k-row insert into a 1M-row
history: 13.7 s → 0.19 s. Measured, not guessed.

**4/**
Recommendations use pgvector with an HNSW index.

My first version scored every neighbour ~99%. All-positive vectors all point the same way, so
cosine can't separate them. Measuring from the midpoint fixed it.

[now-playing.webp]

**5/**
Every request runs as a database role, and row-level security decides what it can see.

Tests that tried to break it found a real hole: per-schema ALTER DEFAULT PRIVILEGES can't
revoke from PUBLIC.

**6/**
No server for the demo: PGlite (Postgres in WebAssembly) applies the same migrations and runs
the same SQL files as the API.

Code is MIT. Good first issues are listed if you'd like to help.
https://github.com/ManvGit17/Music-Streaming-Application-Database

---

## LinkedIn post

I rebuilt my DBMS course project from last year, and learned more from the rebuild than from
the original.

VaMusic started as a MySQL schema with two desktop apps. When I audited it properly, the
listener app didn't start, no sample user could log in, likes lived in two tables that
disagreed, and the trending page went blank a week after loading the data. None of it showed up
in a demo.

Version 2 runs on PostgreSQL 18 and puts the work in the database:

• A monthly-partitioned listening history with a BRIN index
• Counters maintained by statement-level triggers: a 10,000-row insert into a million-row
  history went from 13.7 s to 0.19 s
• Hybrid search that tolerates typos (full text + trigram, fused with Reciprocal Rank Fusion)
• Recommendations from audio-feature vectors with pgvector
• Row-level security on every per-user table, verified by tests that attack it

The demo needs no install. It runs PostgreSQL in the browser via WebAssembly, and a "SQL Lens"
shows the queries, plans and triggers behind every screen.

Demo: https://manvgit17.github.io/Music-Streaming-Application-Database/
Code: https://github.com/ManvGit17/Music-Streaming-Application-Database

The original version was built with Lohith Anand. Feedback welcome, especially on the schema.

#PostgreSQL #Databases #WebAssembly #OpenSource
