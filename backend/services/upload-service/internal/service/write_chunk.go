package service

import (
	"context"
)

// WriteChunk appends data to owner's session at the given offset and returns
// the new total. Out-of-order writes and writes beyond the declared size are
// rejected by the underlying store.
//
// ponytail: the ownership check re-reads the session's small JSON sidecar per
// streamed message (~64 KB); AppendChunk reads it again. Pass the owner into
// AppendChunk if that double read ever shows up next to the write itself.
func (u *Upload) WriteChunk(ctx context.Context, owner, id string, offset int64, data []byte) (int64, error) {
	if _, err := u.ownedSession(ctx, owner, id); err != nil {
		return 0, err
	}
	return u.store.AppendChunk(ctx, id, offset, data)
}
