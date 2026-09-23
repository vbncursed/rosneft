// Package summary serves GET /api/console/summary: Home's console cards as
// numbers, one request instead of one per card source.
package summary

import (
	"context"
	"encoding/json/v2"
	"log/slog"
	"net/http"
	"slices"
	"strconv"
	"sync"
	"time"

	"github.com/vbncursed/rosneft/backend/pkg/apperr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
)

// Users is the users card: live accounts (ListUsers leaves the deleted out)
// and how many of them are frozen.
type Users struct {
	Total  int `json:"total"`
	Frozen int `json:"frozen"`
}

// Roles is the roles card: the roles the caller sees, and the permission
// catalog's size.
type Roles struct {
	Roles       int `json:"roles"`
	Permissions int `json:"permissions"`
}

// Content is the content card: the caller's visible territories, every model.
type Content struct {
	Territories int `json:"territories"`
	Models      int `json:"models"`
}

// Params is what the request says about how to count, beyond who asks.
type Params struct {
	// TZOffset is the browser's zone, east of UTC: the journal page buckets
	// by local hours, and audit24h counts the window those buckets cover.
	TZOffset time.Duration
}

// Count reads one card's numbers with the caller's own session.
type Count func(ctx context.Context, p Params) (any, error)

// maxTZOffset bounds tzOffset: no zone is further than 14 hours from UTC.
const maxTZOffset = 14 * 60

// parseParams reads the query. An absent tzOffset is UTC; a present one must
// be whole minutes within ±14 hours.
func parseParams(r *http.Request) (Params, bool) {
	raw := r.URL.Query().Get("tzOffset")
	if raw == "" {
		return Params{}, true
	}
	minutes, err := strconv.Atoi(raw)
	if err != nil || minutes < -maxTZOffset || minutes > maxTZOffset {
		return Params{}, false
	}
	return Params{TZOffset: time.Duration(minutes) * time.Minute}, true
}

// Counts maps a card key to its source.
type Counts map[string]Count

type principal struct {
	owner bool
	perms []string
}

func (p principal) can(perm string) bool { return p.owner || slices.Contains(p.perms, perm) }

// gates is frontend/src/app/router/guard.ts SCREENS, card for card: a card
// opens exactly when its console screen does. Change the two together.
var gates = map[string]func(principal) bool{
	"users":    func(p principal) bool { return p.can("users:read") },
	"roles":    func(p principal) bool { return p.can("roles:read") },
	"content":  func(p principal) bool { return p.can("territory:write") || p.can("model:write") },
	"access":   func(p principal) bool { return p.owner },
	"audit24h": func(p principal) bool { return p.can("audit:read") },
	"alerts":   func(p principal) bool { return p.owner },
}

// Handler answers one key per card the caller can open. A closed card is absent
// and its source is never asked; a source that fails is null for that card
// alone, logged, and does not fail the response.
func Handler(counts Counts, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		params, ok := parseParams(r)
		if !ok {
			apperr.Write(w, http.StatusBadRequest, apperr.SlugInvalidInput, "tzOffset must be whole minutes within ±840")
			return
		}
		p := principal{owner: authhttp.IsOwner(ctx), perms: authhttp.Perms(ctx)}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.MarshalWrite(w, collect(ctx, p, params, counts, logger)); err != nil {
			logger.Warn("console summary: encode failed", "err", err)
		}
	}
}

// cardTimeout bounds one card's source. Every source is a gRPC or Prometheus
// call that honours its context, so one hung backend nulls its own card at
// this deadline instead of holding the whole answer.
const cardTimeout = 5 * time.Second

// collect runs every open card's source in parallel. A WaitGroup rather than
// an errgroup: a failure is local to its card, so there is nothing to cancel.
func collect(ctx context.Context, p principal, params Params, counts Counts, logger *slog.Logger) map[string]any {
	var (
		mu  sync.Mutex
		wg  sync.WaitGroup
		out = make(map[string]any, len(counts))
	)
	for key, count := range counts {
		if open, ok := gates[key]; !ok || !open(p) {
			continue
		}
		wg.Go(func() {
			cardCtx, cancel := context.WithTimeout(ctx, cardTimeout)
			defer cancel()
			v, err := count(cardCtx, params)
			if err != nil {
				logger.Warn("console summary: source failed", "card", key, "err", err)
				v = nil
			}
			mu.Lock()
			out[key] = v
			mu.Unlock()
		})
	}
	wg.Wait()
	return out
}
