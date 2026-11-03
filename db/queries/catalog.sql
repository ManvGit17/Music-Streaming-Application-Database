-- name: genres
SELECT g.genre_id AS id, g.name, g.description, g.hue, count(t.track_id) AS tracks
FROM vamusic.genre g
LEFT JOIN vamusic.album al USING (genre_id)
LEFT JOIN vamusic.track t ON t.album_id = al.album_id
GROUP BY g.genre_id
ORDER BY tracks DESC, g.name;

-- name: search
-- Hybrid search: prefix full-text and strict trigram rankings, fused with RRF.
SELECT c.*, s.score, s.lexical_rank, s.fuzzy_rank
FROM vamusic.search_tracks(:q, :limit) s
JOIN vamusic.track_card c USING (track_id)
ORDER BY s.score DESC, c.track_id;

-- name: trending
-- Time-decayed trending, precomputed in a materialized view.
SELECT c.*, tt.score::float8 AS score, 'trending' AS reason
FROM vamusic.trending_track tt
JOIN vamusic.track_card c USING (track_id)
WHERE CAST(:genre AS integer) IS NULL OR c.genre_id = CAST(:genre AS integer)
ORDER BY tt.rank
LIMIT :limit;

-- name: track
SELECT c.* FROM vamusic.track_card c WHERE c.id = CAST(:id AS uuid);

-- name: similar
-- Nearest neighbours by audio features, through the HNSW index.
SELECT c.*, s.similarity AS score, 'sounds like' AS reason
FROM vamusic.track src
CROSS JOIN LATERAL vamusic.similar_tracks(src.track_id, :limit) s
JOIN vamusic.track_card c ON c.track_id = s.track_id
WHERE src.public_id = CAST(:id AS uuid)
ORDER BY s.similarity DESC;

-- name: top_artists
SELECT d.public_id AS id, d.name, ar.bio, ar.country, d.is_verified AS verified, ar.hue,
       d.monthly_listeners, d.followers, d.total_plays,
       EXISTS (SELECT 1 FROM vamusic.artist_follow f
               WHERE f.user_id = vamusic.current_user_id() AND f.artist_id = d.artist_id)
           AS following
FROM vamusic.artist_dashboard d
JOIN vamusic.artist ar USING (artist_id)
ORDER BY d.monthly_listeners DESC, d.total_plays DESC
LIMIT :limit;

-- name: artist
SELECT d.artist_id, d.public_id AS id, d.name, ar.bio, ar.country, d.is_verified AS verified,
       ar.hue, d.monthly_listeners, d.followers, d.total_plays,
       EXISTS (SELECT 1 FROM vamusic.artist_follow f
               WHERE f.user_id = vamusic.current_user_id() AND f.artist_id = d.artist_id)
           AS following
FROM vamusic.artist_dashboard d
JOIN vamusic.artist ar USING (artist_id)
WHERE d.public_id = CAST(:id AS uuid);

-- name: artist_top_tracks
SELECT c.* FROM vamusic.track_card c
WHERE c.artist_id = :artist_id
ORDER BY c.plays DESC, c.track_id
LIMIT 10;

-- name: artist_albums
SELECT al.public_id AS id, al.title, al.album_type, al.release_date, al.label, al.cover_seed,
       g.name AS genre,
       jsonb_build_object('id', ar.public_id, 'name', ar.name, 'hue', ar.hue) AS artist
FROM vamusic.album al
JOIN vamusic.artist ar USING (artist_id)
LEFT JOIN vamusic.genre g USING (genre_id)
WHERE al.artist_id = :artist_id
ORDER BY al.release_date DESC NULLS LAST;

-- name: album
SELECT al.album_id, al.public_id AS id, al.title, al.album_type, al.release_date, al.label,
       al.cover_seed, g.name AS genre,
       jsonb_build_object('id', ar.public_id, 'name', ar.name, 'hue', ar.hue) AS artist
FROM vamusic.album al
JOIN vamusic.artist ar USING (artist_id)
LEFT JOIN vamusic.genre g USING (genre_id)
WHERE al.public_id = CAST(:id AS uuid);

-- name: album_tracks
SELECT c.* FROM vamusic.track_card c
WHERE c.album_id = :album_id
ORDER BY c.disc_number, c.track_number;
