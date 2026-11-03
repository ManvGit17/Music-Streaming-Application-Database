-- 0004: the listening event store and its counters.
--
-- v1 recomputed play counts, monthly listeners and trending scores inside three row-level
-- triggers that each re-scanned ListeningHistory on every insert. Here:
--   * events go into a table range-partitioned by month, with a BRIN index on time;
--   * counters are maintained by STATEMENT-level triggers reading transition tables, so a
--     batch insert or COPY of N events updates each affected counter row once, not N times;
--   * anything time-windowed (trending, monthly listeners) is a rollup, see migration 0005.

SET search_path = vamusic, public;

CREATE TYPE device_type AS ENUM ('web', 'desktop', 'mobile', 'tablet', 'speaker', 'car');
CREATE TYPE stream_quality AS ENUM ('low', 'normal', 'high', 'lossless');

CREATE TABLE listening_event (
    event_id  bigint GENERATED ALWAYS AS IDENTITY,
    user_id   bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    track_id  bigint NOT NULL REFERENCES track ON DELETE CASCADE,
    played_at timestamptz NOT NULL DEFAULT now(),
    ms_played integer NOT NULL CHECK (ms_played >= 0),
    completed boolean NOT NULL DEFAULT false,
    device    device_type NOT NULL DEFAULT 'web',
    quality   stream_quality NOT NULL DEFAULT 'normal',
    -- The partition key must be part of every unique constraint on a partitioned table.
    PRIMARY KEY (event_id, played_at)
) PARTITION BY RANGE (played_at);

-- BRIN stores min/max per block range: tiny, and ideal for append-mostly time data.
CREATE INDEX listening_event_played_brin ON listening_event USING brin (played_at)
    WITH (pages_per_range = 32);
CREATE INDEX listening_event_user_idx ON listening_event (user_id, played_at DESC);
CREATE INDEX listening_event_track_idx ON listening_event (track_id, played_at);

CREATE TABLE listening_event_default PARTITION OF listening_event DEFAULT;

COMMENT ON TABLE listening_event_default IS
    'Catches events outside every monthly partition; should stay empty (see ensure_listening_partitions).';

-- Creates monthly partitions covering [p_from, p_to). Safe to call repeatedly.
CREATE FUNCTION ensure_listening_partitions(p_from date, p_to date)
    RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
    v_month date := date_trunc('month', p_from)::date;
    v_name  text;
    v_made  integer := 0;
BEGIN
    WHILE v_month < p_to LOOP
        v_name := format('listening_event_%s', to_char(v_month, 'YYYY_MM'));
        IF to_regclass(format('vamusic.%I', v_name)) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE vamusic.%I PARTITION OF vamusic.listening_event
                     FOR VALUES FROM (%L) TO (%L)',
                v_name, v_month, (v_month + interval '1 month')::date);
            v_made := v_made + 1;
        END IF;
        v_month := (v_month + interval '1 month')::date;
    END LOOP;
    RETURN v_made;
END
$$;

SELECT ensure_listening_partitions('2024-01-01', '2028-01-01');

-- Running totals. One row per track / listener.
CREATE TABLE track_stat (
    track_id        bigint PRIMARY KEY REFERENCES track ON DELETE CASCADE,
    play_count      bigint NOT NULL DEFAULT 0 CHECK (play_count >= 0),
    completed_count bigint NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
    ms_played       bigint NOT NULL DEFAULT 0 CHECK (ms_played >= 0),
    like_count      integer NOT NULL DEFAULT 0 CHECK (like_count >= 0),
    last_played_at  timestamptz
);

CREATE INDEX track_stat_plays_idx ON track_stat (play_count DESC);

CREATE TABLE user_stat (
    user_id         bigint PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
    play_count      bigint NOT NULL DEFAULT 0 CHECK (play_count >= 0),
    ms_played       bigint NOT NULL DEFAULT 0 CHECK (ms_played >= 0),
    first_played_at timestamptz,
    last_played_at  timestamptz
);

CREATE FUNCTION track_stat_init() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO track_stat (track_id) SELECT track_id FROM new_tracks;
    RETURN NULL;
END
$$;

CREATE TRIGGER track_stat_init AFTER INSERT ON track
    REFERENCING NEW TABLE AS new_tracks
    FOR EACH STATEMENT EXECUTE FUNCTION track_stat_init();

-- Fold a batch of new events into the counters: one aggregate per statement.
CREATE FUNCTION listening_event_count_insert() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE track_stat ts
    SET play_count      = ts.play_count + b.plays,
        completed_count = ts.completed_count + b.completed,
        ms_played       = ts.ms_played + b.ms,
        last_played_at  = greatest(ts.last_played_at, b.last_at)
    FROM (
        SELECT track_id,
               count(*)                        AS plays,
               count(*) FILTER (WHERE completed) AS completed,
               sum(ms_played)                  AS ms,
               max(played_at)                  AS last_at
        FROM new_events
        GROUP BY track_id
    ) b
    WHERE ts.track_id = b.track_id;

    INSERT INTO user_stat AS us (user_id, play_count, ms_played, first_played_at, last_played_at)
    SELECT user_id, count(*), sum(ms_played), min(played_at), max(played_at)
    FROM new_events
    GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE
    SET play_count      = us.play_count + excluded.play_count,
        ms_played       = us.ms_played + excluded.ms_played,
        first_played_at = least(us.first_played_at, excluded.first_played_at),
        last_played_at  = greatest(us.last_played_at, excluded.last_played_at);

    RETURN NULL;
END
$$;

CREATE FUNCTION listening_event_count_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE track_stat ts
    SET play_count      = greatest(ts.play_count - b.plays, 0),
        completed_count = greatest(ts.completed_count - b.completed, 0),
        ms_played       = greatest(ts.ms_played - b.ms, 0)
    FROM (
        SELECT track_id, count(*) AS plays,
               count(*) FILTER (WHERE completed) AS completed, sum(ms_played) AS ms
        FROM old_events GROUP BY track_id
    ) b
    WHERE ts.track_id = b.track_id;

    UPDATE user_stat us
    SET play_count = greatest(us.play_count - b.plays, 0),
        ms_played  = greatest(us.ms_played - b.ms, 0)
    FROM (
        SELECT user_id, count(*) AS plays, sum(ms_played) AS ms
        FROM old_events GROUP BY user_id
    ) b
    WHERE us.user_id = b.user_id;

    RETURN NULL;
END
$$;

CREATE TRIGGER listening_event_count_insert AFTER INSERT ON listening_event
    REFERENCING NEW TABLE AS new_events
    FOR EACH STATEMENT EXECUTE FUNCTION listening_event_count_insert();

CREATE TRIGGER listening_event_count_delete AFTER DELETE ON listening_event
    REFERENCING OLD TABLE AS old_events
    FOR EACH STATEMENT EXECUTE FUNCTION listening_event_count_delete();

-- Like counts, same pattern.
CREATE FUNCTION track_like_count() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE track_stat ts SET like_count = ts.like_count + b.n
        FROM (SELECT track_id, count(*) AS n FROM changed GROUP BY track_id) b
        WHERE ts.track_id = b.track_id;
    ELSE
        UPDATE track_stat ts SET like_count = greatest(ts.like_count - b.n, 0)
        FROM (SELECT track_id, count(*) AS n FROM changed GROUP BY track_id) b
        WHERE ts.track_id = b.track_id;
    END IF;
    RETURN NULL;
END
$$;

CREATE TRIGGER track_like_count_insert AFTER INSERT ON track_like
    REFERENCING NEW TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION track_like_count();

CREATE TRIGGER track_like_count_delete AFTER DELETE ON track_like
    REFERENCING OLD TABLE AS changed
    FOR EACH STATEMENT EXECUTE FUNCTION track_like_count();
