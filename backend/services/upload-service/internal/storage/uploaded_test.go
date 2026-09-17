package storage_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/storage"
)

// Owners are user UUIDs; a hash is lowercase hex.
const (
	hash   = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
	owner1 = "0b1c2d3e-aaaa-bbbb-cccc-000000000001"
	owner2 = "0b1c2d3e-aaaa-bbbb-cccc-000000000002"
)

type UploadedSuite struct {
	suite.Suite
	root string
	fs   *storage.FS
}

func TestUploadedSuite(t *testing.T) { suite.Run(t, new(UploadedSuite)) }

func (s *UploadedSuite) SetupTest() {
	s.root = s.T().TempDir()
	var err error
	s.fs, err = storage.NewFS(s.root)
	assert.NilError(s.T(), err)
}

func (s *UploadedSuite) TestRecordedUploadIsTheAuthorsOnly() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.fs.RecordUpload(ctx, hash, owner1))

	mine, err := s.fs.HasUpload(ctx, hash, owner1)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), mine)

	theirs, err := s.fs.HasUpload(ctx, hash, owner2)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !theirs)
}

// Uploading the same bytes twice is normal (content addressing dedups them).
func (s *UploadedSuite) TestRecordingTwiceIsFine() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.fs.RecordUpload(ctx, hash, owner1))
	assert.NilError(s.T(), s.fs.RecordUpload(ctx, hash, owner1))
}

func (s *UploadedSuite) TestUnknownHashWasNotUploaded() {
	got, err := s.fs.HasUpload(s.T().Context(), hash, owner1)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), !got)
}

// Both parts become path segments, so anything that could climb out of the
// root is refused before it reaches the filesystem.
func (s *UploadedSuite) TestRefusesPathTricks() {
	ctx := s.T().Context()
	assert.Assert(s.T(), s.fs.RecordUpload(ctx, "../"+hash, owner1) != nil)
	assert.Assert(s.T(), s.fs.RecordUpload(ctx, hash, "../../etc") != nil)
	_, err := s.fs.HasUpload(ctx, hash, "a/b")
	assert.Assert(s.T(), err != nil)
}

// Markers live beside the session directories and must never be mistaken for
// one: their directory name is not a valid session id.
func (s *UploadedSuite) TestMarkersDoNotLookLikeASession() {
	ctx := s.T().Context()
	assert.NilError(s.T(), s.fs.RecordUpload(ctx, hash, owner1))
	entries, err := os.ReadDir(s.root)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(entries), 1)
	_, err = s.fs.GetStatus(ctx, entries[0].Name())
	assert.Assert(s.T(), err != nil)
	_, err = os.Stat(filepath.Join(s.root, entries[0].Name(), hash, owner1))
	assert.NilError(s.T(), err)
}

// The author survives a round trip through meta.json.
func (s *UploadedSuite) TestInitiateStoresTheAuthor() {
	ctx := s.T().Context()
	_, err := s.fs.Initiate(ctx, "abc123", owner1, 10, "application/zip")
	assert.NilError(s.T(), err)
	got, err := s.fs.GetStatus(ctx, "abc123")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), got.OwnerID, owner1)
}
