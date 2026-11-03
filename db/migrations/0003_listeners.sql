-- 0003: listeners, subscriptions, social graph and playlists.
--
-- v1 had two tables for likes (UserLikedTrack, UserFavorites) and two for follows
-- (UserFollowArtist, UserFollowing); the app wrote one and the analytics read the other.
-- There is now exactly one of each.

SET search_path = vamusic, public;

CREATE TYPE user_role AS ENUM ('listener', 'admin');

-- Users are split vertically: app_user is the public profile anyone may read; user_account
-- holds private fields and is readable only by its owner (row-level security, migration 0007).
-- That keeps password hashes and emails out of every query that just needs a display name.
CREATE TABLE app_user (
    user_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id    uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    username     text NOT NULL CHECK (username ~ '^[A-Za-z0-9_.]{3,32}$'),
    display_name text CHECK (length(display_name) <= 64),
    country      char(2) CHECK (country ~ '^[A-Z]{2}$'),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness without citext: "John_Doe" and "john_doe" are the same account.
CREATE UNIQUE INDEX app_user_username_key ON app_user (lower(username));

CREATE TABLE user_account (
    user_id       bigint PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
    email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash text NOT NULL,
    birth_date    date CHECK (birth_date > '1900-01-01'),
    role          user_role NOT NULL DEFAULT 'listener',
    is_active     boolean NOT NULL DEFAULT true,
    last_login_at timestamptz
);

CREATE UNIQUE INDEX user_account_email_key ON user_account (lower(email));

CREATE TABLE plan (
    plan_id        smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name           text NOT NULL UNIQUE,
    price          numeric(8, 2) NOT NULL CHECK (price >= 0),
    period_days    smallint NOT NULL CHECK (period_days >= 0),
    download_limit integer NOT NULL DEFAULT 0 CHECK (download_limit >= 0),
    ad_free        boolean NOT NULL DEFAULT false,
    lossless       boolean NOT NULL DEFAULT false,
    offline        boolean NOT NULL DEFAULT false,
    max_devices    smallint NOT NULL DEFAULT 1 CHECK (max_devices > 0),
    description    text
);

CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'paused');

-- A listener can't hold two subscriptions for overlapping dates. v1 had no such rule; here the
-- database enforces it with an exclusion constraint over a date range (needs btree_gist).
CREATE TABLE subscription (
    subscription_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    plan_id         smallint NOT NULL REFERENCES plan,
    active_during   daterange NOT NULL CHECK (NOT isempty(active_during)),
    status          subscription_status NOT NULL DEFAULT 'active',
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT subscription_no_overlap
        EXCLUDE USING gist (user_id WITH =, active_during WITH &&)
);

CREATE TYPE payment_method AS ENUM ('card', 'paypal', 'upi', 'netbanking');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

CREATE TABLE payment (
    payment_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id bigint NOT NULL REFERENCES subscription ON DELETE CASCADE,
    amount          numeric(8, 2) NOT NULL CHECK (amount >= 0),
    method          payment_method NOT NULL,
    reference       text NOT NULL UNIQUE,
    status          payment_status NOT NULL DEFAULT 'pending',
    paid_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_subscription_idx ON payment (subscription_id);

CREATE TABLE track_like (
    user_id  bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    track_id bigint NOT NULL REFERENCES track ON DELETE CASCADE,
    liked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX track_like_track_idx ON track_like (track_id);

CREATE TABLE artist_follow (
    user_id     bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    artist_id   bigint NOT NULL REFERENCES artist ON DELETE CASCADE,
    followed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX artist_follow_artist_idx ON artist_follow (artist_id);

CREATE TABLE user_follow (
    follower_id bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    followee_id bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    followed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, followee_id),
    CONSTRAINT user_follow_not_self CHECK (follower_id <> followee_id)
);

CREATE INDEX user_follow_followee_idx ON user_follow (followee_id);

CREATE TABLE playlist (
    playlist_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id   uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    owner_id    bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    description text,
    is_public   boolean NOT NULL DEFAULT true,
    cover_seed  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX playlist_owner_idx ON playlist (owner_id);
CREATE INDEX playlist_public_idx ON playlist (created_at DESC) WHERE is_public;

CREATE TRIGGER playlist_touch BEFORE UPDATE ON playlist
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION touch_updated_at();

-- Positions are unique per playlist, checked at commit time (DEFERRABLE), so a reorder can
-- move many rows through temporarily-duplicate positions inside one transaction.
CREATE TABLE playlist_track (
    playlist_id bigint NOT NULL REFERENCES playlist ON DELETE CASCADE,
    track_id    bigint NOT NULL REFERENCES track ON DELETE CASCADE,
    position    integer NOT NULL CHECK (position > 0),
    added_by    bigint REFERENCES app_user ON DELETE SET NULL,
    added_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (playlist_id, track_id),
    CONSTRAINT playlist_track_position_unique UNIQUE (playlist_id, position)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX playlist_track_track_idx ON playlist_track (track_id);

CREATE TABLE playlist_follow (
    user_id     bigint NOT NULL REFERENCES app_user ON DELETE CASCADE,
    playlist_id bigint NOT NULL REFERENCES playlist ON DELETE CASCADE,
    followed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, playlist_id)
);

CREATE INDEX playlist_follow_playlist_idx ON playlist_follow (playlist_id);

-- Appending to a playlist: next position, idempotent for a track that's already there.
CREATE FUNCTION playlist_add_track(p_playlist_id bigint, p_track_id bigint)
    RETURNS boolean
    LANGUAGE plpgsql AS $$
DECLARE
    v_next integer;
BEGIN
    -- Serialise appends to the same playlist so two concurrent adds can't pick the same slot.
    PERFORM 1 FROM playlist WHERE playlist_id = p_playlist_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'playlist % not found', p_playlist_id USING ERRCODE = 'no_data_found';
    END IF;

    SELECT coalesce(max(position), 0) + 1 INTO v_next
    FROM playlist_track WHERE playlist_id = p_playlist_id;

    INSERT INTO playlist_track (playlist_id, track_id, position, added_by)
    VALUES (p_playlist_id, p_track_id, v_next, current_user_id())
    ON CONFLICT (playlist_id, track_id) DO NOTHING;

    RETURN FOUND;
END
$$;

COMMENT ON FUNCTION playlist_add_track(bigint, bigint) IS
    'Append a track; returns false if it was already in the playlist (v1 crashed on this).';

-- Rewrites positions 1..n in the given order in one statement; the deferred unique constraint
-- makes the intermediate duplicates legal.
CREATE FUNCTION playlist_reorder(p_playlist_id bigint, p_track_ids bigint[])
    RETURNS void
    LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT count(*) FROM playlist_track WHERE playlist_id = p_playlist_id)
       <> cardinality(p_track_ids)
       OR (SELECT count(DISTINCT id) FROM unnest(p_track_ids) AS u(id)) <> cardinality(p_track_ids)
       OR EXISTS (
           SELECT 1 FROM unnest(p_track_ids) AS t(id)
           WHERE NOT EXISTS (
               SELECT 1 FROM playlist_track pt
               WHERE pt.playlist_id = p_playlist_id AND pt.track_id = t.id))
    THEN
        RAISE EXCEPTION 'new order must list every track in the playlist exactly once'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    UPDATE playlist_track pt
    SET position = o.ord
    FROM unnest(p_track_ids) WITH ORDINALITY AS o(track_id, ord)
    WHERE pt.playlist_id = p_playlist_id AND pt.track_id = o.track_id;
END
$$;

-- Removing a track closes the gap so positions stay 1..n.
CREATE FUNCTION playlist_remove_track(p_playlist_id bigint, p_track_id bigint)
    RETURNS boolean
    LANGUAGE plpgsql AS $$
DECLARE
    v_pos integer;
BEGIN
    DELETE FROM playlist_track
    WHERE playlist_id = p_playlist_id AND track_id = p_track_id
    RETURNING position INTO v_pos;
    IF v_pos IS NULL THEN
        RETURN false;
    END IF;
    UPDATE playlist_track SET position = position - 1
    WHERE playlist_id = p_playlist_id AND position > v_pos;
    RETURN true;
END
$$;
