package httpapi

import (
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

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
