---
title: Recommendations
description: Audio-feature vectors, centred cosine similarity and an HNSW index in pgvector.
sidebar:
  order: 5
---

"Sounds like this" and "Made for you" both come from vectors stored next to each track and
searched with [pgvector](https://github.com/pgvector/pgvector).

## Audio-feature vectors

Each track has an 8-dimension `vector` of audio features between 0 and 1: energy, valence,
danceability, acousticness, instrumentalness, speechiness, liveness and tempo. The data
generator scatters tracks around a centre for each genre, so tracks that are close in this space
sound alike. In the browser demo, the music you hear is generated from the same numbers.

## Why "centred" cosine

Cosine similarity compares the directions of two vectors. When every coordinate is between 0 and
1, every vector points into the same corner of the space, so no two tracks can be opposites and
every neighbour scored about 99%.

Migration 0010 measures vectors from the neutral point 0.5 instead:

```sql
CREATE FUNCTION centred(v vector) RETURNS vector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN v - '[0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5]'::vector;
```

Now "loud and electronic" and "quiet and acoustic" point in opposite directions, similarity
uses the whole range from -1 to 1, and neighbours' scores spread out.

## The index

```sql
CREATE INDEX track_features_centred_hnsw ON track
    USING hnsw ((centred(features)::vector(8)) vector_cosine_ops);
```

An HNSW index is a layered graph that finds approximate nearest neighbours without comparing
against every track. Two details matter:

- It's an **expression index**, so queries must order by exactly
  `centred(features)::vector(8) <=> ...` for the planner to use it.
- The `::vector(8)` cast is needed because pgvector requires a known dimension to build the
  index, and PostgreSQL drops type modifiers from function results.

A test checks that `similar_tracks()` uses the index rather than scanning the table.

## Sounds like this

`similar_tracks(track_id, limit)` is a single nearest-neighbour query on that index, returning
`1 - cosine distance` as the similarity.

## Made for you

`recommend_tracks(user_id, limit)` builds a **taste vector**: the average of the tracks the
listener liked plus everything they played in the last 90 days, centred. It then:

1. pulls the nearest tracks to that vector through the index;
2. skips tracks the listener already likes or played in the last 30 days;
3. ranks the rest mostly by similarity, with a small boost for popular tracks.

Step 2 can discard many candidates, and an approximate index normally returns a fixed number
of them. The function sets pgvector's `hnsw.iterative_scan = relaxed_order` so the index keeps
producing candidates until enough survive the filter. Listeners with no history get trending
tracks instead.
