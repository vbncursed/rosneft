package bootstrap

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/catalog"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/converter"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/storage"
)

// InitServiceAPI builds the mesh service surface used by mesh-api: only the
// queue + an ID generator are needed, since the API never does conversion.
func InitServiceAPI(queue *storage.Redis) *service.Mesh {
	return service.New(service.Config{
		Queue: queue,
		IDGen: newJobID,
	})
}

// InitServiceWorker builds the mesh service surface used by mesh-worker —
// the full pipeline (queue + catalog + converter + blobstore). Source bytes
// are now fetched from the BlobStore by hash; mesh-worker no longer needs a
// host-mounted source directory. IDGen is required because the reconciler
// calls SubmitConversion to enqueue missing artifacts, and SubmitConversion
// mints a job ID for each new job.
func InitServiceWorker(
	queue *storage.Redis,
	cat *catalog.Client,
	conv *converter.Converter,
	blobs *blobstore.FS,
) *service.Mesh {
	return service.New(service.Config{
		Queue:     queue,
		Catalog:   cat,
		Converter: conv,
		Blobs:     blobs,
		IDGen:     newJobID,
	})
}

// newJobID returns a random 128-bit hex ID. Compact, sortable enough, and
// impossible to guess. Replace with ULID/Snowflake later if needed.
func newJobID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
