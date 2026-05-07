// Package httpapi implements the HTTP surface for the asset service. One
// handler method per file. This file holds only the Service contract, the
// Handler constructor, and the mux mount.
package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

// Service is what the HTTP handler needs from the asset service.
type Service interface {
	Stat(ctx context.Context, hash string) (blobstore.Blob, error)
	Get(ctx context.Context, hash string) (io.ReadCloser, blobstore.Blob, error)
}

// Handler serves binary artifacts over HTTP.
type Handler struct {
	svc    Service
	logger *slog.Logger
}

// New constructs a Handler.
func New(svc Service, logger *slog.Logger) *Handler {
	return &Handler{svc: svc, logger: logger}
}

// Mount registers GET/HEAD /assets/{hash} on mux.
func (h *Handler) Mount(mux *http.ServeMux) {
	mux.HandleFunc("GET /assets/{hash}", h.serveAsset)
	mux.HandleFunc("HEAD /assets/{hash}", h.serveAsset)
}
