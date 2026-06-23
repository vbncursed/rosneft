package grpcapi

import (
	"context"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
)

func (s *Server) CreateUser(ctx context.Context, req *authv1.CreateUserRequest) (*authv1.User, error) {
	u, err := s.users.Create(ctx, req.GetEmail(), req.GetUsername(), req.GetPassword(), req.GetRoleSlugs())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) ListUsers(ctx context.Context, req *authv1.ListUsersRequest) (*authv1.ListUsersResponse, error) {
	list, err := s.users.List(ctx, req.GetStatus(), req.GetIncludeDeleted())
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
	u, err := s.users.Get(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UpdateUser(ctx context.Context, req *authv1.UpdateUserRequest) (*authv1.User, error) {
	u, err := s.users.Update(ctx, req.GetId(), req.GetRoleSlugs(), req.GetEmail(), req.GetUsername())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) FreezeUser(ctx context.Context, req *authv1.FreezeUserRequest) (*authv1.User, error) {
	actorID, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	u, err := s.users.Freeze(ctx, actorID, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) UnfreezeUser(ctx context.Context, req *authv1.UnfreezeUserRequest) (*authv1.User, error) {
	u, err := s.users.Unfreeze(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}

func (s *Server) SoftDeleteUser(ctx context.Context, req *authv1.SoftDeleteUserRequest) (*authv1.SoftDeleteUserResponse, error) {
	actorID, err := s.userIDFromToken(ctx, req.GetToken())
	if err != nil {
		return nil, mapError(err)
	}
	if err := s.users.SoftDelete(ctx, actorID, req.GetId()); err != nil {
		return nil, mapError(err)
	}
	return &authv1.SoftDeleteUserResponse{}, nil
}

func (s *Server) RestoreUser(ctx context.Context, req *authv1.RestoreUserRequest) (*authv1.User, error) {
	u, err := s.users.Restore(ctx, req.GetId())
	if err != nil {
		return nil, mapError(err)
	}
	return userToProto(u), nil
}
