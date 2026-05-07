package service_test

import (
	"context"
	"io"
	"sync"

	"github.com/vbncursed/rosneft/backend/pkg/blobstore"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
)

// fakeStore is an in-memory SessionStore used by every suite in this package.
// It tracks each session's offset and size and rejects writes that overflow
// the declared total (matching the real on-disk store's semantics).
type fakeStore struct {
	mu       sync.Mutex
	sessions map[string]*domain.Session

	// FinalizeHash is what Finalize returns when called on a complete
	// session; it lets tests assert the gateway gets the hash unchanged.
	FinalizeHash string

	// ErrInitiate / ErrFinalize / ErrAppend let tests inject failures
	// without the noise of a custom store per test case.
	ErrInitiate error
	ErrFinalize error
	ErrAppend   error
}

func newFakeStore() *fakeStore {
	return &fakeStore{sessions: map[string]*domain.Session{}}
}

func (s *fakeStore) Initiate(_ context.Context, id string, size int64, contentType string) (domain.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ErrInitiate != nil {
		return domain.Session{}, s.ErrInitiate
	}
	sess := &domain.Session{ID: id, Size: size, ContentType: contentType}
	s.sessions[id] = sess
	return *sess, nil
}

func (s *fakeStore) AppendChunk(_ context.Context, id string, offset int64, data []byte) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ErrAppend != nil {
		return 0, s.ErrAppend
	}
	sess, ok := s.sessions[id]
	if !ok {
		return 0, domain.ErrSessionNotFound
	}
	if offset != sess.Offset {
		return 0, domain.ErrOffsetMismatch
	}
	if sess.Offset+int64(len(data)) > sess.Size {
		return 0, domain.ErrSizeExceeded
	}
	sess.Offset += int64(len(data))
	return sess.Offset, nil
}

func (s *fakeStore) GetStatus(_ context.Context, id string) (domain.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return domain.Session{}, domain.ErrSessionNotFound
	}
	return *sess, nil
}

func (s *fakeStore) Finalize(ctx context.Context, id string, putBlob func(ctx context.Context, hash string, r io.Reader) error) (string, int64, error) {
	s.mu.Lock()
	sess, ok := s.sessions[id]
	if !ok {
		s.mu.Unlock()
		return "", 0, domain.ErrSessionNotFound
	}
	size := sess.Size
	hash := s.FinalizeHash
	if hash == "" {
		hash = "deadbeef"
	}
	s.mu.Unlock()

	if s.ErrFinalize != nil {
		return "", 0, s.ErrFinalize
	}
	if err := putBlob(ctx, hash, &nopReader{}); err != nil {
		return "", 0, err
	}

	s.mu.Lock()
	delete(s.sessions, id)
	s.mu.Unlock()
	return hash, size, nil
}

func (s *fakeStore) Abort(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, id)
	return nil
}

// fakeBlobs records the last Put call so tests can verify the service
// forwarded the hash and content type. ErrPut returns the configured error
// so tests can simulate BlobStore failure during Finalize.
type fakeBlobs struct {
	mu              sync.Mutex
	LastHash        string
	LastContentType string
	ErrPut          error
}

func (b *fakeBlobs) Put(_ context.Context, hash, contentType string, _ io.Reader) (blobstore.Blob, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.ErrPut != nil {
		return blobstore.Blob{}, b.ErrPut
	}
	b.LastHash = hash
	b.LastContentType = contentType
	return blobstore.Blob{Hash: hash, ContentType: contentType}, nil
}

// nopReader satisfies io.Reader without ever producing bytes — Finalize's
// putBlob callback only needs the reader as an opaque value.
type nopReader struct{}

func (*nopReader) Read(_ []byte) (int, error) { return 0, io.EOF }

