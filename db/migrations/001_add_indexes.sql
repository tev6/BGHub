-- 用户查询优化
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_level ON users(role_level);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- 论坛查询优化
CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_review_status ON posts(review_status);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

-- 评论查询优化
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- 作业查询优化
CREATE INDEX IF NOT EXISTS idx_homeworks_board_id ON homeworks(board_id);
CREATE INDEX IF NOT EXISTS idx_homeworks_deadline ON homeworks(deadline);
CREATE INDEX IF NOT EXISTS idx_homework_statuses_user ON homework_statuses(user_id);

-- 资源查询优化
CREATE INDEX IF NOT EXISTS idx_resources_board_id ON resources(board_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at);

-- 通知查询优化
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 聊天查询优化
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_status ON chat_messages(status);

-- 积分日志查询优化
CREATE INDEX IF NOT EXISTS idx_credit_log_user_id ON credit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_log_created_at ON credit_log(created_at);

-- 审核查询优化
CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_items_created_by ON review_items(created_by);

-- CJ 内容查询优化
CREATE INDEX IF NOT EXISTS idx_board_sections_board_date ON board_sections(board_id, section_date);

-- 私信查询优化
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
