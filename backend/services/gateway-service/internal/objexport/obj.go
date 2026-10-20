package objexport

import (
	"bufio"
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// stream holds the running state of the OBJ text: the buffered output and
// the count of v / vt lines written so far, which bases every face index.
type stream struct {
	ctx           context.Context
	open          glbexport.Opener
	bw            *bufio.Writer
	buf           []byte
	vBase, vtBase uint64
}

func (p Plan) writeOBJ(ctx context.Context, bw *bufio.Writer, open glbexport.Opener) error {
	s := &stream{ctx: ctx, open: open, bw: bw}
	if _, err := bw.WriteString(p.header); err != nil {
		return err
	}
	for _, o := range p.objects {
		s.buf = append(append(append(s.buf[:0], "o "...), o.name...), '\n')
		if err := s.flushLine(); err != nil {
			return err
		}
		for _, in := range o.instances {
			if err := s.instance(o.hash, in); err != nil {
				return err
			}
		}
	}
	return nil
}

// flushLine writes buf to the output.
func (s *stream) flushLine() error {
	_, err := s.bw.Write(s.buf)
	return err
}

// each reads a's count elements through one open and hands each element's
// bytes to fn, skipping the stride's padding.
// ponytail: every accessor is its own open-ended read that is closed early
// (as readHead does), so the connection is dropped instead of reused; a
// bounded Range is the upgrade if asset-service connection churn shows up.
func (s *stream) each(hash string, a accessor, fn func(raw []byte) error) error {
	if err := s.ctx.Err(); err != nil {
		return err
	}
	rc, err := s.open(s.ctx, hash, a.off)
	if err != nil {
		return fmt.Errorf("objexport: open blob %s: %w", hash, err)
	}
	defer func() { _ = rc.Close() }() // read-only body: a close error loses nothing
	br := bufio.NewReaderSize(rc, ioBuffer)
	raw := make([]byte, a.elem)
	for i := range a.count {
		if _, err := io.ReadFull(br, raw); err != nil {
			return fmt.Errorf("objexport: blob %s: %w", hash, truncated(err))
		}
		if err := fn(raw); err != nil {
			return err
		}
		if i < a.count-1 && a.stride > a.elem {
			if _, err := br.Discard(a.stride - a.elem); err != nil {
				return fmt.Errorf("objexport: blob %s: %w", hash, truncated(err))
			}
		}
	}
	return nil
}

func f32at(raw []byte, i int) float64 {
	return float64(math.Float32frombits(binary.LittleEndian.Uint32(raw[i*4:])))
}

func finite(v float64) bool {
	f := float64(float32(v))
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

// instance writes one mesh-node: the v blocks, the vt blocks, then each
// primitive's usemtl and faces.
func (s *stream) instance(hash string, in instance) error {
	m := in.mesh
	posBase := make([]uint64, len(m.pos))
	for i, a := range m.pos {
		posBase[i] = s.vBase
		if err := s.vertices(hash, a, in.f); err != nil {
			return err
		}
	}
	uvBase := make([]uint64, len(m.uvs))
	for i, a := range m.uvs {
		uvBase[i] = s.vtBase
		if err := s.texcoords(hash, a); err != nil {
			return err
		}
	}
	for _, pr := range m.prims {
		s.buf = append(append(append(s.buf[:0], "usemtl "...), pr.mtl...), '\n')
		if err := s.flushLine(); err != nil {
			return err
		}
		var uv uint64
		if pr.uv >= 0 {
			uv = uvBase[pr.uv]
		}
		if err := s.faces(hash, pr, m.pos[pr.pos].count, posBase[pr.pos], uv, in.flip); err != nil {
			return err
		}
	}
	return nil
}

func (s *stream) vertices(hash string, a accessor, f mat4) error {
	err := s.each(hash, a, func(raw []byte) error {
		x, y, z := f.apply(f32at(raw, 0), f32at(raw, 1), f32at(raw, 2))
		if !finite(x) || !finite(y) || !finite(z) {
			return malformed("blob %s: vertex does not bake to a finite point", hash)
		}
		s.buf = append(s.buf[:0], "v "...)
		s.buf = appendNum(append(appendNum(append(appendNum(s.buf, x), ' '), y), ' '), z)
		s.buf = append(s.buf, '\n')
		return s.flushLine()
	})
	s.vBase += uint64(a.count)
	return err
}

func (s *stream) texcoords(hash string, a accessor) error {
	err := s.each(hash, a, func(raw []byte) error {
		u, v := f32at(raw, 0), 1-f32at(raw, 1)
		if !finite(u) || !finite(v) {
			return malformed("blob %s: texture coordinate is not finite", hash)
		}
		s.buf = append(s.buf[:0], "vt "...)
		s.buf = appendNum(append(appendNum(s.buf, u), ' '), v)
		s.buf = append(s.buf, '\n')
		return s.flushLine()
	})
	s.vtBase += uint64(a.count)
	return err
}

// readIndex decodes one uint8, uint16 or uint32 index.
func readIndex(raw []byte) uint64 {
	switch len(raw) {
	case 1:
		return uint64(raw[0])
	case 2:
		return uint64(binary.LittleEndian.Uint16(raw))
	default:
		return uint64(binary.LittleEndian.Uint32(raw))
	}
}

// faces writes a primitive's triangles, reversed when flip is set. An index
// at or past its vertex count aborts the stream.
func (s *stream) faces(hash string, pr primitive, posCount int, posBase, uvBase uint64, flip bool) error {
	var tri [3]uint64
	n := 0
	return s.each(hash, pr.indices, func(raw []byte) error {
		idx := readIndex(raw)
		if idx >= uint64(posCount) {
			return malformed("blob %s: index %d past the %d vertices", hash, idx, posCount)
		}
		tri[n] = idx
		if n++; n < 3 {
			return nil
		}
		n = 0
		if flip {
			tri[0], tri[2] = tri[2], tri[0]
		}
		s.buf = append(s.buf[:0], 'f')
		for _, i := range tri {
			s.buf = strconv.AppendUint(append(s.buf, ' '), posBase+i+1, 10)
			if pr.uv >= 0 {
				s.buf = strconv.AppendUint(append(s.buf, '/'), uvBase+i+1, 10)
			}
		}
		s.buf = append(s.buf, '\n')
		return s.flushLine()
	})
}
