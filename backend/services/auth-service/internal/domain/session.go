package domain

import "time"

// Session is the data stored in Redis under session:<token>. Permissions is a
// snapshot taken at login so ValidateToken needs only one Redis GET.
type Session struct {
	UserID         string    `json:"user_id"`
	Permissions    []string  `json:"permissions"`
	Status         string    `json:"status"`
	AbsoluteExpiry time.Time `json:"absolute_expiry"`
}
