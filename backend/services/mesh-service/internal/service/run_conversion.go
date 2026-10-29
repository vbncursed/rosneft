package service

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/converter"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/domain"
)

// progressFunc reports a coarse conversion checkpoint (0..1) and its stage.
type progressFunc func(fraction float32, stage string)

// runConversion does the actual work. It mutates job.ArtifactHash on success.
// Progress checkpoints (0..1) bump in coarse stages — frontend renders a
// determinate bar so the user can tell the difference between "stuck" and
// "running long". Errors from UpdateProgress are swallowed: a missed tick
// must not fail the conversion.
//
// It returns the source hash it converted; the target is read exactly once,
// here, so ProcessJob re-checks it afterwards — see requeueIfSourceReplaced.
func (m *Mesh) runConversion(ctx context.Context, j *domain.Job) (string, error) {
	// progress mirrors each report onto j, so markFailed saves the stage the
	// job actually reached rather than the copy loaded before the first one.
	progress := func(fraction float32, stage string) {
		j.Progress, j.Stage = fraction, stage
		_ = m.UpdateProgress(ctx, j.ID, fraction, stage)
	}
	progress(0.05, "fetching")

	source, err := m.sourceHash(ctx, j)
	if err != nil {
		return "", err
	}

	workDir, err := os.MkdirTemp("", "mesh-job-*")
	if err != nil {
		return "", fmt.Errorf("tmp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	results, err := m.convertSource(ctx, j.Kind, source, workDir, progress)
	if err != nil {
		return "", err
	}
	if err := m.publishLODs(ctx, j, results, progress); err != nil {
		return "", err
	}
	j.ArtifactHash = results[0].ArtifactHash
	j.Progress = 1.0
	j.Stage = "registering"
	return source, nil
}

// sourceHash reads the job's target once and returns its source blob hash.
func (m *Mesh) sourceHash(ctx context.Context, j *domain.Job) (string, error) {
	target, err := m.catalog.GetTarget(ctx, j.Kind, j.Slug)
	if err != nil {
		if errors.Is(err, domain.ErrTargetNotFound) {
			return "", err
		}
		return "", fmt.Errorf("get target: %w", err)
	}
	if target.SourceBlobHash == "" {
		return "", fmt.Errorf("%w: target has no source_blob_hash", domain.ErrBadSource)
	}
	return target.SourceBlobHash, nil
}

// convertSource unpacks the source ZIP into workDir and converts its first
// .obj into the LOD chain. It never returns an empty chain without an error.
func (m *Mesh) convertSource(
	ctx context.Context,
	kind domain.Kind,
	source, workDir string,
	progress progressFunc,
) ([]domain.ConversionResult, error) {
	if err := m.fetchAndExtract(ctx, source, workDir); err != nil {
		return nil, fmt.Errorf("fetch/extract source: %w", err)
	}
	progress(0.20, "extracting")

	objPath, err := findFirstOBJ(workDir)
	if err != nil {
		return nil, fmt.Errorf("locate obj: %w", err)
	}
	progress(0.30, "parsing")

	results, err := m.converter.ConvertLODs(conversionContext(ctx, kind, progress), workDir, objPath)
	if err != nil {
		return nil, fmt.Errorf("convert: %w", err)
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("convert: no LOD results")
	}
	return results, nil
}

// conversionContext carries the progress sink and, for models, the Y-up flag.
func conversionContext(ctx context.Context, kind domain.Kind, progress progressFunc) context.Context {
	ctx = converter.WithProgress(ctx, func(stage string, fraction float32) {
		progress(fraction, stage)
	})
	if kind == domain.KindModel {
		// Models are authored Y-up; only territories (photogrammetry) are Z-up.
		ctx = converter.WithYUpSource(ctx)
	}
	return ctx
}

// publishLODs registers every LOD. Distributes the remaining 0.30 evenly
// across the results so the bar moves smoothly toward 1.0 as artifacts land.
func (m *Mesh) publishLODs(
	ctx context.Context,
	j *domain.Job,
	results []domain.ConversionResult,
	progress progressFunc,
) error {
	span := float32(0.30) / float32(len(results))
	for i, r := range results {
		if err := m.persistLOD(ctx, j.Kind, j.Slug, uint32(i), r); err != nil {
			return err
		}
		if i == 0 {
			// Placements follow the mesh, never lead it: see rescaleAfterConvert.
			if err := m.rescaleAfterConvert(ctx, j.Kind, j.Slug, results); err != nil {
				return err
			}
		}
		progress(0.70+span*float32(i+1), fmt.Sprintf("lod-%d", i))
	}
	return nil
}
