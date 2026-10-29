package service

import (
	"bytes"
	"context"
	"fmt"

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
// can decide whether to ack or retry. Either way — success or failure — the
// target claim markRunning re-took (HoldTarget) is released before returning:
// see the unlock call below for why a failure releases too, rather than
// waiting out the TTL.
func (m *Mesh) ProcessJob(ctx context.Context, jobID string) error {
	job, err := m.queue.GetJob(ctx, jobID)
	if err != nil {
		return fmt.Errorf("service.ProcessJob: load: %w", err)
	}
	if err := m.markRunning(ctx, &job); err != nil {
		// Released and failed like a conversion error: left Pending, it would
		// block its target for MaxQueueWait behind a job nothing runs.
		m.unlockTarget(ctx, job)
		_ = m.markFailed(ctx, job, err)
		return err
	}

	source, err := m.runConversion(ctx, &job)
	if err != nil {
		// Release rather than hold TargetLockTTL: its own doc comment
		// scopes it to the worker dying between claim and finish, and that
		// case never reaches here — a returned error means the worker is
		// alive and already knows the outcome. Holding the claim anyway
		// previously left process_job.go and reconcile_missing_artifacts.go
		// disagreeing silently: a submit failure was released for retry, a
		// conversion failure was not. Same rule now for both: the
		// reconciler's job is to retry, so nothing here should block it.
		m.unlockTarget(ctx, job)
		_ = m.markFailed(ctx, job, err)
		return err
	}

	// Every running job holds the claim — markRunning re-took it.
	m.unlockTarget(ctx, job)

	if err := m.markSucceeded(ctx, job); err != nil {
		return err
	}
	m.requeueIfSourceReplaced(ctx, job, source)
	return nil
}

// persistLOD writes one LOD artifact to the BlobStore and registers it in
// the catalog under the appropriate table (territory_artifacts or
// model_artifacts depending on Kind).
//
// LOD0's plain GLB is written after the LOD and before the registration, so
// the catalog never records a mapping that names a missing blob.
func (m *Mesh) persistLOD(
	ctx context.Context,
	kind domain.Kind,
	slug string,
	lod uint32,
	r domain.ConversionResult,
) error {
	if _, err := m.blobs.Put(ctx, r.ArtifactHash, r.ContentType, bytes.NewReader(r.Content)); err != nil {
		return fmt.Errorf("blobstore put lod=%d: %w", lod, err)
	}
	if r.PlainHash != "" {
		if _, err := m.blobs.Put(ctx, r.PlainHash, r.ContentType, bytes.NewReader(r.Plain)); err != nil {
			return fmt.Errorf("blobstore put plain lod=%d: %w", lod, err)
		}
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
		PlainHash:   r.PlainHash,
	}); err != nil {
		return fmt.Errorf("register artifact lod=%d: %w", lod, err)
	}
	return nil
}
