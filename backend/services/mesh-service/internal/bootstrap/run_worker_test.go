package bootstrap

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/suite"
	"github.com/vbncursed/rosneft/backend/services/mesh-service/internal/config"
	"gotest.tools/v3/assert"
)

// fakeReconciler answers from a script, one entry per call, then 0 forever.
// onCall runs inside the call (a queued conversion "finishing" later).
type fakeReconciler struct {
	queued []int
	calls  atomic.Int32
	onCall func(call int)
}

func (f *fakeReconciler) ReconcileMissingArtifacts(context.Context) (int, error) {
	i := int(f.calls.Add(1))
	if f.onCall != nil {
		f.onCall(i)
	}
	if i > len(f.queued) {
		return 0, nil
	}
	return f.queued[i-1], nil
}

func runLoop(t *testing.T, rec reconciler, kick <-chan struct{}) (tick chan time.Time, stop func()) {
	tick = make(chan time.Time)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { reconcileLoop(ctx, rec, tick, kick); close(done) }()
	return tick, func() { cancel(); <-done }
}

// A signal runs one reconcile without waiting for a tick; and every pass that
// queues something is followed by the next only when that job reports back,
// so a backlog of N drains in N+1 passes (the last finds nothing) and stops.
func TestReconcileLoop_DrainsABacklogOnSignalsAndTerminates(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		kick := make(chan struct{}, 1)
		rec := &fakeReconciler{queued: []int{1, 1, 1}}
		// Each queued conversion finishes and signals, as the worker does.
		rec.onCall = func(call int) {
			if call <= 3 {
				select {
				case kick <- struct{}{}:
				default:
				}
			}
		}
		kick <- struct{}{} // the job that finished before the first pass
		_, stop := runLoop(t, rec, kick)

		synctest.Wait()
		assert.Equal(t, rec.calls.Load(), int32(4), "3 queued + 1 empty pass")

		time.Sleep(time.Hour) // nothing signals: no further passes, no loop
		synctest.Wait()
		assert.Equal(t, rec.calls.Load(), int32(4))
		stop()
	})
}

// With no signal (a failed job, or a live user job that made the pass queue
// nothing) only the tick runs a pass.
func TestReconcileLoop_TickStillRunsWithoutSignals(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		rec := &fakeReconciler{}
		tick, stop := runLoop(t, rec, make(chan struct{}, 1))

		synctest.Wait()
		assert.Equal(t, rec.calls.Load(), int32(0))
		tick <- time.Now()
		synctest.Wait()
		assert.Equal(t, rec.calls.Load(), int32(1))
		stop()
	})
}

// Signals that pile up while a pass runs collapse into one more pass.
func TestReconcileLoop_CoalescedSignalsRunOnePass(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		kick := make(chan struct{}, 1)
		for range 5 {
			select {
			case kick <- struct{}{}:
			default:
			}
		}
		rec := &fakeReconciler{}
		_, stop := runLoop(t, rec, kick)

		synctest.Wait()
		assert.Equal(t, rec.calls.Load(), int32(1))
		stop()
	})
}

type CompressorSuite struct{ suite.Suite }

func TestCompressorSuite(t *testing.T) { suite.Run(t, new(CompressorSuite)) }

func (s *CompressorSuite) TestDisabledAndMissingBinary() {
	missing := filepath.Join(s.T().TempDir(), "missing")
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	compressor, err := InitCompressor(s.T().Context(), config.Config{GltfpackBin: missing}, logger)
	assert.NilError(s.T(), err)
	assert.Assert(s.T(), compressor == nil)

	for _, cfg := range []config.Config{
		{GltfpackBin: missing, MeshoptEnabled: true},
		{GltfpackBin: missing, KTX2Enabled: true},
	} {
		compressor, err = InitCompressor(s.T().Context(), cfg, logger)
		assert.Assert(s.T(), compressor == nil)
		assert.ErrorContains(s.T(), err, "gltfpack not found")
	}
}

func (s *CompressorSuite) TestConfiguredOptions() {
	for _, tc := range []struct {
		name          string
		meshopt, ktx2 bool
		want          []string
	}{
		{"meshopt", true, false, []string{"-cc"}},
		{"ktx2", false, true, []string{"-tc", "-tj", "1", "-tl", "2048"}},
		{"both", true, true, []string{"-cc", "-tc", "-tj", "1", "-tl", "2048"}},
	} {
		s.Run(tc.name, func() {
			dir := s.T().TempDir()
			bin, record := filepath.Join(dir, "gltfpack"), filepath.Join(dir, "argv")
			script := "#!/bin/sh\nif [ \"$1\" = -h ]; then exit 0; fi\nprintf '%s\\n' \"$@\" > '" + record + "'\ncp \"$2\" \"$4\"\n"
			assert.NilError(s.T(), os.WriteFile(bin, []byte(script), 0o700))
			cfg := config.Config{
				GltfpackBin:    bin,
				MeshoptEnabled: tc.meshopt,
				KTX2Enabled:    tc.ktx2,
				TextureMaxSize: 2048,
			}
			logger := slog.New(slog.NewTextHandler(io.Discard, nil))
			compressor, err := InitCompressor(s.T().Context(), cfg, logger)
			assert.NilError(s.T(), err)
			assert.Assert(s.T(), compressor != nil)
			_, err = compressor.Compress(s.T().Context(), []byte("input"))
			assert.NilError(s.T(), err)
			raw, err := os.ReadFile(record)
			assert.NilError(s.T(), err)
			args := strings.Split(strings.TrimSpace(string(raw)), "\n")
			assert.DeepEqual(s.T(), args[8:], tc.want)
		})
	}
}
