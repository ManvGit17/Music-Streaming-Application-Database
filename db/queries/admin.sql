-- name: counts
SELECT (SELECT count(*) FROM vamusic.app_user) AS listeners,
       (SELECT count(*) FROM vamusic.artist) AS artists,
       (SELECT count(*) FROM vamusic.album) AS albums,
       (SELECT count(*) FROM vamusic.track) AS tracks,
       (SELECT count(*) FROM vamusic.playlist) AS playlists,
       (SELECT sum(play_count) FROM vamusic.track_stat)::bigint AS plays;

-- name: daily_plays
-- Last 30 days of the daily rollup, counted back from its newest day.
SELECT day, sum(plays)::bigint AS plays, sum(listeners)::bigint AS listener_days
FROM vamusic.daily_track_play
WHERE day > (SELECT max(day) FROM vamusic.daily_track_play) - 30
GROUP BY day
ORDER BY day;

-- name: top_tracks
SELECT c.* FROM vamusic.track_card c ORDER BY c.plays DESC, c.track_id LIMIT 5;

-- name: partitions
SELECT c.relname AS name,
       pg_get_expr(c.relpartbound, c.oid) AS bounds,
       c.reltuples::bigint AS estimated_rows,
       pg_total_relation_size(c.oid) AS bytes
FROM pg_inherits i
JOIN pg_class c ON c.oid = i.inhrelid
WHERE i.inhparent = 'vamusic.listening_event'::regclass AND c.reltuples > 0
ORDER BY c.relname;

-- name: revenue
SELECT vamusic.monthly_revenue(current_date) AS revenue;

-- name: audit
SELECT c.change_id AS id, c.changed_at AS at, u.username AS actor, c.db_role,
       c.table_name AS "table", c.operation, c.row_key, c.before, c.after
FROM audit.change_log c
LEFT JOIN vamusic.app_user u ON u.user_id = c.actor_id
WHERE CAST(:table AS text) IS NULL OR c.table_name = CAST(:table AS text)
ORDER BY c.change_id DESC
LIMIT :limit;

-- name: refresh
SELECT view_name, duration_ms::float8 AS duration_ms FROM vamusic.refresh_analytics();

-- name: update_artist
-- Every change lands in audit.change_log through the audit trigger.
UPDATE vamusic.artist SET
    name = coalesce(:name, name),
    bio = CASE WHEN :has_bio THEN :bio ELSE bio END,
    is_verified = coalesce(:verified, is_verified)
WHERE public_id = CAST(:id AS uuid)
RETURNING public_id AS id, name, hue;
