---
title: Generating data
description: The deterministic data generator, its scales and how the demo dataset is exported.
sidebar:
  order: 3
---

A database design only proves itself with data in it. VaMusic's generator produces a realistic
catalog and listening history from a fixed seed, so every run, test and screenshot sees the same
data.

## Scales

| Scale | Artists | Listeners | Listening events | Used for |
| :-- | --: | --: | --: | :-- |
| `tiny` | 30 | 60 | 6,000 | Tests and quick local runs |
| `web` | 100 | 250 | 20,000 | The in-browser demo |
| `demo` | 120 | 400 | 60,000 | `docker compose up` |
| `full` | 220 | 5,000 | 1,000,000 | Benchmarks |

```bash
uv run vamusic seed --scale demo           # load into an empty database
uv run vamusic seed --scale full --seed 7  # a different, equally reproducible world
```

`seed` refuses to load into a database that already has data; `--if-empty` makes that a quiet
success, which is what Compose uses.

## What it generates

- Genres with a colour and a centre in audio-feature space. Artists and tracks scatter around
  their genre's centre, so vector similarity finds tracks that belong together.
- Listeners with a few favourite genres, an activity level and a preferred time of day.
- Popularity within a genre that follows a Zipf curve, plus a handful of tracks that go viral in
  the final weeks, so "trending" differs from "most played of all time".
- An 18-month history in which traffic grows over time and about a third of plays are skips.
- Subscriptions, payments, likes, follows and playlists.
- The catalog and accounts from the original 2025 project, such as `john_doe`, so the old
  examples still work. Every other name is assembled from word lists; no real artists, songs or
  people are used.

All passwords are `vamusic`, stored as bcrypt hashes. The data is loaded with `COPY`, which also
exercises the statement-level counter triggers at full speed.

## The browser dataset

```bash
uv run vamusic export --scale web --out web/public/seed
```

This writes one gzipped `COPY` file per table and a `manifest.json` listing tables, columns and
row counts. The browser loads exactly these files. The export is byte-for-byte reproducible: the
bcrypt salt and gzip timestamps are fixed, so rebuilding the site doesn't change the dataset's
hash or force visitors to rebuild their local database.
