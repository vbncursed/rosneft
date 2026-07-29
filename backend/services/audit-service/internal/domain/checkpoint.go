package domain

import "time"

// Checkpoint is one sealed range of the journal: the digest of every audit_log
// row in (FromID, ToID], chained to the previous checkpoint through PrevDigest.
//
// Watermark is pg_sequence_last_value('audit_log_id_seq') as observed by the
// tick that wrote this checkpoint. The next tick uses it as its boundary — see
// storage.ComputeDigest for why max(id) cannot serve that role.
type Checkpoint struct {
	ID         int64
	At         time.Time
	FromID     int64
	ToID       int64
	Watermark  int64
	RowCount   int32
	Digest     string
	PrevDigest string
}
