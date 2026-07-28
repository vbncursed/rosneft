package metrics

import (
	"cmp"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
)

// Point is one sample: t is the Unix timestamp (seconds), v the value. The JSON
// shape matches the frontend's domain Series exactly.
type Point struct {
	T float64 `json:"t"`
	V float64 `json:"v"`
}

// Series is one time series: a label plus points. labels carries the raw
// Prometheus metric labels — the alerts card needs them to tell firing from
// pending; charts ignore them.
type Series struct {
	Label  string            `json:"label"`
	Points []Point           `json:"points"`
	Labels map[string]string `json:"labels,omitzero"`
}

// promResponse is the Prometheus query API envelope — an internal detail.
type promResponse struct {
	Status string `json:"status"`
	Error  string `json:"error"`
	Data   struct {
		Result []promResult `json:"result"`
	} `json:"data"`
}

type promResult struct {
	Metric map[string]string `json:"metric"`
	Values [][2]any          `json:"values"` // range query
	Value  [2]any            `json:"value"`  // instant query
}

// labelKeys is the priority order for naming a series. alertname comes first:
// the ALERTS series also carries service, and naming it by service would lose
// which alert it is. No other metric has alertname, so the order is harmless.
var labelKeys = []string{"alertname", "service", "grpc_service", "status", "code", "method"}

// parseProm turns a Prometheus response body into domain series. It fails on a
// non-success status; NaN/±Inf samples (histogram_quantile with no traffic) are
// dropped rather than emitted.
func parseProm(body []byte) ([]Series, error) {
	var r promResponse
	if err := json.Unmarshal(body, &r); err != nil {
		return nil, fmt.Errorf("decode prometheus response: %w", err)
	}
	if r.Status != "success" {
		return nil, fmt.Errorf("prometheus query failed: %s", cmp.Or(r.Error, "unknown error"))
	}

	out := []Series{}
	for _, res := range r.Data.Result {
		samples := res.Values
		if len(samples) == 0 {
			samples = [][2]any{res.Value}
		}
		points := make([]Point, 0, len(samples))
		for _, s := range samples {
			if p, ok := toPoint(s); ok {
				points = append(points, p)
			}
		}
		if len(points) > 0 {
			out = append(out, Series{Label: labelOf(res.Metric), Points: points, Labels: res.Metric})
		}
	}
	return out, nil
}

// toPoint parses one [timestamp, "value"] Prometheus sample. Missing (the zero
// instant value) or non-finite samples yield ok=false.
func toPoint(s [2]any) (Point, bool) {
	t, ok := s[0].(float64)
	if !ok {
		return Point{}, false
	}
	raw, ok := s[1].(string)
	if !ok {
		return Point{}, false
	}
	v, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsInf(v, 0) || math.IsNaN(v) {
		return Point{}, false
	}
	return Point{T: t, V: v}, true
}

// labelOf picks the first meaningful label, else a k=v join, else "value".
func labelOf(metric map[string]string) string {
	for _, k := range labelKeys {
		if v := metric[k]; v != "" {
			return v
		}
	}
	rest := ""
	for k, v := range metric {
		if k == "__name__" || k == "stack" {
			continue
		}
		if rest != "" {
			rest += ","
		}
		rest += k + "=" + v
	}
	return cmp.Or(rest, "value")
}

// ErrUnknownPanel is returned when a panel ID is not in the registry.
var ErrUnknownPanel = errors.New("unknown panel")

// ErrBadRange is returned for a range outside the allowed set.
var ErrBadRange = errors.New("invalid range")
