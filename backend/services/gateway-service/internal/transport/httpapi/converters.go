package httpapi

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// Converters between domain types and openapi-generated DTOs (which live in
// the same package, produced by oapi-codegen).

func projectToAPI(p domain.Project) Project {
	out := Project{
		Slug:              p.Slug,
		Title:             p.Title,
		Subtitle:          stringPtrIfNonEmpty(p.Subtitle),
		Description:       stringPtrIfNonEmpty(p.Description),
		SourceObjPath:     stringPtrIfNonEmpty(p.SourceObjPath),
		SourceMtlPath:     stringPtrIfNonEmpty(p.SourceMtlPath),
		SourceTexturePath: stringPtrIfNonEmpty(p.SourceTexturePath),
	}
	if !p.CreatedAt.IsZero() {
		t := p.CreatedAt
		out.CreatedAt = &t
	}
	if !p.UpdatedAt.IsZero() {
		t := p.UpdatedAt
		out.UpdatedAt = &t
	}
	return out
}

func projectsToAPI(in []domain.Project) []Project {
	out := make([]Project, len(in))
	for i, p := range in {
		out[i] = projectToAPI(p)
	}
	return out
}

func artifactToAPI(a domain.Artifact) Artifact {
	v := int64(a.Vertices)
	f := int64(a.Faces)
	out := Artifact{
		ProjectSlug: a.ProjectSlug,
		Lod:         int32(a.LOD),
		Hash:        a.Hash,
		ContentType: a.ContentType,
		Size:        a.Size,
		Vertices:    &v,
		Faces:       &f,
	}
	bmin := vec3ToAPI(a.BBoxMin)
	bmax := vec3ToAPI(a.BBoxMax)
	out.BboxMin = &bmin
	out.BboxMax = &bmax
	if !a.CreatedAt.IsZero() {
		t := a.CreatedAt
		out.CreatedAt = &t
	}
	if len(a.LODs) > 0 {
		chain := lodChainToAPI(a.LODs)
		out.Artifacts = &chain
	}
	return out
}

func artifactsToAPI(in []domain.Artifact) []Artifact {
	out := make([]Artifact, len(in))
	for i, a := range in {
		out[i] = artifactToAPI(a)
	}
	return out
}

func vec3ToAPI(v domain.Vec3) Vec3 {
	return Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func jobToAPI(j domain.Job) Job {
	out := Job{
		Id:          j.ID,
		ProjectSlug: j.ProjectSlug,
		Status:      JobStatus(j.Status),
	}
	if j.ErrorMessage != "" {
		s := j.ErrorMessage
		out.ErrorMessage = &s
	}
	if j.ArtifactHash != "" {
		s := j.ArtifactHash
		out.ArtifactHash = &s
	}
	if !j.CreatedAt.IsZero() {
		t := j.CreatedAt
		out.CreatedAt = &t
	}
	if !j.UpdatedAt.IsZero() {
		t := j.UpdatedAt
		out.UpdatedAt = &t
	}
	return out
}

func stringPtrIfNonEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func placementToAPI(p domain.Placement) Placement {
	out := Placement{
		Id:         p.ID,
		ParentSlug: p.ParentSlug,
		AssetSlug:  p.AssetSlug,
		Position:   vec3ToAPI(p.Position),
		Rotation:   vec3ToAPI(p.Rotation),
		Scale:      vec3ToAPI(p.Scale),
		Label:      stringPtrIfNonEmpty(p.Label),
	}
	if !p.CreatedAt.IsZero() {
		t := p.CreatedAt
		out.CreatedAt = &t
	}
	if !p.UpdatedAt.IsZero() {
		t := p.UpdatedAt
		out.UpdatedAt = &t
	}
	return out
}

func placementsToAPI(in []domain.Placement) []Placement {
	out := make([]Placement, len(in))
	for i, p := range in {
		out[i] = placementToAPI(p)
	}
	return out
}

func vec3FromAPIPtr(v *Vec3) domain.Vec3 {
	if v == nil {
		return domain.Vec3{}
	}
	return domain.Vec3{X: v.X, Y: v.Y, Z: v.Z}
}

func stringFromPtr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
