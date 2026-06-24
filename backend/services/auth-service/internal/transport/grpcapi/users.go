package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) CreateUser(ctx context.Context, req *authv1.CreateUserRequest) (*authv1.User, error) {
	actorID, _, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Create(ctx, actorID, req.GetEmail(), req.GetUsername(), req.GetPassword(), req.GetRoleSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ListUsers(ctx context.Context, req *authv1.ListUsersRequest) (*authv1.ListUsersResponse, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	list, err := s.users.List(ctx, actorID, scopeAll, req.GetStatus(), req.GetIncludeDeleted())
	if err != nil {
		return nil, mapError(err)
	}
	out := make([]*authv1.User, 0, len(list))
	for _, u := range list {
		out = append(out, userToProto(u))
	}
	return &authv1.ListUsersResponse{Users: out}, nil
}

func (s *Server) GetUser(ctx context.Context, req *authv1.GetUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Get(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UpdateUser(ctx context.Context, req *authv1.UpdateUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Update(ctx, actorID, scopeAll, req.GetId(), req.GetRoleSlugs(), req.GetEmail(), req.GetUsername())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) FreezeUser(ctx context.Context, req *authv1.FreezeUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Freeze(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UnfreezeUser(ctx context.Context, req *authv1.UnfreezeUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Unfreeze(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) SoftDeleteUser(ctx context.Context, req *authv1.SoftDeleteUserRequest) (*authv1.SoftDeleteUserResponse, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.SoftDelete(ctx, actorID, scopeAll, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.SoftDeleteUserResponse{}, nil
}

func (s *Server) RestoreUser(ctx context.Context, req *authv1.RestoreUserRequest) (*authv1.User, error) {
	actorID, scopeAll, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Restore(ctx, actorID, scopeAll, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) SetUserOwner(ctx context.Context, req *authv1.SetUserOwnerRequest) (*authv1.User, error) {
	actorID, _, err := s.actor(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.SetOwner(ctx, actorID, req.GetId(), req.GetIsOwner())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}
