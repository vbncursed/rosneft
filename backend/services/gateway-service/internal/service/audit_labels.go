package service

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// territoryOwners lists the entities whose row carries a territory_id. Checking
// the entity before parsing keeps the JSON decode off every other row: a page of
// user or session events has no parent territory to find.
var territoryOwners = map[string]struct{}{
	"placement":            {},
	"panorama":             {},
	"document":             {},
	"territory_assignment": {},
}

// snapshot returns the row this entry describes: the new state, or the old one
// when the row was deleted and there is no new state left.
func snapshot(e domain.AuditEntry) string {
	if e.NewRow != "" {
		return e.NewRow
	}
	return e.OldRow
}

// territoryIDOf digs the parent territory out of an entry's row snapshot.
//
// The journal stores snapshots as raw JSON precisely so it never has to agree
// with anyone on a row's shape, which means the parent is a number inside a
// document rather than a column. A snapshot that does not parse yields 0 and is
// skipped — a broken snapshot must not cost the reader the whole page.
func territoryIDOf(e domain.AuditEntry) int64 {
	if _, ok := territoryOwners[e.Entity]; !ok {
		return 0
	}
	raw := snapshot(e)
	if raw == "" {
		return 0
	}
	var row struct {
		TerritoryID *int64 `json:"territory_id"`
	}
	if err := json.Unmarshal([]byte(raw), &row); err != nil || row.TerritoryID == nil {
		return 0
	}
	return *row.TerritoryID
}

// labelAuditEntries fills in the logins and territory slugs behind the ids on
// one page.
//
// Two calls per page, never one per entry: a CSV export pages 200 rows at a
// time, and per-row lookups would turn that into hundreds of round trips.
//
// Failure to resolve is logged and swallowed. Readability is a convenience;
// who did what and when is the substance, and it is already in the entry. A
// journal that answers 500 because auth is restarting is worse than one that
// answers with uuids, which is exactly what it answered before this existed.
func (g *Gateway) labelAuditEntries(
	ctx context.Context, token string, entries []domain.AuditEntry,
) []domain.AuditEntry {
	if len(entries) == 0 {
		return entries
	}

	userIDs := make([]string, 0, len(entries)*2)
	terrIDs := make([]int64, 0, len(entries))
	for _, e := range entries {
		userIDs = append(userIDs, e.ActorID, e.CompanyID)
		if id := territoryIDOf(e); id != 0 {
			terrIDs = append(terrIDs, id)
		}
	}

	// Both services dedupe and drop blanks, so the slices go out as collected.
	// Batched even though a page cannot exceed auth's cap today: that bound is
	// a page size constant two files away, not a property of this code.
	logins, err := g.resolveLoginsBatched(ctx, token, userIDs)
	if err != nil {
		slog.WarnContext(ctx, "audit: could not resolve actor logins", "err", err)
		logins = map[string]string{}
	}
	slugs := map[int64]string{}
	if len(terrIDs) > 0 {
		slugs, err = g.catalog.ResolveTerritorySlugs(ctx, terrIDs)
		if err != nil {
			slog.WarnContext(ctx, "audit: could not resolve territory slugs", "err", err)
			slugs = map[int64]string{}
		}
	}

	for i := range entries {
		entries[i].ActorLogin = logins[entries[i].ActorID]
		entries[i].CompanyLogin = logins[entries[i].CompanyID]
		entries[i].TerritorySlug = slugs[territoryIDOf(entries[i])]
	}
	return entries
}
