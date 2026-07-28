package service_test

import (
	"context"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/service/mocks"
)

type ListSuite struct {
	suite.Suite
	mc *minimock.Controller
}

func TestListSuite(t *testing.T) {
	suite.Run(t, new(ListSuite))
}

func (s *ListSuite) SetupTest() {
	s.mc = minimock.NewController(s.T())
}

// A tenant-scoped read with a blank company id would degrade to "every row
// whose company is NULL" — precisely Root's and the system's actions, which a
// Company Owner must never see. Refuse rather than execute.
func (s *ListSuite) TestScopedListRequiresCompany() {
	svc := service.New(mocks.NewStoreMock(s.mc))

	_, _, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: false, CompanyID: ""})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

// The store is asked for one row more than the caller wants; that extra row is
// the "there is another page" signal and must not be returned.
func (s *ListSuite) TestExtraRowBecomesCursorNotResult() {
	store := mocks.NewStoreMock(s.mc).
		ListMock.Return([]domain.Entry{{ID: 30}, {ID: 20}, {ID: 10}}, nil)
	svc := service.New(store)

	entries, next, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, Limit: 2})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 2)
	assert.Equal(s.T(), entries[1].ID, int64(20))
	assert.Equal(s.T(), next, int64(20))
}

func (s *ListSuite) TestLastPageHasNoCursor() {
	store := mocks.NewStoreMock(s.mc).
		ListMock.Return([]domain.Entry{{ID: 30}, {ID: 20}}, nil)
	svc := service.New(store)

	entries, next, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, Limit: 5})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 2)
	assert.Equal(s.T(), next, int64(0))
}

// A caller-supplied limit must not let one request drag the whole journal.
func (s *ListSuite) TestLimitIsClamped() {
	var got domain.Filter
	store := mocks.NewStoreMock(s.mc).
		ListMock.Set(func(_ context.Context, f domain.Filter) ([]domain.Entry, error) {
		got = f
		return nil, nil
	})
	svc := service.New(store)

	_, _, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true, Limit: 5000})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Limit, int32(201)) // maxLimit 200 + the lookahead row
}

func (s *ListSuite) TestZeroLimitFallsBackToDefault() {
	var got domain.Filter
	store := mocks.NewStoreMock(s.mc).
		ListMock.Set(func(_ context.Context, f domain.Filter) ([]domain.Entry, error) {
		got = f
		return nil, nil
	})
	svc := service.New(store)

	_, _, err := svc.List(s.T().Context(), domain.Filter{AllCompanies: true})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.Limit, int32(51)) // defaultLimit 50 + the lookahead row
}

func (s *ListSuite) TestRecordRejectsEmptyAction() {
	svc := service.New(mocks.NewStoreMock(s.mc))

	_, err := svc.Record(s.T().Context(), domain.Entry{})

	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *ListSuite) TestRecordDefaultsResultToOK() {
	var got domain.Entry
	store := mocks.NewStoreMock(s.mc).
		RecordMock.Set(func(_ context.Context, e domain.Entry) (int64, error) {
		got = e
		return 1, nil
	})
	svc := service.New(store)

	id, err := svc.Record(s.T().Context(), domain.Entry{Action: "auth.login"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), id, int64(1))
	assert.Equal(s.T(), got.Result, "ok")
}
