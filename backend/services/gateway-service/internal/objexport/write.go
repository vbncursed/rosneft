package objexport

import (
	"archive/zip"
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

const ioBuffer = 64 << 10

// Write streams the archive: README.txt, the MTL, the images in counter
// order, then the OBJ. Every entry is deflated. The ZIP is closed only on
// success, so a failure leaves a stream with no central directory, which no
// unzipper takes for a finished file. ctx is checked before every open.
func Write(ctx context.Context, w io.Writer, p Plan, open glbexport.Opener) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	zw := zip.NewWriter(w)
	entry := func(name string) (io.Writer, error) {
		return zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: p.modified})
	}
	for _, f := range []struct{ name, text string }{{"README.txt", p.readme}, {p.stem + ".mtl", p.mtl}} {
		e, err := entry(f.name)
		if err != nil {
			return fmt.Errorf("objexport: %s: %w", f.name, err)
		}
		if _, err := io.WriteString(e, f.text); err != nil {
			return fmt.Errorf("objexport: %s: %w", f.name, err)
		}
	}
	for _, im := range p.images {
		e, err := entry(im.name)
		if err != nil {
			return fmt.Errorf("objexport: %s: %w", im.name, err)
		}
		if err := copyImage(ctx, e, im, open); err != nil {
			return err
		}
	}
	e, err := entry(p.stem + ".obj")
	if err != nil {
		return fmt.Errorf("objexport: %s.obj: %w", p.stem, err)
	}
	bw := bufio.NewWriterSize(e, ioBuffer)
	if err := p.writeOBJ(ctx, bw, open); err != nil {
		return err
	}
	if err := bw.Flush(); err != nil {
		return fmt.Errorf("objexport: %s.obj: %w", p.stem, err)
	}
	return zw.Close()
}

// copyImage copies the image's bytes from the blob, which must hold all of them.
func copyImage(ctx context.Context, w io.Writer, im imageRef, open glbexport.Opener) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	rc, err := open(ctx, im.hash, im.off)
	if err != nil {
		return fmt.Errorf("objexport: open blob %s: %w", im.hash, err)
	}
	defer func() { _ = rc.Close() }() // read-only body: a close error loses nothing
	if _, err := io.CopyN(w, rc, im.length); err != nil {
		return fmt.Errorf("objexport: image %s: %w", im.name, truncated(err))
	}
	return nil
}

// truncated turns a source that ended early into io.ErrUnexpectedEOF.
func truncated(err error) error {
	if errors.Is(err, io.EOF) {
		return io.ErrUnexpectedEOF
	}
	return err
}
