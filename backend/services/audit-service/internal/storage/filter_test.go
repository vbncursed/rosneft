package storage

import (
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
	"gotest.tools/v3/assert"
)

type filterSuite struct{ suite.Suite }

func TestFilterSuite(t *testing.T) { suite.Run(t, new(filterSuite)) }

func (s *filterSuite) TestWhere() {
	from := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	to := from.Add(time.Hour)
	injection := "' OR 1=1 --"
	tests := []struct {
		name   string
		filter domain.Filter
		where  string
		args   []any
	}{
		{"scoped empty company", domain.Filter{}, " WHERE 1=1 AND company_id = $1", []any{""}},
		{
			"all companies ignores company",
			domain.Filter{AllCompanies: true, CompanyID: "ignored"},
			" WHERE 1=1",
			[]any{},
		},
		{
			"all filters scoped",
			domain.Filter{
				CompanyID: "company",
				ActorID:   "actor",
				Action:    "update",
				Entity:    "model",
				From:      from,
				To:        to,
			},
			" WHERE 1=1 AND company_id = $1 AND actor_id = $2 AND action = $3 AND entity = $4 AND at >= $5 AND at <= $6",
			[]any{"company", "actor", "update", "model", from, to},
		},
		{
			"sparse filters root",
			domain.Filter{AllCompanies: true, Action: "delete", To: to},
			" WHERE 1=1 AND action = $1 AND at <= $2",
			[]any{"delete", to},
		},
		{
			"untrusted values are parameters",
			domain.Filter{CompanyID: injection, ActorID: injection, Action: injection, Entity: injection},
			" WHERE 1=1 AND company_id = $1 AND actor_id = $2 AND action = $3 AND entity = $4",
			[]any{injection, injection, injection, injection},
		},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			where, args := filterWhere(tt.filter)
			assert.Equal(s.T(), where, tt.where)
			assert.DeepEqual(s.T(), args, tt.args)
		})
	}
}

func (s *filterSuite) TestWhereIgnoresPaging() {
	f := domain.Filter{CompanyID: "company", ActorID: "actor"}
	where, args := filterWhere(f)
	f.Cursor, f.Limit, f.IncludeTotal = 42, 25, true
	pagedWhere, pagedArgs := filterWhere(f)
	assert.Equal(s.T(), pagedWhere, where)
	assert.DeepEqual(s.T(), pagedArgs, args)
}
