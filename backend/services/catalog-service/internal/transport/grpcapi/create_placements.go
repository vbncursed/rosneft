package grpcapi

import (
	"context"
	"errors"

	"google.golang.org/grpc/status"

	catalogv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/catalog/v1"
	"github.com/vbncursed/rosneft/backend/services/catalog-service/internal/domain"
)

func (s *Server) CreatePlacements(ctx context.Context, req *catalogv1.CreatePlacementsRequest) (*catalogv1.CreatePlacementsResponse, error) {
	items := make([]domain.Placement, len(req.GetItems()))
	for i, it := range req.GetItems() {
		items[i] = placementFromCreateRequest(it)
	}
	out, err := s.svc.CreatePlacements(ctx, req.GetTerritorySlug(), items)
	if err != nil {
		return nil, itemStatus(err)
	}
	resp := &catalogv1.CreatePlacementsResponse{Placements: make([]*catalogv1.Placement, len(out))}
	for i, p := range out {
		resp.Placements[i] = placementToProto(p)
	}
	return resp, nil
}

// itemStatus answers a refused item with the code its sentinel maps to and a
// message of the index and that refusal alone ("item 2: model not found"): the
// gateway hands the message to the browser, so the layers' wrapping stays out.
func itemStatus(err error) error {
	item, ok := errors.AsType[domain.ItemError](err)
	if !ok {
		return mapError(err)
	}
	return status.Error(status.Code(mapError(item.Err)), item.Error())
}
