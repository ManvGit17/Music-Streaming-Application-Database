-- name: register
-- Create the public profile and private account together (SECURITY DEFINER).
SELECT * FROM vamusic.register_listener(:username, :email, :password_hash, :display_name);

-- name: login_lookup
-- Runs as vamusic_app, before any SET ROLE: the only way to read a password hash.
SELECT * FROM vamusic.auth_lookup(:login);

-- name: touch_login
SELECT vamusic.auth_touch_login(:user_id);

-- name: me
-- RLS on user_account and user_stat returns only the caller's own rows.
SELECT u.public_id AS id, u.username, u.display_name, u.country, u.created_at AS joined,
       a.email, a.role,
       vamusic.listener_tier(u.user_id) AS tier,
       coalesce(s.play_count, 0) AS plays,
       coalesce(s.ms_played, 0) / 60000 AS minutes,
       (SELECT p.name FROM vamusic.subscription sub JOIN vamusic.plan p USING (plan_id)
        WHERE sub.user_id = u.user_id AND sub.status = 'active'
          AND sub.active_during @> current_date) AS plan
FROM vamusic.app_user u
JOIN vamusic.user_account a USING (user_id)
LEFT JOIN vamusic.user_stat s USING (user_id)
WHERE u.user_id = vamusic.current_user_id();

-- name: update_me
-- Column privileges allow listeners to change only display_name and country.
UPDATE vamusic.app_user
SET display_name = coalesce(:display_name, display_name),
    country = coalesce(:country, country)
WHERE user_id = vamusic.current_user_id();
