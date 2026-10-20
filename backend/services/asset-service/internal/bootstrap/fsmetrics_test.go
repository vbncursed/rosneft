package bootstrap

import (
	"errors"
	"io"
	"log/slog"
	"strings"
	"syscall"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func quietLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestFSCollector_Collect_PublishesFreeAndSize(t *testing.T) {
	var gotDir string
	c := newFSCollector("/var/blob", quietLogger(), func(dir string, st *syscall.Statfs_t) error {
		gotDir = dir
		st.Bsize = 4096
		st.Blocks = 1000
		st.Bavail = 250 // below Bfree on purpose: Bavail is what a non-root writer gets
		st.Bfree = 400
		return nil
	})

	want := `
# HELP blobstore_fs_free_bytes Bytes a non-root writer can still use on the filesystem holding the blob directory.
# TYPE blobstore_fs_free_bytes gauge
blobstore_fs_free_bytes 1.024e+06
# HELP blobstore_fs_size_bytes Total size in bytes of the filesystem holding the blob directory.
# TYPE blobstore_fs_size_bytes gauge
blobstore_fs_size_bytes 4.096e+06
`
	require.NoError(t, testutil.CollectAndCompare(c, strings.NewReader(want)))
	assert.Equal(t, "/var/blob", gotDir)
}

func TestFSCollector_Collect_StatfsErrorEmitsNothing(t *testing.T) {
	c := newFSCollector("/var/blob", quietLogger(), func(string, *syscall.Statfs_t) error {
		return errors.New("boom")
	})

	// Absent series, not a zero: DiskMetricMissing must be able to see it.
	assert.Equal(t, 0, testutil.CollectAndCount(c))
	assert.NotPanics(t, func() { testutil.CollectAndCount(c) })
}
