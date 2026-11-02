package blobstore

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"

	"gotest.tools/v3/assert"
)

// The blob volume is read and written by one uid (nonroot in every service
// image), so a shard directory and its metadata sidecar need no access for
// anyone else.
func TestPutKeepsShardAndMetaPrivate(t *testing.T) {
	root := t.TempDir()
	store, err := NewFS(filepath.Join(root, "blobs"))
	assert.NilError(t, err)

	hash := strings.Repeat("ab", 32)
	_, err = store.Put(t.Context(), hash, "text/plain", strings.NewReader("x"))
	assert.NilError(t, err)

	shard := filepath.Join(root, "blobs", "ab")
	for path, other := range map[string]os.FileMode{
		filepath.Join(root, "blobs"):       0o007,
		shard:                              0o007,
		filepath.Join(shard, hash+".bin"):  0o077,
		filepath.Join(shard, hash+".json"): 0o077,
	} {
		info, err := os.Stat(path)
		assert.NilError(t, err)
		assert.Equal(t, info.Mode().Perm()&other, os.FileMode(0), path)
	}
}

// slowReader hands out its bytes in small pieces and yields between them, so
// concurrent Puts interleave while their temp files are open.
type slowReader struct{ r io.Reader }

func (s slowReader) Read(p []byte) (int, error) {
	runtime.Gosched()
	return s.r.Read(p[:min(len(p), 4096)])
}

// Two uploads of the same content (or of different content under one hash)
// share a destination: each must stage into a file of its own, and every Put
// must succeed with a blob that reads back whole.
func TestPutConcurrentSameHash(t *testing.T) {
	store, err := NewFS(filepath.Join(t.TempDir(), "blobs"))
	assert.NilError(t, err)

	hash := strings.Repeat("cd", 32)
	payloads := [][]byte{bytes.Repeat([]byte("a"), 256<<10), bytes.Repeat([]byte("b"), 256<<10)}

	var wg sync.WaitGroup
	for i := range 16 {
		wg.Go(func() {
			data := payloads[i%len(payloads)]
			blob, err := store.Put(t.Context(), hash, "text/plain", slowReader{bytes.NewReader(data)})
			assert.Check(t, err)
			assert.Check(t, blob.Size == int64(len(data)), "size %d", blob.Size)
		})
	}
	wg.Wait()

	rc, blob, err := store.Get(t.Context(), hash)
	assert.NilError(t, err)
	defer func() { assert.Check(t, rc.Close()) }()
	got, err := io.ReadAll(rc)
	assert.NilError(t, err)
	assert.Equal(t, blob.Size, int64(len(got)))
	assert.Assert(t, bytes.Equal(got, payloads[0]) || bytes.Equal(got, payloads[1]), "blob is a mix of uploads")

	entries, err := os.ReadDir(filepath.Join(store.root, "cd"))
	assert.NilError(t, err)
	assert.Equal(t, len(entries), 2, "leftover staging files: %v", entries)
}

func TestPutConcurrentDifferentHashes(t *testing.T) {
	store, err := NewFS(filepath.Join(t.TempDir(), "blobs"))
	assert.NilError(t, err)

	var wg sync.WaitGroup
	for i := range 16 {
		wg.Go(func() {
			hash := strings.Repeat("a", 62) + string("0123456789abcdef"[i]) + "0"
			_, err := store.Put(t.Context(), hash, "text/plain", slowReader{strings.NewReader(hash)})
			assert.Check(t, err)
		})
	}
	wg.Wait()
}

// A panic inside the writer (a reader that blows up mid-copy) must not leave
// the temp file behind: a hard failure is still a failure of the write.
func TestWriteAtomicRemovesTheTempFileOnPanic(t *testing.T) {
	dir := t.TempDir()
	final := filepath.Join(dir, "blob")

	func() {
		defer func() { assert.Assert(t, recover() != nil, "the panic must propagate") }()
		_, _ = writeAtomic(final, func(w io.Writer) (int64, error) {
			_, _ = w.Write([]byte("half"))
			panic("reader exploded")
		})
	}()

	left, err := os.ReadDir(dir)
	assert.NilError(t, err)
	assert.Equal(t, len(left), 0, "temp file leaked: %v", left)
	_, err = os.Stat(final)
	assert.Assert(t, os.IsNotExist(err))
}

func TestStatNamesABadHashAsInvalid(t *testing.T) {
	fs, err := NewFS(t.TempDir())
	assert.NilError(t, err)
	for _, hash := range []string{"", "a", "../../etc/passwd", "zz11"} {
		_, err := fs.Stat(t.Context(), hash)
		assert.Assert(t, errors.Is(err, ErrInvalidHash), "%q: %v", hash, err)
	}
	_, err = fs.Stat(t.Context(), "abcdef")
	assert.Assert(t, errors.Is(err, ErrNotFound), "a well-formed absent hash is not found: %v", err)
}
