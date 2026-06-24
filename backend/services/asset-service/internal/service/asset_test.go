package service_test

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/asset-service/internal/service/mocks"
)

type AssetSuite struct {
	suite.Suite
	store *mocks.StoreMock
	svc   *service.Asset
	ctx   context.Context
}

func TestAssetSuite(t *testing.T) {
	suite.Run(t, new(AssetSuite))
}

func (s *AssetSuite) SetupTest() {
	s.store = mocks.NewStoreMock(minimock.NewController(s.T()))
	s.svc = service.New(s.store)
	s.ctx = s.T().Context()
}

func (s *AssetSuite) TestStatReturnsMetadata() {
	s.store.StatMock.Expect(s.ctx, "abc").
		Return(blobstore.Blob{Hash: "abc", ContentType: "model/gltf-binary", Size: 100}, nil)
	blob, err := s.svc.Stat(s.ctx, "abc")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), blob.Hash, "abc")
	assert.Equal(s.T(), blob.Size, int64(100))
}

func (s *AssetSuite) TestStatPropagatesNotFound() {
	s.store.StatMock.Expect(s.ctx, "missing").Return(blobstore.Blob{}, blobstore.ErrNotFound)
	_, err := s.svc.Stat(s.ctx, "missing")
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}

func (s *AssetSuite) TestGetReturnsReaderAndMetadata() {
	rc := io.NopCloser(strings.NewReader("glb-bytes"))
	s.store.GetMock.Expect(s.ctx, "abc").Return(rc, blobstore.Blob{Hash: "abc", Size: 9}, nil)

	r, blob, err := s.svc.Get(s.ctx, "abc")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), blob.Hash, "abc")
	body, err := io.ReadAll(r)
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), string(body), "glb-bytes")
	assert.NilError(s.T(), r.Close())
}

func (s *AssetSuite) TestGetPropagatesNotFound() {
	s.store.GetMock.Expect(s.ctx, "missing").Return(nil, blobstore.Blob{}, blobstore.ErrNotFound)
	_, _, err := s.svc.Get(s.ctx, "missing")
	assert.ErrorIs(s.T(), err, blobstore.ErrNotFound)
}
