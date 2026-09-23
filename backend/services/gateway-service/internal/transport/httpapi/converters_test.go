package httpapi

import (
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// The thumbnail is omitted, never sent empty, while content-service has not
// made it yet. The SPA reads the absence as "draw the glyph".
func TestPanoramaToAPIOmitsAThumbnailNotYetMade(t *testing.T) {
	assert.Assert(t, panoramaToAPI(domain.Panorama{ID: 1}).ThumbnailBlobHash == nil)

	got := panoramaToAPI(domain.Panorama{ID: 1, ThumbnailBlobHash: "ab12"})
	assert.Assert(t, got.ThumbnailBlobHash != nil)
	assert.Equal(t, *got.ThumbnailBlobHash, "ab12")
}
