// In-package test: auditCSVHeader and auditCSVRow are unexported.
package httpapi

import (
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

type AuditCSVSuite struct{ suite.Suite }

func TestAuditCSVSuite(t *testing.T) { suite.Run(t, new(AuditCSVSuite)) }

// Заголовок и строка обязаны быть одной длины. Колонка, добавленная в одно и
// забытая в другом, не падает и не ругается — она сдвигает все последующие
// поля, и экспорт молча начинает врать.
func (s *AuditCSVSuite) TestHeaderAndRowAgreeOnWidth() {
	row := auditCSVRow(domain.AuditEntry{})

	assert.Equal(s.T(), len(row), len(auditCSVHeader))
}

// Порядок значений должен соответствовать порядку имён. Проверяется по
// различимым значениям: перестановка двух колонок прошла бы проверку длины.
func (s *AuditCSVSuite) TestRowValuesLandUnderTheirOwnHeadings() {
	at := time.Date(2026, 7, 29, 22, 13, 20, 0, time.UTC)
	row := auditCSVRow(domain.AuditEntry{
		At:            at,
		ActorID:       "actor-id",
		ActorLogin:    "actor-login",
		CompanyID:     "company-id",
		CompanyLogin:  "company-login",
		Action:        "placement.update",
		Entity:        "placement",
		EntityID:      "65",
		EntityLabel:   "Test",
		TerritorySlug: "dji-wp-46-cut",
		Result:        "ok",
	})

	got := make(map[string]string, len(row))
	for i, name := range auditCSVHeader {
		got[name] = row[i]
	}

	assert.Equal(s.T(), got["at"], at.Format(time.RFC3339))
	assert.Equal(s.T(), got["actor_id"], "actor-id")
	assert.Equal(s.T(), got["actor_login"], "actor-login")
	assert.Equal(s.T(), got["company_id"], "company-id")
	assert.Equal(s.T(), got["company_login"], "company-login")
	assert.Equal(s.T(), got["action"], "placement.update")
	assert.Equal(s.T(), got["entity"], "placement")
	assert.Equal(s.T(), got["entity_id"], "65")
	assert.Equal(s.T(), got["entity_label"], "Test")
	assert.Equal(s.T(), got["territory"], "dji-wp-46-cut")
	assert.Equal(s.T(), got["result"], "ok")
}
