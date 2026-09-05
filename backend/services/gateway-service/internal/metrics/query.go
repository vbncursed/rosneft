package metrics

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// rangeSeconds is the allow-list of dashboard ranges → window in seconds.
// Anything else is rejected before a Prometheus query is built.
var rangeSeconds = map[string]int{
	"15m": 900,
	"1h":  3600,
	"6h":  21600,
	"24h": 86400,
	"7d":  604800,
}

const (
	scrapeSeconds = 15  // Prometheus scrape interval — no finer points exist.
	targetPoints  = 200 // ~200 points per range for query_range.
	queryTimeout  = 10 * time.Second
	// A ~200-point range over a handful of series is tens of KB; 8 MB leaves
	// generous headroom while keeping a misconfigured or hostile PROMETHEUS_URL
	// from ballooning gateway memory through an unbounded read.
	maxResponseBytes = 8 << 20
)

// stepSeconds keeps ~targetPoints points per range, rounded to whole scrapes.
func stepSeconds(windowSeconds int) int {
	return max(scrapeSeconds, int(math.Round(float64(windowSeconds)/targetPoints/scrapeSeconds))*scrapeSeconds)
}

// Client queries Prometheus for a resolved panel. It holds one reusable
// http.Client; per-query deadlines come from the request context.
type Client struct {
	base string
	http *http.Client
}

// NewClient builds a Prometheus client against base (e.g. http://prometheus:9090).
func NewClient(base string) *Client {
	return &Client{
		base: strings.TrimRight(base, "/"),
		// The per-query context already bounds each call; the client timeout is
		// the backstop for a base URL that connects but never answers.
		http: &http.Client{Timeout: queryTimeout},
	}
}

// Query resolves panelID to PromQL, runs it against Prometheus for the given
// range, and maps the result to domain series. panelID and rng are validated
// against the server-side registry / allow-list, so the caller-supplied values
// never reach Prometheus as free-form input (no SSRF / query injection).
func (c *Client) Query(ctx context.Context, panelID, rng string) ([]Series, error) {
	p, ok := lookup(panelID)
	if !ok {
		return nil, ErrUnknownPanel
	}
	window, ok := rangeSeconds[rng]
	if !ok {
		return nil, ErrBadRange
	}

	endpoint, err := c.buildURL(p, window)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build prometheus request: %w", err)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("query prometheus: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	// Read one byte past the cap so a truncated response fails loudly instead
	// of reaching the JSON parser as a valid-looking prefix.
	body, err := io.ReadAll(io.LimitReader(res.Body, maxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read prometheus response: %w", err)
	}
	if len(body) > maxResponseBytes {
		return nil, fmt.Errorf("prometheus response exceeds %d bytes", maxResponseBytes)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus status %d", res.StatusCode)
	}
	return parseProm(body)
}

// buildURL assembles the /api/v1/query (instant) or /api/v1/query_range URL.
func (c *Client) buildURL(p panel, window int) (string, error) {
	u, err := url.Parse(c.base)
	if err != nil {
		return "", fmt.Errorf("parse prometheus base url: %w", err)
	}
	now := time.Now().Unix()
	q := url.Values{}
	q.Set("query", p.expr)
	if p.instant {
		u.Path = "/api/v1/query"
		q.Set("time", strconv.FormatInt(now, 10))
	} else {
		u.Path = "/api/v1/query_range"
		q.Set("start", strconv.FormatInt(now-int64(window), 10))
		q.Set("end", strconv.FormatInt(now, 10))
		q.Set("step", strconv.Itoa(stepSeconds(window)))
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}
