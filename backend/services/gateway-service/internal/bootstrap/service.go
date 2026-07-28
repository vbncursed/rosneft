package bootstrap

import (
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/catalog"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/content"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/mesh"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/upload"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/service"
)

// InitService wires the catalog + content + mesh + upload + audit + auth clients
// into the gateway service.
//
// auth joins the list for one reason: the journal's actor and company columns are
// user ids, and only auth can turn them into logins. User administration still
// goes through authhttp, not through here.
func InitService(cat *catalog.Client, con *content.Client, m *mesh.Client, up *upload.Client, aud *audit.Client, aut *auth.Client) *service.Gateway {
	return service.New(cat, con, m, up, aud, aut)
}
