-- name: mine
SELECT * FROM vamusic.playlist_card
WHERE owner_id = vamusic.current_user_id()
ORDER BY updated_at DESC;

-- name: public
SELECT * FROM vamusic.playlist_card
WHERE is_public
ORDER BY followers DESC, playlist_id
LIMIT :limit;

-- name: by_id
-- Another listener's private playlist simply isn't returned (row-level security).
SELECT * FROM vamusic.playlist_card WHERE id = CAST(:id AS uuid);

-- name: tracks
SELECT c.*
FROM vamusic.playlist_track pt
JOIN vamusic.track_card c ON c.track_id = pt.track_id
WHERE pt.playlist_id = :playlist_id
ORDER BY pt.position;

-- name: create
INSERT INTO vamusic.playlist (owner_id, name, description, is_public, cover_seed)
VALUES (vamusic.current_user_id(), :name, :description, :is_public,
        (random() * 1e9)::integer)
RETURNING public_id AS id;

-- name: update
UPDATE vamusic.playlist SET
    name = coalesce(:name, name),
    description = CASE WHEN :has_description THEN :description ELSE description END,
    is_public = coalesce(:is_public, is_public)
WHERE public_id = CAST(:id AS uuid)
RETURNING public_id AS id;

-- name: delete
DELETE FROM vamusic.playlist WHERE public_id = CAST(:id AS uuid) RETURNING playlist_id;

-- name: add_track
SELECT vamusic.playlist_add_track(:playlist_id, :track_id) AS added;

-- name: remove_track
SELECT vamusic.playlist_remove_track(:playlist_id, t.track_id) AS removed
FROM vamusic.track t
WHERE t.public_id = CAST(:track_id AS uuid);

-- name: reorder
-- Unknown ids become NULL, which playlist_reorder rejects.
SELECT vamusic.playlist_reorder(:playlist_id, array(
    SELECT t.track_id
    FROM unnest(CAST(:track_ids AS uuid[])) WITH ORDINALITY AS o(public_id, ord)
    LEFT JOIN vamusic.track t ON t.public_id = o.public_id
    ORDER BY o.ord));

-- name: follow
INSERT INTO vamusic.playlist_follow (user_id, playlist_id)
VALUES (vamusic.current_user_id(), :playlist_id)
ON CONFLICT DO NOTHING;

-- name: unfollow
DELETE FROM vamusic.playlist_follow WHERE playlist_id = :playlist_id;
