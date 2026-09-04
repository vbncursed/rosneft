package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// ListJobs answers GET /api/jobs: the latest job per catalog target that is
// still worth showing, filtered to what the caller may see. It is the poll
// behind the console's Content screen, so it declines caching outright.
//
// Registered on the root router like WatchJobEvents — the `jobs` tag is
// excluded from the generated stubs.
func (s *Server) ListJobs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if !allAccess && scopeAdminID == "" {
		writeJobs(w, nil) // fail-closed, as ListTerritories does
		return
	}
	jobs, err := s.svc.ListTargetJobs(ctx)
	if err != nil {
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, errMsg(err))
		return
	}
	visible := map[string]bool{}
	if !allAccess {
		territories, err := s.svc.ListTerritories(ctx, scopeAdminID)
		if err != nil {
			apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, errMsg(err))
			return
		}
		for _, t := range territories {
			visible[t.Slug] = true
		}
	}
	out := make([]domain.Job, 0, len(jobs))
	for _, j := range jobs {
		if visibleJob(j, visible, allAccess) {
			out = append(out, j)
		}
	}
	writeJobs(w, out)
}

// visibleJob is the one rule both /api/jobs and the per-id stream apply.
// Succeeded is never shown: the artifacts already say "ready", and a stale
// "succeeded" would outlive a replaced source. Models are shared by decision;
// a territory needs to be in the caller's visible set unless they are Root.
func visibleJob(j domain.Job, visible map[string]bool, allAccess bool) bool {
	if j.Status == domain.JobStatusSucceeded {
		return false
	}
	return j.Kind != domain.KindTerritory || allAccess || visible[j.Slug]
}

func writeJobs(w http.ResponseWriter, jobs []domain.Job) {
	resp := make([]Job, len(jobs))
	for i, j := range jobs {
		resp[i] = jobToAPI(j)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}
