package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListModels returns every model in the catalog.
func (c *Client) ListModels(ctx context.Context) ([]domain.Model, error) {
	resp, err := c.cc.ListModels(ctx, &catalogv1.ListModelsRequest{})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListModels: %w", err)
	}
	out := make([]domain.Model, len(resp.GetModels()))
	for i, m := range resp.GetModels() {
		out[i] = modelFromProto(m)
	}
	return out, nil
}

// GetModel fetches a model by slug.
func (c *Client) GetModel(ctx context.Context, slug string) (domain.Model, error) {
	resp, err := c.cc.GetModel(ctx, &catalogv1.GetModelRequest{Slug: slug})
	if err != nil {
		return domain.Model{}, fmt.Errorf("catalog.GetModel: %w", grpcerr.MapStatus(err, domain.ErrModelNotFound))
	}
	return modelFromProto(resp.GetModel()), nil
}

// UpsertModel creates or updates a model by slug.
func (c *Client) UpsertModel(ctx context.Context, m domain.Model) (domain.Model, error) {
	resp, err := c.cc.UpsertModel(ctx, &catalogv1.UpsertModelRequest{Model: modelToProto(m)})
	if err != nil {
		return domain.Model{}, fmt.Errorf("catalog.UpsertModel: %w", err)
	}
	return modelFromProto(resp.GetModel()), nil
}

// DeleteModel removes a model. Refuses to delete a model still referenced
// by placements (returns InvalidInput from upstream catalog).
func (c *Client) DeleteModel(ctx context.Context, slug string) error {
	_, err := c.cc.DeleteModel(ctx, &catalogv1.DeleteModelRequest{Slug: slug})
	if err != nil {
		return fmt.Errorf("catalog.DeleteModel: %w", grpcerr.MapStatus(err, domain.ErrModelNotFound))
	}
	return nil
}

// ListModelArtifacts returns every model artifact ordered by LOD.
func (c *Client) ListModelArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	resp, err := c.cc.ListModelArtifacts(ctx, &catalogv1.ListModelArtifactsRequest{ModelSlug: slug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListModelArtifacts: %w", grpcerr.MapStatus(err, domain.ErrModelNotFound))
	}
	out := make([]domain.Artifact, len(resp.GetArtifacts()))
	for i, a := range resp.GetArtifacts() {
		out[i] = modelArtifactFromProto(a)
	}
	return out, nil
}

// GetModelArtifact returns one model artifact at the given LOD.
func (c *Client) GetModelArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	resp, err := c.cc.GetModelArtifact(ctx, &catalogv1.GetModelArtifactRequest{ModelSlug: slug, Lod: lod})
	if err != nil {
		return domain.Artifact{}, fmt.Errorf("catalog.GetModelArtifact: %w", grpcerr.MapStatus(err, domain.ErrArtifactNotFound))
	}
	return modelArtifactFromProto(resp.GetArtifact()), nil
}
