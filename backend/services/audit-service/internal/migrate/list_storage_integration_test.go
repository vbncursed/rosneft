//go:build integration

package migrate_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/suite"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
	"gotest.tools/v3/assert"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/transport/grpcapi"
)

const (
	actorA = "11111111-1111-4111-8111-111111111111"
	actorB = "22222222-2222-4222-8222-222222222222"
	// This suite's own actor, written by nobody else, so the row below cannot
	// move a count another case asserts whatever order the suite runs in.
	actorC = "55555555-5555-4555-8555-555555555555"
	// The one company any row in this suite carries; every SetupSuite row
	// leaves it NULL, so the scoped count has exactly this row to find.
	companyA = "44444444-4444-4444-8444-444444444444"
	companyB = "33333333-3333-4333-8333-333333333333"
)

type ListStorageSuite struct {
	suite.Suite
	pool  *pgxpool.Pool
	ctr   *tcpostgres.PostgresContainer
	store *storage.PG
}

func TestListStorageSuite(t *testing.T) { suite.Run(t, new(ListStorageSuite)) }

func (s *ListStorageSuite) SetupSuite() {
	ctx := context.Background()
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"), tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"), tcpostgres.BasicWaitStrategies())
	assert.NilError(s.T(), err)
	s.ctr = ctr
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(s.T(), err)
	assert.NilError(s.T(), migrate.Up(ctx, dsn))
	s.pool, err = pgxpool.New(ctx, dsn)
	assert.NilError(s.T(), err)
	s.store = storage.New(s.pool)
	for i, actor := range []string{actorA, actorA, actorB, actorA, actorB} {
		_, err := s.store.Record(s.T().Context(), domain.Entry{
			ActorID: actor, Action: "auth.login", Entity: "session", Result: "ok",
		})
		assert.NilError(s.T(), err, "row %d", i)
	}
}

func (s *ListStorageSuite) TearDownSuite() {
	if s.pool != nil {
		s.pool.Close()
	}
	if s.ctr != nil {
		_ = testcontainers.TerminateContainer(s.ctr)
	}
}

// The count answers for everything the filters match; the page and its cursor
// are not filters.
func (s *ListStorageSuite) TestCountIgnoresPagingAndHonoursTheActor() {
	all := domain.Filter{AllCompanies: true, ActorID: actorA}

	first, err := s.store.List(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorA, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(first), 2)

	nA, err := s.store.Count(
		s.T().Context(),
		domain.Filter{AllCompanies: true, ActorID: actorA, Cursor: first[1].ID, Limit: 2},
	)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nA, int64(3))

	nAll, err := s.store.Count(s.T().Context(), all)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nAll, int64(3))

	nB, err := s.store.Count(s.T().Context(), domain.Filter{AllCompanies: true, ActorID: actorB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), nB, int64(2))
}

// A scoped count sees its own company's rows and only those: 0 for a company
// nobody wrote — the NULL-company rows of SetupSuite are not it — and 1 for the
// company that has exactly one. Without the positive half a Count that always
// answered 0 would pass.
func (s *ListStorageSuite) TestScopedCountSeesOnlyItsCompany() {
	_, err := s.store.Record(s.T().Context(), domain.Entry{
		ActorID: actorC, CompanyID: companyA, Action: "auth.login", Entity: "session", Result: "ok",
	})
	assert.NilError(s.T(), err)

	n, err := s.store.Count(s.T().Context(), domain.Filter{CompanyID: companyA})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(1))

	n, err = s.store.Count(s.T().Context(), domain.Filter{CompanyID: companyB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, int64(0))
}

func (s *ListStorageSuite) TestListAndDistinctActorsRespectCompanyScope() {
	ctx := s.T().Context()
	const company = "66666666-6666-4666-8666-666666666666"
	var ids []int64
	for _, actor := range []string{actorA, actorB, "", actorA} {
		id, err := s.store.Record(ctx, domain.Entry{
			ActorID: actor, CompanyID: company, Action: "auth.login", Entity: "session", Result: "ok",
		})
		assert.NilError(s.T(), err)
		ids = append(ids, id)
	}

	page, err := s.store.List(ctx, domain.Filter{CompanyID: company, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page), 2)
	assert.Equal(s.T(), page[0].ID, ids[3])
	assert.Equal(s.T(), page[1].ID, ids[2])
	assert.Equal(s.T(), page[1].ActorID, "")

	next, err := s.store.List(ctx, domain.Filter{CompanyID: company, Cursor: page[1].ID, Limit: 2})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(next), 2)
	assert.Equal(s.T(), next[0].ID, ids[1])
	assert.Equal(s.T(), next[1].ID, ids[0])

	actors, err := s.store.DistinctActors(ctx, domain.Filter{
		CompanyID: company, ActorID: actorB, Action: "ignored", Cursor: ids[0], Limit: 1,
	})
	assert.NilError(s.T(), err)
	assert.DeepEqual(s.T(), actors, []string{actorA, actorB})

	actors, err = s.store.DistinctActors(ctx, domain.Filter{CompanyID: companyB})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(actors), 0)

	const actorD = "88888888-8888-4888-8888-888888888888"
	const actorE = "99999999-9999-4999-8999-999999999999"
	for _, entry := range []domain.Entry{
		{ActorID: actorD, CompanyID: company, Action: "auth.login", Entity: "session", Result: "ok"},
		{ActorID: actorE, CompanyID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", Action: "auth.login", Entity: "session", Result: "ok"},
	} {
		_, err = s.store.Record(ctx, entry)
		assert.NilError(s.T(), err)
	}
	actors, err = s.store.DistinctActors(ctx, domain.Filter{AllCompanies: true, CompanyID: company})
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), len(actors) >= 4)
	assert.DeepEqual(s.T(), actors[:2], []string{actorE, actorD})
}

func (s *ListStorageSuite) TestListEntries() {
	ctx := s.T().Context()
	const company = "77777777-7777-4777-8777-777777777777"
	for _, actor := range []string{actorA, actorB} {
		_, err := s.store.Record(ctx, domain.Entry{
			ActorID: actor, CompanyID: company, Action: "auth.login", Entity: "session", Result: "ok",
		})
		assert.NilError(s.T(), err)
	}
	server := grpcapi.New(service.New(s.store))
	page, err := server.ListEntries(ctx, &auditv1.ListEntriesRequest{CompanyId: company, Limit: 1, IncludeTotal: true})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page.Entries), 1)
	assert.Equal(s.T(), page.Entries[0].ActorId, actorB)
	assert.Equal(s.T(), page.Total, int64(2))
	assert.Equal(s.T(), page.NextCursor, page.Entries[0].Id)

	next, err := server.ListEntries(
		ctx,
		&auditv1.ListEntriesRequest{CompanyId: company, Limit: 1, Cursor: page.NextCursor},
	)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(next.Entries), 1)
	assert.Equal(s.T(), next.Entries[0].ActorId, actorA)
	assert.Equal(s.T(), next.NextCursor, int64(0))

	_, err = server.ListEntries(ctx, &auditv1.ListEntriesRequest{})
	assert.Equal(s.T(), status.Code(err), codes.InvalidArgument)
}

func (s *ListStorageSuite) TestListEntriesFiltersAndMapsFields() {
	ctx := s.T().Context()
	const company = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	at := time.Date(2020, 1, 5, 12, 0, 0, 0, time.UTC)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO audit_log (at, actor_id, company_id, action, entity, result) VALUES
			($1, $2, $3, 'wanted', 'model', 'ok'),
			($1, $4, $3, 'wanted', 'model', 'ok'),
			($1, $2, $3, 'other',  'model', 'ok'),
			($1, $2, $3, 'wanted', 'other', 'ok'),
			($1 - interval '2 days', $2, $3, 'wanted', 'model', 'ok'),
			($1 + interval '2 days', $2, $3, 'wanted', 'model', 'ok')`, at, actorA, company, actorB)
	assert.NilError(s.T(), err)

	server := grpcapi.New(service.New(s.store))
	page, err := server.ListEntries(ctx, &auditv1.ListEntriesRequest{
		CompanyId: company, ActorId: actorA, Action: "wanted", Entity: "model",
		From: timestamppb.New(at.Add(-time.Hour)), To: timestamppb.New(at.Add(time.Hour)), IncludeTotal: true,
	})
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(page.Entries), 1)
	assert.Equal(s.T(), page.Total, int64(1))
	assert.Equal(s.T(), page.Entries[0].CompanyId, company)
	assert.Equal(s.T(), page.Entries[0].ActorId, actorA)
	assert.Equal(s.T(), page.Entries[0].Action, "wanted")
	assert.Equal(s.T(), page.Entries[0].Entity, "model")
	assert.Assert(s.T(), page.Entries[0].At.AsTime().Equal(at))
}
