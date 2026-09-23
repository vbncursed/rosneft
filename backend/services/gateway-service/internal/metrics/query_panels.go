package metrics

import (
	"context"
	"errors"
	"slices"
	"sync"
)

// maxParallelPanels caps the Prometheus queries one page load runs at once.
const maxParallelPanels = 4

// QueryPanels runs Query for every distinct panel id over one range, at most
// maxParallelPanels at a time. Every id and the range are checked before the
// first request, so one bad id never leaves Prometheus half-asked. A panel
// whose query failed is left out of the map — one dark card, as when each
// panel was its own request; only when every panel failed is it an error.
// The whole call shares one deadline, so a hung Prometheus darkens the page for
// panelsTimeout, not for a per-query timeout per wave of panels, and a panel
// still waiting for a slot when it passes gives up without asking.
func (c *Client) QueryPanels(ctx context.Context, ids []string, rng string) (map[string][]Series, error) {
	ids = slices.Compact(slices.Sorted(slices.Values(ids)))
	if len(ids) == 0 {
		return nil, ErrUnknownPanel
	}
	for _, id := range ids {
		if _, ok := lookup(id); !ok {
			return nil, ErrUnknownPanel
		}
	}
	if _, ok := rangeSeconds[rng]; !ok {
		return nil, ErrBadRange
	}

	ctx, cancel := context.WithTimeout(ctx, c.panelsTimeout)
	defer cancel()
	results := make([][]Series, len(ids))
	errs := make([]error, len(ids))
	sem := make(chan struct{}, maxParallelPanels)
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Go(func() {
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				errs[i] = ctx.Err()
				return
			}
			defer func() { <-sem }()
			results[i], errs[i] = c.Query(ctx, id, rng)
		})
	}
	wg.Wait()

	out := make(map[string][]Series, len(ids))
	for i, id := range ids {
		if errs[i] == nil {
			out[id] = results[i]
		}
	}
	if len(out) == 0 {
		return nil, errors.Join(errs...)
	}
	return out, nil
}
