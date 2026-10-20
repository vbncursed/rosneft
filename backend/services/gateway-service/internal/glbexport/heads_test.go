package glbexport

import (
	"bytes"
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/suite"
	"gotest.tools/v3/assert"
)

type HeadsSuite struct{ suite.Suite }

func TestHeadsSuite(t *testing.T) { suite.Run(t, new(HeadsSuite)) }

// trackedBody records its Close so a leaked body shows.
type trackedBody struct {
	io.Reader
	closed *int
	mu     *sync.Mutex
}

func (b trackedBody) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	*b.closed++
	return nil
}

func triangleGLB(t *testing.T) []byte {
	t.Helper()
	doc, bin := triangleDoc()
	return makeGLB(t, doc, bin)
}

func (s *HeadsSuite) TestReadsEachDistinctHashOnce() {
	glb := triangleGLB(s.T())
	var (
		mu      sync.Mutex
		offsets = map[string][]int64{}
		closed  int
	)
	open := func(_ context.Context, hash string, offset int64) (io.ReadCloser, error) {
		mu.Lock()
		defer mu.Unlock()
		offsets[hash] = append(offsets[hash], offset)
		return trackedBody{bytes.NewReader(glb), &closed, &mu}, nil
	}

	heads, err := ReadHeads(s.T().Context(), open, []string{"a", "b", "a"})

	assert.NilError(s.T(), err)
	assert.Equal(s.T(), len(heads), 2)
	assert.Equal(s.T(), len(heads["a"].Doc.Meshes), 1)
	assert.DeepEqual(s.T(), offsets, map[string][]int64{"a": {0}, "b": {0}})
	assert.Equal(s.T(), closed, 2)
}

func (s *HeadsSuite) TestAtMostFourInFlight() {
	glb := triangleGLB(s.T())
	synctest.Test(s.T(), func(t *testing.T) {
		var (
			mu          sync.Mutex
			inFlight    int
			maxInFlight int
		)
		open := func(context.Context, string, int64) (io.ReadCloser, error) {
			mu.Lock()
			inFlight++
			maxInFlight = max(maxInFlight, inFlight)
			mu.Unlock()
			time.Sleep(time.Second)
			mu.Lock()
			inFlight--
			mu.Unlock()
			return io.NopCloser(bytes.NewReader(glb)), nil
		}
		hashes := []string{"0", "1", "2", "3", "4", "5", "6", "7", "8", "9"}

		heads, err := ReadHeads(t.Context(), open, hashes)

		assert.NilError(t, err)
		assert.Equal(t, len(heads), 10)
		assert.Equal(t, maxInFlight, 4)
	})
}

func (s *HeadsSuite) TestFirstErrorCancelsTheRest() {
	boom := errors.New("boom")
	synctest.Test(s.T(), func(t *testing.T) {
		open := func(ctx context.Context, hash string, _ int64) (io.ReadCloser, error) {
			if hash == "bad" {
				return nil, boom
			}
			<-ctx.Done()
			return nil, ctx.Err()
		}

		heads, err := ReadHeads(t.Context(), open, []string{"bad", "x", "y", "z", "w"})

		assert.ErrorIs(t, err, boom)
		assert.ErrorContains(t, err, "bad")
		assert.Assert(t, heads == nil)
	})
}

func (s *HeadsSuite) TestMalformedBlob() {
	open := func(context.Context, string, int64) (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader([]byte("definitely not a glb at all"))), nil
	}

	_, err := ReadHeads(s.T().Context(), open, []string{"junk"})

	assert.ErrorIs(s.T(), err, ErrMalformed)
	assert.ErrorContains(s.T(), err, "junk")
}

func (s *HeadsSuite) TestCancelledContextIsAnError() {
	glb := triangleGLB(s.T())
	open := func(context.Context, string, int64) (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(glb)), nil // ignores ctx on purpose
	}
	ctx, cancel := context.WithCancel(s.T().Context())
	cancel()

	heads, err := ReadHeads(ctx, open, []string{"a", "b"})

	assert.ErrorIs(s.T(), err, context.Canceled)
	assert.Assert(s.T(), heads == nil)
}
