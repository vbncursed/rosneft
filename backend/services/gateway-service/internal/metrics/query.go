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
	"1h":  3600,
	"6h":  21600,
	"24h": 86400,
	"7d":  604800,
}

const (
	scrapeSeconds = 15  // Prometheus scrape interval — no finer points exist.
	targetPoints  = 200 // ~200 points per range for query_range.
	queryTimeout  = 10 * time.Second
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
		http: &http.Client{},
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
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("read prometheus response: %w", err)
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
