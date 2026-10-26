-- +goose Up
-- +goose StatementBegin
-- Adds the site-zone tables and the calibration points (catalog 00024-00026) to
-- the audited tables. The body is 00008's with four rows more; see 00002 for
-- what the columns mean. model_tags and site_zones carry a title, so their
-- entries name the row in the journal. site_zone_tags and
-- document_calibration_points have composite keys and no label, so the id and
-- label are empty and the row is in old_row/new_row. Boot attaches the triggers
-- (storage.EnsureTriggers), as for 00007.
CREATE OR REPLACE FUNCTION ensure_audit_triggers() RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    spec     TEXT[];
    attached INT := 0;
    specs    TEXT[][] := ARRAY[
        ARRAY['territories',                 'territory',            'id', 'slug' ],
        ARRAY['models',                      'model',                'id', 'slug' ],
        ARRAY['placements',                  'placement',            'id', 'label'],
        ARRAY['territory_assignments',       'territory_assignment', '',   ''     ],
        ARRAY['panoramas',                   'panorama',             'id', 'slug' ],
        ARRAY['territory_documents',         'document',             'id', 'title'],
        ARRAY['users',                       'user',                 'id', 'email'],
        ARRAY['user_roles',                  'user_role',            '',   ''     ],
        ARRAY['roles',                       'role',                 'id', 'slug' ],
        ARRAY['role_permissions',            'role_permission',      '',   ''     ],
        ARRAY['measurements',                'measurement',          'id', ''     ],
        ARRAY['placement_groups',            'placement_group',      'id', 'title'],
        ARRAY['panorama_phase_visibility',   'panorama_phase',       '',   ''     ],
        ARRAY['model_tags',                  'model_tag',            'id', 'title'],
        ARRAY['site_zones',                  'zone',                 'id', 'title'],
        ARRAY['site_zone_tags',              'zone_tag',             '',   ''     ],
        ARRAY['document_calibration_points', 'calibration',          '',   ''     ]
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
-- Detach first: the restored function no longer knows these tables, so a
-- trigger left behind would keep journalling them with nothing to say it should.
DROP TRIGGER IF EXISTS audit_model_tags ON public.model_tags;
DROP TRIGGER IF EXISTS audit_site_zones ON public.site_zones;
DROP TRIGGER IF EXISTS audit_site_zone_tags ON public.site_zone_tags;
DROP TRIGGER IF EXISTS audit_document_calibration_points ON public.document_calibration_points;

-- 00008's body, verbatim.
CREATE OR REPLACE FUNCTION ensure_audit_triggers() RETURNS int LANGUAGE plpgsql AS $$
DECLARE
    spec     TEXT[];
    attached INT := 0;
    specs    TEXT[][] := ARRAY[
        ARRAY['territories',               'territory',            'id', 'slug' ],
        ARRAY['models',                    'model',                'id', 'slug' ],
        ARRAY['placements',                'placement',            'id', 'label'],
        ARRAY['territory_assignments',     'territory_assignment', '',   ''     ],
        ARRAY['panoramas',                 'panorama',             'id', 'slug' ],
        ARRAY['territory_documents',       'document',             'id', 'title'],
        ARRAY['users',                     'user',                 'id', 'email'],
        ARRAY['user_roles',                'user_role',            '',   ''     ],
        ARRAY['roles',                     'role',                 'id', 'slug' ],
        ARRAY['role_permissions',          'role_permission',      '',   ''     ],
        ARRAY['measurements',              'measurement',          'id', ''     ],
        ARRAY['placement_groups',          'placement_group',      'id', 'title'],
        ARRAY['panorama_phase_visibility', 'panorama_phase',       '',   ''     ]
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
