package metrics

import "cmp"

// FiringRules counts alert rules with at least one firing series, keyed the
// way the SPA's alertsOf keys them (alertname, service, severity), so a rule
// firing on two replicas counts once.
func FiringRules(series []Series) int {
	firing := map[[3]string]bool{}
	for _, s := range series {
		if s.Labels["alertstate"] != "firing" {
			continue
		}
		name := cmp.Or(s.Labels["alertname"], s.Label)
		firing[[3]string{name, s.Labels["service"], s.Labels["severity"]}] = true
	}
	return len(firing)
}
