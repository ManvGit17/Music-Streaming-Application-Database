-- 0009: "card" views, the shapes the API and the web app render.
--
-- Each view returns one ready-to-display row, with nested objects already built as JSONB, so
-- the Python API and the in-browser demo (PGlite) can share the same SQL without reshaping
-- results in two languages.
--
-- Both are security_invoker views: they run with the caller's privileges, so row-level
-- security decides `liked`, `is_owner` and which playlists appear at all.

SET search_path = vamusic, public;

CREATE VIEW track_card WITH (security_invoker = true) AS
SELECT t.track_id,
       al.album_id,
       al.artist_id,
       al.genre_id,
       t.public_id AS id,
       t.title,
       t.duration_ms,
       t.is_explicit AS explicit,
       t.audio_seed,
       t.track_number,
       t.disc_number,
       t.features::real[] AS features,
       jsonb_build_object('id', ar.public_id, 'name', ar.name, 'hue', ar.hue) AS artist,
       jsonb_build_object('id', al.public_id, 'title', al.title, 'cover_seed', al.cover_seed)
           AS album,
       g.name AS genre,
       g.hue AS genre_hue,
       ts.play_count AS plays,
       ts.like_count AS likes,
       EXISTS (SELECT 1 FROM track_like l
               WHERE l.user_id = current_user_id() AND l.track_id = t.track_id) AS liked
FROM track t
JOIN album al ON al.album_id = t.album_id
JOIN artist ar ON ar.artist_id = al.artist_id
LEFT JOIN genre g ON g.genre_id = al.genre_id
JOIN track_stat ts ON ts.track_id = t.track_id;

COMMENT ON VIEW track_card IS
    'Everything a track row in the UI needs. liked is per caller, through row-level security.';

CREATE VIEW playlist_card WITH (security_invoker = true) AS
SELECT p.playlist_id,
       p.owner_id,
       p.public_id AS id,
       p.name,
       p.description,
       p.is_public,
       p.cover_seed,
       p.updated_at,
       p.owner_id IS NOT DISTINCT FROM current_user_id() AS is_owner,
       jsonb_build_object('id', u.public_id, 'username', u.username,
                          'display_name', u.display_name) AS owner,
       (SELECT count(*) FROM playlist_track pt WHERE pt.playlist_id = p.playlist_id)
           AS track_count,
       playlist_duration_ms(p.playlist_id) AS duration_ms,
       playlist_follower_count(p.playlist_id) AS followers
FROM playlist p
JOIN app_user u ON u.user_id = p.owner_id;

COMMENT ON VIEW playlist_card IS
    'A playlist header. Private playlists of other listeners never appear (row-level security).';

GRANT SELECT ON track_card, playlist_card TO vamusic_anon, vamusic_listener, vamusic_admin;
