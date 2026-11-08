-- 0003_email_normalized_unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
