package mesh

import (
	"context"
	"fmt"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// SubmitConversion enqueues a conversion job and returns the resulting job state.
func (c *Client) SubmitConversion(ctx context.Context, slug string) (domain.Job, error) {
	resp, err := c.cc.SubmitConversion(ctx, &meshv1.SubmitConversionRequest{ProjectSlug: slug})
	if err != nil {
		return domain.Job{}, fmt.Errorf("mesh.SubmitConversion: %w", err)
	}
	return jobFromProto(resp.GetJob()), nil
}
