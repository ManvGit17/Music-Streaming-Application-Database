-- 0002: the music catalog.
--
-- Every entity has an internal identity key (compact, used for joins) and a public uuidv7 key
-- (exposed by the API). uuidv7 values are time-ordered, so their unique index stays append-only
-- instead of taking random page splits like uuidv4.

SET search_path = vamusic, public;

CREATE TABLE genre (
    genre_id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            text NOT NULL,
    description     text,
    parent_genre_id integer REFERENCES genre ON DELETE SET NULL,
    hue             smallint NOT NULL DEFAULT 0 CHECK (hue BETWEEN 0 AND 359),
    CONSTRAINT genre_name_unique UNIQUE (name),
    CONSTRAINT genre_not_own_parent CHECK (parent_genre_id <> genre_id)
);

COMMENT ON COLUMN genre.hue IS 'Base colour (HSL hue) used by the UI for generated artwork.';

CREATE TABLE artist (
    artist_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id   uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    name        text NOT NULL CHECK (length(btrim(name)) > 0),
    bio         text,
    country     char(2) CHECK (country ~ '^[A-Z]{2}$'),
    is_verified boolean NOT NULL DEFAULT false,
    hue         smallint NOT NULL DEFAULT 0 CHECK (hue BETWEEN 0 AND 359),
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX artist_name_trgm ON artist USING gin (fold(name) gin_trgm_ops);

CREATE TYPE album_type AS ENUM ('single', 'ep', 'album', 'compilation');

CREATE TABLE album (
    album_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id    uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    artist_id    bigint NOT NULL REFERENCES artist ON DELETE CASCADE,
    title        text NOT NULL CHECK (length(btrim(title)) > 0),
    album_type   album_type NOT NULL DEFAULT 'album',
    genre_id     integer REFERENCES genre ON DELETE SET NULL,
    release_date date,
    label        text,
    cover_seed   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX album_artist_idx ON album (artist_id, release_date DESC);
CREATE INDEX album_genre_idx ON album (genre_id);

COMMENT ON COLUMN album.cover_seed IS 'Seed for the UI''s generated cover art.';

-- Audio features are an 8-dimension vector, each value in [0, 1]:
--   energy, valence, danceability, acousticness, instrumentalness, speechiness, liveness, tempo
-- They drive "sounds like" recommendations through pgvector (migration 0006).
CREATE TABLE track (
    track_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    public_id        uuid NOT NULL DEFAULT uuidv7() UNIQUE,
    album_id         bigint NOT NULL REFERENCES album ON DELETE CASCADE,
    title            text NOT NULL CHECK (length(btrim(title)) > 0),
    disc_number      smallint NOT NULL DEFAULT 1 CHECK (disc_number > 0),
    track_number     smallint CHECK (track_number > 0),
    duration_ms      integer NOT NULL CHECK (duration_ms BETWEEN 1000 AND 3600000),
    -- PostgreSQL 18: virtual generated columns are computed on read and take no storage.
    duration_seconds integer GENERATED ALWAYS AS (duration_ms / 1000) VIRTUAL,
    is_explicit      boolean NOT NULL DEFAULT false,
    audio_seed       integer NOT NULL DEFAULT 0,
    features         vector(8),
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT track_position_unique UNIQUE (album_id, disc_number, track_number)
);

CREATE INDEX track_title_trgm ON track USING gin (fold(title) gin_trgm_ops);

COMMENT ON COLUMN track.audio_seed IS 'Seed for the UI''s deterministic generative audio, so every track can actually play.';

CREATE TYPE credit_role AS ENUM ('primary', 'featured', 'producer', 'composer');

CREATE TABLE track_credit (
    track_id  bigint NOT NULL REFERENCES track ON DELETE CASCADE,
    artist_id bigint NOT NULL REFERENCES artist ON DELETE CASCADE,
    role      credit_role NOT NULL DEFAULT 'featured',
    PRIMARY KEY (track_id, artist_id, role)
);

CREATE INDEX track_credit_artist_idx ON track_credit (artist_id);

-- Keep updated_at honest without trusting callers.
CREATE FUNCTION touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

CREATE TRIGGER artist_touch BEFORE UPDATE ON artist
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER album_touch BEFORE UPDATE ON album
    FOR EACH ROW WHEN (OLD IS DISTINCT FROM NEW) EXECUTE FUNCTION touch_updated_at();
