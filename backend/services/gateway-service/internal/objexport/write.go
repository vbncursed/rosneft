package objexport

import (
	"archive/zip"
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"time"

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
	a := archive{zw: zip.NewWriter(w), modified: p.modified}
	for _, f := range []struct{ name, text string }{{"README.txt", p.readme}, {p.stem + ".mtl", p.mtl}} {
		if err := a.text(f.name, f.text); err != nil {
			return err
		}
	}
	for _, im := range p.images {
		if err := a.image(ctx, im, open); err != nil {
			return err
		}
	}
	if err := a.obj(ctx, p, open); err != nil {
		return err
	}
	return a.zw.Close()
}

// archive adds deflated entries, all stamped with one time, to a ZIP.
type archive struct {
	zw       *zip.Writer
	modified time.Time
}

func (a archive) entry(name string) (io.Writer, error) {
	e, err := a.zw.CreateHeader(&zip.FileHeader{Name: name, Method: zip.Deflate, Modified: a.modified})
	if err != nil {
		return nil, fmt.Errorf("objexport: %s: %w", name, err)
	}
	return e, nil
}

func (a archive) text(name, text string) error {
	e, err := a.entry(name)
	if err != nil {
		return err
	}
	if _, err := io.WriteString(e, text); err != nil {
		return fmt.Errorf("objexport: %s: %w", name, err)
	}
	return nil
}

func (a archive) image(ctx context.Context, im imageRef, open glbexport.Opener) error {
	e, err := a.entry(im.name)
	if err != nil {
		return err
	}
	return copyImage(ctx, e, im, open)
}

func (a archive) obj(ctx context.Context, p Plan, open glbexport.Opener) error {
	name := p.stem + ".obj"
	e, err := a.entry(name)
	if err != nil {
		return err
	}
	bw := bufio.NewWriterSize(e, ioBuffer)
	if err := p.writeOBJ(ctx, bw, open); err != nil {
		return err
	}
	if err := bw.Flush(); err != nil {
		return fmt.Errorf("objexport: %s: %w", name, err)
	}
	return nil
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
