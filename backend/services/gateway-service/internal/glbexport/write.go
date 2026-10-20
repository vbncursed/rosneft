package glbexport

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"math"
)

var zeros [4]byte // padding never exceeds 3 bytes

// appendU32 appends n little-endian; a Plan that does not fit 32 bits is refused.
func appendU32(b []byte, n int64) ([]byte, error) {
	if n < 0 || n > math.MaxUint32 {
		return nil, ErrTooLarge
	}
	return binary.LittleEndian.AppendUint32(b, uint32(n)), nil
}

// frame is everything before the BIN data: GLB header, JSON chunk, and the
// BIN chunk's header when there is one.
func frame(p Plan) ([]byte, error) {
	words := []int64{glbMagic, glbVersion, p.Size, int64(len(p.JSON)), chunkJSON}
	b := make([]byte, 0, headerSize+chunkHeader+len(p.JSON)+chunkHeader)
	var err error
	for _, w := range words {
		if b, err = appendU32(b, w); err != nil {
			return nil, err
		}
	}
	b = append(b, p.JSON...)
	if p.BinLength > 0 {
		for _, w := range []int64{p.BinLength, chunkBIN} {
			if b, err = appendU32(b, w); err != nil {
				return nil, err
			}
		}
	}
	return b, nil
}

// Write streams the planned file: the framing, then each segment's bytes
// fetched through open, zero-padded to its place. A failure after the first
// byte leaves a short output; the caller knows the exact Size and must treat
// anything shorter as failed.
func Write(ctx context.Context, w io.Writer, p Plan, open Opener) error {
	head, err := frame(p)
	if err != nil {
		return err
	}
	if _, err := w.Write(head); err != nil {
		return fmt.Errorf("glbexport: write header: %w", err)
	}
	var pos int64 // bytes of BIN data written so far
	for _, seg := range p.Segments {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := pad(w, seg.OutOffset-pos); err != nil {
			return err
		}
		if err := copySegment(ctx, w, seg, open); err != nil {
			return fmt.Errorf("glbexport: blob %s: %w", seg.Hash, err)
		}
		pos = seg.OutOffset + seg.Length
	}
	return pad(w, p.BinLength-pos)
}

func copySegment(ctx context.Context, w io.Writer, seg Segment, open Opener) error {
	rc, err := open(ctx, seg.Hash, seg.Offset)
	if err != nil {
		return err
	}
	defer func() { _ = rc.Close() }() // read side: a failed Close loses nothing
	if _, err := io.CopyN(w, rc, seg.Length); errors.Is(err, io.EOF) {
		return io.ErrUnexpectedEOF // the source ended before the head said it would
	} else if err != nil {
		return err
	}
	return nil
}

func pad(w io.Writer, n int64) error {
	if n < 0 || n >= int64(len(zeros)) {
		return malformed("padding of %d bytes", n)
	}
	if _, err := w.Write(zeros[:n]); err != nil {
		return fmt.Errorf("glbexport: write padding: %w", err)
	}
	return nil
}
