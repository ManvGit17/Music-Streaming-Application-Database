---
title: Search
description: Prefix full-text search and trigram matching, fused with Reciprocal Rank Fusion.
sidebar:
  order: 4
---

Search has to work while you're still typing and when you misspell things. VaMusic runs two
rankings over the same documents and combines them with **Reciprocal Rank Fusion** (RRF), all in
one SQL function, `search_tracks(query, limit)`.

## The documents

The `catalog_search` materialized view holds one row per track with:

- a weighted `tsvector`: title (weight A), artists (B), album (C) and genre (D);
- a plain "haystack" string of the same text, for trigram matching.

Both are built from `fold()`, an `IMMUTABLE` wrapper that lower-cases and strips accents with
`unaccent`, so `Beyoncé` and `beyonce` match. Being immutable is what lets it appear in index
expressions.

## Two rankings

**Lexical.** Each word of the query becomes a prefix term, so `midnite tran` becomes
`'midnite':* & 'tran':*` (the `simple` configuration, so no stemming). This finds partial words
as you type, and `ts_rank_cd` orders the matches using the weights above.

**Fuzzy.** `strict_word_similarity` from pg_trgm compares the query with the haystack and the
title (title matches count double). The threshold is lowered from the default 0.5 to 0.3 so a
one-letter typo still matches. This survives typos that full-text
search can't, like `midnite` for "Midnight".

## Fusing them

Scores from the two rankers aren't comparable, so RRF ignores them and uses positions:

```
score = 1 / (60 + lexical_rank) + 1 / (60 + fuzzy_rank)
```

A track near the top of either list scores well; one near the top of both scores best. The
constant 60 is the value from the original RRF paper and damps the difference between first
and second place. The function also returns each rank, so the app and the API show which
ranker found a result.

Try it in the demo: search for `midnite tran` and open the SQL Lens.

## A bug the tests caught

The first version used plain `word_similarity`, which matches the best _fragment_ of the
haystack. "midnite tran" then ranked a track whose haystack contained "…bright kite, midnight
kite…" above "Midnight Train". `strict_word_similarity` only compares whole-word extents, which
fixed it, and a test now pins the expected order.
