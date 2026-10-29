//go:build integration

package twofa_test

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gojuno/minimock/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
	"gotest.tools/v3/assert"

	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/domain"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/migrate"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/service/twofa/mocks"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/storage/recovery"
	"github.com/vbncursed/rosneft/backend/services/twofa-service/internal/totp"
)

// A recovery code is one-time: N concurrent Verify calls with the same code
// must produce exactly one success against a real Postgres.
func TestVerifyRecoveryCodeIsSingleUseUnderConcurrency(t *testing.T) {
	ctx := t.Context()
	// postgres:18.6 matches docker-compose.yml's pin.
	ctr, err := tcpostgres.Run(ctx, "postgres:18.6",
		tcpostgres.WithDatabase("andrey"),
		tcpostgres.WithUsername("andrey"),
		tcpostgres.WithPassword("andrey"),
		tcpostgres.BasicWaitStrategies(),
	)
	assert.NilError(t, err)
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(ctr) })
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	assert.NilError(t, err)
	assert.NilError(t, migrate.Up(ctx, dsn))
	pool, err := pgxpool.New(ctx, dsn)
	assert.NilError(t, err)
	t.Cleanup(pool.Close)

	rec := recovery.New(pool)
	plain, hashes, err := totp.GenerateRecovery(1)
	assert.NilError(t, err)
	assert.NilError(t, rec.Replace(ctx, "u1", hashes))

	secret, _, err := totp.Generate("Andrey", "ivan")
	assert.NilError(t, err)
	mc := minimock.NewController(t)
	st := mocks.NewStoreMock(mc).GetMock.Return(domain.Credential{UserID: "u1", Secret: []byte("ct"), Enabled: true}, nil)
	ciph := mocks.NewCipherMock(mc).DecryptMock.Return([]byte(secret), nil)
	lim := mocks.NewRateLimiterMock(mc)
	lim.TakeAttemptMock.Return(true, nil)
	lim.ClearMock.Return(nil)
	svc := twofa.New(st, rec, ciph, lim, "Andrey")

	const attempts = 16
	var wins atomic.Int32
	var wg sync.WaitGroup
	start := make(chan struct{})
	for range attempts {
		wg.Go(func() {
			<-start
			if ok, err := svc.Verify(ctx, "u1", plain[0]); err == nil && ok {
				wins.Add(1)
			}
		})
	}
	close(start)
	wg.Wait()

	assert.Equal(t, wins.Load(), int32(1), "one-time recovery code accepted more than once")
}
