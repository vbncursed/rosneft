// Package digest witnesses journal checkpoints outside the database.
//
// A digest chain that lives only in Postgres protects against nobody: whoever
// can drop the append-only trigger can recompute the chain to match whatever
// they rewrote. The value is in a copy kept somewhere else — here an append-only
// JSONL file on a volume separate from the database, so a backup of one is not
// a backup of the other.
package digest

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/vbncursed/rosneft/backend/services/audit-service/internal/domain"
)

// Writer appends one JSON line per checkpoint.
type Writer struct {
	mu sync.Mutex
	f  *os.File
}

// line is the on-disk shape. Field names match audit_checkpoint's columns so a
// reader never has to translate between the two.
type line struct {
	At         time.Time `json:"at"`
	FromID     int64     `json:"from_id"`
	ToID       int64     `json:"to_id"`
	RowCount   int32     `json:"row_count"`
	Digest     string    `json:"digest"`
	PrevDigest string    `json:"prev_digest"`
}

// Open prepares the witness file. An empty path returns (nil, nil): the witness
// is optional, and a nil Writer still answers Write and Close, so callers stay
// free of a branch per tick.
//
// The file is opened for append and never truncated — a restart that wiped it
// would erase precisely the history it exists to protect. It is not created
// with its parent directories: a mistyped path must fail loudly at boot rather
// than silently witness into a directory nobody backs up.
func Open(path string) (*Writer, error) {
	if path == "" {
		return nil, nil
	}
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("digest.Open %s: %w", path, err)
	}
	return &Writer{f: f}, nil
}

// Write appends one checkpoint and fsyncs it. One line every few minutes makes
// the sync free, and durability is the entire point of the file.
func (w *Writer) Write(c domain.Checkpoint) error {
	if w == nil {
		return nil
	}
	b, err := json.Marshal(line{
		At:         c.At.UTC(),
		FromID:     c.FromID,
		ToID:       c.ToID,
		RowCount:   c.RowCount,
		Digest:     c.Digest,
		PrevDigest: c.PrevDigest,
	})
	if err != nil {
		return fmt.Errorf("digest.Write: marshal: %w", err)
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	if _, err := w.f.Write(append(b, '\n')); err != nil {
		return fmt.Errorf("digest.Write: %w", err)
	}
	if err := w.f.Sync(); err != nil {
		return fmt.Errorf("digest.Write: sync: %w", err)
	}
	return nil
}

// Close releases the file. Safe on a nil Writer.
func (w *Writer) Close() error {
	if w == nil {
		return nil
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.f.Close()
}
