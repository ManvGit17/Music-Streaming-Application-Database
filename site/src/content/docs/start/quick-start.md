---
title: Quick start
description: Run VaMusic in the browser, with Docker, or from source.
sidebar:
  order: 2
---

## In the browser

Open the [live demo](https://manvgit17.github.io/Music-Streaming-Application-Database/) and
choose **Explore as a listener**.

On the first visit the app downloads PostgreSQL as WebAssembly (a few megabytes), applies the
migrations and loads about 20,000 listening events. That takes a few seconds and the progress is
shown on screen. The database is then kept in your browser's IndexedDB, so later visits start
almost instantly. It's rebuilt automatically when a new version changes the schema or the data.

Everything you do stays in your browser. Nothing is sent anywhere.

## With Docker

You need Docker with Compose.

```bash
git clone https://github.com/ManvGit17/Music-Streaming-Application-Database.git vamusic
cd vamusic
docker compose up
```

This starts PostgreSQL 18 with pgvector, applies the migrations, loads a reproducible dataset
(400 listeners, about 2,000 tracks, 60,000 plays) and serves the API on
<http://localhost:8000>. The interactive API docs are at <http://localhost:8000/docs>.

If port 8000 is taken, copy `.env.example` to `.env` and set `API_PORT`.

Try a search with its plan:

```bash
curl "http://localhost:8000/api/search?q=midnite%20tran&lens=plan"
```

Then sign in and ask for recommendations:

```bash
TOKEN=$(curl -s http://localhost:8000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"login": "john_doe", "password": "vamusic"}' | jq -r .token)

curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/me/recommendations?limit=5"
```

## Demo accounts

Every account in the generated dataset uses the password `vamusic`.

| Username | Role | Notes |
| :-- | :-- | :-- |
| `john_doe` | listener | Rock and pop, plays daily |
| `jane_smith` | listener | Different taste, so different recommendations |
| `admin` | admin | The admin workspace: audit log, partitions and rollups |

In the browser demo, **Explore as a listener** signs you in as `john_doe`. The sign-in page
offers all three accounts with one click.

## The web app from source

You need Node 24 and [uv](https://docs.astral.sh/uv/).

```bash
cd web
npm install
npm run seed     # generate the demo dataset into web/public/seed
npm run dev      # http://localhost:5173
```

By default the app runs the database in the browser. To use the API from Docker instead:

```bash
VITE_API_URL=http://localhost:8000 npm run dev
```
