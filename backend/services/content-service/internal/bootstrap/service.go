package bootstrap

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	svc "github.com/vbncursed/rosneft/backend/services/content-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/storage"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/thumbnail"
)

// InitService wires storage and the blob store into the content service. The
// blob store is where panorama thumbnails are made from and written to.
func InitService(pool *pgxpool.Pool, blobs *blobstore.FS) *svc.Content {
	return svc.New(storage.New(pool), func(ctx context.Context, srcHash string) (string, error) {
		return thumbnail.Make(ctx, blobs, srcHash)
	})
}
