package digest

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

// ReadFile loads the witness into a checkpoint id → digest map.
//
// Keyed by the checkpoint's own id, never by to_id: a quiet interval seals an
// empty range, so from_id == to_id repeats across consecutive checkpoints while
// their digests keep advancing. Keying by to_id collapses them and makes verify
// report a disagreement on a journal nobody touched.
//
// Later lines win: a checkpoint written twice (a restart mid-tick) is not
// corruption, and the last word is the one the database ended up agreeing with.
func ReadFile(path string) (map[int64]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("digest.ReadFile %s: %w", path, err)
	}
	defer func() { _ = f.Close() }()

	out := make(map[int64]string)
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 4096), 1<<20)
	for n := 1; sc.Scan(); n++ {
		var l line
		if err := json.Unmarshal(sc.Bytes(), &l); err != nil {
			return nil, fmt.Errorf("digest.ReadFile %s: line %d: %w", path, n, err)
		}
		out[l.ID] = l.Digest
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("digest.ReadFile %s: %w", path, err)
	}
	return out, nil
}
