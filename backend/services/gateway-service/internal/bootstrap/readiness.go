package bootstrap

import (
	"google.golang.org/grpc"

	"github.com/vbncursed/rosneft/backend/pkg/healthz"
)

// registerBackendProbes wires one GRPCProbe per named backend into hz, so
// /readyz fans out concurrently across every gRPC dependency the gateway
// talks to. Eight named probes, evaluated under one 2s deadline — the shape
// healthz was written for. MarkReady on its own reported ok with an empty
// checks map from the process's first millisecond.
func registerBackendProbes(hz *healthz.Handler, backends map[string]grpc.ClientConnInterface) {
	for name, conn := range backends {
		hz.Register(name, healthz.GRPCProbe(conn))
	}
}
