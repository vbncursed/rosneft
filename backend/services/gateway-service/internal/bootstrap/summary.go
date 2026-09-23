package bootstrap

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	authv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/auth/v1"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/metrics"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/authhttp"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/httpapi"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/transport/summary"
)

// InitConsoleSummary builds GET /api/console/summary. Each card reads the
// source its console screen reads, with the caller's own token or scope, so a
// count never reaches past what that screen would show.
func InitConsoleSummary(svc *service.Gateway, authClient *auth.Client, prom *metrics.Client, logger *slog.Logger) http.Handler {
	return summary.Handler(consoleCounts(svc, authClient, prom), logger)
}

func consoleCounts(svc *service.Gateway, authClient *auth.Client, prom *metrics.Client) summary.Counts {
	return summary.Counts{
		"users": func(ctx context.Context) (any, error) {
			list, err := authClient.ListUsers(ctx, authhttp.Token(ctx), "", false)
			if err != nil {
				return nil, err
			}
			return countUsers(list), nil
		},
		"roles": func(ctx context.Context) (any, error) {
			roles, err := authClient.ListRoles(ctx, authhttp.Token(ctx))
			if err != nil {
				return nil, err
			}
			perms, err := authClient.ListPermissions(ctx)
			if err != nil {
				return nil, err
			}
			return summary.Roles{Roles: len(roles), Permissions: len(perms)}, nil
		},
		"content": func(ctx context.Context) (any, error) { return countContent(ctx, svc) },
		"access": func(ctx context.Context) (any, error) {
			scope, all := authhttp.Scope(ctx)
			bySlug, err := svc.ListTerritoryAdmins(ctx, scope, all)
			if err != nil {
				return nil, err
			}
			grants := 0
			for _, ids := range bySlug {
				grants += len(ids)
			}
			return grants, nil
		},
		"audit24h": func(ctx context.Context) (any, error) {
			sc, err := service.AuditScope(httpapi.AuditPrincipal(ctx))
			if err != nil {
				return nil, err
			}
			n, err := svc.CountAuditDay(ctx, sc, time.Now())
			return n, err
		},
		"alerts": func(ctx context.Context) (any, error) {
			series, err := prom.Query(ctx, "alerts", "1h")
			if err != nil {
				return nil, err
			}
			return metrics.FiringRules(series), nil
		},
	}
}

// countUsers counts what the Users card says: live accounts (ListUsers
// without includeDeleted already leaves the deleted out) and the frozen among
// them.
func countUsers(list []*authv1.User) summary.Users {
	frozen := 0
	for _, u := range list {
		if u.GetStatus() == "frozen" {
			frozen++
		}
	}
	return summary.Users{Total: len(list), Frozen: frozen}
}

// countContent counts what the Content screen lists: the caller's visible
// territories, fail-closed exactly as GET /api/territories, and every model.
func countContent(ctx context.Context, svc *service.Gateway) (summary.Content, error) {
	var c summary.Content
	if scope, all := authhttp.Scope(ctx); all || scope != "" {
		territories, err := svc.ListTerritories(ctx, scope)
		if err != nil {
			return summary.Content{}, err
		}
		c.Territories = len(territories)
	}
	models, err := svc.ListModels(ctx)
	if err != nil {
		return summary.Content{}, err
	}
	c.Models = len(models)
	return c, nil
}
