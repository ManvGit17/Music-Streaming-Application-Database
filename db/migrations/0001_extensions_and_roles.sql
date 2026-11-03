-- 0001: extensions, schemas, roles and request-context helpers.
--
-- Roles
--   vamusic_app       the login role the API connects as; owns nothing
--   vamusic_listener  what a signed-in listener's requests run as (SET LOCAL ROLE)
--   vamusic_admin     what an admin's requests run as
--   vamusic_anon      what signed-out requests run as
-- Tables are owned by whoever runs migrations, so row-level security always applies to the
-- three request roles (owners bypass RLS unless FORCE is set; we set it anyway).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA vamusic;
CREATE SCHEMA audit;

DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['vamusic_anon', 'vamusic_listener', 'vamusic_admin'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('CREATE ROLE %I NOLOGIN', r);
        END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vamusic_app') THEN
        -- The password is set at deploy time (`vamusic migrate --app-password ...`), never here.
        CREATE ROLE vamusic_app LOGIN NOINHERIT;
    END IF;
END
$$;

GRANT vamusic_anon, vamusic_listener, vamusic_admin TO vamusic_app;

-- vamusic_app is NOINHERIT: it has none of the request roles' rights until it SET ROLEs, so it
-- needs schema usage of its own to reach the login functions.
GRANT USAGE ON SCHEMA vamusic TO vamusic_app, vamusic_anon, vamusic_listener, vamusic_admin;
GRANT USAGE ON SCHEMA audit TO vamusic_admin;

-- Request context. The API sets these with set_config(..., is_local => true) inside each
-- transaction, so they reset automatically when a pooled connection is returned.

CREATE FUNCTION vamusic.current_user_id() RETURNS bigint
    LANGUAGE sql STABLE PARALLEL SAFE
    RETURN nullif(current_setting('vamusic.user_id', true), '')::bigint;

COMMENT ON FUNCTION vamusic.current_user_id() IS
    'The signed-in listener for this transaction, or NULL. Set by the API with set_config(''vamusic.user_id'', ..., true).';

-- unaccent() is only STABLE (it depends on the dictionary), so it can't appear in generated
-- columns or index expressions. Pinning the dictionary makes this wrapper safe to mark IMMUTABLE.
CREATE FUNCTION vamusic.fold(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN lower(public.unaccent('public.unaccent'::regdictionary, $1));

COMMENT ON FUNCTION vamusic.fold(text) IS 'Lower-case and strip accents, for search and uniqueness.';
