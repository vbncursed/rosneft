package httpapi

import (
	"encoding/csv"
	"net/http"
	"strconv"
	"time"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// csvPageSize is the chunk the export pulls per round trip. It is the service's
// own maximum, so one page is one gRPC call and the writer never buffers more
// than that many rows.
const csvPageSize int32 = 200

var auditCSVHeader = []string{
	"at", "actor_id", "company_id", "action", "entity", "entity_id",
	"entity_label", "result",
}

// ServeAuditCSV streams the filtered journal as CSV.
//
// It lives on the root router rather than the /api JSON sub-router because
// ETagMiddleware hashes the whole response body, which means buffering it —
// unacceptable for an export that may run to many pages. The asset proxy and
// the SSE stream sit outside that chain for the same reason, so authentication
// and the audit:read gate are applied to this route by hand in InitRouter.
func (s *Server) ServeAuditCSV(w http.ResponseWriter, r *http.Request) {
	q, err := auditCSVQuery(r)
	if err != nil {
		apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, err.Error())
		return
	}
	ctx := r.Context()
	isOwner, company := authhttp.IsOwner(ctx), authhttp.AuditCompany(ctx)

	// Resolve the scope before writing a byte: once the header is sent the
	// status code is fixed, and a 200 with a truncated body would read as a
	// complete export.
	first, next, err := s.svc.ListAudit(ctx, q, isOwner, company)
	if err != nil {
		writeAuditCSVError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="audit.csv"`)
	cw := csv.NewWriter(w)
	defer cw.Flush()

	if err := cw.Write(auditCSVHeader); err != nil {
		return // client hung up
	}
	page := first
	for {
		for _, e := range page {
			if err := cw.Write(auditCSVRow(e)); err != nil {
				return
			}
		}
		cw.Flush()
		if next == 0 || ctx.Err() != nil {
			return
		}
		q.Cursor = next
		page, next, err = s.svc.ListAudit(ctx, q, isOwner, company)
		if err != nil {
			// The header is already out; log-free bail is the only option left.
			return
		}
	}
}

func auditCSVRow(e domain.AuditEntry) []string {
	return []string{
		e.At.Format(time.RFC3339),
		e.ActorID, e.CompanyID, e.Action, e.Entity, e.EntityID, e.EntityLabel, e.Result,
	}
}

func writeAuditCSVError(w http.ResponseWriter, err error) {
	switch {
	case isForbidden(err):
		apperr.Write(w, http.StatusForbidden, apperr.SlugForbidden, "no audit scope for this principal")
	case isInvalid(err):
		apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, err.Error())
	default:
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, "audit export failed")
	}
}

// auditCSVQuery parses the same filters as GET /api/audit. The page size is
// fixed rather than caller-controlled: this endpoint pages until exhausted, so
// a limit would only change the round-trip count.
func auditCSVQuery(r *http.Request) (domain.AuditQuery, error) {
	v := r.URL.Query()
	q := domain.AuditQuery{
		ActorID: v.Get("actor"),
		Action:  v.Get("action"),
		Entity:  v.Get("entity"),
		Limit:   csvPageSize,
	}
	var err error
	if q.From, err = parseCSVTime(v.Get("from")); err != nil {
		return domain.AuditQuery{}, err
	}
	if q.To, err = parseCSVTime(v.Get("to")); err != nil {
		return domain.AuditQuery{}, err
	}
	if c := v.Get("cursor"); c != "" {
		if q.Cursor, err = strconv.ParseInt(c, 10, 64); err != nil {
			return domain.AuditQuery{}, err
		}
	}
	return q, nil
}

func parseCSVTime(s string) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	return time.Parse(time.RFC3339, s)
}
