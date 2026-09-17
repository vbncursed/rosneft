package service_test

import (
	"context"

	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/upload-service/internal/service/mocks"
)

// author owns the sessions these tests stub; stranger is anyone else.
const (
	author   = "user-1"
	stranger = "user-2"
)

// stubSession answers GetStatus for id with a session of the given owner.
func stubSession(ctx context.Context, store *mocks.SessionStoreMock, id, owner string, size, offset int64) {
	store.GetStatusMock.When(ctx, id).Then(domain.Session{
		ID: id, OwnerID: owner, Size: size, Offset: offset, ContentType: "application/zip",
	}, nil)
}
