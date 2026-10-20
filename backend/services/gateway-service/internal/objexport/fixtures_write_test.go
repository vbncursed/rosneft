package objexport

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"sync"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/glbexport"
)

// source is an in-memory Opener that records every (hash, offset) call.
type source struct {
	mu    sync.Mutex
	blobs map[string][]byte
	calls []string
	err   error
}

func (s *source) open(_ context.Context, hash string, off int64) (io.ReadCloser, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, fmt.Sprintf("%s@%d", hash, off))
	if s.err != nil {
		return nil, s.err
	}
	return io.NopCloser(bytes.NewReader(s.blobs[hash][off:])), nil
}

// export runs Build and Write over blobs and returns the unzipped entries.
func export(t *testing.T, ps []glbexport.Placement, blobs map[string][]byte, opts Options) (map[string]string, []string) {
	t.Helper()
	heads := map[string]glbexport.Head{}
	for h, b := range blobs {
		heads[h] = headOf(t, b)
	}
	plan, err := Build(ps, heads, opts)
	assert.NilError(t, err)
	var out bytes.Buffer
	assert.NilError(t, Write(t.Context(), &out, plan, (&source{blobs: blobs}).open))
	return unzip(t, out.Bytes())
}

func unzip(t *testing.T, b []byte) (map[string]string, []string) {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	assert.NilError(t, err)
	files := map[string]string{}
	names := make([]string, 0, len(zr.File))
	for _, f := range zr.File {
		rc, err := f.Open()
		assert.NilError(t, err)
		data, err := io.ReadAll(rc)
		assert.NilError(t, err)
		assert.NilError(t, rc.Close())
		files[f.Name] = string(data)
		names = append(names, f.Name)
	}
	return files, names
}

// objOf is export reduced to the OBJ and MTL of the default stem.
func objOf(t *testing.T, ps []glbexport.Placement, blobs map[string][]byte, opts Options) (obj, mtl string) {
	t.Helper()
	files, _ := export(t, ps, blobs, opts)
	return files[opts.Stem+".obj"], files[opts.Stem+".mtl"]
}
