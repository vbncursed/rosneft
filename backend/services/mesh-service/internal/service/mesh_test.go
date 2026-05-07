package service_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/service"
)

// fakeQueue implements service.Queue with in-memory state.
type fakeQueue struct {
	jobs        map[string]domain.Job
	enqueued    []string
	saveErr     error
	enqueueErr  error
	getErr      error
}

func newFakeQueue() *fakeQueue { return &fakeQueue{jobs: map[string]domain.Job{}} }

func (q *fakeQueue) SaveJob(_ context.Context, j domain.Job) error {
	if q.saveErr != nil {
		return q.saveErr
	}
	q.jobs[j.ID] = j
	return nil
}
func (q *fakeQueue) GetJob(_ context.Context, id string) (domain.Job, error) {
	if q.getErr != nil {
		return domain.Job{}, q.getErr
	}
	j, ok := q.jobs[id]
	if !ok {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return j, nil
}
func (q *fakeQueue) EnqueueJob(_ context.Context, jobID string) error {
	if q.enqueueErr != nil {
		return q.enqueueErr
	}
	q.enqueued = append(q.enqueued, jobID)
	return nil
}

type fakeCatalog struct {
	GetProjectFunc       func(ctx context.Context, slug string) (domain.Project, error)
	ListProjectsFunc     func(ctx context.Context) ([]domain.Project, error)
	GetArtifactFunc      func(ctx context.Context, slug string, lod uint32) (domain.Artifact, error)
	RegisterArtifactFunc func(ctx context.Context, a domain.Artifact) error
}

func (c *fakeCatalog) GetProject(ctx context.Context, slug string) (domain.Project, error) {
	return c.GetProjectFunc(ctx, slug)
}
func (c *fakeCatalog) ListProjects(ctx context.Context) ([]domain.Project, error) {
	return c.ListProjectsFunc(ctx)
}
func (c *fakeCatalog) GetArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	return c.GetArtifactFunc(ctx, slug, lod)
}
func (c *fakeCatalog) RegisterArtifact(ctx context.Context, a domain.Artifact) error {
	return c.RegisterArtifactFunc(ctx, a)
}

type fakeConverter struct {
	ConvertLODsFunc func(ctx context.Context, sourcePath string) ([]domain.ConversionResult, error)
}

func (f *fakeConverter) ConvertLODs(ctx context.Context, sourcePath string) ([]domain.ConversionResult, error) {
	return f.ConvertLODsFunc(ctx, sourcePath)
}

type fakeBlobs struct {
	puts    []string
	putErr  error
}

func (b *fakeBlobs) Put(_ context.Context, hash, _ string, r io.Reader) (blobstore.Blob, error) {
	if b.putErr != nil {
		return blobstore.Blob{}, b.putErr
	}
	body, _ := io.ReadAll(r)
	b.puts = append(b.puts, hash)
	return blobstore.Blob{Hash: hash, Size: int64(len(body))}, nil
}

type MeshSuite struct {
	suite.Suite
	queue *fakeQueue
	cat   *fakeCatalog
	conv  *fakeConverter
	blobs *fakeBlobs
	svc   *service.Mesh
}

func TestMeshSuite(t *testing.T) {
	suite.Run(t, new(MeshSuite))
}

func (s *MeshSuite) SetupTest() {
	s.queue = newFakeQueue()
	s.cat = &fakeCatalog{}
	s.conv = &fakeConverter{}
	s.blobs = &fakeBlobs{}
	s.svc = service.New(service.Config{
		Queue:      s.queue,
		Catalog:    s.cat,
		Converter:  s.conv,
		Blobs:      s.blobs,
		SourceRoot: "/var/source",
		IDGen:      func() string { return "job-1" },
	})
}

// SubmitConversion

func (s *MeshSuite) TestSubmitConversion_emptySlug_invalidInput() {
	_, err := s.svc.SubmitConversion(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeshSuite) TestSubmitConversion_persistsAndEnqueues() {
	job, err := s.svc.SubmitConversion(s.T().Context(), "dji")
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), job.ID, "job-1")
	assert.Equal(s.T(), job.ProjectSlug, "dji")
	assert.Equal(s.T(), job.Status, domain.JobStatusPending)
	assert.Equal(s.T(), len(s.queue.jobs), 1)
	assert.Equal(s.T(), len(s.queue.enqueued), 1)
	assert.Equal(s.T(), s.queue.enqueued[0], "job-1")
}

func (s *MeshSuite) TestSubmitConversion_saveError() {
	s.queue.saveErr = errors.New("save boom")
	_, err := s.svc.SubmitConversion(s.T().Context(), "dji")
	assert.ErrorContains(s.T(), err, "save boom")
}

func (s *MeshSuite) TestSubmitConversion_enqueueError() {
	s.queue.enqueueErr = errors.New("enqueue boom")
	_, err := s.svc.SubmitConversion(s.T().Context(), "dji")
	assert.ErrorContains(s.T(), err, "enqueue boom")
}

// GetJob

func (s *MeshSuite) TestGetJob_emptyID_invalidInput() {
	_, err := s.svc.GetJob(s.T().Context(), "")
	assert.ErrorIs(s.T(), err, domain.ErrInvalidInput)
}

func (s *MeshSuite) TestGetJob_notFound() {
	_, err := s.svc.GetJob(s.T().Context(), "missing")
	assert.ErrorIs(s.T(), err, domain.ErrJobNotFound)
}

// ProcessJob

func (s *MeshSuite) TestProcessJob_happyPath() {
	ctx := s.T().Context()
	_, err := s.svc.SubmitConversion(ctx, "dji")
	assert.NilError(s.T(), err)

	s.cat.GetProjectFunc = func(_ context.Context, slug string) (domain.Project, error) {
		return domain.Project{Slug: slug, SourceObjPath: "DJI/sf.obj"}, nil
	}
	var sawPath string
	s.conv.ConvertLODsFunc = func(_ context.Context, p string) ([]domain.ConversionResult, error) {
		sawPath = p
		return []domain.ConversionResult{{
			ArtifactHash: "abc",
			Content:      []byte("glb-bytes"),
			ContentType:  "model/gltf-binary",
			Size:         9,
		}}, nil
	}
	var registered domain.Artifact
	s.cat.RegisterArtifactFunc = func(_ context.Context, a domain.Artifact) error {
		registered = a
		return nil
	}

	err = s.svc.ProcessJob(ctx, "job-1")
	assert.NilError(s.T(), err)

	assert.Equal(s.T(), sawPath, "/var/source/DJI/sf.obj")
	assert.Equal(s.T(), len(s.blobs.puts), 1)
	assert.Equal(s.T(), s.blobs.puts[0], "abc")
	assert.Equal(s.T(), registered.ProjectSlug, "dji")
	assert.Equal(s.T(), registered.Hash, "abc")

	final, _ := s.svc.GetJob(ctx, "job-1")
	assert.Equal(s.T(), final.Status, domain.JobStatusSucceeded)
	assert.Equal(s.T(), final.ArtifactHash, "abc")
}

func (s *MeshSuite) TestProcessJob_projectNotFound_marksFailed() {
	ctx := s.T().Context()
	_, err := s.svc.SubmitConversion(ctx, "dji")
	assert.NilError(s.T(), err)

	s.cat.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{}, domain.ErrProjectNotFound
	}

	err = s.svc.ProcessJob(ctx, "job-1")
	assert.ErrorIs(s.T(), err, domain.ErrProjectNotFound)

	final, _ := s.svc.GetJob(ctx, "job-1")
	assert.Equal(s.T(), final.Status, domain.JobStatusFailed)
	assert.Assert(s.T(), strings.Contains(final.ErrorMessage, "not found"))
}

func (s *MeshSuite) TestProcessJob_converterError_marksFailed() {
	ctx := s.T().Context()
	_, err := s.svc.SubmitConversion(ctx, "dji")
	assert.NilError(s.T(), err)

	s.cat.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{Slug: "dji", SourceObjPath: "x.obj"}, nil
	}
	s.conv.ConvertLODsFunc = func(_ context.Context, _ string) ([]domain.ConversionResult, error) {
		return nil, errors.New("parse failed")
	}

	err = s.svc.ProcessJob(ctx, "job-1")
	assert.ErrorContains(s.T(), err, "parse failed")

	final, _ := s.svc.GetJob(ctx, "job-1")
	assert.Equal(s.T(), final.Status, domain.JobStatusFailed)
	assert.Equal(s.T(), len(s.blobs.puts), 0)
}

func (s *MeshSuite) TestProcessJob_blobError_marksFailed() {
	ctx := s.T().Context()
	_, err := s.svc.SubmitConversion(ctx, "dji")
	assert.NilError(s.T(), err)

	s.cat.GetProjectFunc = func(_ context.Context, _ string) (domain.Project, error) {
		return domain.Project{Slug: "dji", SourceObjPath: "x.obj"}, nil
	}
	s.conv.ConvertLODsFunc = func(_ context.Context, _ string) ([]domain.ConversionResult, error) {
		return []domain.ConversionResult{{ArtifactHash: "h", Content: []byte{1}, ContentType: "x", Size: 1}}, nil
	}
	s.blobs.putErr = errors.New("disk full")

	err = s.svc.ProcessJob(ctx, "job-1")
	assert.ErrorContains(s.T(), err, "disk full")

	final, _ := s.svc.GetJob(ctx, "job-1")
	assert.Equal(s.T(), final.Status, domain.JobStatusFailed)
}

func (s *MeshSuite) TestProcessJob_missingJob() {
	err := s.svc.ProcessJob(s.T().Context(), "ghost")
	assert.ErrorIs(s.T(), err, domain.ErrJobNotFound)
}

// ReconcileMissingArtifacts

func (s *MeshSuite) TestReconcile_allMissing_queuesAll() {
	s.cat.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "a"}, {Slug: "b"}, {Slug: "c"}}, nil
	}
	s.cat.GetArtifactFunc = func(_ context.Context, _ string, _ uint32) (domain.Artifact, error) {
		return domain.Artifact{}, domain.ErrArtifactNotFound
	}

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 3)
	assert.Equal(s.T(), len(s.queue.enqueued), 3)
}

func (s *MeshSuite) TestReconcile_allHaveArtifacts_queuesNothing() {
	s.cat.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "a"}, {Slug: "b"}}, nil
	}
	s.cat.GetArtifactFunc = func(_ context.Context, slug string, _ uint32) (domain.Artifact, error) {
		return domain.Artifact{ProjectSlug: slug, Hash: "h"}, nil
	}

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 0)
	assert.Equal(s.T(), len(s.queue.enqueued), 0)
}

func (s *MeshSuite) TestReconcile_partialCoverage_queuesOnlyMissing() {
	s.cat.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return []domain.Project{{Slug: "ok"}, {Slug: "missing"}}, nil
	}
	s.cat.GetArtifactFunc = func(_ context.Context, slug string, _ uint32) (domain.Artifact, error) {
		if slug == "ok" {
			return domain.Artifact{ProjectSlug: slug, Hash: "h"}, nil
		}
		return domain.Artifact{}, domain.ErrArtifactNotFound
	}

	n, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.NilError(s.T(), err)
	assert.Equal(s.T(), n, 1)
	assert.Equal(s.T(), len(s.queue.enqueued), 1)
}

func (s *MeshSuite) TestReconcile_listError_propagates() {
	s.cat.ListProjectsFunc = func(_ context.Context) ([]domain.Project, error) {
		return nil, errors.New("catalog down")
	}
	_, err := s.svc.ReconcileMissingArtifacts(s.T().Context())
	assert.ErrorContains(s.T(), err, "catalog down")
}
