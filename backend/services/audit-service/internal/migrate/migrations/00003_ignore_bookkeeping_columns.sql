-- +goose Up
-- +goose StatementBegin
-- Widen the no-op guard from updated_at alone to a list of bookkeeping columns.
--
-- Columns that carry no editorial meaning would otherwise each produce a
-- journal entry a reader cannot act on:
--   updated_at            — bumped by every write, including idempotent upserts
--   onboarding_tours_seen — set when a user dismisses a first-run tooltip
--   rescale_baseline_max  — internal plumbing of the source-replacement rescale
--
-- Only writes that touch *nothing but* these are dropped; a change that also
-- edits a real column is still captured in full, ignored columns included.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entity  TEXT   := TG_ARGV[0];
    v_pk_col  TEXT   := TG_ARGV[1];
    v_lbl_col TEXT   := TG_ARGV[2];
    v_redact  TEXT[] := ARRAY['password_hash', 'totp_secret', 'code_hash'];
    v_ignore  TEXT[] := ARRAY['updated_at', 'onboarding_tours_seen', 'rescale_baseline_max'];
    v_old     JSONB;
    v_new     JSONB;
    v_row     JSONB;
    v_id      TEXT;
    v_label   TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_redact; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_redact; END IF;

    IF TG_OP = 'UPDATE' AND (v_old - v_ignore) = (v_new - v_ignore) THEN
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

-- +goose Down
-- +goose StatementBegin
-- Restore the updated_at-only guard from 00001.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
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
    RETURN NULL;
END $$;
-- +goose StatementEnd
