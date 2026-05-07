package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ProcessJob runs one conversion end-to-end:
//  1. Mark the job Running.
//  2. Resolve the project's source path through the catalog.
//  3. Convert the source mesh.
//  4. Write the artifact to the BlobStore.
//  5. Register the artifact in the catalog.
//  6. Mark the job Succeeded with the artifact hash.
//
// On any error it marks the job Failed and returns the error so the caller
// can decide whether to ack or retry.
func (m *Mesh) ProcessJob(ctx context.Context, jobID string) error {
	job, err := m.queue.GetJob(ctx, jobID)
	if err != nil {
		return fmt.Errorf("service.ProcessJob: load: %w", err)
	}
	if err := m.markRunning(ctx, &job); err != nil {
		return err
	}

	if err := m.runConversion(ctx, &job); err != nil {
		_ = m.markFailed(ctx, job, err)
		return err
	}
	return m.markSucceeded(ctx, job)
}

func (m *Mesh) markRunning(ctx context.Context, j *domain.Job) error {
	j.Status = domain.JobStatusRunning
	j.ErrorMessage = ""
	return m.queue.SaveJob(ctx, *j)
}

func (m *Mesh) markSucceeded(ctx context.Context, j domain.Job) error {
	j.Status = domain.JobStatusSucceeded
	j.ErrorMessage = ""
	return m.queue.SaveJob(ctx, j)
}

func (m *Mesh) markFailed(ctx context.Context, j domain.Job, cause error) error {
	j.Status = domain.JobStatusFailed
	j.ErrorMessage = cause.Error()
	return m.queue.SaveJob(ctx, j)
}

// runConversion does the actual work. It mutates job.ArtifactHash on success.
func (m *Mesh) runConversion(ctx context.Context, j *domain.Job) error {
	project, err := m.catalog.GetProject(ctx, j.ProjectSlug)
	if err != nil {
		if errors.Is(err, domain.ErrProjectNotFound) {
			return err
		}
		return fmt.Errorf("get project: %w", err)
	}

	sourcePath := filepath.Join(m.sourceRoot, project.SourceObjPath)
	results, err := m.converter.ConvertLODs(ctx, sourcePath)
	if err != nil {
		return fmt.Errorf("convert: %w", err)
	}
	if len(results) == 0 {
		return fmt.Errorf("convert: no LOD results")
	}

	for i, r := range results {
		if err := m.persistLOD(ctx, j.ProjectSlug, uint32(i), r); err != nil {
			return err
		}
	}
	j.ArtifactHash = results[0].ArtifactHash
	return nil
}

// persistLOD writes one LOD artifact to the BlobStore and registers it in
// the catalog. LOD0 carries vertex/face/bbox metadata; lower LODs are
// content-only.
func (m *Mesh) persistLOD(ctx context.Context, slug string, lod uint32, r domain.ConversionResult) error {
	if _, err := m.blobs.Put(ctx, r.ArtifactHash, r.ContentType, bytes.NewReader(r.Content)); err != nil {
		return fmt.Errorf("blobstore put lod=%d: %w", lod, err)
	}
	if err := m.catalog.RegisterArtifact(ctx, domain.Artifact{
		ProjectSlug: slug,
		LOD:         lod,
		Hash:        r.ArtifactHash,
		ContentType: r.ContentType,
		Size:        r.Size,
		Vertices:    r.Vertices,
		Faces:       r.Faces,
		BBoxMin:     r.BBoxMin,
		BBoxMax:     r.BBoxMax,
	}); err != nil {
		return fmt.Errorf("register artifact lod=%d: %w", lod, err)
	}
	return nil
}
