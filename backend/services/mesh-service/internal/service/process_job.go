package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/converter"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// ProcessJob runs one conversion end-to-end:
//  1. Mark the job Running.
//  2. Resolve the catalog target (territory or model) → source_blob_hash.
//  3. Fetch the source ZIP from BlobStore and extract to a tmp dir.
//  4. Find the .obj inside and convert it (LOD chain).
//  5. Write each LOD artifact back to BlobStore.
//  6. Register each artifact in the catalog (Kind decides which table).
//  7. Mark the job Succeeded with the LOD0 artifact hash.
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
// Progress checkpoints (0..1) bump in coarse stages — frontend renders a
// determinate bar so the user can tell the difference between "stuck" and
// "running long". Errors from UpdateProgress are swallowed: a missed tick
// must not fail the conversion.
func (m *Mesh) runConversion(ctx context.Context, j *domain.Job) error {
	_ = m.UpdateProgress(ctx, j.ID, 0.05, "fetching")

	target, err := m.catalog.GetTarget(ctx, j.Kind, j.Slug)
	if err != nil {
		if errors.Is(err, domain.ErrTargetNotFound) {
			return err
		}
		return fmt.Errorf("get target: %w", err)
	}
	if target.SourceBlobHash == "" {
		return fmt.Errorf("%w: target has no source_blob_hash", domain.ErrInvalidInput)
	}

	workDir, err := os.MkdirTemp("", "mesh-job-*")
	if err != nil {
		return fmt.Errorf("tmp dir: %w", err)
	}
	defer os.RemoveAll(workDir)

	if err := m.fetchAndExtract(ctx, target.SourceBlobHash, workDir); err != nil {
		return fmt.Errorf("fetch/extract source: %w", err)
	}
	_ = m.UpdateProgress(ctx, j.ID, 0.20, "extracting")

	objPath, err := findFirstOBJ(workDir)
	if err != nil {
		return fmt.Errorf("locate obj: %w", err)
	}
	_ = m.UpdateProgress(ctx, j.ID, 0.30, "parsing")

	jobID := j.ID
	convCtx := converter.WithProgress(ctx, func(stage string, fraction float32) {
		_ = m.UpdateProgress(ctx, jobID, fraction, stage)
	})
	results, err := m.converter.ConvertLODs(convCtx, objPath)
	if err != nil {
		return fmt.Errorf("convert: %w", err)
	}
	if len(results) == 0 {
		return fmt.Errorf("convert: no LOD results")
	}

	// Keep existing placements 1:1 with the new mesh before publishing the
	// artifacts — see rescaleAfterConvert for why ordering matters.
	if err := m.rescaleAfterConvert(ctx, j.Kind, j.Slug, results); err != nil {
		return err
	}

	// Per-LOD register pass. Distribute the remaining 0.30 evenly across
	// every result so the bar moves smoothly toward 1.0 as artifacts land.
	span := float32(0.30) / float32(len(results))
	for i, r := range results {
		if err := m.persistLOD(ctx, j.Kind, j.Slug, uint32(i), r); err != nil {
			return err
		}
		_ = m.UpdateProgress(ctx, j.ID, 0.70+span*float32(i+1), fmt.Sprintf("lod-%d", i))
	}
	j.ArtifactHash = results[0].ArtifactHash
	j.Progress = 1.0
	j.Stage = "registering"
	return nil
}

// persistLOD writes one LOD artifact to the BlobStore and registers it in
// the catalog under the appropriate table (territory_artifacts or
// model_artifacts depending on Kind).
func (m *Mesh) persistLOD(ctx context.Context, kind domain.Kind, slug string, lod uint32, r domain.ConversionResult) error {
	if _, err := m.blobs.Put(ctx, r.ArtifactHash, r.ContentType, bytes.NewReader(r.Content)); err != nil {
		return fmt.Errorf("blobstore put lod=%d: %w", lod, err)
	}
	if err := m.catalog.RegisterArtifact(ctx, domain.Artifact{
		Kind:        kind,
		Slug:        slug,
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
