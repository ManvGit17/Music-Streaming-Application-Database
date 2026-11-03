-- 0012: summarize the listening_event BRIN index after bulk loads.
--
-- A BRIN index keeps a min/max summary per block range, but ranges filled after the index was
-- created stay unsummarized until VACUUM or brin_summarize_new_values() runs, and a scan has to
-- read every unsummarized range. The index is created by migration 0004, before any data, so a
-- freshly seeded database got no benefit from it: a one-hour query read the whole partition
-- (scripts/bench_brin.py measures this). Live traffic is covered by autovacuum; bulk loads call
-- this function.

SET search_path = vamusic, public;

CREATE FUNCTION summarize_listening_events() RETURNS integer
    LANGUAGE sql
    SET search_path = vamusic, public
    RETURN (
        SELECT coalesce(sum(brin_summarize_new_values(relid)), 0)::integer
        FROM pg_partition_tree('vamusic.listening_event_played_brin'::regclass)
        WHERE isleaf
    );

COMMENT ON FUNCTION summarize_listening_events() IS
    'Summarizes the block ranges of every listening_event partition''s BRIN index that have none yet; returns how many it summarized. Run after bulk loads.';

REVOKE EXECUTE ON FUNCTION summarize_listening_events() FROM PUBLIC;
