package catalog

import (
	"context"
	"fmt"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListTerritories returns territories visible to scopeAdminID (empty = all).
func (c *Client) ListTerritories(ctx context.Context, scopeAdminID string) ([]domain.Territory, error) {
	resp, err := c.cc.ListTerritories(ctx, &catalogv1.ListTerritoriesRequest{ScopeAdminId: scopeAdminID})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTerritories: %w", err)
	}
	out := make([]domain.Territory, len(resp.GetTerritories()))
	for i, t := range resp.GetTerritories() {
		out[i] = territoryFromProto(t)
	}
	return out, nil
}

// GetTerritory fetches a territory by slug, scoped to scopeAdminID when non-empty
// (unassigned territory reads as not found).
func (c *Client) GetTerritory(ctx context.Context, slug, scopeAdminID string) (domain.Territory, error) {
	resp, err := c.cc.GetTerritory(ctx, &catalogv1.GetTerritoryRequest{Slug: slug, ScopeAdminId: scopeAdminID})
	if err != nil {
		return domain.Territory{}, fmt.Errorf("catalog.GetTerritory: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return territoryFromProto(resp.GetTerritory()), nil
}

// UpsertTerritory creates or updates a territory by slug.
func (c *Client) UpsertTerritory(ctx context.Context, t domain.Territory) (domain.Territory, error) {
	resp, err := c.cc.UpsertTerritory(ctx, &catalogv1.UpsertTerritoryRequest{Territory: territoryToProto(t)})
	if err != nil {
		return domain.Territory{}, fmt.Errorf("catalog.UpsertTerritory: %w", err)
	}
	return territoryFromProto(resp.GetTerritory()), nil
}

// DeleteTerritory removes a territory and cascade-deletes its artifacts +
// placements.
func (c *Client) DeleteTerritory(ctx context.Context, slug string) error {
	_, err := c.cc.DeleteTerritory(ctx, &catalogv1.DeleteTerritoryRequest{Slug: slug})
	if err != nil {
		return fmt.Errorf("catalog.DeleteTerritory: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}

// DeleteTerritoryArtifacts clears every LOD artifact of a territory, resetting
// it to pending before a source-replacement re-conversion.
func (c *Client) DeleteTerritoryArtifacts(ctx context.Context, slug string) error {
	_, err := c.cc.DeleteTerritoryArtifacts(ctx, &catalogv1.DeleteTerritoryArtifactsRequest{TerritorySlug: slug})
	if err != nil {
		return fmt.Errorf("catalog.DeleteTerritoryArtifacts: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}

// SetTerritoryRescaleBaseline records the territory's current source-mesh
// max-dimension before a source replacement clears its artifacts, so the
// post-conversion rescale keeps placements 1:1 against the new normalization.
func (c *Client) SetTerritoryRescaleBaseline(ctx context.Context, slug string, sourceMax float64) error {
	_, err := c.cc.SetTerritoryRescaleBaseline(ctx, &catalogv1.SetTerritoryRescaleBaselineRequest{
		TerritorySlug: slug,
		SourceMax:     sourceMax,
	})
	if err != nil {
		return fmt.Errorf("catalog.SetTerritoryRescaleBaseline: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return nil
}

// ListTerritoryArtifacts returns every territory artifact ordered by LOD.
func (c *Client) ListTerritoryArtifacts(ctx context.Context, slug string) ([]domain.Artifact, error) {
	resp, err := c.cc.ListTerritoryArtifacts(ctx, &catalogv1.ListTerritoryArtifactsRequest{TerritorySlug: slug})
	if err != nil {
		return nil, fmt.Errorf("catalog.ListTerritoryArtifacts: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Artifact, len(resp.GetArtifacts()))
	for i, a := range resp.GetArtifacts() {
		out[i] = territoryArtifactFromProto(a)
	}
	return out, nil
}

// GetTerritoryArtifact returns one territory artifact at the given LOD.
func (c *Client) GetTerritoryArtifact(ctx context.Context, slug string, lod uint32) (domain.Artifact, error) {
	resp, err := c.cc.GetTerritoryArtifact(ctx, &catalogv1.GetTerritoryArtifactRequest{TerritorySlug: slug, Lod: lod})
	if err != nil {
		return domain.Artifact{}, fmt.Errorf("catalog.GetTerritoryArtifact: %w", grpcerr.MapStatus(err, domain.ErrArtifactNotFound))
	}
	return territoryArtifactFromProto(resp.GetArtifact()), nil
}
