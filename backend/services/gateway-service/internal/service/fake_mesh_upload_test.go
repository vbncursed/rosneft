package service_test

import (
	"context"
	"io"
	"sync"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// fakeMesh implements service.Mesh. SubmitConversion records the args so
// tests can assert the gateway forwarded the right (kind, slug). LastJob
// is what the next call returns; tests fill it in SetupTest.
type fakeMesh struct {
	mu sync.Mutex

	NextJob   domain.Job
	ErrSubmit error
	ErrGet    error
	GetByID   map[string]domain.Job

	LastSubmitKind domain.Kind
	LastSubmitSlug string
}

func newFakeMesh() *fakeMesh {
	return &fakeMesh{GetByID: map[string]domain.Job{}}
}

func (m *fakeMesh) SubmitConversion(_ context.Context, kind domain.Kind, slug string) (domain.Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.LastSubmitKind = kind
	m.LastSubmitSlug = slug
	if m.ErrSubmit != nil {
		return domain.Job{}, m.ErrSubmit
	}
	return m.NextJob, nil
}

func (m *fakeMesh) GetJob(_ context.Context, id string) (domain.Job, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ErrGet != nil {
		return domain.Job{}, m.ErrGet
	}
	job, ok := m.GetByID[id]
	if !ok {
		return domain.Job{}, domain.ErrJobNotFound
	}
	return job, nil
}

// fakeUpload implements service.Upload. Methods record their arguments and
// return the values populated in the *Result fields so tests can assert
// gateway → upload-service forwarding without spinning up real I/O.
type fakeUpload struct {
	mu sync.Mutex

	InitiateResult domain.UploadSession
	StatusResult   domain.UploadSession
	WriteResult    int64
	FinalizeResult domain.FinalizedBlob
	ErrInitiate    error
	ErrFinalize    error

	LastInitiateSize        int64
	LastInitiateContentType string
	LastWriteID             string
	LastWriteOffset         int64
	LastFinalizeID          string
	LastAbortID             string
}

func (u *fakeUpload) Initiate(_ context.Context, size int64, contentType string) (domain.UploadSession, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.LastInitiateSize = size
	u.LastInitiateContentType = contentType
	if u.ErrInitiate != nil {
		return domain.UploadSession{}, u.ErrInitiate
	}
	return u.InitiateResult, nil
}

func (u *fakeUpload) WriteChunk(_ context.Context, id string, offset int64, _ io.Reader) (int64, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.LastWriteID = id
	u.LastWriteOffset = offset
	return u.WriteResult, nil
}

func (u *fakeUpload) GetStatus(_ context.Context, _ string) (domain.UploadSession, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.StatusResult, nil
}

func (u *fakeUpload) Finalize(_ context.Context, id string) (domain.FinalizedBlob, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.LastFinalizeID = id
	if u.ErrFinalize != nil {
		return domain.FinalizedBlob{}, u.ErrFinalize
	}
	return u.FinalizeResult, nil
}

func (u *fakeUpload) Abort(_ context.Context, id string) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.LastAbortID = id
	return nil
}
