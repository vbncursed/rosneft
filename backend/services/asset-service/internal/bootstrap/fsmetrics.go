package bootstrap

import (
	"log/slog"
	"sync"
	"syscall"

	"github.com/prometheus/client_golang/prometheus"
)

// fsCollector reports the free and total space of the filesystem holding the
// blob directory, read with statfs at scrape time. The blob volume lives on
// the host's root filesystem, so on prod these two numbers describe the whole
// disk (images, logs and Postgres included): they feed the DiskSpace* alerts
// in ops/prometheus/rules.yml. There is no node_exporter by decision.
//
// On a statfs error it emits nothing: an absent series is what DiskMetricMissing
// watches for, whereas a zero would read as "disk full" and page for the wrong reason.
type fsCollector struct {
	dir    string
	statfs func(dir string, st *syscall.Statfs_t) error
	logger *slog.Logger
	warn   sync.Once

	free *prometheus.Desc
	size *prometheus.Desc
}

func newFSCollector(dir string, logger *slog.Logger, statfs func(string, *syscall.Statfs_t) error) *fsCollector {
	return &fsCollector{
		dir:    dir,
		statfs: statfs,
		logger: logger,
		free: prometheus.NewDesc("blobstore_fs_free_bytes",
			"Bytes a non-root writer can still use on the filesystem holding the blob directory.", nil, nil),
		size: prometheus.NewDesc("blobstore_fs_size_bytes",
			"Total size in bytes of the filesystem holding the blob directory.", nil, nil),
	}
}

func (c *fsCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.free
	ch <- c.size
}

func (c *fsCollector) Collect(ch chan<- prometheus.Metric) {
	var st syscall.Statfs_t
	if err := c.statfs(c.dir, &st); err != nil {
		// Once per process: the scrape runs every 15s, and the alert, not the log, is the signal.
		c.warn.Do(func() { c.logger.Warn("blobstore fs metrics: statfs failed", "dir", c.dir, "err", err) })
		return
	}
	// Bsize is int64 on linux and uint32 on darwin; both are positive here.
	bsize := float64(st.Bsize)
	ch <- prometheus.MustNewConstMetric(c.free, prometheus.GaugeValue, float64(st.Bavail)*bsize)
	ch <- prometheus.MustNewConstMetric(c.size, prometheus.GaugeValue, float64(st.Blocks)*bsize)
}

// registerFSMetrics wires the collector into the registry served on :9101.
func registerFSMetrics(reg prometheus.Registerer, dir string, logger *slog.Logger) {
	reg.MustRegister(newFSCollector(dir, logger, syscall.Statfs))
}
