-- 0006: hybrid search and vector recommendations.
--
-- Search combines two rankings with Reciprocal Rank Fusion (RRF):
--   lexical  full-text match on a weighted document (title A, artists B, album C, genre D),
--            with prefix matching on every word so it works as you type;
--   fuzzy    trigram similarity against whole words (strict_word_similarity), with a match
--            on the title counting double, which survives typos.
-- RRF scores each result 1/(k + rank) per list and sums them; k = 60 is the usual constant.
--
-- Recommendations use pgvector: each track has an 8-dimension audio-feature vector, and an
-- HNSW index answers "nearest tracks to this point" without scanning the catalog.

SET search_path = vamusic, public;

CREATE MATERIALIZED VIEW catalog_search AS
SELECT t.track_id,
       setweight(to_tsvector('simple', fold(t.title)), 'A')
    || setweight(to_tsvector('simple', fold(ar.name || ' ' || coalesce(feat.names, ''))), 'B')
    || setweight(to_tsvector('simple', fold(al.title)), 'C')
    || setweight(to_tsvector('simple', fold(coalesce(g.name, ''))), 'D') AS document,
       fold(t.title) AS title,
       fold(t.title || ' ' || ar.name || ' ' || coalesce(feat.names, '') || ' ' || al.title)
           AS haystack
FROM track t
JOIN album al USING (album_id)
JOIN artist ar ON ar.artist_id = al.artist_id
LEFT JOIN genre g ON g.genre_id = al.genre_id
LEFT JOIN LATERAL (
    SELECT string_agg(a2.name, ' ') AS names
    FROM track_credit c JOIN artist a2 USING (artist_id)
    WHERE c.track_id = t.track_id AND c.role = 'featured'
) feat ON true;

CREATE UNIQUE INDEX catalog_search_key ON catalog_search (track_id);
CREATE INDEX catalog_search_document_idx ON catalog_search USING gin (document);
CREATE INDEX catalog_search_haystack_idx ON catalog_search USING gin (haystack gin_trgm_ops);

-- Every word in the query becomes a prefix term: "mid tra" -> 'mid':* & 'tra':*
CREATE FUNCTION prefix_tsquery(p_query text) RETURNS tsquery
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    RETURN (
        SELECT to_tsquery('simple', coalesce(string_agg(quote_literal(w) || ':*', ' & '), ''))
        FROM regexp_split_to_table(fold(p_query), '[^[:alnum:]]+') AS w
        WHERE w <> ''
    );

-- The strict trigram threshold is lowered from the default 0.5 so one-letter typos match.
CREATE FUNCTION search_tracks(p_query text, p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, score double precision,
                   lexical_rank bigint, fuzzy_rank bigint)
    LANGUAGE sql STABLE
    SET pg_trgm.strict_word_similarity_threshold = 0.3
AS $$
WITH q AS (
    SELECT fold(p_query) AS folded, prefix_tsquery(p_query) AS tsq
),
lexical AS (
    SELECT s.track_id,
           row_number() OVER (ORDER BY ts_rank_cd(s.document, q.tsq) DESC, s.track_id) AS r
    FROM catalog_search s, q
    WHERE s.document @@ q.tsq
    ORDER BY r
    LIMIT 100
),
fuzzy AS (
    SELECT s.track_id,
           row_number() OVER (
               ORDER BY 2 * strict_word_similarity(q.folded, s.title)
                          + strict_word_similarity(q.folded, s.haystack) DESC,
                        s.track_id) AS r
    FROM catalog_search s, q
    WHERE q.folded <<% s.haystack
    ORDER BY r
    LIMIT 100
)
SELECT coalesce(l.track_id, f.track_id) AS track_id,
       coalesce(1.0 / (60 + l.r), 0) + coalesce(1.0 / (60 + f.r), 0) AS score,
       l.r AS lexical_rank,
       f.r AS fuzzy_rank
FROM lexical l
FULL JOIN fuzzy f USING (track_id)
ORDER BY score DESC, track_id
LIMIT p_limit;
$$;

COMMENT ON FUNCTION search_tracks(text, integer) IS
    'Hybrid search: prefix full-text + trigram fuzzy, fused with Reciprocal Rank Fusion (k = 60).';

-- ---------------------------------------------------------------------------------------------
-- Vector similarity
-- ---------------------------------------------------------------------------------------------

CREATE INDEX track_features_hnsw ON track USING hnsw (features vector_cosine_ops);

CREATE FUNCTION similar_tracks(p_track_id bigint, p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, similarity double precision)
    LANGUAGE sql STABLE AS $$
    SELECT t.track_id, 1 - (t.features <=> s.features) AS similarity
    FROM track s
    CROSS JOIN LATERAL (
        SELECT track_id, features FROM track
        WHERE track_id <> s.track_id AND features IS NOT NULL
        ORDER BY features <=> s.features
        LIMIT p_limit
    ) t
    WHERE s.track_id = p_track_id
    ORDER BY similarity DESC;
$$;

-- The listener's taste is the average feature vector of what they liked and played recently.
-- Candidates come from the HNSW index; ones they played in the last 30 days or already like
-- are filtered out. hnsw.iterative_scan (pgvector 0.8) keeps pulling from the index until
-- enough rows survive that filter, instead of returning a short list.
CREATE FUNCTION recommend_tracks(p_user_id bigint, p_limit integer DEFAULT 20)
    RETURNS TABLE (track_id bigint, score double precision, reason text)
    LANGUAGE plpgsql STABLE
    SET hnsw.iterative_scan = 'relaxed_order'
AS $$
DECLARE
    v_anchor timestamptz;
    v_taste  vector(8);
BEGIN
    SELECT coalesce(max(e.played_at), now()) INTO v_anchor
    FROM listening_event e WHERE e.user_id = p_user_id;

    SELECT avg(t.features) INTO v_taste
    FROM track t
    WHERE t.features IS NOT NULL
      AND t.track_id IN (
          SELECT l.track_id FROM track_like l WHERE l.user_id = p_user_id
          UNION ALL
          SELECT e.track_id FROM listening_event e
          WHERE e.user_id = p_user_id AND e.played_at > v_anchor - interval '90 days');

    IF v_taste IS NULL THEN
        -- Nothing to go on yet: fall back to what's trending.
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
            SELECT t.track_id, t.features <=> v_taste AS dist
            FROM track t
            WHERE t.features IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM track_like l
                              WHERE l.user_id = p_user_id AND l.track_id = t.track_id)
              AND NOT EXISTS (SELECT 1 FROM listening_event e
                              WHERE e.user_id = p_user_id AND e.track_id = t.track_id
                                AND e.played_at > v_anchor - interval '30 days')
            ORDER BY t.features <=> v_taste
            LIMIT p_limit * 3
        ) c
        JOIN track_stat ts USING (track_id)
        ORDER BY 2 DESC
        LIMIT p_limit;
END
$$;
