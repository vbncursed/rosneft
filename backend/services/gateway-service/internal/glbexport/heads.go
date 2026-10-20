package glbexport

import (
	"context"
	"fmt"
	"sync"

	"golang.org/x/sync/errgroup"
)

// maxHeadReads bounds the head reads in flight.
const maxHeadReads = 4

// ReadHeads reads the head of every distinct hash, at most maxHeadReads at a
// time. The first failure cancels the reads still running and is returned,
// naming its hash.
func ReadHeads(ctx context.Context, open Opener, hashes []string) (map[string]Head, error) {
	var (
		mu    sync.Mutex
		heads = make(map[string]Head, len(hashes))
	)
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(maxHeadReads)
	seen := make(map[string]bool, len(hashes))
	for _, hash := range hashes {
		if seen[hash] {
			continue
		}
		seen[hash] = true
		if gctx.Err() != nil {
			break
		}
		g.Go(func() error {
			h, err := readHead(gctx, open, hash)
			if err != nil {
				return fmt.Errorf("head of %s: %w", hash, err)
			}
			mu.Lock()
			heads[hash] = h
			mu.Unlock()
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, err
	}
	// The loop stops launching on a cancelled ctx; with no read failing, that
	// would hand back a partial map as success.
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return heads, nil
}

// readHead opens the blob from byte 0 and parses its head.
// ponytail: this closes an open-ended response early, so the connection is
// dropped instead of reused; a bounded Range is the upgrade if connection
// churn shows up.
func readHead(ctx context.Context, open Opener, hash string) (Head, error) {
	rc, err := open(ctx, hash, 0)
	if err != nil {
		return Head{}, err
	}
	defer func() { _ = rc.Close() }() // read-only body: a close error loses nothing
	return ReadHead(rc)
}
