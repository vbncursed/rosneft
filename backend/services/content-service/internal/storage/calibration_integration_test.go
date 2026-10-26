//go:build integration

package storage_test

import (
	"database/sql"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // registers "pgx" for goose
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/storage"
)

// CalibrationSuite covers document_calibration_points against the real schema.
type CalibrationSuite struct {
	suite.Suite
	pool *pgxpool.Pool
	ctr  *tcpostgres.PostgresContainer
	pg   *storage.PG

	docA int64 // on territory "a"
}

func TestCalibrationSuite(t *testing.T) { suite.Run(t, new(CalibrationSuite)) }

func (s *CalibrationSuite) SetupSuite() {
	ctx := s.T().Context()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(s.T(), err)
	s.ctr = ctr

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	db, err := sql.Open("pgx", dsn)
	assert.NilError(s.T(), err)
	defer func() { _ = db.Close() }()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, os.DirFS(catalogMigrations))
	assert.NilError(s.T(), err)
	_, err = provider.Up(ctx)
	assert.NilError(s.T(), err)

	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.pg = storage.New(s.pool)
	_, err = s.pool.Exec(ctx, `INSERT INTO territories (slug, title, source_blob_hash) VALUES ('a','a','a'), ('b','b','b')`)
	assert.NilError(s.T(), err)
}

func (s *CalibrationSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

func (s *CalibrationSuite) SetupTest() {
	_, err := s.pool.Exec(s.T().Context(), `DELETE FROM territory_documents`)
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pool.QueryRow(s.T().Context(), `
		INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		SELECT id, 'plan', 'doc' FROM territories WHERE slug = 'a' RETURNING id`).Scan(&s.docA))
}

func calibration(page, n int) domain.Calibration {
	c := domain.Calibration{Page: page}
	for i := range n {
		c.Points = append(c.Points, domain.CalibrationPoint{
			PDFX: float64(i), PDFY: 10, Scene: domain.Vec3{X: float64(i), Y: 1, Z: 2},
		})
	}
	c.Points[0].UTM = &domain.UTM{E: 500000, N: 6000000}
	return c
}

func (s *CalibrationSuite) idxs() []int {
	rows, err := s.pool.Query(s.T().Context(),
		`SELECT idx FROM document_calibration_points WHERE document_id = $1 ORDER BY idx`, s.docA)
	assert.NilError(s.T(), err)
	defer rows.Close()
	var out []int
	for rows.Next() {
		var i int
		assert.NilError(s.T(), rows.Scan(&i))
		out = append(out, i)
	}
	assert.NilError(s.T(), rows.Err())
	return out
}

func (s *CalibrationSuite) TestPutCalibrationReplacesSet() {
	ctx := s.T().Context()
	_, err := s.pg.PutDocumentCalibration(ctx, "a", s.docA, calibration(1, 3))
	assert.NilError(s.T(), err)
	_, err = s.pg.PutDocumentCalibration(ctx, "a", s.docA, calibration(2, 2))
	assert.NilError(s.T(), err)

	assert.DeepEqual(s.T(), s.idxs(), []int{0, 1})
	docs, err := s.pg.ListDocuments(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), docs[0].Calibration.Page, 2)
}

func (s *CalibrationSuite) TestCalibrationForeignDocumentNotFound() {
	ctx := s.T().Context()
	_, err := s.pg.PutDocumentCalibration(ctx, "b", s.docA, calibration(1, 2))
	assert.ErrorIs(s.T(), err, domain.ErrDocumentNotFound)
	assert.ErrorIs(s.T(), s.pg.DeleteDocumentCalibration(ctx, "b", s.docA), domain.ErrDocumentNotFound)
	assert.Equal(s.T(), len(s.idxs()), 0)
}

func (s *CalibrationSuite) TestDeleteCalibrationOnOwnDocument() {
	ctx := s.T().Context()
	_, err := s.pg.PutDocumentCalibration(ctx, "a", s.docA, calibration(1, 2))
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeleteDocumentCalibration(ctx, "a", s.docA))
	assert.NilError(s.T(), s.pg.DeleteDocumentCalibration(ctx, "a", s.docA)) // already none: not an error
	assert.Equal(s.T(), len(s.idxs()), 0)
}

func (s *CalibrationSuite) TestListDocumentsCarriesCalibration() {
	ctx := s.T().Context()
	want := calibration(3, 2)
	_, err := s.pg.PutDocumentCalibration(ctx, "a", s.docA, want)
	assert.NilError(s.T(), err)
	var bare int64
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `
		INSERT INTO territory_documents (territory_id, title, source_blob_hash)
		SELECT id, 'bare', 'doc2' FROM territories WHERE slug = 'a' RETURNING id`).Scan(&bare))

	docs, err := s.pg.ListDocuments(ctx, "a")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(docs), 2)
	byID := map[int64]domain.Document{docs[0].ID: docs[0], docs[1].ID: docs[1]}
	assert.DeepEqual(s.T(), byID[s.docA].Calibration, &want)
	assert.Assert(s.T(), byID[bare].Calibration == nil)
}

func (s *CalibrationSuite) TestDeleteDocumentDropsCalibration() {
	ctx := s.T().Context()
	_, err := s.pg.PutDocumentCalibration(ctx, "a", s.docA, calibration(1, 2))
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), s.pg.DeleteDocument(ctx, "a", s.docA))
	var n int
	assert.NilError(s.T(), s.pool.QueryRow(ctx, `SELECT count(*) FROM document_calibration_points`).Scan(&n))
	assert.Equal(s.T(), n, 0)
}
