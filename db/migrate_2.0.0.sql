-- BIGZ Hub Database Migration Script
-- Version: 2.0.0
-- Description: Credit system, role permissions, and review functionality

-- =====================================================
-- Table: user_credit
-- Stores credit score for each user (0-1000)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_credit (
    user_id INTEGER PRIMARY KEY,
    credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0 AND credit <= 1000),
    last_login_date TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- Table: credit_log
-- Audit trail for all credit changes
-- =====================================================
CREATE TABLE IF NOT EXISTS credit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reviewer_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- Table: roles
-- Level-based role definitions with credit thresholds
-- =====================================================
CREATE TABLE IF NOT EXISTS roles (
    level TINYINT PRIMARY KEY,
    min_credit INTEGER NOT NULL,
    name TEXT NOT NULL,
    badge_color TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE
);

-- Default role definitions
INSERT OR IGNORE INTO roles (level, min_credit, name, badge_color, is_admin) VALUES
    (0, 0, 'LV0', '#94a3b8', FALSE),
    (1, 50, 'LV1', '#64748b', FALSE),
    (2, 150, 'LV2', '#3255a4', FALSE),
    (3, 300, 'LV3', '#0ea5e9', FALSE),
    (4, 500, 'LV4', '#16a34a', FALSE),
    (5, 800, 'LV5', '#f59e0b', FALSE),
    (6, 1000, 'LV6', '#dc2626', TRUE);

-- =====================================================
-- Table: review_items
-- Pending content for review queue
-- =====================================================
CREATE TABLE IF NOT EXISTS review_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL CHECK (item_type IN ('post', 'chat', 'resource')),
    item_id INTEGER NOT NULL,
    payload TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_by INTEGER NOT NULL,
    reviewer_id INTEGER,
    decision_reason TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- Table: review_actions
-- Historical record of all review decisions
-- =====================================================
CREATE TABLE IF NOT EXISTS review_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    reviewer_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
    reason TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(review_id) REFERENCES review_items(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- Table: rate_limit_log
-- Track rate limit violations for security monitoring
-- =====================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip TEXT NOT NULL,
    route TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Table: supercode_lockouts
-- Track failed supercode attempts to prevent brute force
-- =====================================================
CREATE TABLE IF NOT EXISTS supercode_lockouts (
    email TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until DATETIME
);

-- =====================================================
-- Table: admin_log
-- Audit trail for all admin actions
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_user_id INTEGER,
    ip TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- Table: notifications
-- In-app notifications for users
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- Table: email_outbox
-- Queued outbound emails
-- =====================================================
CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Existing table modifications (if not already present)
-- =====================================================

-- Add role_level to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_level INTEGER NOT NULL DEFAULT 0;

-- Add banned_until to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until DATETIME;

-- Add muted_until to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until DATETIME;

-- Add review_status to posts if not exists
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'approved';

-- Add status to chat_messages if not exists
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';

-- Add payload to review_items if not exists
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS payload TEXT NOT NULL DEFAULT '';

-- =====================================================
-- Indexes for performance optimization
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_credit_log_user_id ON credit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_log_created_at ON credit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_items_type ON review_items(item_type);
CREATE INDEX IF NOT EXISTS idx_review_items_created_at ON review_items(created_at);
CREATE INDEX IF NOT EXISTS idx_review_actions_review_id ON review_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_admin_log_admin_user_id ON admin_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_log_created_at ON admin_log(created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_ip ON rate_limit_log(ip);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_created_at ON rate_limit_log(created_at);
