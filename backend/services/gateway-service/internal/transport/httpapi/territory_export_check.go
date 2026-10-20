package httpapi

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
)

// ExportTerritoryCheck answers what the matching download would send — its
// exact filename and length — or the refusal it would answer, so the browser
// can start the download natively knowing it will succeed. It runs
// prepareExport, the code the download routes run up to the first byte, and
// streams nothing. A normal /api operation: it inherits the session and the
// territory gate from the group by its route pattern.
func (s *Server) ExportTerritoryCheck(ctx context.Context, req ExportTerritoryCheckRequestObject) (ExportTerritoryCheckResponseObject, error) {
	v, ok := checkVariant(req.Params.Variant)
	if !ok {
		return &exportRefusal{http.StatusBadRequest, apperr.SlugInvalidInput, "variant must be one of compressed, compatible, obj"}, nil
	}
	p, ref := s.prepareExport(ctx, req.Slug, v)
	if ref != nil {
		return ref, nil
	}
	return ExportTerritoryCheck200JSONResponse{
		Body:    ExportCheck{Filename: p.filename, SizeBytes: p.size},
		Headers: ExportTerritoryCheck200ResponseHeaders{CacheControl: "no-store"},
	}, nil
}

// Mount registers the generated /api routes on r. A parameter the generated
// wrapper refuses (a missing or repeated query value) answers the {code,
// message} envelope like every other 400, not the wrapper's plain text.
func Mount(r chi.Router, s *Server) http.Handler {
	return HandlerWithOptions(NewStrictHandler(s, nil), ChiServerOptions{
		BaseRouter: r,
		ErrorHandlerFunc: func(w http.ResponseWriter, _ *http.Request, err error) {
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, err.Error())
		},
	})
}
