-- +goose Up
-- +goose StatementBegin
CREATE TABLE audit_log (
    id           BIGSERIAL PRIMARY KEY,
    at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id     UUID,          -- NULL = system change (mesh-worker, migrations)
    company_id   UUID,          -- NULL = Root or system change
    action       TEXT NOT NULL, -- 'territory.update', 'auth.login'
    entity       TEXT NOT NULL,
    entity_id    TEXT,          -- pk as text: bigint in catalog, uuid in auth
    entity_label TEXT,          -- slug/email at the time; outlives the row
    old_row      JSONB,
    new_row      JSONB,
    request_id   TEXT,
    result       TEXT NOT NULL DEFAULT 'ok'
);

-- The Company Owner query, the Root query, and the actor filter respectively.
CREATE INDEX audit_log_company_idx ON audit_log (company_id, id DESC);
CREATE INDEX audit_log_id_idx      ON audit_log (id DESC);
CREATE INDEX audit_log_actor_idx   ON audit_log (actor_id, id DESC);
-- +goose StatementEnd

-- +goose StatementBegin
-- Generic capture trigger. TG_ARGV: entity name, pk column, label column.
-- An empty pk/label column means the table has none (composite-key join
-- tables) — the full row is still in old_row/new_row.
--
-- The actor arrives as transaction-local settings published by pkg/audittx.
-- current_setting(..., true) tolerates their absence, so background work
-- (the mesh-worker reconciler, migrations) is logged with a NULL actor rather
-- than failing the mutation.
CREATE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entity  TEXT   := TG_ARGV[0];
    v_pk_col  TEXT   := TG_ARGV[1];
    v_lbl_col TEXT   := TG_ARGV[2];
    v_redact  TEXT[] := ARRAY['password_hash', 'totp_secret', 'code_hash'];
    v_old     JSONB;
    v_new     JSONB;
    v_row     JSONB;
    v_id      TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_redact; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_redact; END IF;

    -- An upsert with unchanged values still bumps updated_at; logging it would
    -- fill the journal with entries whose diff is empty.
    IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
        RETURN NULL;
    END IF;

    v_row := COALESCE(v_new, v_old);
    IF v_pk_col  <> '' THEN v_id    := v_row ->> v_pk_col;  END IF;
    IF v_lbl_col <> '' THEN v_label := v_row ->> v_lbl_col; END IF;

    INSERT INTO audit_log (actor_id, company_id, action, entity, entity_id,
                           entity_label, old_row, new_row, request_id)
    VALUES (
        NULLIF(current_setting('app.actor_id',   true), '')::UUID,
        NULLIF(current_setting('app.company_id', true), '')::UUID,
        v_entity || '.' || lower(TG_OP),
        v_entity, v_id, v_label, v_old, v_new,
        NULLIF(current_setting('app.request_id', true), '')
    );
    RETURN NULL; -- AFTER trigger: the return value is ignored
END $$;
-- +goose StatementEnd

-- +goose StatementBegin
-- Append-only. A REVOKE alone would not hold: POSTGRES_USER owns every table
-- and could GRANT the right back. This trigger fires against the owner too.
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END $$;
-- +goose StatementEnd

-- +goose StatementBegin
-- TRUNCATE cannot share a trigger definition with row events, hence two.
CREATE TRIGGER audit_log_no_mutate BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
    FOR EACH STATEMENT EXECUTE FUNCTION audit_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
DROP TRIGGER IF EXISTS audit_log_no_mutate ON audit_log;
DROP FUNCTION IF EXISTS audit_immutable();
DROP FUNCTION IF EXISTS audit_capture();
DROP TABLE IF EXISTS audit_log;
-- +goose StatementEnd
