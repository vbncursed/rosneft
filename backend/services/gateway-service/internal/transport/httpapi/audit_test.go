package httpapi

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListAuditSuite covers the company journal route's one paging decision: it
// never asks for the total. It is polled every 30 s while the page follows,
// and a COUNT on every tick would be paid for by nobody.
type ListAuditSuite struct {
	suite.Suite
}

func TestListAuditSuite(t *testing.T) { suite.Run(t, new(ListAuditSuite)) }

func (s *ListAuditSuite) TestDoesNotAskForTheTotal() {
	svc := &mineServiceStub{page: domain.AuditPage{Total: 184}}
	ctx := authhttp.NewTestContextFor(s.T().Context(), authhttp.TestPrincipal{
		UserID: "owner-1", Perms: []string{"audit:read"},
		OwningAdmin: "company-1", AuditCompany: "company-1",
	})

	resp, err := New(svc).ListAudit(ctx, ListAuditRequestObject{})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), svc.seen.IncludeTotal, false)
	page, ok := resp.(ListAudit200JSONResponse)
	assert.Assert(s.T(), ok, "expected 200, got %T", resp)
	assert.Assert(s.T(), page.Total == nil, "the company journal carries no total")
}

func (s *ListAuditSuite) TestFiltersAndPage() {
	from := time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)
	to := from.Add(time.Hour)
	svc := &mineServiceStub{
		page: domain.AuditPage{
			Entries:    []domain.AuditEntry{{ID: 42, Action: "update", Entity: "territory", Result: "success"}},
			NextCursor: 17,
		},
		refs: map[string]string{"x": "name"},
	}
	ctx := authhttp.NewTestContextFor(
		s.T().Context(),
		authhttp.TestPrincipal{UserID: "owner", Perms: []string{"audit:read"}, AuditCompany: "company-1"},
	)
	resp, err := New(
		svc,
	).ListAudit(ctx, ListAuditRequestObject{Params: ListAuditParams{Actor: new("other"), Action: new("update"), Entity: new("territory"), From: &from, To: &to, Cursor: new(int64(20)), Limit: new(int32(5))}})
	assert.NilError(s.T(), err)
	assert.DeepEqual(
		s.T(),
		svc.seen,
		domain.AuditQuery{
			CompanyID: "company-1",
			ActorID:   "other",
			Action:    "update",
			Entity:    "territory",
			From:      from,
			To:        to,
			Cursor:    20,
			Limit:     5,
		},
	)
	page, ok := resp.(ListAudit200JSONResponse)
	assert.Assert(s.T(), ok)
	assert.Equal(s.T(), page.Entries[0].Id, int64(42))
	assert.Equal(s.T(), *page.NextCursor, int64(17))
	assert.Equal(s.T(), (*page.Refs)["x"], "name")
}

func (s *ListAuditSuite) TestErrorsAndEmptyPage() {
	ctx := authhttp.NewTestContextFor(
		s.T().Context(),
		authhttp.TestPrincipal{UserID: "owner", Perms: []string{"audit:read"}, AuditCompany: "company-1"},
	)
	for _, tc := range []struct {
		name     string
		err      error
		expected any
	}{
		{"forbidden", domain.ErrForbidden, ListAudit403JSONResponse{}},
		{"invalid", domain.ErrInvalidInput, ListAudit400JSONResponse{}},
		{"internal", errors.New("private detail"), ListAudit500JSONResponse{}},
	} {
		s.Run(tc.name, func() {
			resp, err := New(&mineServiceStub{err: tc.err}).ListAudit(ctx, ListAuditRequestObject{})
			assert.NilError(s.T(), err)
			assert.Equal(s.T(), reflect.TypeOf(resp), reflect.TypeOf(tc.expected))
			if internal, ok := resp.(ListAudit500JSONResponse); ok {
				assert.Equal(s.T(), internal.Code, apperr.SlugInternal)
				assert.Equal(s.T(), internal.Message, apperr.InternalMessage)
			}
		})
	}
	resp, err := New(&mineServiceStub{}).ListAudit(ctx, ListAuditRequestObject{})
	assert.NilError(s.T(), err)
	page := resp.(ListAudit200JSONResponse)
	assert.Assert(s.T(), page.Entries != nil && len(page.Entries) == 0)
	assert.Assert(s.T(), page.NextCursor == nil && page.Refs == nil)
	denied, err := New(&mineServiceStub{}).ListAudit(s.T().Context(), ListAuditRequestObject{})
	assert.NilError(s.T(), err)
	_, ok := denied.(ListAudit403JSONResponse)
	assert.Assert(s.T(), ok)
}
