package service_test

import (
	"bytes"
	"context"
	"errors"
	"io"

	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// stubTwoLODsWithPlain makes the converter return LOD0 (with a plain copy) and
// LOD1, and records Put / RegisterArtifact in call order.
func (s *ProcessJobSuite) stubTwoLODsWithPlain(
	plainPutErr error,
) (events *[]string, registered *[]domain.Artifact, plainBody *[]byte) {
	s.queue.GetJobMock.Return(
		domain.Job{ID: "job-1", Kind: domain.KindModel, Slug: "m1", Status: domain.JobStatusPending},
		nil,
	)
	s.queue.UnlockTargetMock.Return(nil)
	s.stubSourceHashes("h1")
	s.blobs.GetMock.Set(func(context.Context, string) (io.ReadCloser, blobstore.Blob, error) {
		return io.NopCloser(bytes.NewReader(objZip(s.T()))), blobstore.Blob{}, nil
	})
	s.converter.ConvertLODsMock.Set(func(context.Context, string, string) ([]domain.ConversionResult, error) {
		return []domain.ConversionResult{
			{
				ArtifactHash: "lod0",
				ContentType:  "model/gltf-binary",
				Content:      []byte("packed"),
				Plain:        []byte("plain"),
				PlainHash:    "p",
			},
			{ArtifactHash: "lod1", ContentType: "model/gltf-binary", Content: []byte("small")},
		}, nil
	})
	events, registered, plainBody = new([]string), new([]domain.Artifact), new([]byte)
	s.blobs.PutMock.Set(func(_ context.Context, hash, contentType string, r io.Reader) (blobstore.Blob, error) {
		*events = append(*events, "put:"+hash)
		if hash == "p" {
			assert.Equal(s.T(), contentType, "model/gltf-binary")
			*plainBody, _ = io.ReadAll(r)
			return blobstore.Blob{}, plainPutErr
		}
		return blobstore.Blob{}, nil
	})
	if plainPutErr != nil {
		// RegisterArtifact stays unmocked: reaching it fails the test.
		return events, registered, plainBody
	}
	s.catalog.RegisterArtifactMock.Set(func(_ context.Context, a domain.Artifact) error {
		*events = append(*events, "register:"+a.Hash)
		*registered = append(*registered, a)
		return nil
	})
	return events, registered, plainBody
}

func (s *ProcessJobSuite) TestPersistsThePlainBeforeRegisteringLOD0() {
	events, registered, plainBody := s.stubTwoLODsWithPlain(nil)

	assert.NilError(s.T(), s.svc.ProcessJob(s.ctx, "job-1"))

	assert.DeepEqual(s.T(), *events, []string{"put:lod0", "put:p", "register:lod0", "put:lod1", "register:lod1"})
	assert.Assert(s.T(), bytes.Equal(*plainBody, []byte("plain")))
	assert.Equal(s.T(), (*registered)[0].PlainHash, "p")
	assert.Equal(s.T(), (*registered)[1].PlainHash, "")
}

func (s *ProcessJobSuite) TestPlainPutFailureFailsTheJobAndRegistersNothing() {
	putErr := errors.New("disk full")
	_, registered, _ := s.stubTwoLODsWithPlain(putErr)

	err := s.svc.ProcessJob(s.ctx, "job-1")

	assert.Assert(s.T(), errors.Is(err, putErr))
	assert.ErrorContains(s.T(), err, "blobstore put plain lod=0")
	assert.Equal(s.T(), len(*registered), 0)
	last := s.saved[len(s.saved)-1]
	assert.Equal(s.T(), last.Status, domain.JobStatusFailed)
	assert.Assert(s.T(), !last.FailedOnSource)
}
