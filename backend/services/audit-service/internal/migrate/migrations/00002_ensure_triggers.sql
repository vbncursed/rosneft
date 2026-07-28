-- +goose Up
-- +goose StatementBegin
-- Attaches audit_capture() to every audited table that already exists, skipping
-- the rest, and reports how many it newly attached.
--
-- audit-service migrates independently of catalog/auth/content, so a plain
-- CREATE TRIGGER would fail on a fresh install where those tables do not exist
-- yet. This is called on every boot instead, so tables created later are picked
-- up without anyone having to order the services' migrations.
--
-- Columns per entry: table, entity name, pk column, label column. An empty pk
-- or label marks a composite-key join table that has neither; the whole row is
-- still captured in old_row/new_row.
--
-- territory_artifacts / model_artifacts are deliberately absent: mesh-worker
-- writes them with no human actor, and the conversion is already visible
-- through jobs and logs. permissions is a static catalogue changed only by
-- migrations. The credential tables (recovery_codes, twofa_*, passkey_*) hold
-- secrets — their events are recorded by the gateway, not their rows.
CREATE FUNCTION ensure_audit_triggers() RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    spec     TEXT[];
    attached INT := 0;
    specs    TEXT[][] := ARRAY[
        ARRAY['territories',           'territory',            'id', 'slug' ],
        ARRAY['models',                'model',                'id', 'slug' ],
        ARRAY['placements',            'placement',            'id', 'label'],
        ARRAY['territory_assignments', 'territory_assignment', '',   ''     ],
        ARRAY['panoramas',             'panorama',             'id', 'slug' ],
        ARRAY['territory_documents',   'document',             'id', 'title'],
        ARRAY['users',                 'user',                 'id', 'email'],
        ARRAY['user_roles',            'user_role',            '',   ''     ],
        ARRAY['roles',                 'role',                 'id', 'slug' ],
        ARRAY['role_permissions',      'role_permission',      '',   ''     ]
    ];
BEGIN
    FOREACH spec SLICE 1 IN ARRAY specs LOOP
        CONTINUE WHEN to_regclass('public.' || spec[1]) IS NULL;
        CONTINUE WHEN EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgrelid = ('public.' || spec[1])::regclass
              AND tgname  = 'audit_' || spec[1]
        );
        EXECUTE format(
            'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I '
            'FOR EACH ROW EXECUTE FUNCTION audit_capture(%L, %L, %L)',
            'audit_' || spec[1], spec[1], spec[2], spec[3], spec[4]
        );
        attached := attached + 1;
    END LOOP;
    RETURN attached;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION IF EXISTS ensure_audit_triggers();
-- +goose StatementEnd
