package blobstore

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type FSContractSuite struct {
	suite.Suite
	fs   *FS
	root string
}

func TestFSContract(t *testing.T) { suite.Run(t, new(FSContractSuite)) }

func (s *FSContractSuite) SetupTest() {
	s.root = s.T().TempDir()
	var err error
	s.fs, err = NewFS(s.root)
	assert.NilError(s.T(), err)
}

func (s *FSContractSuite) TestLifecycleAndIsolation() {
	t := s.T()
	for _, hash := range []string{"aabb", "aacc"} {
		_, err := s.fs.Put(t.Context(), hash, "text/plain", strings.NewReader(hash))
		assert.NilError(t, err)
	}
	exists, err := s.fs.Exists(t.Context(), "aabb")
	assert.NilError(t, err)
	assert.Assert(t, exists)
	assert.NilError(t, s.fs.Delete(t.Context(), "aabb"))
	exists, err = s.fs.Exists(t.Context(), "aabb")
	assert.NilError(t, err)
	assert.Assert(t, !exists)
	_, _, err = s.fs.Get(t.Context(), "aabb")
	assert.Assert(t, errors.Is(err, ErrNotFound))
	assert.NilError(t, s.fs.Delete(t.Context(), "aabb"))
	exists, err = s.fs.Exists(t.Context(), "aacc")
	assert.NilError(t, err)
	assert.Assert(t, exists)
}

func (s *FSContractSuite) TestCancellationAndInvalidHashes() {
	t := s.T()
	_, err := s.fs.Put(t.Context(), "aabb", "text/plain", strings.NewReader("data"))
	assert.NilError(t, err)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	exists, err := s.fs.Exists(ctx, "aabb")
	assert.Assert(t, !exists)
	assert.Assert(t, errors.Is(err, context.Canceled))
	assert.Assert(t, errors.Is(s.fs.Delete(ctx, "aabb"), context.Canceled))
	exists, err = s.fs.Exists(t.Context(), "aabb")
	assert.NilError(t, err)
	assert.Assert(t, exists)
	for _, hash := range []string{"", "a", "../outside", "zz"} {
		exists, err = s.fs.Exists(t.Context(), hash)
		assert.Assert(t, !exists)
		assert.Assert(t, errors.Is(err, ErrInvalidHash))
		assert.Assert(t, errors.Is(s.fs.Delete(t.Context(), hash), ErrInvalidHash))
	}
}

func (s *FSContractSuite) TestExistsReportsFilesystemError() {
	t := s.T()
	assert.NilError(t, os.WriteFile(filepath.Join(s.root, "aa"), []byte("block shard"), 0o600))
	exists, err := s.fs.Exists(t.Context(), "aabb")
	assert.Assert(t, !exists)
	assert.Assert(t, errors.Is(err, syscall.ENOTDIR))
	assert.Assert(t, !errors.Is(err, ErrNotFound))
}

func (s *FSContractSuite) TestDeleteAttemptsBothFilesAndPreservesErrors() {
	t := s.T()
	for _, suffix := range []string{".bin", ".json"} {
		path := filepath.Join(s.root, "aa", "aabb"+suffix)
		assert.NilError(t, os.MkdirAll(path, 0o700))
		assert.NilError(t, os.WriteFile(filepath.Join(path, "child"), []byte("x"), 0o600))
	}
	err := s.fs.Delete(t.Context(), "aabb")
	assert.Assert(t, errors.Is(err, syscall.ENOTEMPTY))
	joined, ok := err.(interface{ Unwrap() []error })
	assert.Assert(t, ok)
	parts := joined.Unwrap()
	assert.Equal(t, len(parts), 2)
	for i, suffix := range []string{".bin", ".json"} {
		pathErr, ok := errors.AsType[*os.PathError](parts[i])
		assert.Assert(t, ok)
		assert.Equal(t, pathErr.Path, filepath.Join(s.root, "aa", "aabb"+suffix))
		assert.Assert(t, errors.Is(parts[i], syscall.ENOTEMPTY))
	}
}
