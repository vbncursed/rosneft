package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
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

	streamJob(r.Context(), w, flusher, id, s.svc.GetJob)
}

// streamJob is split out so it can be tested with a fake fetcher without
// running an HTTP server. The signature matches Service.GetJob exactly.
func streamJob(
	ctx context.Context,
	w http.ResponseWriter,
	flusher http.Flusher,
	id string,
	fetch func(ctx context.Context, id string) (domain.Job, error),
) {
	tick := time.NewTicker(jobEventInterval)
	defer tick.Stop()
	keepalive := time.NewTicker(jobEventKeepalive)
	defer keepalive.Stop()

	var last domain.Job
	emit := func(job domain.Job) bool {
		if !writeJobEvent(w, job) {
			return false
		}
		flusher.Flush()
		last = job
		return job.Status == domain.JobStatusSucceeded || job.Status == domain.JobStatusFailed
	}

	// Send the first snapshot immediately so the client doesn't wait a tick.
	if job, err := fetch(ctx, id); err == nil {
		if emit(job) {
			return
		}
	} else if errors.Is(err, domain.ErrJobNotFound) {
		body, _ := json.Marshal(apperr.Body{Code: apperr.SlugNotFound, Message: "job not found"})
		writeNamedEvent(w, "error", string(body))
		flusher.Flush()
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-keepalive.C:
			_, _ = fmt.Fprint(w, ": keepalive\n\n")
			flusher.Flush()
		case <-tick.C:
			job, err := fetch(ctx, id)
			if err != nil {
				continue
			}
			if !job.UpdatedAt.Equal(last.UpdatedAt) || job.Status != last.Status {
				if emit(job) {
					return
				}
			}
		}
	}
}

// writeJobEvent emits a single SSE `event: job` frame whose data is the
// JSON-encoded job. Returns false on a write failure (client disconnected).
func writeJobEvent(w http.ResponseWriter, job domain.Job) bool {
	body, err := json.Marshal(jobToAPI(job))
	if err != nil {
		return false
	}
	return writeNamedEvent(w, "job", string(body))
}

// writeNamedEvent emits one SSE frame.
func writeNamedEvent(w http.ResponseWriter, name, data string) bool {
	_, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data)
	return err == nil
}
