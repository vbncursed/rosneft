package service

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"testing"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// bytesBlobs serves one fixed body for any hash.
type bytesBlobs struct {
	BlobStore
	body []byte
}

func (b bytesBlobs) Get(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
	return io.NopCloser(bytes.NewReader(b.body)), blobstore.Blob{}, nil
}

// A source that is not a ZIP fails the same way on every retry, so it must
// carry ErrBadSource for the reconciler to leave it alone.
func TestFetchAndExtractMarksACorruptArchiveBadSource(t *testing.T) {
	m := &Mesh{blobs: bytesBlobs{body: []byte("not a zip")}}
	err := m.fetchAndExtract(t.Context(), "h", t.TempDir())
	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
}

// A failing blob store says nothing about the source: it must stay retryable.
func TestFetchAndExtractBlobFailureIsNotBadSource(t *testing.T) {
	m := &Mesh{blobs: failingBlobs{}}
	err := m.fetchAndExtract(t.Context(), "h", t.TempDir())
	assert.Assert(t, err != nil && !errors.Is(err, domain.ErrBadSource), "got %v", err)
}

type failingBlobs struct{ BlobStore }

func (failingBlobs) Get(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
	return nil, blobstore.Blob{}, errors.New("asset store down")
}

// zipEntry is one archive member; raw writes body as the already-compressed
// bytes, bypassing the encoder, so a test can plant a broken stream.
type zipEntry struct {
	hdr  zip.FileHeader
	body []byte
	raw  bool
}

// zipOf builds an archive from entries in order.
func zipOf(t *testing.T, entries ...zipEntry) *zip.Reader {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		var w io.Writer
		var err error
		if e.raw {
			w, err = zw.CreateRaw(&e.hdr)
		} else {
			w, err = zw.CreateHeader(&e.hdr)
		}
		assert.NilError(t, err)
		_, err = w.Write(e.body)
		assert.NilError(t, err)
	}
	assert.NilError(t, zw.Close())
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	assert.NilError(t, err)
	return zr
}

func stored(name, body string) zipEntry {
	return zipEntry{hdr: zip.FileHeader{Name: name, Method: zip.Store}, body: []byte(body)}
}

// Every way the archive's own content can break extraction carries
// ErrBadSource; the reconciler skips such a target instead of retrying forever.
func TestExtractZip_SourceFailuresAreBadSource(t *testing.T) {
	tests := []struct {
		name       string
		zr         func(t *testing.T) *zip.Reader
		maxBytes   int64
		maxEntries int
	}{
		{"entry escapes target", func(t *testing.T) *zip.Reader { return zipOf(t, stored("../x.obj", "x")) }, 1 << 20, 10},
		{"too many entries", func(t *testing.T) *zip.Reader { return zipOf(t, stored("a", "x"), stored("b", "x")) }, 1 << 20, 1},
		{"over the size cap", func(t *testing.T) *zip.Reader { return zipOf(t, stored("a", "0123456789")) }, 5, 10},
		{"unsupported method", func(t *testing.T) *zip.Reader {
			return zipOf(t, zipEntry{hdr: zip.FileHeader{Name: "a", Method: 99, CompressedSize64: 1, UncompressedSize64: 1}, body: []byte("x"), raw: true})
		}, 1 << 20, 10},
		{"broken deflate stream", func(t *testing.T) *zip.Reader {
			return zipOf(t, zipEntry{hdr: zip.FileHeader{Name: "a", Method: zip.Deflate, CompressedSize64: 4, UncompressedSize64: 10}, body: []byte{0xff, 0xff, 0xff, 0xff}, raw: true})
		}, 1 << 20, 10},
		{"crc mismatch", func(t *testing.T) *zip.Reader {
			return zipOf(t, zipEntry{hdr: zip.FileHeader{Name: "a", Method: zip.Store, CRC32: 1, CompressedSize64: 3, UncompressedSize64: 3}, body: []byte("abc"), raw: true})
		}, 1 << 20, 10},
		{"file where a directory is needed", func(t *testing.T) *zip.Reader { return zipOf(t, stored("a", "x"), stored("a/b.obj", "x")) }, 1 << 20, 10},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := extractZip(tt.zr(t), t.TempDir(), tt.maxBytes, tt.maxEntries)
			assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
		})
	}
}

func TestFindFirstOBJWithNoOBJIsBadSource(t *testing.T) {
	_, err := findFirstOBJ(t.TempDir())
	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
}

// buildZip returns a reader over an in-memory archive with the given entries.
func buildZip(t *testing.T, files map[string][]byte) *zip.Reader {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range files {
		w, err := zw.Create(name)
		assert.NilError(t, err)
		_, err = w.Write(body)
		assert.NilError(t, err)
	}
	assert.NilError(t, zw.Close())
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	assert.NilError(t, err)
	return zr
}

func TestExtractZip_OverSizeCapFailsAndLeavesNoFile(t *testing.T) {
	dir := t.TempDir()
	// Highly compressible: a few hundred bytes on the wire, 1 KiB extracted.
	zr := buildZip(t, map[string][]byte{"big.bin": bytes.Repeat([]byte{'a'}, 1024)})

	err := extractZip(zr, dir, 1023, 10)

	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
	assert.ErrorContains(t, err, "1023 bytes")
	_, statErr := os.Stat(filepath.Join(dir, "big.bin"))
	assert.Assert(t, errors.Is(statErr, os.ErrNotExist), "partial file left behind")
}

func TestExtractZip_SizeCapIsSharedAcrossEntries(t *testing.T) {
	dir := t.TempDir()
	zr := buildZip(t, map[string][]byte{
		"a.bin": bytes.Repeat([]byte{'a'}, 600),
		"b.bin": bytes.Repeat([]byte{'b'}, 600),
	})

	err := extractZip(zr, dir, 1000, 10)

	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
}

func TestExtractZip_ExactlyAtSizeCapSucceeds(t *testing.T) {
	dir := t.TempDir()
	zr := buildZip(t, map[string][]byte{
		"a.bin": bytes.Repeat([]byte{'a'}, 600),
		"b.bin": bytes.Repeat([]byte{'b'}, 400),
	})

	assert.NilError(t, extractZip(zr, dir, 1000, 10))

	got, err := os.ReadFile(filepath.Join(dir, "b.bin"))
	assert.NilError(t, err)
	assert.Equal(t, len(got), 400)
}

func TestExtractZip_EntryCountOverLimitFails(t *testing.T) {
	files := map[string][]byte{}
	for i := range 4 {
		files[fmt.Sprintf("f%d.txt", i)] = []byte("x")
	}
	dir := t.TempDir()

	err := extractZip(buildZip(t, files), dir, 1<<20, 3)

	assert.Assert(t, errors.Is(err, domain.ErrBadSource), "got %v", err)
	assert.ErrorContains(t, err, "3 entries")
	entries, readErr := os.ReadDir(dir)
	assert.NilError(t, readErr)
	assert.Equal(t, len(entries), 0)
}

func TestExtractZip_EntryCountAtLimitSucceeds(t *testing.T) {
	files := map[string][]byte{}
	for i := range 3 {
		files[fmt.Sprintf("f%d.txt", i)] = []byte("x")
	}

	assert.NilError(t, extractZip(buildZip(t, files), t.TempDir(), 1<<20, 3))
}

func TestExtractZip_EntryNames(t *testing.T) {
	tests := []struct {
		name    string
		entry   string
		refused bool
	}{
		{"dot-dot prefix in a name is local", "..foo/x.obj", false},
		{"parent traversal", "../x.obj", true},
		{"nested traversal", "a/../../x.obj", true},
		{"absolute", "/etc/x.obj", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := t.TempDir()
			err := extractZip(buildZip(t, map[string][]byte{tt.entry: []byte("x")}), dir, 1<<20, 10)
			if tt.refused {
				assert.ErrorContains(t, err, "escapes target")
				return
			}
			assert.NilError(t, err)
			_, statErr := os.Stat(filepath.Join(dir, tt.entry))
			assert.NilError(t, statErr)
		})
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		n    int64
		want string
	}{
		{8 << 30, "8 GiB"},
		{3 << 20, "3 MiB"},
		{2 << 10, "2 KiB"},
		{1023, "1023 bytes"},
		{(1 << 30) + 1, "1073741825 bytes"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			assert.Equal(t, formatBytes(tt.n), tt.want)
		})
	}
}
