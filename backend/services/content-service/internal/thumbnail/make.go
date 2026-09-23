// Package thumbnail makes the small JPEG the View tab shows for a panorama,
// so a 44×34 row never downloads and decodes the whole equirect.
package thumbnail

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png" // a panorama source is a JPEG or a PNG (the SPA sniffs both)
	"io"
	"sync"

	"golang.org/x/image/draw"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/content-service/internal/domain"
)

// Width and Height are the thumbnail's size. The source is an equirect, 2:1.
const (
	Width  = 256
	Height = 128
)

// MaxWidth and MaxHeight bound what Make agrees to decode. The header is read
// first, and anything larger is refused before a byte of it is allocated.
const (
	MaxWidth  = 16384
	MaxHeight = 8192
)

const quality = 80

// decoding serialises Make. A source at the limit decodes to ~400 MB, and a
// create racing the backfill, or two creates, would hold two at once.
// ponytail: one decode per process; a semaphore of N if uploads ever queue.
var decoding sync.Mutex

// Make decodes the image blob srcHash and scales it to Width×Height. It stores
// the result as a JPEG and returns the hash, which is the lowercase sha256 hex
// of the JPEG bytes: the addressing upload-service and mesh-worker use. A rerun
// therefore rewrites the same blob instead of adding another.
func Make(ctx context.Context, store blobstore.Store, srcHash string) (string, error) {
	decoding.Lock()
	defer decoding.Unlock()

	src, err := decode(ctx, store, srcHash)
	if err != nil {
		return "", err
	}
	dst := image.NewRGBA(image.Rect(0, 0, Width, Height))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, src.Bounds(), draw.Src, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: quality}); err != nil {
		return "", fmt.Errorf("thumbnail: encode: %w", err)
	}
	sum := sha256.Sum256(out.Bytes())
	hash := hex.EncodeToString(sum[:])
	if _, err := store.Put(ctx, hash, "image/jpeg", &out); err != nil {
		return "", fmt.Errorf("thumbnail: put: %w", err)
	}
	return hash, nil
}

// decode reads the header through a tee and checks the size. It then decodes
// the image from the teed bytes followed by the rest of the stream, so the blob
// is opened once and read once.
func decode(ctx context.Context, store blobstore.Store, hash string) (image.Image, error) {
	rc, _, err := store.Get(ctx, hash)
	if err != nil {
		return nil, fmt.Errorf("thumbnail: get source: %w", err)
	}
	defer func() { _ = rc.Close() }()

	var head bytes.Buffer
	cfg, _, err := image.DecodeConfig(io.TeeReader(rc, &head))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: read header: %w", err)
	}
	if cfg.Width > MaxWidth || cfg.Height > MaxHeight {
		return nil, fmt.Errorf("thumbnail: %w: %d×%d", domain.ErrImageTooLarge, cfg.Width, cfg.Height)
	}
	img, _, err := image.Decode(io.MultiReader(&head, rc))
	if err != nil {
		return nil, fmt.Errorf("thumbnail: decode: %w", err)
	}
	return img, nil
}
