//go:build integration

package storage_test

import (
	"time"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"gotest.tools/v3/assert"
)

func (s *ModelTagsSuite) TestCreateModelTagRoundTrip() {
	made, err := s.pg.CreateModelTag(s.T().Context(), "welding", "Welding")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), made.Slug, "welding")
	assert.Equal(s.T(), made.Title, "Welding")
	assert.Assert(s.T(), made.ID > 0)

	tags, err := s.pg.ListModelTags(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(tags), 13)
	assert.Equal(s.T(), tags[12].Slug, "welding")
}

func (s *ModelTagsSuite) TestCreateModelTagRefusesATakenSlugOrTitle() {
	for name, c := range map[string][2]string{
		"slug":  {"camp", "Another title"},
		"title": {"fresh", "  flare SYSTEM "},
	} {
		_, err := s.pg.CreateModelTag(s.T().Context(), c[0], c[1])
		assert.ErrorIs(s.T(), err, domain.ErrInvalidInput, name)
		assert.ErrorContains(s.T(), err, "already exists", name)
	}
}

func (s *ModelTagsSuite) TestUpdateModelTagRetitlesOnly() {
	out, err := s.pg.UpdateModelTag(s.T().Context(), "camp", "Camps")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), out.Slug, "camp")
	assert.Equal(s.T(), out.Title, "Camps")

	// A model keeps pointing at the same row, so it reads the new title.
	s.create("pump", "camp")
	got, err := s.pg.GetModel(s.T().Context(), "pump")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Tag.Title, "Camps")
}

func (s *ModelTagsSuite) TestUpdateModelTagRefusals() {
	_, err := s.pg.UpdateModelTag(s.T().Context(), "no-such-tag", "X")
	assert.ErrorIs(s.T(), err, domain.ErrModelTagNotFound)

	_, err = s.pg.UpdateModelTag(s.T().Context(), "camp", "Flare system")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "already exists")
}

func (s *ModelTagsSuite) TestDeleteModelTag() {
	ctx := s.T().Context()
	_, err := s.pg.CreateModelTag(ctx, "unused", "Unused")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeleteModelTag(ctx, "unused"))
	assert.ErrorIs(s.T(), s.pg.DeleteModelTag(ctx, "unused"), domain.ErrModelTagNotFound)
	s.create("used", "camp")
	assert.ErrorIs(s.T(), s.pg.DeleteModelTag(ctx, "camp"), domain.ErrModelTagInUse)
}

func (s *ModelTagsSuite) TestDeleteModelTagUsedByZone() {
	ctx := s.T().Context()
	var territoryID, zoneID int64
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `INSERT INTO territories (slug, title, source_blob_hash)
		VALUES ('tag-test', 'tag-test', 'tag-test') RETURNING id`).Scan(&territoryID))
	defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM territories WHERE id = $1`, territoryID) }()
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `INSERT INTO site_zones (territory_id, title, points)
		VALUES ($1, 'zone', ARRAY[0,0,0,1,0,0,1,0,1,0,0,1]::float8[]) RETURNING id`, territoryID).Scan(&zoneID))
	_, err := s.pool.Exec(ctx, `INSERT INTO site_zone_tags (zone_id, tag_id)
		SELECT $1, id FROM model_tags WHERE slug = 'camp'`, zoneID)
	assert.NilError(s.T(), err)
	assert.ErrorIs(s.T(), s.pg.DeleteModelTag(ctx, "camp"), domain.ErrModelTagInUse)
}

// A delete holding the tag row forces each concurrent assignment to wait. Once
// the delete commits, the assignment must reject the now-unknown tag.
func (s *ModelTagsSuite) TestDeleteConcurrentWithAssignment() {
	ctx := s.T().Context()
	for _, kind := range []string{"model", "model-update", "zone"} {
		s.Run(kind, func() {
			slug := "race-" + kind
			_, err := s.pg.CreateModelTag(ctx, slug, "Race "+kind)
			assert.NilError(s.T(), err)
			if kind == "model-update" {
				_, err = s.pg.CreateModel(
					ctx,
					domain.Model{
						Slug:           slug,
						Title:          slug,
						SourceBlobHash: slug,
						Tag:            domain.ModelTag{Slug: "ungrouped"},
					},
				)
				assert.NilError(s.T(), err)
				defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM models WHERE slug = $1`, slug) }()
			}
			if kind == "zone" {
				_, err = s.pool.Exec(
					ctx,
					`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1)`,
					slug,
				)
				assert.NilError(s.T(), err)
				defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM territories WHERE slug = $1`, slug) }()
			}
			tx, err := s.pool.Begin(ctx)
			assert.NilError(s.T(), err)
			defer func() { _ = tx.Rollback(ctx) }()
			_, err = tx.Exec(ctx, `DELETE FROM model_tags WHERE slug = $1`, slug)
			assert.NilError(s.T(), err)
			done := make(chan error, 1)
			go func() {
				switch kind {
				case "model":
					_, e := s.pg.CreateModel(
						ctx,
						domain.Model{Slug: slug, Title: slug, SourceBlobHash: slug, Tag: domain.ModelTag{Slug: slug}},
					)
					done <- e
				case "model-update":
					_, e := s.pg.UpdateModel(ctx, slug, domain.ModelPatch{TagSlug: &slug})
					done <- e
				default:
					_, e := s.pg.CreateZone(ctx, slug, domain.ZoneCreate{Title: slug, TagSlugs: []string{slug}})
					done <- e
				}
			}()
			deadline := time.Now().Add(5 * time.Second)
			for {
				var waiting bool
				err = s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid)))`, tx.Conn().PgConn().PID()).
					Scan(&waiting)
				assert.NilError(s.T(), err)
				if waiting {
					break
				}
				if time.Now().After(deadline) {
					s.T().Fatal("assignment did not wait for delete")
				}
				time.Sleep(10 * time.Millisecond)
			}
			assert.NilError(s.T(), tx.Commit(ctx))
			assert.ErrorIs(s.T(), <-done, domain.ErrInvalidInput)
		})
	}
}

func (s *ModelTagsSuite) TestAssignmentConcurrentWithDelete() {
	ctx := s.T().Context()
	for _, kind := range []string{"model", "zone"} {
		s.Run(kind, func() {
			slug := "assign-" + kind
			_, err := s.pg.CreateModelTag(ctx, slug, "Assign "+kind)
			assert.NilError(s.T(), err)
			defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM model_tags WHERE slug = $1`, slug) }()
			if kind == "zone" {
				_, err = s.pool.Exec(
					ctx,
					`INSERT INTO territories (slug, title, source_blob_hash) VALUES ($1, $1, $1)`,
					slug,
				)
				assert.NilError(s.T(), err)
				defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM territories WHERE slug = $1`, slug) }()
			} else {
				defer func() { _, _ = s.pool.Exec(ctx, `DELETE FROM models WHERE slug = $1`, slug) }()
			}
			tx, err := s.pool.Begin(ctx)
			assert.NilError(s.T(), err)
			defer func() { _ = tx.Rollback(ctx) }()
			if kind == "model" {
				_, err = tx.Exec(ctx, `INSERT INTO models (slug, title, source_blob_hash, tag_id)
					SELECT $1, $1, $1, id FROM model_tags WHERE slug = $1`, slug)
			} else {
				_, err = tx.Exec(ctx, `WITH z AS (INSERT INTO site_zones (territory_id, title, points)
					SELECT id, $1, ARRAY[0,0,0,1,0,0,1,0,1,0,0,1]::float8[] FROM territories WHERE slug = $1 RETURNING id)
					INSERT INTO site_zone_tags (zone_id, tag_id) SELECT z.id, t.id FROM z, model_tags t WHERE t.slug = $1`, slug)
			}
			assert.NilError(s.T(), err)
			done := make(chan error, 1)
			go func() { done <- s.pg.DeleteModelTag(ctx, slug) }()
			deadline := time.Now().Add(5 * time.Second)
			for {
				var waiting bool
				err = s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND $1 = ANY(pg_blocking_pids(pid))
					AND query LIKE '%DELETE FROM model_tags%')`, tx.Conn().PgConn().PID()).
					Scan(&waiting)
				assert.NilError(s.T(), err)
				if waiting {
					break
				}
				if time.Now().After(deadline) {
					s.T().Fatal("delete did not wait for assignment")
				}
				time.Sleep(10 * time.Millisecond)
			}
			assert.NilError(s.T(), tx.Commit(ctx))
			assert.ErrorIs(s.T(), <-done, domain.ErrModelTagInUse)
		})
	}
}
