package bootstrap

import (
	"fmt"
	"io"

	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/audit"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/auth"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/catalog"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/content"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/mesh"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/passkey"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/twofa"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/clients/upload"
	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/config"
)

// gatewayClients is every gRPC client the gateway dials, closed together.
type gatewayClients struct {
	cat     *catalog.Client
	con     *content.Client
	mesh    *mesh.Client
	up      *upload.Client
	auth    *auth.Client
	twofa   *twofa.Client
	passkey *passkey.Client
	audit   *audit.Client

	opened []io.Closer
	err    error // first dial failure; later dials are skipped
}

// dialClients dials every backend in a fixed order and stops at the first
// failure, closing whatever was already open.
func dialClients(cfg config.Config) (*gatewayClients, error) {
	c := &gatewayClients{}
	c.cat = dial(c, cfg, "catalog", InitCatalog)
	c.con = dial(c, cfg, "content", InitContent)
	c.mesh = dial(c, cfg, "mesh", InitMesh)
	c.up = dial(c, cfg, "upload", InitUpload)
	c.auth = dial(c, cfg, "auth", InitAuth)
	c.twofa = dial(c, cfg, "twofa", InitTwoFA)
	c.passkey = dial(c, cfg, "passkey", InitPasskey)
	c.audit = dial(c, cfg, "audit", InitAudit)
	if c.err != nil {
		c.Close()
		return nil, c.err
	}
	return c, nil
}

// dial runs one Init* unless an earlier one failed, and records the client so
// Close reaches it.
func dial[T io.Closer](c *gatewayClients, cfg config.Config, name string, init func(config.Config) (T, error)) T {
	var zero T
	if c.err != nil {
		return zero
	}
	cl, err := init(cfg)
	if err != nil {
		c.err = fmt.Errorf("init %s: %w", name, err)
		return zero
	}
	c.opened = append(c.opened, cl)
	return cl
}

// Close closes every client that was opened.
func (c *gatewayClients) Close() {
	for _, cl := range c.opened {
		_ = cl.Close()
	}
}

// conns is the named probe set /readyz and the readiness gauge fan out over.
func (c *gatewayClients) conns() map[string]grpc.ClientConnInterface {
	return map[string]grpc.ClientConnInterface{
		"catalog": c.cat.Conn(),
		"content": c.con.Conn(),
		"auth":    c.auth.Conn(),
		"twofa":   c.twofa.Conn(),
		"passkey": c.passkey.Conn(),
		"mesh":    c.mesh.Conn(),
		"upload":  c.up.Conn(),
		"audit":   c.audit.Conn(),
	}
}
