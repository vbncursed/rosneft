package content

import (
	"context"
	"fmt"

	contentv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/content/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// ListDocuments returns every document attached to the given territory.
func (c *Client) ListDocuments(ctx context.Context, territorySlug string) ([]domain.Document, error) {
	resp, err := c.cc.ListDocuments(ctx, &contentv1.ListDocumentsRequest{TerritorySlug: territorySlug})
	if err != nil {
		return nil, fmt.Errorf("content.ListDocuments: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	out := make([]domain.Document, len(resp.GetDocuments()))
	for i, d := range resp.GetDocuments() {
		out[i] = documentFromProto(d)
	}
	return out, nil
}

// CreateDocument attaches a new document to the territory.
func (c *Client) CreateDocument(ctx context.Context, d domain.Document) (domain.Document, error) {
	resp, err := c.cc.CreateDocument(ctx, &contentv1.CreateDocumentRequest{
		TerritorySlug:  d.TerritorySlug,
		Title:          d.Title,
		SourceBlobHash: d.SourceBlobHash,
	})
	if err != nil {
		return domain.Document{}, fmt.Errorf("content.CreateDocument: %w", grpcerr.MapStatus(err, domain.ErrTerritoryNotFound))
	}
	return documentFromProto(resp.GetDocument()), nil
}

// DeleteDocument removes a document by ID.
func (c *Client) DeleteDocument(ctx context.Context, id int64) error {
	_, err := c.cc.DeleteDocument(ctx, &contentv1.DeleteDocumentRequest{Id: id})
	if err != nil {
		return fmt.Errorf("content.DeleteDocument: %w", grpcerr.MapStatus(err, domain.ErrDocumentNotFound))
	}
	return nil
}
