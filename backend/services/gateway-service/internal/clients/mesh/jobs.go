package mesh

import (
	"context"
	"fmt"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/grpcerr"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// SubmitConversion enqueues a conversion job for the given target.
func (c *Client) SubmitConversion(ctx context.Context, kind domain.Kind, slug string) (domain.Job, error) {
	resp, err := c.cc.SubmitConversion(ctx, &meshv1.SubmitConversionRequest{
		Kind: kindToProto(kind),
		Slug: slug,
	})
	if err != nil {
		return domain.Job{}, fmt.Errorf("mesh.SubmitConversion: %w", err)
	}
	return jobFromProto(resp.GetJob()), nil
}

// GetJob fetches a job by id.
func (c *Client) GetJob(ctx context.Context, id string) (domain.Job, error) {
	resp, err := c.cc.GetJob(ctx, &meshv1.GetJobRequest{Id: id})
	if err != nil {
		return domain.Job{}, fmt.Errorf("mesh.GetJob: %w", grpcerr.MapStatus(err, domain.ErrJobNotFound))
	}
	return jobFromProto(resp.GetJob()), nil
}
