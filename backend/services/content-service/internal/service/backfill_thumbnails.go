package service

import (
	"context"
	"errors"
	"log/slog"

	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// errEmptyThumbnail stands for a thumbnailer that answered no error and no
// hash. "" means "none yet", so recording it would journal a write that
// changed nothing; the row is left for the next boot instead.
var errEmptyThumbnail = errors.New("thumbnailer returned an empty hash")

// BackfillThumbnails makes the thumbnail of every panorama that has none. It
// works one panorama at a time, until the list is done or ctx ends. It is also
// the retry for create-time failures, so a source that cannot be decoded is
// tried, and logged once, on every boot. Run it in its own goroutine at startup.
//
// It is the only caller of ListPanoramasWithoutThumbnail, which reads across
// every tenant: keep it off the gRPC surface.
func (c *Content) BackfillThumbnails(ctx context.Context) {
	pending, err := c.repo.ListPanoramasWithoutThumbnail(ctx)
	if err != nil {
		if ctx.Err() == nil {
			slog.ErrorContext(ctx, "content: thumbnail backfill: list", "err", err)
		}
		return
	}
	if len(pending) == 0 {
		return
	}
	slog.InfoContext(ctx, "content: thumbnail backfill started", "pending", len(pending))
	made := 0
	for _, p := range pending {
		if err := c.backfillOne(ctx, p); err != nil {
			if ctx.Err() != nil {
				return // shutting down; the rest waits for the next boot
			}
			slog.WarnContext(ctx, "content: thumbnail backfill failed", "panorama", p.ID, "err", err)
			continue
		}
		made++
	}
	slog.InfoContext(ctx, "content: thumbnail backfill done", "made", made, "failed", len(pending)-made)
}

func (c *Content) backfillOne(ctx context.Context, p domain.Panorama) error {
	hash, err := c.thumb(ctx, p.SourceBlobHash)
	if err != nil {
		return err
	}
	if hash == "" {
		return errEmptyThumbnail
	}
	return c.repo.SetPanoramaThumbnail(ctx, p.ID, hash)
}
