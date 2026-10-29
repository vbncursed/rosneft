// In-package test: auditCSVHeader and auditCSVRow are unexported.
package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
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

// Порядок первых восьми колонок — обещание, данное всем, кто уже читает этот
// экспорт позиционно: awk по номеру поля, макрос в таблице, импорт по фиксированным
// индексам. Вставка колонки в середину сдвигает всё после неё без ошибки и без
// предупреждения, поэтому проверяется буквальный префикс, а не только имена.
// Новые колонки дописываются после auditCSVLegacyWidth.
func (s *AuditCSVSuite) TestLegacyPrefixNeverMoves() {
	shipped := []string{
		"at", "actor_id", "company_id", "action", "entity", "entity_id",
		"entity_label", "result",
	}

	assert.Equal(s.T(), auditCSVLegacyWidth, len(shipped))
	assert.Assert(s.T(), len(auditCSVHeader) >= auditCSVLegacyWidth)
	assert.DeepEqual(s.T(), auditCSVHeader[:auditCSVLegacyWidth], shipped)
}

// Ячейка, начинающаяся с = + - @ TAB CR, исполняется как формула при открытии
// в Excel/Sheets; логины и подписи сущностей задаёт пользователь. Колонок с
// числами здесь нет (все значения — текст, время RFC3339 начинается с цифры),
// поэтому защита одна для всех ячеек строки.
func (s *AuditCSVSuite) TestFormulaTriggersAreNeutralised() {
	for _, lead := range []string{"=", "+", "-", "@", "\t", "\r"} {
		cell := lead + "cmd|' /C calc'!A0"
		row := auditCSVRow(domain.AuditEntry{ActorLogin: cell, EntityLabel: cell, Action: "ok-1"})

		for _, got := range []string{row[6], row[8]} {
			assert.Equal(s.T(), got, "'"+cell)
		}
		assert.Equal(s.T(), row[3], "ok-1") // only a leading trigger counts
	}
}

// csvServiceStub serves the pages in order and records every query it saw.
type csvServiceStub struct {
	Service
	pages  []domain.AuditPage
	errAt  int // 1-based call that fails; 0 never
	err    error
	seen   []domain.AuditQuery
	scopes []domain.AuditScope
	onCall func(call int)
}

func (c *csvServiceStub) ListAudit(
	_ context.Context, q domain.AuditQuery, sc domain.AuditScope, _ string, _ bool,
) (domain.AuditPage, map[string]string, error) {
	c.seen = append(c.seen, q)
	c.scopes = append(c.scopes, sc)
	call := len(c.seen)
	if c.onCall != nil {
		c.onCall(call)
	}
	if call == c.errAt {
		return domain.AuditPage{}, nil, c.err
	}
	return c.pages[call-1], nil, nil
}

var csvOwner = authhttp.TestPrincipal{UserID: "root", IsOwner: true}

func (s *AuditCSVSuite) serve(
	svc Service, target string, p authhttp.TestPrincipal,
) *httptest.ResponseRecorder {
	ctx, cancel := context.WithCancel(authhttp.NewTestContextFor(s.T().Context(), p))
	defer cancel()
	rec := httptest.NewRecorder()
	New(svc).ServeAuditCSV(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, target, nil))
	return rec
}

func csvEntry(id string) domain.AuditEntry {
	return domain.AuditEntry{
		At: time.Date(2026, 7, 29, 22, 13, 20, 0, time.UTC), ActorID: "a" + id, Action: "x", Entity: "e",
		EntityID: id, Result: "ok",
	}
}

func (s *AuditCSVSuite) TestBadQueryIs400BeforeAnyRead() {
	for _, target := range []string{"/?from=yesterday", "/?to=nope", "/?cursor=abc"} {
		svc := &csvServiceStub{}

		rec := s.serve(svc, target, csvOwner)

		assert.Equal(s.T(), rec.Code, http.StatusBadRequest, target)
		assert.Assert(s.T(), strings.Contains(rec.Body.String(), "invalid_input"), rec.Body.String())
		assert.Equal(s.T(), len(svc.seen), 0)
	}
}

func (s *AuditCSVSuite) TestPrincipalWithoutAuditScopeIs403() {
	svc := &csvServiceStub{}

	rec := s.serve(svc, "/", authhttp.TestPrincipal{UserID: "u", AuditCompany: "c1", Perms: []string{"audit:read_own"}})

	assert.Equal(s.T(), rec.Code, http.StatusForbidden)
	assert.Assert(s.T(), strings.Contains(rec.Body.String(), "no audit scope for this principal"))
	assert.Equal(s.T(), len(svc.seen), 0)
}

func (s *AuditCSVSuite) TestFirstPageFailureMapsToStatus() {
	tests := []struct {
		name string
		err  error
		code int
		body string
	}{
		{"forbidden", domain.ErrForbidden, http.StatusForbidden, "no audit scope for this principal"},
		{"invalid", domain.ErrInvalidInput, http.StatusBadRequest, domain.ErrInvalidInput.Error()},
		{"other", errors.New("boom"), http.StatusInternalServerError, "audit export failed"},
	}
	for _, tt := range tests {
		s.Run(tt.name, func() {
			svc := &csvServiceStub{errAt: 1, err: tt.err}

			rec := s.serve(svc, "/", csvOwner)

			assert.Equal(s.T(), rec.Code, tt.code)
			assert.Assert(s.T(), strings.Contains(rec.Body.String(), tt.body), rec.Body.String())
			assert.Assert(s.T(), !strings.Contains(rec.Body.String(), "boom"))
			assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), "")
		})
	}
}

func (s *AuditCSVSuite) TestSinglePageBytesAndHeaders() {
	e := csvEntry("1")
	e.EntityLabel = "a,b \"q\"\nline"
	e.ActorLogin = "=cmd"
	svc := &csvServiceStub{pages: []domain.AuditPage{{Entries: []domain.AuditEntry{e}}}}

	rec := s.serve(svc, "/?actor=u1&action=act&entity=ent&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z", csvOwner)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), rec.Header().Get("Content-Type"), "text/csv; charset=utf-8")
	assert.Equal(s.T(), rec.Header().Get("Content-Disposition"), `attachment; filename="audit.csv"`)
	assert.Equal(s.T(), rec.Body.String(),
		"at,actor_id,company_id,action,entity,entity_id,entity_label,result,actor_login,company_login,territory\n"+
			"2026-07-29T22:13:20Z,a1,,x,e,1,\"a,b \"\"q\"\"\nline\",ok,'=cmd,,\n")
	assert.Equal(s.T(), len(svc.seen), 1)
	q := svc.seen[0]
	assert.Equal(s.T(), q.ActorID+q.Action+q.Entity, "u1actent")
	assert.Equal(s.T(), q.Limit, csvPageSize)
	assert.Equal(s.T(), q.From, time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	assert.Equal(s.T(), q.To, time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC))
	assert.Equal(s.T(), svc.scopes[0], domain.AuditScope{All: true})
}

func (s *AuditCSVSuite) TestPagesAreFollowedByCursor() {
	svc := &csvServiceStub{pages: []domain.AuditPage{
		{Entries: []domain.AuditEntry{csvEntry("3"), csvEntry("2")}, NextCursor: 2},
		{Entries: []domain.AuditEntry{csvEntry("1")}},
	}}

	rec := s.serve(svc, "/?cursor=9", csvOwner)

	lines := strings.Split(strings.TrimSpace(rec.Body.String()), "\n")
	assert.Equal(s.T(), len(lines), 4)
	assert.Assert(s.T(), strings.HasPrefix(lines[1], "2026-07-29T22:13:20Z,a3,"))
	assert.Assert(s.T(), strings.HasPrefix(lines[3], "2026-07-29T22:13:20Z,a1,"))
	assert.Equal(s.T(), len(svc.seen), 2)
	assert.Equal(s.T(), svc.seen[0].Cursor, int64(9))
	assert.Equal(s.T(), svc.seen[1].Cursor, int64(2))
	assert.Equal(s.T(), svc.scopes[1], svc.scopes[0])
}

func (s *AuditCSVSuite) TestLaterPageFailureLeavesAShortBodyWith200() {
	svc := &csvServiceStub{
		pages: []domain.AuditPage{{Entries: []domain.AuditEntry{csvEntry("2")}, NextCursor: 2}},
		errAt: 2, err: errors.New("boom"),
	}

	rec := s.serve(svc, "/", csvOwner)

	assert.Equal(s.T(), rec.Code, http.StatusOK)
	assert.Equal(s.T(), len(strings.Split(strings.TrimSpace(rec.Body.String()), "\n")), 2)
	assert.Equal(s.T(), len(svc.seen), 2)
}

func (s *AuditCSVSuite) TestCancelledRequestStopsPaging() {
	ctx, cancel := context.WithCancel(authhttp.NewTestContextFor(s.T().Context(), csvOwner))
	defer cancel()
	svc := &csvServiceStub{
		pages:  []domain.AuditPage{{Entries: []domain.AuditEntry{csvEntry("2")}, NextCursor: 2}},
		onCall: func(int) { cancel() },
	}
	rec := httptest.NewRecorder()

	New(svc).ServeAuditCSV(rec, httptest.NewRequestWithContext(ctx, http.MethodGet, "/", nil))

	assert.Equal(s.T(), len(svc.seen), 1)
	assert.Equal(s.T(), len(strings.Split(strings.TrimSpace(rec.Body.String()), "\n")), 2)
}

// errWriter fails every write, like a client that hung up.
type errWriter struct{ *httptest.ResponseRecorder }

func (errWriter) Write([]byte) (int, error) { return 0, errors.New("hung up") }

func (s *AuditCSVSuite) TestWriteFailureStopsPaging() {
	big := make([]domain.AuditEntry, 200)
	for i := range big {
		big[i] = csvEntry("1")
		big[i].EntityLabel = strings.Repeat("x", 100)
	}
	svc := &csvServiceStub{pages: []domain.AuditPage{{Entries: big, NextCursor: 5}, {}}}
	ctx := authhttp.NewTestContextFor(s.T().Context(), csvOwner)

	req := httptest.NewRequestWithContext(ctx, http.MethodGet, "/", nil)
	New(svc).ServeAuditCSV(errWriter{httptest.NewRecorder()}, req)

	assert.Equal(s.T(), len(svc.seen), 1)
}
