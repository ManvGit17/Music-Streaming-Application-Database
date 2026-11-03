-- name: track_pk
SELECT track_id FROM vamusic.track WHERE public_id = CAST(:id AS uuid);

-- name: artist_pk
SELECT artist_id FROM vamusic.artist WHERE public_id = CAST(:id AS uuid);

-- name: likes
-- No user filter: row-level security only returns the caller's likes.
SELECT c.*
FROM vamusic.track_like lk
JOIN vamusic.track_card c ON c.track_id = lk.track_id
ORDER BY lk.liked_at DESC
LIMIT :limit;

-- name: like
INSERT INTO vamusic.track_like (user_id, track_id)
VALUES (vamusic.current_user_id(), :track_id)
ON CONFLICT DO NOTHING;

-- name: unlike
DELETE FROM vamusic.track_like WHERE track_id = :track_id;

-- name: follows
SELECT ar.public_id AS id, ar.name, ar.hue
FROM vamusic.artist_follow f JOIN vamusic.artist ar USING (artist_id)
ORDER BY f.followed_at DESC;

-- name: follow
INSERT INTO vamusic.artist_follow (user_id, artist_id)
VALUES (vamusic.current_user_id(), :artist_id)
ON CONFLICT DO NOTHING;

-- name: unfollow
DELETE FROM vamusic.artist_follow WHERE artist_id = :artist_id;

-- name: record_play
-- Counters update in this same statement, via the statement-level trigger.
INSERT INTO vamusic.listening_event (user_id, track_id, ms_played, completed, device, quality)
VALUES (vamusic.current_user_id(), :track_id, :ms_played, :completed,
        CAST(:device AS vamusic.device_type), CAST(:quality AS vamusic.stream_quality))
RETURNING played_at;

-- name: history
-- tableoid names the monthly partition each row was read from.
SELECT to_jsonb(c) AS track, e.played_at, e.ms_played, e.completed, e.device,
       (SELECT format('%I.%I', n.nspname, p.relname)
        FROM pg_class p JOIN pg_namespace n ON n.oid = p.relnamespace
        WHERE p.oid = e.tableoid) AS partition
FROM vamusic.listening_event e
JOIN vamusic.track_card c ON c.track_id = e.track_id
WHERE e.user_id = vamusic.current_user_id()
ORDER BY e.played_at DESC
LIMIT :limit;

-- name: recommendations
-- Taste vector from likes and recent plays, nearest neighbours through HNSW.
SELECT c.*, r.score, r.reason
FROM vamusic.recommend_tracks(vamusic.current_user_id(), :limit) r
JOIN vamusic.track_card c ON c.track_id = r.track_id
ORDER BY r.score DESC;

-- name: wrapped
SELECT vamusic.my_wrapped(:year) AS wrapped;
