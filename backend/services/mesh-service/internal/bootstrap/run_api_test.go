package bootstrap

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"gotest.tools/v3/assert"

	meshv1 "github.com/vbncursed/rosneft/backend/proto/gen/go/rosneft/mesh/v1"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
)

// fakeRedis answers just enough RESP2 for InitRedis (PING) and InitStorage
// (XGROUP CREATE ... MKSTREAM): HELLO is refused so go-redis falls back to
// RESP2, PING is PONG, anything else is OK.
func fakeRedis(t *testing.T) string {
	t.Helper()
	lis, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	t.Cleanup(func() { _ = lis.Close() })
	go func() {
		for {
			conn, err := lis.Accept()
			if err != nil {
				return
			}
			go serveFakeRedis(conn)
		}
	}()
	return lis.Addr().String()
}

func serveFakeRedis(conn net.Conn) {
	defer func() { _ = conn.Close() }()
	rd := bufio.NewReader(conn)
	for {
		head, err := rd.ReadString('\n')
		if err != nil || !strings.HasPrefix(head, "*") {
			return
		}
		n, _ := strconv.Atoi(strings.TrimSpace(head[1:]))
		args := make([]string, 0, n)
		for range n {
			if _, err := rd.ReadString('\n'); err != nil { // $len
				return
			}
			arg, err := rd.ReadString('\n')
			if err != nil {
				return
			}
			args = append(args, strings.TrimSpace(arg))
		}
		reply := "+OK\r\n"
		switch strings.ToUpper(args[0]) {
		case "HELLO":
			reply = "-ERR unknown command 'hello'\r\n"
		case "PING":
			reply = "+PONG\r\n"
		}
		if _, err := conn.Write([]byte(reply)); err != nil {
			return
		}
	}
}

func freeAddr(t *testing.T) string {
	t.Helper()
	lis, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	addr := lis.Addr().String()
	assert.NilError(t, lis.Close())
	return addr
}

func apiConfig(t *testing.T, redisAddr string) config.Config {
	t.Helper()
	return config.Config{
		GRPCAddr:        freeAddr(t),
		MetricsAddr:     freeAddr(t),
		RedisAddr:       redisAddr,
		LogLevel:        "error",
		LogFormat:       "json",
		ShutdownTimeout: 5 * time.Second,
	}
}

func healthStatus(ctx context.Context, addr, service string) (healthpb.HealthCheckResponse_ServingStatus, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return 0, err
	}
	defer func() { _ = conn.Close() }()
	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{Service: service})
	if err != nil {
		return 0, err
	}
	return resp.GetStatus(), nil
}

// RunAPI serves the mesh gRPC service with a SERVING health status, and a
// cancelled context is a clean shutdown (nil) that releases the port.
func TestRunAPIServesAndShutsDownCleanly(t *testing.T) {
	cfg := apiConfig(t, fakeRedis(t))
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- RunAPI(ctx, cfg) }()

	name := meshv1.MeshService_ServiceDesc.ServiceName
	assert.Assert(t, func() bool {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if st, err := healthStatus(t.Context(), cfg.GRPCAddr, name); err == nil &&
				st == healthpb.HealthCheckResponse_SERVING {
				return true
			}
			time.Sleep(20 * time.Millisecond)
		}
		return false
	}(), "mesh service never reported SERVING")

	cancel()
	select {
	case err := <-done:
		assert.NilError(t, err)
	case <-time.After(10 * time.Second):
		t.Fatal("RunAPI did not return after cancel")
	}
	_, err := healthStatus(t.Context(), cfg.GRPCAddr, name)
	assert.Assert(t, err != nil, "port must be released after shutdown")
}

func TestRunAPIRedisUnreachable(t *testing.T) {
	cfg := apiConfig(t, freeAddr(t))

	err := RunAPI(t.Context(), cfg)

	assert.ErrorContains(t, err, "bootstrap: redis ping")
}

func TestRunAPIListenFailure(t *testing.T) {
	cfg := apiConfig(t, fakeRedis(t))
	busy, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	assert.NilError(t, err)
	defer func() { _ = busy.Close() }()
	cfg.GRPCAddr = busy.Addr().String()

	err = RunAPI(t.Context(), cfg)

	assert.ErrorContains(t, err, fmt.Sprintf("listen %s:", cfg.GRPCAddr))
}
