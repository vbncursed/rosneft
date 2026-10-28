package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"time"

	slogchi "github.com/samber/slog-chi"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/objexport"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// exportRefusal is an answer other than the file: the status and the {code,
// message} body. Both the download routes and export-check write refusals from
// here, so the same cause is the same bytes on either.
type exportRefusal struct {
	status        int
	code, message string
}

func (e *exportRefusal) write(w http.ResponseWriter) { apperr.Write(w, e.status, e.code, e.message) }

// VisitExportTerritoryCheckResponse lets a refusal be export-check's response.
func (e *exportRefusal) VisitExportTerritoryCheckResponse(w http.ResponseWriter) error {
	w.Header().Set("Cache-Control", "no-store")
	e.write(w)
	return nil
}

func territoryMissing() *exportRefusal {
	return &exportRefusal{http.StatusNotFound, apperr.SlugNotFound, msgTerritoryMissing}
}

// exportFailed is the 500 with the generic body; the cause goes on the
// request's log line.
func exportFailed(ctx context.Context, err error) *exportRefusal {
	slogchi.AddContextAttributes(ctx, slog.String("error", errMsg(err)))
	return &exportRefusal{http.StatusInternalServerError, apperr.SlugInternal, apperr.InternalMessage}
}

// preparedExport is everything known before the first byte: what the download
// will be called, its type, its exact length (nil when it is chunked) and how
// to stream it. The download routes send it, export-check only announces it.
type preparedExport struct {
	filename, contentType string
	size                  *int64
	stream                func(ctx context.Context, w io.Writer) error
}

// begin writes the download's headers and 200.
func (p preparedExport) begin(w http.ResponseWriter) {
	h := w.Header()
	setDownloadHeaders(h, p.contentType, p.filename)
	if p.size != nil {
		h.Set("Content-Length", strconv.FormatInt(*p.size, 10))
	}
	w.WriteHeader(http.StatusOK)
}

// prepareExport does all the work an export does short of streaming a body: the
// scope re-check, the scene bundle, the placement selection, the head reads and
// the GLB or OBJ plan. A nil refusal means the download will start.
//
// It is the only place that decides whether an export is possible, what it is
// called and how large it is; ServeTerritoryExport, ServeTerritoryExportOBJ and
// ExportTerritoryCheck all call it, so they cannot answer differently.
func (s *Server) prepareExport(ctx context.Context, slug string, v exportVariant) (preparedExport, *exportRefusal) {
	src, ref := s.loadExport(ctx, slug, v)
	if ref != nil {
		return preparedExport{}, ref
	}
	if v == variantOBJ {
		return s.planOBJ(ctx, slug, src)
	}
	return s.planGLB(ctx, slug, v, src)
}

func (s *Server) planGLB(
	ctx context.Context,
	slug string,
	v exportVariant,
	src exportSource,
) (preparedExport, *exportRefusal) {
	plan, err := glbexport.Build(src.placements, src.heads)
	if errors.Is(err, glbexport.ErrTooLarge) {
		return preparedExport{}, &exportRefusal{
			http.StatusUnprocessableEntity,
			apperr.SlugUnprocessable,
			"export exceeds the 4 GiB GLB limit",
		}
	}
	if err != nil {
		return preparedExport{}, exportFailed(ctx, err)
	}
	if v == variantCompatible && len(plan.Required) > 0 {
		return preparedExport{}, exportFailed(ctx, fmt.Errorf("compatible export requires %v", plan.Required))
	}
	return preparedExport{
		filename: v.filename(slug), contentType: v.contentType(), size: new(plan.Size),
		stream: func(ctx context.Context, w io.Writer) error { return glbexport.Write(ctx, w, plan, s.open) },
	}, nil
}

func (s *Server) planOBJ(ctx context.Context, slug string, src exportSource) (preparedExport, *exportRefusal) {
	a := src.bundle.Artifact
	ratio, metric := objexport.UnitRatio(
		[3]float64{a.BBoxMin.X, a.BBoxMin.Y, a.BBoxMin.Z},
		[3]float64{a.BBoxMax.X, a.BBoxMax.Y, a.BBoxMax.Z})
	plan, err := objexport.Build(src.placements, src.heads, objexport.Options{
		Stem: slug, Ratio: ratio, Metric: metric, Modified: time.Now(),
	})
	if errors.Is(err, objexport.ErrTooLarge) {
		return preparedExport{}, &exportRefusal{
			http.StatusUnprocessableEntity,
			apperr.SlugUnprocessable,
			"OBJ export exceeds 20 million vertices or 40 million faces",
		}
	}
	if err != nil {
		return preparedExport{}, exportFailed(ctx, err)
	}
	return preparedExport{
		filename: variantOBJ.filename(slug), contentType: variantOBJ.contentType(),
		stream: func(ctx context.Context, w io.Writer) error { return objexport.Write(ctx, w, plan, s.open) },
	}, nil
}

// exportSource is what every export reads before the first byte.
type exportSource struct {
	bundle     domain.SceneBundle // Artifact non-nil
	placements []glbexport.Placement
	heads      map[string]glbexport.Head
}

// loadExport runs the steps all variants share: the scope re-check, the bundle
// read, the 409 for a territory without LOD0, the 409 notReady when a plain
// variant lacks a plain copy for something it draws, and the head reads.
func (s *Server) loadExport(ctx context.Context, slug string, v exportVariant) (exportSource, *exportRefusal) {
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if !allAccess && scopeAdminID == "" {
		return exportSource{}, territoryMissing()
	}
	bundle, err := s.svc.GetSceneBundle(ctx, slug, scopeAdminID)
	switch {
	case isNotFound(err):
		return exportSource{}, territoryMissing()
	case err != nil:
		return exportSource{}, exportFailed(ctx, err)
	}
	if bundle.Artifact == nil {
		return exportSource{}, &exportRefusal{
			http.StatusConflict,
			apperr.SlugConflict,
			"territory is not converted yet",
		}
	}

	placements, skipped := exportPlacements(bundle, v)
	if v.plain() && slices.ContainsFunc(placements, func(p glbexport.Placement) bool { return p.Hash == "" }) {
		return exportSource{}, &exportRefusal{http.StatusConflict, apperr.SlugConflict, v.notReady()}
	}
	if skipped > 0 {
		slogchi.AddContextAttributes(ctx, slog.Int("export_skipped", skipped))
	}
	hashes := make([]string, len(placements))
	for i, p := range placements {
		hashes[i] = p.Hash
	}
	heads, err := glbexport.ReadHeads(ctx, s.open, hashes)
	if err != nil {
		return exportSource{}, exportFailed(ctx, err)
	}
	return exportSource{bundle: bundle, placements: placements, heads: heads}, nil
}
