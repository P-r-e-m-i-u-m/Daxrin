-- Performance indexes for high-traffic tables
CREATE INDEX IF NOT EXISTS idx_users_email_status
ON users(email, status)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_created
ON sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_created_level
ON logs(created_at DESC, level)
-- updated: 2026-09-25 build: 1790345932
