-- +goose Up
-- +goose StatementBegin
-- Adds catalog's measurements (saved ruler chains) to the audited tables. The
-- body is 00002's with one row more; see 00002 for what the columns mean.
--
-- measurements has an id but no label column. audit_capture() reads the pk
-- and the label independently, so the empty label yields entity_id = id and a
-- NULL entity_label — the chain itself is in old_row/new_row.
CREATE OR REPLACE FUNCTION ensure_audit_triggers() RETURNS int LANGUAGE plpgsql AS $$
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
        ARRAY['role_permissions',      'role_permission',      '',   ''     ],
        ARRAY['measurements',          'measurement',          'id', ''     ]
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
-- Detach first: the restored function no longer knows the table, so a trigger
-- left behind would keep journalling it with nothing to say it should.
DROP TRIGGER IF EXISTS audit_measurements ON public.measurements;

-- 00002's body, verbatim.
CREATE OR REPLACE FUNCTION ensure_audit_triggers() RETURNS int LANGUAGE plpgsql AS $$
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
