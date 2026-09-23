// Package summary serves GET /api/console/summary: Home's console cards as
// numbers, one request instead of one per card source.
package summary

import (
	"context"
	"encoding/json/v2"
	"log/slog"
	"net/http"
	"slices"
	"sync"

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

// Count reads one card's numbers with the caller's own session.
type Count func(ctx context.Context) (any, error)

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
		p := principal{owner: authhttp.IsOwner(ctx), perms: authhttp.Perms(ctx)}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := json.MarshalWrite(w, collect(ctx, p, counts, logger)); err != nil {
			logger.Warn("console summary: encode failed", "err", err)
		}
	}
}

// collect runs every open card's source in parallel. A WaitGroup rather than
// an errgroup: a failure is local to its card, so there is nothing to cancel.
func collect(ctx context.Context, p principal, counts Counts, logger *slog.Logger) map[string]any {
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
			v, err := count(ctx)
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
