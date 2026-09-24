-- +goose Up
-- +goose StatementBegin
-- Adds catalog's placement_groups to the audited tables. The body is 00005's
-- with one row more; see 00002 for what the columns mean. Placement hiding and
-- grouping land on placements (hidden, group_id), already audited and not in
-- audit_capture()'s ignore list, so they need nothing here.
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
        ARRAY['measurements',          'measurement',          'id', ''     ],
        ARRAY['placement_groups',      'placement_group',      'id', 'title']
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
DROP TRIGGER IF EXISTS audit_placement_groups ON public.placement_groups;

-- 00005's body, verbatim.
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
