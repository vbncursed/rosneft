package domain

import "time"

// Session is the data stored in Redis under session:<token>. Permissions is a
// snapshot taken at login so ValidateToken needs only one Redis GET.
type Session struct {
	UserID         string    `json:"user_id"`
	Permissions    []string  `json:"permissions"`
	IsOwner        bool      `json:"is_owner"` // root of trust, snapshotted at login like Permissions
	OwningAdminID  string    `json:"owning_admin_id"` // tenant admin for territory scoping; "" for Root
	Status         string    `json:"status"`
	AbsoluteExpiry time.Time `json:"absolute_expiry"`
}
