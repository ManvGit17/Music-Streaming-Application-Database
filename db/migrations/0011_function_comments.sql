-- 0011: describe every function in the catalog, so \df+ and other tools explain the schema.
-- tests/db/test_comments.py fails if a function in vamusic or audit is left without one.

SET search_path = vamusic, public;

-- Catalog and listener helpers
COMMENT ON FUNCTION format_duration(bigint) IS
    'Milliseconds as m:ss, or h:mm:ss from an hour up.';
COMMENT ON FUNCTION listener_tier(bigint) IS
    'A listener''s tier from total minutes played, from New Listener to Music Master. Fixed v1 GetUserTier, which ranked new listeners as Music Master.';
COMMENT ON FUNCTION monthly_revenue(date) IS
    'Sum of plan prices for active subscriptions overlapping the month of the given date. Fixed v1 CalculateMonthlyRevenue, which was wrong across year boundaries.';
COMMENT ON FUNCTION playlist_duration_ms(bigint) IS
    'Total length of a playlist''s tracks in milliseconds.';
COMMENT ON FUNCTION prefix_tsquery(text) IS
    'Turns a search query into an AND of prefix terms (''midnite tran'' becomes ''midnite'':* & ''tran'':*), so search works while typing.';

-- Events and counters
COMMENT ON FUNCTION ensure_listening_partitions(date, date) IS
    'Creates the monthly listening_event partitions covering [from, to) that do not exist yet; returns how many it made.';
COMMENT ON FUNCTION listening_event_count_insert() IS
    'Statement-level trigger: folds a batch of new listening events into track_stat and user_stat with one aggregate.';
COMMENT ON FUNCTION listening_event_count_delete() IS
    'Statement-level trigger: subtracts a batch of deleted listening events from track_stat and user_stat.';
COMMENT ON FUNCTION track_like_count() IS
    'Statement-level trigger: keeps track_stat.like_count in step with inserted and deleted likes.';
COMMENT ON FUNCTION track_stat_init() IS
    'Statement-level trigger: creates the zeroed track_stat row for each new track.';
COMMENT ON FUNCTION touch_updated_at() IS
    'Row trigger: sets updated_at to now() when a row actually changes.';
COMMENT ON FUNCTION refresh_analytics() IS
    'Refreshes every analytics materialized view concurrently and returns how long each took, in milliseconds.';

-- Wrapped
COMMENT ON FUNCTION listener_wrapped(bigint, integer) IS
    'A listener''s year in review as one JSON document: totals, top artists and tracks, the longest daily streak and their percentile.';
COMMENT ON FUNCTION my_wrapped(integer) IS
    'SECURITY DEFINER: listener_wrapped for the signed-in listener only, so the percentile can compare against everyone without exposing their rows.';

-- Search and recommendations
COMMENT ON FUNCTION similar_tracks(bigint, integer) IS
    'Nearest neighbours of a track by centred cosine similarity over audio features, through the HNSW expression index.';
COMMENT ON FUNCTION recommend_tracks(bigint, integer) IS
    'Tracks near a listener''s taste vector (liked and recently played tracks), skipping ones they know; trending for listeners with no history.';

-- Security definer functions
COMMENT ON FUNCTION auth_lookup(text) IS
    'SECURITY DEFINER, vamusic_app only: the account and password hash for a username or email, for sign-in. The only way to read a hash.';
COMMENT ON FUNCTION auth_touch_login(bigint) IS
    'SECURITY DEFINER, vamusic_app only: records the time of a successful sign-in.';
COMMENT ON FUNCTION register_listener(text, text, text, text) IS
    'SECURITY DEFINER: creates a listener''s public profile and private account together; returns the new ids.';
COMMENT ON FUNCTION playlist_follower_count(bigint) IS
    'SECURITY DEFINER: how many listeners follow a playlist, which row-level security would otherwise hide.';
COMMENT ON FUNCTION playlist_remove_track(bigint, bigint) IS
    'Removes a track from a playlist and closes the gap in positions.';
COMMENT ON FUNCTION playlist_reorder(bigint, bigint[]) IS
    'Sets a playlist''s order from an array of track ids in one UPDATE, relying on the deferrable position constraint.';

-- Audit
COMMENT ON FUNCTION audit.capture() IS
    'Generic audit trigger: logs the change, the signed-in user and the request role as JSONB. Argument 1 names the key column; further arguments are columns to redact.';
