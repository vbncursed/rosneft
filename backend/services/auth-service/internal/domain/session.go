package domain

import "time"

// Session is the data stored in Redis under session:<token>. It proves the
// login is live (existence + expiry); authorization (permissions, owner flag,
// territory scope) is re-read from the database on each ValidateToken so role
// changes take effect without re-login.
type Session struct {
	UserID         string    `json:"user_id"`
	Status         string    `json:"status"`
	AbsoluteExpiry time.Time `json:"absolute_expiry"`
}
