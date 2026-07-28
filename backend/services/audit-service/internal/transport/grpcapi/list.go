package grpcapi

import (
	"context"

	auditv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/audit/v1"
)

// ListEntries returns one page of the journal plus the cursor for the next.
func (s *Server) ListEntries(ctx context.Context, req *auditv1.ListEntriesRequest) (*auditv1.ListEntriesResponse, error) {
	entries, next, err := s.svc.List(ctx, filterFromProto(req))
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*auditv1.Entry, 0, len(entries))
	for _, e := range entries {
		out = append(out, entryToProto(e))
	}
	return &auditv1.ListEntriesResponse{Entries: out, NextCursor: next}, nil
}
