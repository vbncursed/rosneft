-- +goose Up
-- +goose StatementBegin
-- Catalog's 00017 adds rescale_baseline_center_{x,y,z} beside
-- rescale_baseline_max. They are the same plumbing — written on a source
-- replace, cleared by the post-conversion rescale — so they join the list of
-- columns whose change alone files no journal entry. Body otherwise identical
-- to 00003.
CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_entity  TEXT   := TG_ARGV[0];
    v_pk_col  TEXT   := TG_ARGV[1];
    v_lbl_col TEXT   := TG_ARGV[2];
    v_redact  TEXT[] := ARRAY['password_hash', 'totp_secret', 'code_hash'];
    v_ignore  TEXT[] := ARRAY['updated_at', 'onboarding_tours_seen', 'rescale_baseline_max',
                              'rescale_baseline_center_x', 'rescale_baseline_center_y',
                              'rescale_baseline_center_z'];
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
-- Restore 00003's list.
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
