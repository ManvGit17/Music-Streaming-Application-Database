-- 0007: privileges, row-level security, and the few functions allowed to cross it.
--
-- Model
--   * Request roles (anon, listener, admin) never own tables. Owners bypass RLS, so tables
--     are owned by the migration role and RLS always applies to requests.
--   * The API sets vamusic.user_id per transaction; policies compare rows against
--     current_user_id().
--   * Operations that legitimately need to see past a listener's own rows (login, sign-up,
--     maintaining global counters, rollups) are SECURITY DEFINER functions with a pinned
--     search_path, executable only by the roles that need them.

SET search_path = vamusic, public;

-- ---------------------------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------------------------

-- The public catalog, readable by everyone.
GRANT SELECT ON genre, artist, album, track, track_credit, plan, track_stat,
                daily_track_play, trending_track, artist_monthly_listener, catalog_search,
                artist_dashboard, track_performance, app_user, playlist, playlist_track
    TO vamusic_anon, vamusic_listener;

-- Signed-out visitors may query likes and follows but no policy matches them, so RLS returns
-- no rows. That lets one query answer "is this liked?" for everyone, with no special case.
GRANT SELECT ON track_like, artist_follow TO vamusic_anon;

-- A listener's own data.
GRANT SELECT ON user_account, subscription, payment, user_stat TO vamusic_listener;
GRANT UPDATE (email, birth_date) ON user_account TO vamusic_listener;
GRANT UPDATE (display_name, country) ON app_user TO vamusic_listener;
GRANT SELECT, INSERT, DELETE ON track_like, artist_follow, user_follow, playlist_follow
    TO vamusic_listener;
GRANT INSERT, UPDATE, DELETE ON playlist, playlist_track TO vamusic_listener;
GRANT SELECT, INSERT ON listening_event TO vamusic_listener;

-- Admins manage everything.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA vamusic TO vamusic_admin;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_read ON app_user FOR SELECT USING (true);
CREATE POLICY profile_update_self ON app_user FOR UPDATE TO vamusic_listener
    USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE user_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_self ON user_account FOR SELECT TO vamusic_listener
    USING (user_id = current_user_id());
CREATE POLICY account_update_self ON user_account FOR UPDATE TO vamusic_listener
    USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_self ON subscription FOR SELECT TO vamusic_listener
    USING (user_id = current_user_id());

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_self ON payment FOR SELECT TO vamusic_listener
    USING (EXISTS (SELECT 1 FROM subscription s
                   WHERE s.subscription_id = payment.subscription_id
                     AND s.user_id = current_user_id()));

ALTER TABLE user_stat ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_stat_self ON user_stat FOR SELECT TO vamusic_listener
    USING (user_id = current_user_id());

ALTER TABLE listening_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY listening_self_read ON listening_event FOR SELECT TO vamusic_listener
    USING (user_id = current_user_id());
CREATE POLICY listening_self_write ON listening_event FOR INSERT TO vamusic_listener
    WITH CHECK (user_id = current_user_id());

-- Likes and follows: private to their owner. Totals are public through track_stat and the
-- aggregate views.
ALTER TABLE track_like ENABLE ROW LEVEL SECURITY;
CREATE POLICY track_like_self ON track_like FOR ALL TO vamusic_listener
    USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE artist_follow ENABLE ROW LEVEL SECURITY;
CREATE POLICY artist_follow_self ON artist_follow FOR ALL TO vamusic_listener
    USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE playlist_follow ENABLE ROW LEVEL SECURITY;
CREATE POLICY playlist_follow_self ON playlist_follow FOR ALL TO vamusic_listener
    USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

ALTER TABLE user_follow ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_follow_read ON user_follow FOR SELECT TO vamusic_listener
    USING (current_user_id() IN (follower_id, followee_id));
CREATE POLICY user_follow_write ON user_follow FOR INSERT TO vamusic_listener
    WITH CHECK (follower_id = current_user_id());
CREATE POLICY user_follow_delete ON user_follow FOR DELETE TO vamusic_listener
    USING (follower_id = current_user_id());

-- Playlists: public ones are visible to everyone, private ones only to their owner.
ALTER TABLE playlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY playlist_read ON playlist FOR SELECT
    USING (is_public OR owner_id = current_user_id());
CREATE POLICY playlist_insert ON playlist FOR INSERT TO vamusic_listener
    WITH CHECK (owner_id = current_user_id());
CREATE POLICY playlist_update ON playlist FOR UPDATE TO vamusic_listener
    USING (owner_id = current_user_id()) WITH CHECK (owner_id = current_user_id());
CREATE POLICY playlist_delete ON playlist FOR DELETE TO vamusic_listener
    USING (owner_id = current_user_id());

-- Playlist entries follow their playlist: the subquery is itself filtered by playlist's RLS.
ALTER TABLE playlist_track ENABLE ROW LEVEL SECURITY;
CREATE POLICY playlist_track_read ON playlist_track FOR SELECT
    USING (EXISTS (SELECT 1 FROM playlist p WHERE p.playlist_id = playlist_track.playlist_id));
CREATE POLICY playlist_track_write ON playlist_track FOR ALL TO vamusic_listener
    USING (EXISTS (SELECT 1 FROM playlist p WHERE p.playlist_id = playlist_track.playlist_id
                                            AND p.owner_id = current_user_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM playlist p
                        WHERE p.playlist_id = playlist_track.playlist_id
                          AND p.owner_id = current_user_id()));

-- Admins see and change everything on every RLS table.
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'vamusic' AND c.relrowsecurity AND c.relkind IN ('r', 'p')
    LOOP
        EXECUTE format('CREATE POLICY admin_all ON vamusic.%I FOR ALL TO vamusic_admin
                            USING (true) WITH CHECK (true)', t);
    END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Functions that cross the RLS boundary
-- ---------------------------------------------------------------------------------------------

-- Counter and rollup maintenance must update global rows on behalf of any listener.
ALTER FUNCTION track_stat_init() SECURITY DEFINER SET search_path = vamusic, public;
ALTER FUNCTION listening_event_count_insert() SECURITY DEFINER SET search_path = vamusic, public;
ALTER FUNCTION listening_event_count_delete() SECURITY DEFINER SET search_path = vamusic, public;
ALTER FUNCTION track_like_count() SECURITY DEFINER SET search_path = vamusic, public;
ALTER FUNCTION refresh_analytics() SECURITY DEFINER SET search_path = vamusic, public;
ALTER FUNCTION ensure_listening_partitions(date, date)
    SECURITY DEFINER SET search_path = vamusic, public;

-- Login: the API (connected as vamusic_app, before any SET ROLE) needs the hash to verify.
CREATE FUNCTION auth_lookup(p_login text)
    RETURNS TABLE (user_id bigint, public_id uuid, username text, display_name text,
                   password_hash text, role user_role, is_active boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
    SELECT u.user_id, u.public_id, u.username, u.display_name, a.password_hash, a.role,
           a.is_active
    FROM app_user u JOIN user_account a USING (user_id)
    WHERE lower(u.username) = lower(p_login) OR lower(a.email) = lower(p_login);
$$;

CREATE FUNCTION auth_touch_login(p_user_id bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
    UPDATE user_account SET last_login_at = now() WHERE user_id = p_user_id;
$$;

-- Sign-up: creates the profile and the private account together.
CREATE FUNCTION register_listener(p_username text, p_email text, p_password_hash text,
                                  p_display_name text DEFAULT NULL)
    RETURNS TABLE (user_id bigint, public_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
BEGIN
    INSERT INTO app_user (username, display_name)
    VALUES (p_username, coalesce(p_display_name, p_username))
    RETURNING app_user.user_id, app_user.public_id INTO user_id, public_id;

    INSERT INTO user_account (user_id, email, password_hash)
    VALUES (register_listener.user_id, p_email, p_password_hash);

    RETURN NEXT;
END
$$;

-- Follower totals are public even though who-follows-what is private.
CREATE FUNCTION playlist_follower_count(p_playlist_id bigint) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = vamusic, public
    RETURN (SELECT count(*) FROM playlist_follow WHERE playlist_id = p_playlist_id);

-- Wrapped compares the listener against everyone, which RLS would otherwise hide; this
-- wrapper only ever reports on the caller.
ALTER FUNCTION listener_wrapped(bigint, integer) SET search_path = vamusic, public;
CREATE FUNCTION my_wrapped(p_year integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
    SELECT listener_wrapped(current_user_id(), p_year);
$$;

-- ---------------------------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------------------------

-- Functions are executable by PUBLIC by default. Take that away from everything defined so
-- far, and from anything this role creates later. (A per-schema ALTER DEFAULT PRIVILEGES can
-- only add privileges, so the global form is needed to revoke the PUBLIC default.)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA vamusic FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_lookup(text), auth_touch_login(bigint),
                          register_listener(text, text, text, text)
    TO vamusic_app;

GRANT EXECUTE ON FUNCTION current_user_id(), fold(text), format_duration(bigint),
                          prefix_tsquery(text), search_tracks(text, integer),
                          similar_tracks(bigint, integer), playlist_duration_ms(bigint),
                          playlist_follower_count(bigint),
                          recommend_tracks(bigint, integer)
    TO vamusic_anon, vamusic_listener, vamusic_admin;

GRANT EXECUTE ON FUNCTION listener_tier(bigint), my_wrapped(integer),
                          playlist_add_track(bigint, bigint),
                          playlist_remove_track(bigint, bigint),
                          playlist_reorder(bigint, bigint[])
    TO vamusic_listener, vamusic_admin;

GRANT EXECUTE ON FUNCTION listener_wrapped(bigint, integer), monthly_revenue(date),
                          refresh_analytics(), ensure_listening_partitions(date, date)
    TO vamusic_admin;

-- Trigger functions run as part of the triggering statement and need no EXECUTE grant.

-- Pin search_path on every function that doesn't already have one. Without this a function
-- resolves table and function names through the *caller's* search_path, which both breaks
-- callers that don't set it and lets a caller shadow objects (CVE-2018-1058).
DO $$
DECLARE
    f regprocedure;
BEGIN
    FOR f IN
        SELECT p.oid::regprocedure
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'vamusic' AND p.prokind = 'f'
          AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%')
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = vamusic, public', f);
    END LOOP;
END
$$;
