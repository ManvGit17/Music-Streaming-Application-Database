-- 0008: an append-only audit log for catalog and account changes.
--
-- One generic trigger function records who changed what: the signed-in user (if any), the
-- request role, and for updates only the columns that actually changed, as JSONB.
-- Secrets are never copied into the log.

SET search_path = vamusic, public;

CREATE TABLE audit.change_log (
    change_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    changed_at timestamptz NOT NULL DEFAULT now(),
    actor_id   bigint,
    db_role    text NOT NULL,
    table_name text NOT NULL,
    operation  text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_key    jsonb NOT NULL,
    before     jsonb,
    after      jsonb
);

CREATE INDEX change_log_table_idx ON audit.change_log (table_name, changed_at DESC);
CREATE INDEX change_log_actor_idx ON audit.change_log (actor_id, changed_at DESC);

CREATE FUNCTION audit.capture() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = vamusic, public
AS $$
DECLARE
    -- TG_ARGV[0] names the primary-key column; any further arguments are columns to redact.
    v_key    text := TG_ARGV[0];
    v_old    jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    v_new    jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    v_redact text[] := TG_ARGV[1:];
    v_before jsonb;
    v_after  jsonb;
BEGIN
    IF v_redact IS NOT NULL THEN
        v_old := v_old - v_redact;
        v_new := v_new - v_redact;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Keep only the keys whose values changed.
        SELECT jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, v_new -> o.key)
        INTO v_before, v_after
        FROM jsonb_each(v_old) o
        WHERE o.value IS DISTINCT FROM v_new -> o.key;
        IF v_before IS NULL THEN
            RETURN NULL;  -- nothing visible changed
        END IF;
    ELSE
        v_before := v_old;
        v_after := v_new;
    END IF;

    INSERT INTO audit.change_log (actor_id, db_role, table_name, operation, row_key, before, after)
    -- Inside SECURITY DEFINER, current_user is this function's owner. The role the request
    -- switched to with SET ROLE is still visible through the 'role' setting.
    VALUES (current_user_id(),
            coalesce(nullif(current_setting('role'), 'none'), session_user),
            TG_TABLE_NAME, TG_OP,
            jsonb_build_object(v_key, coalesce(v_new, v_old) -> v_key),
            v_before, v_after);
    RETURN NULL;
END
$$;

CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON genre
    FOR EACH ROW EXECUTE FUNCTION audit.capture('genre_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON artist
    FOR EACH ROW EXECUTE FUNCTION audit.capture('artist_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON album
    FOR EACH ROW EXECUTE FUNCTION audit.capture('album_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON track
    FOR EACH ROW EXECUTE FUNCTION audit.capture('track_id');
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON plan
    FOR EACH ROW EXECUTE FUNCTION audit.capture('plan_id');
CREATE TRIGGER audit AFTER UPDATE OR DELETE ON user_account
    FOR EACH ROW EXECUTE FUNCTION audit.capture('user_id', 'password_hash');

REVOKE ALL ON audit.change_log FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION audit.capture() FROM PUBLIC;
GRANT SELECT ON audit.change_log TO vamusic_admin;
