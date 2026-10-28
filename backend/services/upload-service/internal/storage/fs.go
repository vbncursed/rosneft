// Package storage is the on-disk session manager for upload-service. Each
// active upload owns one directory under the incoming root containing a
// .data file (the partial bytes) and a .json sidecar (the metadata). One
// method per file; this file holds the FS struct + constructor + helpers.
package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// FS is a filesystem-backed session store.
type FS struct {
	root string

	mu    sync.Mutex
	locks map[string]*sessionLock
}

type sessionLock struct {
	sync.Mutex
	refs int
}

// lock serialises everything that touches one session's files and returns the
// unlock func. Entries live only while someone holds or waits for them.
// shortcut: in-process only, upload-service runs as one replica per incoming root.
func (f *FS) lock(id string) func() {
	f.mu.Lock()
	l := f.locks[id]
	if l == nil {
		l = &sessionLock{}
		f.locks[id] = l
	}
	l.refs++
	f.mu.Unlock()

	l.Lock()
	return func() {
		l.Unlock()
		f.mu.Lock()
		if l.refs--; l.refs == 0 {
			delete(f.locks, id)
		}
		f.mu.Unlock()
	}
}

// NewFS ensures root exists and returns a session store anchored on it.
func NewFS(root string) (*FS, error) {
	if root == "" {
		return nil, errors.New("storage: empty root")
	}
	if err := os.MkdirAll(root, 0o750); err != nil {
		return nil, fmt.Errorf("storage.NewFS: %w", err)
	}
	return &FS{root: root, locks: map[string]*sessionLock{}}, nil
}

// validateID rejects empty or path-traversing session IDs. We mint our own
// IDs with crypto/rand hex so this is defence-in-depth, not the primary
// validation; user-supplied IDs would still pass through this gate.
func validateID(id string) error {
	if id == "" {
		return errors.New("storage: empty session id")
	}
	for _, c := range id {
		switch {
		case c >= '0' && c <= '9':
		case c >= 'a' && c <= 'f':
		case c >= 'A' && c <= 'F':
		case c == '-':
		default:
			return fmt.Errorf("storage: session id contains illegal character: %q", id)
		}
	}
	return nil
}

func (f *FS) sessionDir(id string) (string, error) {
	if err := validateID(id); err != nil {
		return "", err
	}
	return filepath.Join(f.root, id), nil
}

func (f *FS) paths(id string) (dir, data, meta string, err error) {
	d, err := f.sessionDir(id)
	if err != nil {
		return "", "", "", err
	}
	return d, filepath.Join(d, "data.bin"), filepath.Join(d, "meta.json"), nil
}
