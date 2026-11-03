-- 0010: centred cosine similarity for audio features.
--
-- Every audio feature lies in [0, 1], so all feature vectors point into the same corner of the
-- space: their cosine similarity can never be negative, and a track's nearest neighbours all
-- scored about 0.99. Measuring from the neutral point 0.5 instead lets similarity use -1..1:
-- "high energy, low acousticness" and its opposite now point in opposite directions, and
-- neighbours' scores separate.
--
-- The HNSW index is rebuilt on the expression centred(features)::vector(8). pgvector needs the
-- dimension and PostgreSQL drops type modifiers from function results, hence the cast; both
-- similarity functions order by exactly that expression so the planner can use the index.

SET search_path = vamusic, public;

CREATE FUNCTION centred(v vector) RETURNS vector
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    SET search_path = vamusic, public
    RETURN v - '[0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5]'::vector;

COMMENT ON FUNCTION centred(vector) IS
    'An audio-feature vector measured from the neutral point 0.5, for cosine similarity.';

DROP INDEX track_features_hnsw;
CREATE INDEX track_features_centred_hnsw ON track
    USING hnsw ((centred(features)::vector(8)) vector_cosine_ops);

CREATE OR REPLACE FUNCTION similar_tracks(p_track_id bigint, p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, similarity double precision)
    LANGUAGE sql STABLE
    SET search_path = vamusic, public
AS $$
    SELECT t.track_id,
           1 - (centred(t.features)::vector(8) <=> centred(s.features)::vector(8)) AS similarity
    FROM track s
    CROSS JOIN LATERAL (
        SELECT track_id, features FROM track
        WHERE track_id <> s.track_id AND features IS NOT NULL
        ORDER BY centred(features)::vector(8) <=> centred(s.features)::vector(8)
        LIMIT p_limit
    ) t
    WHERE s.track_id = p_track_id
    ORDER BY similarity DESC;
$$;

CREATE OR REPLACE FUNCTION recommend_tracks(p_user_id bigint, p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, score double precision, reason text)
    LANGUAGE plpgsql STABLE
    SET search_path = vamusic, public
    SET hnsw.iterative_scan = 'relaxed_order'
AS $$
DECLARE
    v_anchor timestamptz;
    v_taste  vector(8);
BEGIN
    SELECT coalesce(max(e.played_at), now()) INTO v_anchor
    FROM listening_event e WHERE e.user_id = p_user_id;

    SELECT centred(avg(t.features)) INTO v_taste
    FROM track t
    WHERE t.features IS NOT NULL
      AND t.track_id IN (
          SELECT l.track_id FROM track_like l WHERE l.user_id = p_user_id
          UNION ALL
          SELECT e.track_id FROM listening_event e
          WHERE e.user_id = p_user_id AND e.played_at > v_anchor - interval '90 days');

    IF v_taste IS NULL THEN
        RETURN QUERY
            SELECT tt.track_id, tt.score::double precision, 'trending'::text
            FROM trending_track tt ORDER BY tt.rank LIMIT p_limit;
        RETURN;
    END IF;

    RETURN QUERY
        SELECT c.track_id,
               (1 - c.dist) * 0.9 + 0.1 * coalesce(ln(1 + ts.play_count) / 15, 0),
               'taste'::text
        FROM (
            SELECT t.track_id, centred(t.features)::vector(8) <=> v_taste AS dist
            FROM track t
            WHERE t.features IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM track_like l
                              WHERE l.user_id = p_user_id AND l.track_id = t.track_id)
              AND NOT EXISTS (SELECT 1 FROM listening_event e
                              WHERE e.user_id = p_user_id AND e.track_id = t.track_id
                                AND e.played_at > v_anchor - interval '30 days')
            ORDER BY centred(t.features)::vector(8) <=> v_taste
            LIMIT p_limit * 3
        ) c
        JOIN track_stat ts USING (track_id)
        ORDER BY 2 DESC
        LIMIT p_limit;
END
$$;

REVOKE EXECUTE ON FUNCTION centred(vector) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION centred(vector) TO vamusic_anon, vamusic_listener, vamusic_admin;
