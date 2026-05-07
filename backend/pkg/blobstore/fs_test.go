package blobstore_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
)

const sampleHash = "deadbeefcafebabe1234567890abcdef0123456789abcdef0123456789abcdef"

type FSSuite struct {
	suite.Suite
	store *blobstore.FS
	dir   string
	ctx   context.Context
}

func TestFSSuite(t *testing.T) {
	suite.Run(t, new(FSSuite))
}

func (s *FSSuite) SetupTest() {
	s.dir = s.T().TempDir()
	store, err := blobstore.NewFS(s.dir)
	assert.NilError(s.T(), err)
	s.store = store
	s.ctx = s.T().Context()
}

func (s *FSSuite) TestPutGet_roundtrip() {
	content := []byte("binary content here")
	blob, err := s.store.Put(s.ctx, sampleHash, "model/gltf-binary", bytes.NewReader(content))
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), blob.Size, int64(len(content)))
	assert.Equal(s.T(), blob.Hash, sampleHash)
	assert.Equal(s.T(), blob.ContentType, "model/gltf-binary")

	rc, got, err := s.store.Get(s.ctx, sampleHash)
	assert.NilError(s.T(), err)
	defer rc.Close()
	assert.Equal(s.T(), got.Size, blob.Size)

	body, err := io.ReadAll(rc)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), bytes.Equal(body, content), "content mismatch")
}

func (s *FSSuite) TestGet_notFound() {
	_, _, err := s.store.Get(s.ctx, sampleHash)
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}

func (s *FSSuite) TestStat_notFound() {
	_, err := s.store.Stat(s.ctx, sampleHash)
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}

func (s *FSSuite) TestExists() {
	ok, err := s.store.Exists(s.ctx, sampleHash)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !ok, "Exists=true on empty store")

	_, err = s.store.Put(s.ctx, sampleHash, "text/plain", strings.NewReader("x"))
	assert.NilError(s.T(), err)

	ok, err = s.store.Exists(s.ctx, sampleHash)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), ok, "Exists=false after Put")
}

func (s *FSSuite) TestDelete_idempotent() {
	assert.NilError(s.T(), s.store.Delete(s.ctx, sampleHash))

	_, err := s.store.Put(s.ctx, sampleHash, "text/plain", strings.NewReader("x"))
	assert.NilError(s.T(), err)

	assert.NilError(s.T(), s.store.Delete(s.ctx, sampleHash))

	ok, _ := s.store.Exists(s.ctx, sampleHash)
	assert.Assert(s.T(), !ok, "blob still exists after Delete")
}

func (s *FSSuite) TestPaths_rejectInvalidHash() {
	cases := map[string]string{
		"traversal-up":     "../../etc/passwd",
		"traversal-deeper": "../../../foo",
		"absolute":         "/absolute",
		"too-short":        "a",
		"non-hex":          "GGGGGGGGGGGGGGGG",
		"empty":            "",
	}
	for name, h := range cases {
		s.Run(name, func() {
			_, err := s.store.Stat(s.ctx, h)
			assert.Assert(s.T(), err != nil, "expected error for hash=%q", h)
			assert.Assert(s.T(), !errors.Is(err, blobstore.ErrNotFound), "got ErrNotFound, want validation error for %q", h)
		})
	}
}

func (s *FSSuite) TestNewFS_emptyRoot() {
	_, err := blobstore.NewFS("")
	assert.Assert(s.T(), err != nil)
}

func (s *FSSuite) TestSharding() {
	_, err := s.store.Put(s.ctx, sampleHash, "text/plain", strings.NewReader("x"))
	assert.NilError(s.T(), err)

	wantData := filepath.Join(s.dir, sampleHash[:2], sampleHash+".bin")
	wantMeta := filepath.Join(s.dir, sampleHash[:2], sampleHash+".json")
	_, err = os.Stat(wantData)
	assert.NilError(s.T(), err)
	_, err = os.Stat(wantMeta)
	assert.NilError(s.T(), err)
}

func (s *FSSuite) TestPut_atomicityNoTmpRemains() {
	_, err := s.store.Put(s.ctx, sampleHash, "text/plain", strings.NewReader("ok"))
	assert.NilError(s.T(), err)

	tmp := filepath.Join(s.dir, sampleHash[:2], sampleHash+".bin.tmp")
	_, err = os.Stat(tmp)
	assert.Assert(s.T(), errors.Is(err, os.ErrNotExist), "tmp file leaked: %s (err=%v)", tmp, err)
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("boom") }

func (s *FSSuite) TestPut_copyError_cleansUpTmp() {
	_, err := s.store.Put(s.ctx, sampleHash, "text/plain", errReader{})
	assert.Assert(s.T(), err != nil, "expected error from failing reader")

	tmp := filepath.Join(s.dir, sampleHash[:2], sampleHash+".bin.tmp")
	_, err = os.Stat(tmp)
	assert.Assert(s.T(), errors.Is(err, os.ErrNotExist), "tmp file leaked after copy error")

	data := filepath.Join(s.dir, sampleHash[:2], sampleHash+".bin")
	_, err = os.Stat(data)
	assert.Assert(s.T(), errors.Is(err, os.ErrNotExist), "data file unexpectedly created on copy error")
}
