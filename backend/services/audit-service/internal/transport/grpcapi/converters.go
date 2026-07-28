package grpcapi

import (
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

func entryToProto(e domain.Entry) *auditv1.Entry {
	return &auditv1.Entry{
		Id:          e.ID,
		At:          timestamppb.New(e.At),
		ActorId:     e.ActorID,
		CompanyId:   e.CompanyID,
		Action:      e.Action,
		Entity:      e.Entity,
		EntityId:    e.EntityID,
		EntityLabel: e.EntityLabel,
		OldRow:      e.OldRow,
		NewRow:      e.NewRow,
		RequestId:   e.RequestID,
		Result:      e.Result,
	}
}

// asTime maps an absent timestamp onto the zero time, which storage.List reads
// as "no bound on this side". Without the nil check a missing filter would
// become 1970 and silently start excluding rows.
func asTime(ts *timestamppb.Timestamp) time.Time {
	if ts == nil {
		return time.Time{}
	}
	return ts.AsTime()
}

func filterFromProto(req *auditv1.ListEntriesRequest) domain.Filter {
	return domain.Filter{
		AllCompanies: req.GetAllCompanies(),
		CompanyID:    req.GetCompanyId(),
		ActorID:      req.GetActorId(),
		Action:       req.GetAction(),
		Entity:       req.GetEntity(),
		From:         asTime(req.GetFrom()),
		To:           asTime(req.GetTo()),
		Cursor:       req.GetCursor(),
		Limit:        req.GetLimit(),
	}
}
