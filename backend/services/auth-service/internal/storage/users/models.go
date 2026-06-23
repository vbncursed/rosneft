package users

// userColumns is the column list selected by the scan helpers.
const userColumns = `u.id, u.email, u.username, u.password_hash, u.status,
	u.totp_enabled, u.totp_secret, u.created_at, u.updated_at, u.deleted_at`
