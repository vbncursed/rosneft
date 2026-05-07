// Package seed loads project entries from a YAML manifest and upserts them
// through the service layer. Used to bootstrap the catalog from the same
// source-of-truth the frontend used to ship hardcoded.
package seed

import (
	"context"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"

	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

// Service is the dependency seed needs from the service layer.
type Service interface {
	UpsertProject(ctx context.Context, p domain.Project) (domain.Project, error)
}

type fileFormat struct {
	Projects []projectYAML `yaml:"projects"`
}

type projectYAML struct {
	Slug              string `yaml:"slug"`
	Title             string `yaml:"title"`
	Subtitle          string `yaml:"subtitle"`
	Description       string `yaml:"description"`
	SourceObjPath     string `yaml:"source_obj_path"`
	SourceMtlPath     string `yaml:"source_mtl_path"`
	SourceTexturePath string `yaml:"source_texture_path"`
}

// FromFile reads a YAML manifest at path and upserts every project via svc.
// Returns the count of projects upserted.
func FromFile(ctx context.Context, svc Service, path string) (int, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("seed: read %q: %w", path, err)
	}
	var f fileFormat
	if err := yaml.Unmarshal(b, &f); err != nil {
		return 0, fmt.Errorf("seed: parse %q: %w", path, err)
	}

	for i, p := range f.Projects {
		if _, err := svc.UpsertProject(ctx, domain.Project{
			Slug:              p.Slug,
			Title:             p.Title,
			Subtitle:          p.Subtitle,
			Description:       p.Description,
			SourceObjPath:     p.SourceObjPath,
			SourceMtlPath:     p.SourceMtlPath,
			SourceTexturePath: p.SourceTexturePath,
		}); err != nil {
			return i, fmt.Errorf("seed: upsert %q: %w", p.Slug, err)
		}
	}
	return len(f.Projects), nil
}
