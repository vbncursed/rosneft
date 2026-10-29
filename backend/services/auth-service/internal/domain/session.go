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
	// PwEpoch is the password epoch (User.PasswordEpoch) the session was minted
	// under. ValidateToken refuses a session whose epoch is older than the
	// user's current one, so a Login that raced a password change cannot leave
	// a live session behind. Zero marks a session stored before the field
	// existed: it is not checked, so a deploy signs nobody out.
	PwEpoch int64 `json:"pw_epoch,omitempty"`
}
