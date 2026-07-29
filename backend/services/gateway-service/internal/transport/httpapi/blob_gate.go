package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// RequireBlobAccess refuses a caller the bytes behind a hash they cannot reach.
//
// A blob hash addresses content and is deduplicated across territories and
// models, so RequireTerritoryAccess cannot cover it: there is no single
// territory to check against. The catalog answers the question instead, by
// looking for any row holding this hash that the caller can see.
//
// Answers 404 for a refusal, never 403 — a 403 confirms the blob exists — and
// 503 when the catalog itself failed, which is neither "yours" nor "missing"
// and must not be reported as either.
//
// MUST be mounted after Authenticate.
//
// ponytail: one indexed lookup per asset request. Against a 15 MB GLB download
// it is noise; cache per session if it ever shows up in a profile.
func (s *Server) RequireBlobAccess(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		scopeAdminID, allAccess := authhttp.Scope(ctx)
		if allAccess {
			next.ServeHTTP(w, r)
			return
		}
		// An empty scope on a non-Root principal is an upstream bug. Passing ""
		// to the catalog disables the filter and would open every blob.
		if scopeAdminID == "" {
			writeBlobMissing(w)
			return
		}
		allowed, err := s.svc.ResolveBlobAccess(ctx, chi.URLParam(r, "hash"), scopeAdminID)
		if err != nil {
			apperr.Write(w, http.StatusServiceUnavailable, apperr.SlugInternal,
				"cannot verify asset access")
			return
		}
		if !allowed {
			writeBlobMissing(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeBlobMissing(w http.ResponseWriter) {
	apperr.Write(w, http.StatusNotFound, apperr.SlugNotFound, "asset not found")
}
