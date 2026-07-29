package service

import (
	"encoding/json"
	"strconv"

	"github.com/vbncursed/rosneft/backend/services/gateway-service/internal/domain"
)

// refFields is the single source of truth for which snapshot column holds a
// reference and to what.
//
// The client never gets a copy: the page dictionary is keyed "field:value", and
// because no column name means two different kinds across the ten audited
// tables, the field name alone carries the kind. That is deliberate — the
// entity list in frontend/src/audit/domain/vocabulary.ts is the same idea
// duplicated onto the client, and it silently drifted out of step with the
// triggers. If a future table ever introduces a column whose name means a
// different kind, this map is where it has to be noticed.
var refFields = map[string]map[string]string{
	"user_role":            {"user_id": "user", "role_id": "role"},
	"role_permission":      {"role_id": "role", "permission_id": "permission"},
	"territory_assignment": {"territory_id": "territory", "admin_user_id": "user"},
	"placement": {
		"territory_id":         "territory",
		"model_id":             "model",
		"visible_panorama_ids": "panorama",
	},
	"panorama": {"territory_id": "territory"},
	"document": {"territory_id": "territory"},
}

// refKey is the dictionary key the client rebuilds from the field name and the
// raw value it is about to render.
func refKey(field, value string) string {
	return field + ":" + value
}

// collectRefs gathers every referenced id on a page, from both snapshots.
//
// Both, not just the newer one: a changed field needs a label on each side of
// the arrow, and labelling only the new value would leave half the diff opaque.
func collectRefs(entries []domain.AuditEntry) []domain.LabelRef {
	var out []domain.LabelRef
	seen := make(map[string]struct{})

	for _, e := range entries {
		fields, ok := refFields[e.Entity]
		if !ok {
			// Checked before parsing: a page of user or session events carries
			// no references and must not pay for a JSON decode.
			continue
		}
		for _, raw := range []string{e.OldRow, e.NewRow} {
			collectRowRefs(raw, fields, seen, &out)
		}
	}
	return out
}

func collectRowRefs(raw string, fields map[string]string, seen map[string]struct{}, out *[]domain.LabelRef) {
	if raw == "" {
		return
	}
	var row map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &row); err != nil {
		// A broken snapshot costs its own labels, never the page's.
		return
	}
	for field, kind := range fields {
		val, ok := row[field]
		if !ok {
			continue
		}
		for _, id := range refValues(val) {
			key := kind + ":" + id
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			*out = append(*out, domain.LabelRef{Kind: kind, ID: id})
		}
	}
}

// refValues turns one column value into the ids inside it. A column is either a
// scalar id or an array of them (placements.visible_panorama_ids).
func refValues(val json.RawMessage) []string {
	if id, ok := refScalar(val); ok {
		return []string{id}
	}
	var list []json.RawMessage
	if err := json.Unmarshal(val, &list); err != nil {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if id, ok := refScalar(item); ok {
			out = append(out, id)
		}
	}
	return out
}

// refScalar reads one id, whether the column is a uuid string or a bigint.
// null means "no link" and 0 means "the column was absent"; neither is an id.
func refScalar(val json.RawMessage) (string, bool) {
	var s string
	if err := json.Unmarshal(val, &s); err == nil {
		return s, s != ""
	}
	var n int64
	if err := json.Unmarshal(val, &n); err == nil {
		return strconv.FormatInt(n, 10), n > 0
	}
	return "", false
}
