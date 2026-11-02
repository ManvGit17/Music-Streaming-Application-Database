-- 0005: analytics rollups, trending, and the v1 functions and views.
--
-- Time windows are measured from the newest event in the data (the "anchor"), not from now().
-- v1 used NOW(), so a week after the seed was loaded the trending list was empty. A real
-- service has continuous traffic so the two are the same; for a demo dataset they are not.

SET search_path = vamusic, public;

-- ---------------------------------------------------------------------------------------------
-- Rollups
-- ---------------------------------------------------------------------------------------------

CREATE MATERIALIZED VIEW daily_track_play AS
SELECT (played_at AT TIME ZONE 'UTC')::date AS day,
       track_id,
       count(*)                AS plays,
       count(DISTINCT user_id) AS listeners,
       sum(ms_played)          AS ms_played
FROM listening_event
GROUP BY 1, 2;

CREATE UNIQUE INDEX daily_track_play_key ON daily_track_play (day, track_id);
CREATE INDEX daily_track_play_track_idx ON daily_track_play (track_id, day);

COMMENT ON MATERIALIZED VIEW daily_track_play IS
    'Plays per track per UTC day. Refreshed by refresh_analytics().';

-- Trending: exponentially time-decayed plays (half-life 3 days) plus distinct listeners and
-- likes in the last 30 days. Weights follow v1's formula (0.5 / 2 / 1.5).
CREATE MATERIALIZED VIEW trending_track AS
WITH anchor AS (
    SELECT coalesce(max(played_at), now()) AS at FROM listening_event
),
recent AS (
    SELECT e.track_id,
           sum(exp(-ln(2) * extract(epoch FROM a.at - e.played_at) / (3 * 86400))) AS decayed,
           count(DISTINCT e.user_id) AS listeners
    FROM listening_event e, anchor a
    WHERE e.played_at > a.at - interval '30 days' AND e.played_at <= a.at
    GROUP BY e.track_id
),
likes AS (
    SELECT l.track_id, count(*) AS n
    FROM track_like l, anchor a
    WHERE l.liked_at > a.at - interval '30 days'
    GROUP BY l.track_id
)
SELECT r.track_id,
       round((r.decayed * 0.5 + r.listeners * 2 + coalesce(l.n, 0) * 1.5)::numeric, 3) AS score,
       r.listeners,
       coalesce(l.n, 0) AS recent_likes,
       (SELECT at FROM anchor) AS anchor_at,
       rank() OVER (ORDER BY r.decayed * 0.5 + r.listeners * 2 + coalesce(l.n, 0) * 1.5 DESC,
                    r.track_id) AS rank
FROM recent r
LEFT JOIN likes l USING (track_id);

CREATE UNIQUE INDEX trending_track_key ON trending_track (track_id);
CREATE INDEX trending_track_rank_idx ON trending_track (rank);

-- Monthly listeners per artist: distinct listeners in the 28 days before the anchor.
CREATE MATERIALIZED VIEW artist_monthly_listener AS
WITH anchor AS (SELECT coalesce(max(played_at), now()) AS at FROM listening_event)
SELECT al.artist_id, count(DISTINCT e.user_id) AS listeners
FROM listening_event e
JOIN track t USING (track_id)
JOIN album al USING (album_id)
CROSS JOIN anchor a
WHERE e.played_at > a.at - interval '28 days' AND e.played_at <= a.at
GROUP BY al.artist_id;

CREATE UNIQUE INDEX artist_monthly_listener_key ON artist_monthly_listener (artist_id);

-- Refresh every rollup without blocking readers. Returns how long each took.
CREATE FUNCTION refresh_analytics()
    RETURNS TABLE (view_name text, duration_ms numeric)
    LANGUAGE plpgsql AS $$
DECLARE
    v text;
    t0 timestamptz;
BEGIN
    FOREACH v IN ARRAY ARRAY['daily_track_play', 'trending_track', 'artist_monthly_listener',
                             'catalog_search']
    LOOP
        IF to_regclass('vamusic.' || v) IS NULL THEN
            CONTINUE;
        END IF;
        t0 := clock_timestamp();
        EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY vamusic.%I', v);
        view_name := v;
        duration_ms := round(extract(epoch FROM clock_timestamp() - t0)::numeric * 1000, 1);
        RETURN NEXT;
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Functions carried over from v1 (fixed)
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION format_duration(p_ms bigint) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN CASE
        WHEN p_ms >= 3600000 THEN
            format('%s:%s:%s', p_ms / 3600000,
                   lpad(((p_ms / 60000) % 60)::text, 2, '0'),
                   lpad(((p_ms / 1000) % 60)::text, 2, '0'))
        ELSE format('%s:%s', p_ms / 60000, lpad(((p_ms / 1000) % 60)::text, 2, '0'))
    END;

-- v1 returned 'Music Master' for listeners with no statistics row (NULL fell through the CASE).
CREATE FUNCTION listener_tier(p_user_id bigint) RETURNS text
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN (
        SELECT CASE
            WHEN m = 0 THEN 'New Listener'
            WHEN m < 100 THEN 'Casual Listener'
            WHEN m < 500 THEN 'Regular Listener'
            WHEN m < 2000 THEN 'Music Enthusiast'
            WHEN m < 10000 THEN 'Audiophile'
            ELSE 'Music Master'
        END
        FROM (SELECT coalesce((SELECT ms_played FROM user_stat WHERE user_id = p_user_id), 0)
                     / 60000 AS m) x
    );

-- v1 compared month and year separately and undercounted after any year boundary.
CREATE FUNCTION monthly_revenue(p_month date) RETURNS numeric
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN (
        SELECT coalesce(sum(p.price), 0)
        FROM subscription s
        JOIN plan p USING (plan_id)
        WHERE s.status = 'active'
          AND s.active_during && daterange(date_trunc('month', p_month)::date,
                                           (date_trunc('month', p_month) + interval '1 month')::date)
    );

CREATE FUNCTION playlist_duration_ms(p_playlist_id bigint) RETURNS bigint
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN (
        SELECT coalesce(sum(t.duration_ms), 0)
        FROM playlist_track pt JOIN track t USING (track_id)
        WHERE pt.playlist_id = p_playlist_id
    );

-- ---------------------------------------------------------------------------------------------
-- Views carried over from v1, now reading the single like/follow tables and the counters
-- ---------------------------------------------------------------------------------------------

-- These two views run with their owner's rights (the default), not the caller's: they expose
-- only aggregate counts, and those counts must include rows the caller can't see individually
-- (other listeners' follows and playlists are hidden by row-level security).
CREATE VIEW artist_dashboard AS
SELECT ar.artist_id,
       ar.public_id,
       ar.name,
       ar.is_verified,
       coalesce(ml.listeners, 0)                     AS monthly_listeners,
       count(DISTINCT al.album_id)                   AS albums,
       count(t.track_id)                             AS tracks,
       coalesce(sum(ts.play_count), 0)               AS total_plays,
       (SELECT count(*) FROM artist_follow f WHERE f.artist_id = ar.artist_id) AS followers
FROM artist ar
LEFT JOIN artist_monthly_listener ml USING (artist_id)
LEFT JOIN album al ON al.artist_id = ar.artist_id
LEFT JOIN track t ON t.album_id = al.album_id
LEFT JOIN track_stat ts ON ts.track_id = t.track_id
GROUP BY ar.artist_id, ml.listeners;

CREATE VIEW track_performance AS
SELECT t.track_id,
       t.public_id,
       t.title,
       ar.name                    AS artist,
       al.title                   AS album,
       g.name                     AS genre,
       format_duration(t.duration_ms) AS duration,
       ts.play_count,
       ts.completed_count,
       CASE WHEN ts.play_count > 0
            THEN round(ts.completed_count::numeric / ts.play_count, 3) END AS completion_rate,
       ts.like_count,
       coalesce(tr.score, 0)      AS trending_score,
       (SELECT count(*) FROM playlist_track pt WHERE pt.track_id = t.track_id) AS playlist_count
FROM track t
JOIN album al USING (album_id)
JOIN artist ar ON ar.artist_id = al.artist_id
LEFT JOIN genre g ON g.genre_id = al.genre_id
JOIN track_stat ts ON ts.track_id = t.track_id
LEFT JOIN trending_track tr ON tr.track_id = t.track_id;

-- ---------------------------------------------------------------------------------------------
-- Wrapped: a listener's year in review, as one JSON document
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION listener_wrapped(p_user_id bigint, p_year integer)
    RETURNS jsonb
    LANGUAGE sql STABLE AS $$
WITH ev AS (
    SELECT e.*, al.artist_id, al.genre_id
    FROM listening_event e
    JOIN track t USING (track_id)
    JOIN album al USING (album_id)
    WHERE e.user_id = p_user_id
      -- A range predicate on the partition key lets the planner prune to that year's partitions.
      AND e.played_at >= make_date(p_year, 1, 1)
      AND e.played_at <  make_date(p_year + 1, 1, 1)
),
-- One pass, three groupings: per artist, per genre, and the grand total.
totals AS (
    SELECT artist_id, genre_id, count(*) AS plays, sum(ms_played) AS ms,
           GROUPING(artist_id, genre_id) AS g
    FROM ev
    GROUP BY GROUPING SETS ((artist_id), (genre_id), ())
),
-- Gaps and islands: consecutive listening days share the same (day - row_number) value.
days AS (
    SELECT DISTINCT (played_at AT TIME ZONE 'UTC')::date AS d FROM ev
),
streaks AS (
    SELECT min(d) AS starts, max(d) AS ends, count(*) AS length
    FROM (SELECT d, d - (row_number() OVER (ORDER BY d))::integer AS island FROM days) x
    GROUP BY island
),
-- Where this listener ranks among everyone who listened that year.
everyone AS (
    SELECT user_id, sum(ms_played) AS ms
    FROM listening_event
    WHERE played_at >= make_date(p_year, 1, 1) AND played_at < make_date(p_year + 1, 1, 1)
    GROUP BY user_id
),
ranked AS (
    SELECT user_id, percent_rank() OVER (ORDER BY ms) AS pr FROM everyone
)
SELECT jsonb_build_object(
    'year', p_year,
    'minutes', coalesce((SELECT ms FROM totals WHERE g = 3) / 60000, 0),
    'plays', coalesce((SELECT plays FROM totals WHERE g = 3), 0),
    'distinct_tracks', (SELECT count(DISTINCT track_id) FROM ev),
    'top_percent', (SELECT ceil((1 - pr) * 100) FROM ranked WHERE user_id = p_user_id),
    'top_tracks', coalesce((
        SELECT jsonb_agg(x ORDER BY x.plays DESC, x.title)
        FROM (SELECT t.public_id AS id, t.title, ar.name AS artist, count(*) AS plays
              FROM ev JOIN track t USING (track_id)
              JOIN artist ar ON ar.artist_id = ev.artist_id
              GROUP BY t.public_id, t.title, ar.name
              ORDER BY plays DESC, t.title LIMIT 5) x), '[]'::jsonb),
    'top_artists', coalesce((
        SELECT jsonb_agg(x ORDER BY x.minutes DESC)
        FROM (SELECT ar.public_id AS id, ar.name, tt.ms / 60000 AS minutes
              FROM totals tt JOIN artist ar USING (artist_id)
              WHERE tt.g = 1
              ORDER BY tt.ms DESC LIMIT 5) x), '[]'::jsonb),
    'top_genres', coalesce((
        SELECT jsonb_agg(x ORDER BY x.share DESC)
        FROM (SELECT gn.name,
                     round(tt.ms::numeric / nullif((SELECT ms FROM totals WHERE g = 3), 0), 3)
                         AS share
              FROM totals tt JOIN genre gn USING (genre_id)
              WHERE tt.g = 2
              ORDER BY tt.ms DESC LIMIT 5) x), '[]'::jsonb),
    'by_hour', coalesce((
        SELECT jsonb_agg(jsonb_build_object('hour', h, 'plays', n) ORDER BY h)
        FROM (SELECT extract(hour FROM played_at AT TIME ZONE 'UTC')::int AS h, count(*) AS n
              FROM ev GROUP BY 1) x), '[]'::jsonb),
    'median_session_ms', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY ms_played) FROM ev),
    'longest_streak', (
        SELECT jsonb_build_object('days', length, 'from', starts, 'to', ends)
        FROM streaks ORDER BY length DESC, starts LIMIT 1)
);
$$;
