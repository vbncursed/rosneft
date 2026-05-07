package mesh

import (
	"context"
	"fmt"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// GetJob fetches a job by ID or domain.ErrJobNotFound.
func (c *Client) GetJob(ctx context.Context, id string) (domain.Job, error) {
	resp, err := c.cc.GetJob(ctx, &meshv1.GetJobRequest{Id: id})
	if err != nil {
		return domain.Job{}, fmt.Errorf("mesh.GetJob: %w", mapStatusErr(err, domain.ErrJobNotFound))
	}
	return jobFromProto(resp.GetJob()), nil
}
