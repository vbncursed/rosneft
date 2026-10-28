//go:build integration

package storage_test

import (
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/storage"
)

// ZonesSuite runs the zone storage against a real Postgres: the territory scope
// of every id-addressed statement, tag resolution and the title index are SQL.
type ZonesSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG
}

func TestZonesSuite(t *testing.T) { suite.Run(t, new(ZonesSuite)) }

func (s *ZonesSuite) SetupSuite() {
	s.ctr, s.pool = startCatalogDB(&s.Suite)
	s.pg = storage.New(s.pool)
}

func (s *ZonesSuite) TearDownSuite() { stopCatalogDB(s.ctr, s.pool) }

func (s *ZonesSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(), `DELETE FROM site_zones`)
	assert.NilError(s.T(), err)
}

var corners = [4]domain.Vec3{{X: 0, Y: 1, Z: 2}, {X: 3, Y: 4, Z: 5}, {X: 6, Y: 7, Z: 8}, {X: 9, Y: 10, Z: 11}}

func zoneBody(title string, tags ...string) domain.ZoneCreate {
	return domain.ZoneCreate{Title: title, Corners: corners, TagSlugs: tags}
}

func (s *ZonesSuite) create(territory, title string, tags ...string) domain.Zone {
	s.T().Helper()
	z, err := s.pg.CreateZone(s.T().Context(), territory, zoneBody(title, tags...))
	assert.NilError(s.T(), err)
	return z
}

func slugs(tags []domain.ModelTag) []string {
	out := make([]string, len(tags))
	for i, t := range tags {
		out[i] = t.Slug
	}
	return out
}

func (s *ZonesSuite) rowCounts() (zones, links int) {
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(),
		`SELECT (SELECT count(*) FROM site_zones), (SELECT count(*) FROM site_zone_tags)`).Scan(&zones, &links))
	return zones, links
}

func (s *ZonesSuite) TestCreateZoneRoundTrip() {
	body := zoneBody("N2 Area", "power", "camp")
	body.DrawingWidthM, body.DrawingHeightM = new(7.5), new(13.0)
	z, err := s.pg.CreateZone(s.T().Context(), "a", body)
	assert.NilError(s.T(), err)

	assert.Assert(s.T(), z.ID > 0)
	assert.Equal(s.T(), z.Title, "N2 Area")
	assert.Equal(s.T(), z.Corners, corners)
	assert.DeepEqual(s.T(), slugs(z.Tags), []string{"camp", "power"}) // tag (seed) order
	assert.Equal(s.T(), z.Tags[0].Title, "Camp & accommodation")
	assert.Equal(s.T(), *z.DrawingWidthM, 7.5)
	assert.Equal(s.T(), *z.DrawingHeightM, 13.0)
	assert.Assert(s.T(), !z.CreatedAt.IsZero())

	listed, err := s.pg.ListZones(s.T().Context(), "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), listed, []domain.Zone{z})
}

func (s *ZonesSuite) TestListIsPerTerritoryAndEmptyIsNotNil() {
	s.create("a", "Camp", "camp")
	listed, err := s.pg.ListZones(s.T().Context(), "b")
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), listed != nil && len(listed) == 0)
}

func (s *ZonesSuite) TestCreateZoneUnknownTag() {
	_, err := s.pg.CreateZone(s.T().Context(), "a", zoneBody("Camp", "camp", "no-such-tag"))
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "unknown model tag")
	zones, links := s.rowCounts()
	assert.Equal(s.T(), zones+links, 0) // the insert rolled back
}

func (s *ZonesSuite) TestCreateZoneOnAnUnknownTerritory() {
	_, err := s.pg.CreateZone(s.T().Context(), "nope", zoneBody("Camp", "camp"))
	assert.ErrorIs(s.T(), err, domain.ErrTerritoryNotFound)
}

func (s *ZonesSuite) TestZoneTitleClash() {
	ctx := s.T().Context()
	s.create("a", "N2 Area", "nitrogen")
	other := s.create("a", "Camp", "camp")

	// Case and surrounding blanks do not make a different title.
	_, err := s.pg.CreateZone(ctx, "a", zoneBody("  n2 AREA ", "camp"))
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "a zone with this title already exists")

	_, err = s.pg.UpdateZone(ctx, "a", other.ID, domain.ZonePatch{Title: new("n2 area")})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "a zone with this title already exists")

	// The same title on another territory is fine.
	s.create("b", "N2 Area", "nitrogen")
}

func (s *ZonesSuite) TestUpdateZoneRenamesAndReplacesTags() {
	ctx := s.T().Context()
	z := s.create("a", "Camp", "camp", "power")
	assert.Assert(s.T(), z.DrawingWidthM == nil && z.DrawingHeightM == nil) // an unknown drawing scale reads nil

	renamed, err := s.pg.UpdateZone(ctx, "a", z.ID, domain.ZonePatch{Title: new("Camp 2")})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), renamed.Title, "Camp 2")
	assert.DeepEqual(s.T(), slugs(renamed.Tags), []string{"camp", "power"}) // tags untouched
	assert.Equal(s.T(), renamed.Corners, corners)

	retagged, err := s.pg.UpdateZone(ctx, "a", z.ID, domain.ZonePatch{SetTags: true, TagSlugs: []string{"lifting"}})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), retagged.Title, "Camp 2") // title untouched
	assert.DeepEqual(s.T(), slugs(retagged.Tags), []string{"lifting"})

	same, err := s.pg.UpdateZone(ctx, "a", z.ID, domain.ZonePatch{})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), slugs(same.Tags), []string{"lifting"})
}

func (s *ZonesSuite) TestUpdateZoneUnknownTagChangesNothing() {
	ctx := s.T().Context()
	z := s.create("a", "Camp", "camp")
	_, err := s.pg.UpdateZone(ctx, "a", z.ID, domain.ZonePatch{
		Title: new("Renamed"), SetTags: true, TagSlugs: []string{"no-such-tag"},
	})
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
	assert.ErrorContains(s.T(), err, "unknown model tag")

	listed, err := s.pg.ListZones(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), listed[0].Title, "Camp")
	assert.DeepEqual(s.T(), slugs(listed[0].Tags), []string{"camp"})
}

func (s *ZonesSuite) TestZoneForeignTerritoryIsNotFound() {
	ctx := s.T().Context()
	z := s.create("a", "Camp", "camp")

	_, err := s.pg.UpdateZone(ctx, "b", z.ID, domain.ZonePatch{Title: new("Hijacked")})
	assert.ErrorIs(s.T(), err, domain.ErrZoneNotFound)
	_, err = s.pg.UpdateZone(ctx, "b", z.ID, domain.ZonePatch{SetTags: true, TagSlugs: []string{"power"}})
	assert.ErrorIs(s.T(), err, domain.ErrZoneNotFound)
	assert.ErrorIs(s.T(), s.pg.DeleteZone(ctx, "b", z.ID), domain.ErrZoneNotFound)
	assert.ErrorIs(s.T(), s.pg.DeleteZone(ctx, "a", z.ID+1000), domain.ErrZoneNotFound)

	listed, err := s.pg.ListZones(ctx, "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), listed, []domain.Zone{z}) // row and tags intact
}

func (s *ZonesSuite) TestDeleteZoneTakesItsTagLinks() {
	z := s.create("a", "Camp", "camp", "power")
	assert.NilError(s.T(), s.pg.DeleteZone(s.T().Context(), "a", z.ID))
	zones, links := s.rowCounts()
	assert.Equal(s.T(), zones+links, 0)
}

func (s *ZonesSuite) TestDeleteTerritoryCascadesZones() {
	ctx := s.T().Context()
	_, err := s.pool.Exec(
		ctx,
		`INSERT INTO territories (slug, title, source_blob_hash) VALUES ('doomed', 'doomed', 'doomed')`,
	)
	assert.NilError(s.T(), err)
	s.create("doomed", "Camp", "camp", "power")
	survivor := s.create("a", "Camp", "camp")

	assert.NilError(s.T(), s.pg.DeleteTerritory(ctx, "doomed"))

	zones, links := s.rowCounts()
	assert.Equal(s.T(), zones, 1)
	assert.Equal(s.T(), links, 1)
	listed, err := s.pg.ListZones(ctx, "a")
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), listed, []domain.Zone{survivor})
}

// The journal names zone_tag.zone_id, models.tag_id and a calibration's
// document_id by the title of the row they point at; territory_documents is
// content-owned but shares this database.
func (s *ZonesSuite) TestResolveLabelsNamesZonesTagsAndDocuments() {
	ctx := s.T().Context()
	z := s.create("a", "N2 Area", "power")
	var tagID, docID int64
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT id FROM model_tags WHERE slug = 'power'`).Scan(&tagID))
	assert.NilError(s.T(), s.pool.QueryRow(ctx,
		`INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		 SELECT id, 'Site plan', repeat('a', 64) FROM territories WHERE slug = 'a' RETURNING id`).Scan(&docID))

	got, err := s.pg.ResolveLabels(ctx, map[string][]int64{"zone": {z.ID}, "model_tag": {tagID}, "document": {docID}})

	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), got, map[string]string{
		"zone:" + strconv.FormatInt(z.ID, 10):       "N2 Area",
		"model_tag:" + strconv.FormatInt(tagID, 10): "Power generation",
		"document:" + strconv.FormatInt(docID, 10):  "Site plan",
	})
	_, err = s.pool.Exec(ctx, `DELETE FROM territory_documents WHERE id = $1`, docID)
	assert.NilError(s.T(), err)
}
