package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// jobEventInterval is the gateway-side poll cadence that backs the SSE
// stream. 1 s gives near-real-time UX without flooding mesh-api: clients
// usually subscribe for a few seconds (a single conversion) and short-poll
// is bounded.
const jobEventInterval = 1 * time.Second

// jobEventKeepalive prevents intermediaries (NGINX, browsers) from closing
// the connection during long quiet periods between status changes.
const jobEventKeepalive = 15 * time.Second

// WatchJobEvents streams Server-Sent Events for one conversion job. Clients
// subscribe with the job ID returned by POST /convert; the gateway polls
// mesh-api every jobEventInterval and emits an `event: job` whenever the
// job's UpdatedAt changes. Terminal states (`succeeded` / `failed`) close
// the stream.
//
// This is registered directly on the outer mux (outside the ETag and
// compression middlewares) — those middlewares buffer/transform the body,
// which would defeat the streaming contract.
func (s *Server) WatchJobEvents(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "missing job id")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		apperr.Write(w, http.StatusInternalServerError, apperr.SlugInternal, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // tell NGINX not to buffer
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	streamJob(r.Context(), w, flusher, id, s.scopedJob)
}

// scopedJob is GetJob behind the tenant rule: a territory job the caller
// cannot see reads as not found (a catalog failure is passed on as it is), which streamJob already turns into the
// `error` frame an unknown id gets. Models and Root skip the catalog lookup.
// Succeeded jobs still stream — the per-id route is how an upload that just
// finished learns so, and it closes on its own.
//
// This is not a one-time gate: streamJob re-fetches through it on every 1 s
// tick, and that repetition is the whole reason a mid-stream revocation stops
// delivering data. Do not hoist it out of the loop.
//
// The kinds are matched one by one, as visibleJob does, so a kind this
// gateway has no rule for is refused rather than treated as a shared model.
func (s *Server) scopedJob(ctx context.Context, id string) (domain.Job, error) {
	job, err := s.svc.GetJob(ctx, id)
	if err != nil {
		return domain.Job{}, err
	}
	if job.Kind == domain.KindModel {
		return job, nil
	}
	if job.Kind != domain.KindTerritory {
		return domain.Job{}, domain.ErrJobNotFound
	}
	scopeAdminID, allAccess := authhttp.Scope(ctx)
	if allAccess {
		return job, nil
	}
	// Fail closed on an empty scope, as RequireTerritoryAccess does: "" turns
	// the catalog's tenant filter off and would resolve any territory.
	if scopeAdminID == "" {
		return domain.Job{}, domain.ErrJobNotFound
	}
	if _, err := s.svc.GetTerritory(ctx, job.Slug, scopeAdminID); err != nil {
		if errors.Is(err, domain.ErrTerritoryNotFound) {
			return domain.Job{}, domain.ErrJobNotFound
		}
		// Anything else (catalog restarting, timeout) says nothing about access:
		// pass it on so the stream retries instead of closing on "not found".
		return domain.Job{}, fmt.Errorf("scoped job %s: %w", id, err)
	}
	return job, nil
}

// jobFetcher matches Service.GetJob exactly.
type jobFetcher func(ctx context.Context, id string) (domain.Job, error)

// streamJob is split out so it can be tested with a fake fetcher without
// running an HTTP server.
func streamJob(ctx context.Context, w http.ResponseWriter, flusher http.Flusher, id string, fetch jobFetcher) {
	tick := time.NewTicker(jobEventInterval)
	defer tick.Stop()
	keepalive := time.NewTicker(jobEventKeepalive)
	defer keepalive.Stop()

	st := &jobStream{w: w, flusher: flusher}
	// Send the first snapshot immediately so the client doesn't wait a tick.
	if st.first(ctx, id, fetch) {
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-keepalive.C:
			if _, err := fmt.Fprint(w, ": keepalive\n\n"); err != nil {
				return // client hung up
			}
			flusher.Flush()
		case <-tick.C:
			if st.poll(ctx, id, fetch) {
				return
			}
		}
	}
}

// jobStream is one open SSE response and the last job it sent.
type jobStream struct {
	w       http.ResponseWriter
	flusher http.Flusher
	last    domain.Job
}

// emit sends one job frame and reports whether the stream is over: the job is
// terminal, or the write failed because the client is gone.
func (st *jobStream) emit(job domain.Job) bool {
	if !writeJobEvent(st.w, job) {
		return true
	}
	st.flusher.Flush()
	st.last = job
	return isTerminalJob(job)
}

// first sends the opening snapshot, or the `error` frame for an unknown id.
// Any other fetch error is not fatal: the ticks retry. True ends the stream.
func (st *jobStream) first(ctx context.Context, id string, fetch jobFetcher) bool {
	job, err := fetch(ctx, id)
	switch {
	case err == nil:
		return st.emit(job)
	case errors.Is(err, domain.ErrJobNotFound):
		st.notFound()
		return true
	}
	return false
}

func (st *jobStream) notFound() {
	body, err := json.Marshal(apperr.Body{Code: apperr.SlugNotFound, Message: "job not found"})
	if err != nil {
		return
	}
	writeNamedEvent(st.w, "error", string(body))
	st.flusher.Flush()
}

// poll re-fetches through the tenant gate and sends the job only if it
// changed. A job that is no longer found (access revoked, job gone) gets the
// `error` frame and ends the stream; other errors are transient. True ends it.
func (st *jobStream) poll(ctx context.Context, id string, fetch jobFetcher) bool {
	job, err := fetch(ctx, id)
	if errors.Is(err, domain.ErrJobNotFound) {
		st.notFound()
		return true
	}
	if err != nil || !jobChanged(st.last, job) {
		return false
	}
	return st.emit(job)
}

func isTerminalJob(job domain.Job) bool {
	return job.Status == domain.JobStatusSucceeded || job.Status == domain.JobStatusFailed
}

func jobChanged(last, job domain.Job) bool {
	return !job.UpdatedAt.Equal(last.UpdatedAt) || job.Status != last.Status
}

// writeJobEvent emits a single SSE `event: job` frame whose data is the
// JSON-encoded job. Returns false only on a write failure (client
// disconnected). A job that cannot be encoded skips the frame and keeps the
// stream: ending it would make the client reconnect and meet the same job.
func writeJobEvent(w http.ResponseWriter, job domain.Job) bool {
	body, err := json.Marshal(jobToAPI(job))
	if err != nil {
		slog.Warn("watch job events: frame skipped, job does not encode", "job_id", job.ID, "error", err)
		return true
	}
	return writeNamedEvent(w, "job", string(body))
}

// writeNamedEvent emits one SSE frame.
func writeNamedEvent(w http.ResponseWriter, name, data string) bool {
	_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data)
	return err == nil
}
