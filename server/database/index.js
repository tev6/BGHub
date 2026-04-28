const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

function createDatabaseHelpers(db) {
  return {
    run(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
          if (error) {
            reject(error);
            return;
          }

          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        });
      });
    },
    get(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(row || null);
        });
      });
    },
    all(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(rows || []);
        });
      });
    }
  };
}

const boardSeeds = [
  { slug: 'mathematics', name: '数学', name_en: 'Mathematics', color: '#5b7cfa' },
  { slug: 'english', name: '英语', name_en: 'English', color: '#f97316' },
  { slug: 'physics', name: '物理', name_en: 'Physics', color: '#06b6d4' },
  { slug: 'chemistry', name: '化学', name_en: 'Chemistry', color: '#10b981' },
  { slug: 'biology', name: '生物', name_en: 'Biology', color: '#84cc16' },
  { slug: 'history', name: '历史', name_en: 'History', color: '#a855f7' },
  { slug: 'economics', name: '经济', name_en: 'Economics', color: '#ec4899' },
  { slug: 'computer-science', name: '计算机', name_en: 'Computer Science', color: '#0f172a' },
  { slug: 'other', name: '其他', name_en: 'Other', color: '#64748b' }
];

const sectionTitles = {
  IC: '课程内容',
  HW: '课程作业',
  A: '公告'
};

const sectionTitlesEn = {
  IC: 'Course Content',
  HW: 'Homework',
  A: 'Announcement'
};

const defaultRoles = [
  { level: 0,  min_credit: 0,    max_credit: 0,     name: 'LV0',  badge_color: '#94a3b8', is_admin: 0, daily_post_limit: 5,   chat_audit: 'full',  review_target_min: -1, review_target_max: -1, login_credit: 0 },
  { level: 1,  min_credit: 1,    max_credit: 10,    name: 'LV1',  badge_color: '#64748b', is_admin: 0, daily_post_limit: 20,  chat_audit: 'ai',    review_target_min: -1, review_target_max: -1, login_credit: 1 },
  { level: 2,  min_credit: 11,   max_credit: 40,    name: 'LV2',  badge_color: '#3255a4', is_admin: 0, daily_post_limit: 40,  chat_audit: 'ai',    review_target_min: -1, review_target_max: -1, login_credit: 2 },
  { level: 3,  min_credit: 41,   max_credit: 100,   name: 'LV3',  badge_color: '#0ea5e9', is_admin: 0, daily_post_limit: 60,  chat_audit: 'none',  review_target_min: 0, review_target_max: 2, login_credit: 3 },
  { level: 4,  min_credit: 101,  max_credit: 250,   name: 'LV4',  badge_color: '#16a34a', is_admin: 0, daily_post_limit: 80,  chat_audit: 'none',  review_target_min: 0, review_target_max: 3, login_credit: 4 },
  { level: 5,  min_credit: 251, max_credit: 500,   name: 'LV5',  badge_color: '#f59e0b', is_admin: 0, daily_post_limit: 100, chat_audit: 'none',  review_target_min: 0, review_target_max: 4, login_credit: 4 },
  { level: 55, min_credit: -1,   max_credit: -1,    name: 'LV5.5', badge_color: '#8b5cf6', is_admin: 0, daily_post_limit: 999, chat_audit: 'none',  review_target_min: 0, review_target_max: 5, login_credit: 0 },
  { level: 6,  min_credit: 2000, max_credit: -1,    name: 'LV6',  badge_color: '#dc2626', is_admin: 1, daily_post_limit: 999, chat_audit: 'none',  review_target_min: 0, review_target_max: 55, login_credit: 0 }
];

async function ensureColumn(db, query, tableName, columnName, definition) {
  try {
    const tableExists = await query.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    if (!tableExists) {
      return;
    }
    const columns = await query.all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      await query.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (error) {
    console.warn(`[DB Migration] Warning: Could not ensure column ${columnName} on ${tableName}:`, error.message);
  }
}

async function initializeDatabase(db, query, extraEnsureCreditRecord) {
  await query.run('PRAGMA foreign_keys = ON');

  await query.run(`CREATE TABLE IF NOT EXISTS site_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    view_count INTEGER NOT NULL DEFAULT 0,
    last_view_at DATETIME
  )`);
  await query.run('INSERT OR IGNORE INTO site_stats (id, view_count) VALUES (1, 0)');

  await query.run(`CREATE TABLE IF NOT EXISTS about_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    doc_type TEXT NOT NULL DEFAULT 'page',
    is_published INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    updated_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
  )`);
  await query.run('CREATE INDEX IF NOT EXISTS idx_about_slug ON about_pages(slug)');
  await query.run('CREATE INDEX IF NOT EXISTS idx_about_doc_type ON about_pages(doc_type)');

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const deleteResult = await query.run(
      "DELETE FROM board_sections WHERE section_date < ?",
      [sevenDaysAgo]
    );
    if (deleteResult.changes > 0) {
      console.log(`[DB Cleanup] 已自动清理 ${deleteResult.changes} 条超过7天的CJ内容`);
    }
  } catch (e) {
    console.error('[DB Cleanup] CJ内容清理失败:', e.message);
  }

  await query.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    grade TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await ensureColumn(db, query, 'users', 'role_level', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'users', 'banned_until', 'DATETIME');
  await ensureColumn(db, query, 'users', 'muted_until', 'DATETIME');
  await ensureColumn(db, query, 'users', 'locale', "TEXT NOT NULL DEFAULT 'zh'");
  await ensureColumn(db, query, 'users', 'class_name', 'TEXT');

  await query.run(`CREATE TABLE IF NOT EXISTS roles (
    level INTEGER PRIMARY KEY,
    min_credit INTEGER NOT NULL,
    name TEXT NOT NULL,
    badge_color TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS user_credit (
    user_id INTEGER PRIMARY KEY,
    credit INTEGER NOT NULL DEFAULT 0,
    last_login_date TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS credit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    reviewer_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    notification_type TEXT NOT NULL DEFAULT 'system',
    is_read INTEGER NOT NULL DEFAULT 0,
    read_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await ensureColumn(db, query, 'notifications', 'read_at', 'DATETIME');

  await query.run(`CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS review_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    payload TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_by INTEGER NOT NULL,
    reviewer_id INTEGER,
    decision_reason TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await ensureColumn(db, query, 'review_items', 'payload', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, query, 'review_items', 'ai_reviewed', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'review_items', 'review_stage', "TEXT NOT NULL DEFAULT 'pending_human'");
  await ensureColumn(db, query, 'review_items', 'ai_result', 'TEXT');
  await ensureColumn(db, query, 'review_items', 'ai_reason', 'TEXT');
  await ensureColumn(db, query, 'review_items', 'ai_reviewed_at', 'DATETIME');

  await query.run(`CREATE TABLE IF NOT EXISTS review_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    reviewer_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(review_id) REFERENCES review_items(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS rate_limit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    ip TEXT NOT NULL,
    route TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS supercode_lockouts (
    email TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until DATETIME
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS conversation_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_at DATETIME,
    UNIQUE(conversation_id, user_id),
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS private_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS post_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reaction_type TEXT NOT NULL CHECK(reaction_type IN ('like', 'dislike')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('post', 'resource', 'homework')),
    item_id INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_type, item_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id)`);
  await query.run(`CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id)`);

  await query.run(`CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    semester TEXT NOT NULL DEFAULT '2026-Spring',
    grade TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(semester, grade)
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS schedule_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
    period INTEGER NOT NULL CHECK(period BETWEEN 1 AND 8),
    subject TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT '',
    room TEXT NOT NULL DEFAULT '',
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id)`);

  await query.run(`CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    term TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS trending_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL UNIQUE,
    search_count INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE INDEX IF NOT EXISTS idx_private_messages_conversation ON private_messages(conversation_id)`);

  await query.run(`CREATE TABLE IF NOT EXISTS admin_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_user_id INTEGER,
    ip TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS ip_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL DEFAULT '',
    fail_count INTEGER NOT NULL DEFAULT 0,
    banned_at DATETIME NOT NULL,
    expires_at DATETIME,
    created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS user_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    ban_count INTEGER NOT NULL DEFAULT 0,
    banned_at DATETIME NOT NULL,
    expires_at DATETIME,
    created_by INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id)
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id INTEGER,
    review_result TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id)
  )`);

  await ensureColumn(db, query, 'reports', 'review_result', 'TEXT');
  await ensureColumn(db, query, 'reports', 'target_user_id', 'INTEGER');
  await ensureColumn(db, query, 'reports', 'min_reviewer_level', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'reports', 'reviewer_id', 'INTEGER');
  await ensureColumn(db, query, 'reports', 'reviewed_at', 'DATETIME');

  await query.run(`CREATE TABLE IF NOT EXISTS review_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    content_id INTEGER NOT NULL,
    appeal_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_id INTEGER,
    review_note TEXT,
    credit_restored INTEGER DEFAULT 0,
    credit_compensation INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(reviewer_id) REFERENCES users(id)
  )`);

  await ensureColumn(db, query, 'review_appeals', 'credit_restored', 'INTEGER DEFAULT 0');
  await ensureColumn(db, query, 'review_appeals', 'credit_compensation', 'INTEGER DEFAULT 0');

  await query.run(`CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stat_date TEXT NOT NULL,
    posts_count INTEGER NOT NULL DEFAULT 0,
    chat_count INTEGER NOT NULL DEFAULT 0,
    cj_count INTEGER NOT NULL DEFAULT 0,
    resource_count INTEGER NOT NULL DEFAULT 0,
    login_credit_received INTEGER NOT NULL DEFAULT 0,
    credit_capped INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, stat_date)
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS credit_caps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    excess_credit INTEGER NOT NULL DEFAULT 0,
    released_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_en TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#4f46e5',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS grade_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,
    class_name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(grade, class_name)
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS subject_grade_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    grade TEXT NOT NULL,
    is_shared INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_id, grade),
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
  )`);

  await ensureColumn(db, query, 'board_sections', 'class_name', 'TEXT');

  await query.run(`CREATE TABLE IF NOT EXISTS board_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    section_date TEXT NOT NULL DEFAULT (date('now')),
    title TEXT NOT NULL,
    title_en TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    class_name TEXT,
    updated_by INTEGER,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_id, section, section_date, class_name),
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    exam_type TEXT NOT NULL,
    grade TEXT NOT NULL,
    exam_date DATETIME NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    teacher TEXT NOT NULL DEFAULT '',
    is_priority INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS homeworks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT '',
    deadline DATETIME NOT NULL,
    attachment_url TEXT NOT NULL DEFAULT '',
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS homework_statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    homework_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_completed INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(homework_id, user_id),
    FOREIGN KEY(homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    teacher TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL DEFAULT '',
    external_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'approved',
    download_count INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
    FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS resource_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_id, user_id),
    FOREIGN KEY(resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await query.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    post_type TEXT NOT NULL DEFAULT 'question',
    is_anonymous INTEGER NOT NULL DEFAULT 0,
    is_resolved INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    review_status TEXT NOT NULL DEFAULT 'approved',
    view_count INTEGER NOT NULL DEFAULT 0,
    user_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE SET NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  try {
    const postColumns = await query.all('PRAGMA table_info(posts)');
    const boardIdCol = postColumns.find(c => c.name === 'board_id');
    if (boardIdCol && boardIdCol.notnull === 1) {
      await query.run(`CREATE TABLE posts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_id INTEGER,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        post_type TEXT NOT NULL DEFAULT 'question',
        is_anonymous INTEGER NOT NULL DEFAULT 0,
        is_resolved INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        review_status TEXT NOT NULL DEFAULT 'approved',
        view_count INTEGER NOT NULL DEFAULT 0,
        user_id INTEGER NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE SET NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      await query.run(`INSERT INTO posts_new (id, board_id, title, content, post_type, is_anonymous, is_resolved, status, review_status, view_count, user_id, created_at, updated_at) SELECT id, board_id, title, content, post_type, is_anonymous, is_resolved, status, review_status, view_count, user_id, created_at, updated_at FROM posts`);
      await query.run('DROP TABLE posts');
      await query.run('ALTER TABLE posts_new RENAME TO posts');
      console.log('[DB Migration] posts.board_id migrated to allow NULL successfully');
    }
  } catch (e) {
    console.error('[DB Migration] Failed to migrate posts.board_id:', e.message);
  }

  await ensureColumn(db, query, 'posts', 'review_status', "TEXT NOT NULL DEFAULT 'approved'");
  await ensureColumn(db, query, 'posts', 'like_count', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'posts', 'dislike_count', 'INTEGER NOT NULL DEFAULT 0');

  await query.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    is_best INTEGER NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await ensureColumn(db, query, 'comments', 'status', "TEXT NOT NULL DEFAULT 'approved'");

  await query.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    user_id INTEGER,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await ensureColumn(db, query, 'chat_messages', 'status', "TEXT NOT NULL DEFAULT 'approved'");
  await ensureColumn(db, query, 'chat_messages', 'is_pending', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'chat_messages', 'is_rejected', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'chat_messages', 'reviewed_at', 'DATETIME');
  await ensureColumn(db, query, 'chat_messages', 'guest_id', 'TEXT');

  try {
    const chatTableInfo = await query.all("PRAGMA table_info('chat_messages')");
    const userIdCol = chatTableInfo.find(col => col.name === 'user_id');
    if (userIdCol && userIdCol.notnull === 1) {
      console.log('[DB Migration] chat_messages.user_id is NOT NULL, migrating to allow NULL...');
      try { await query.run("DROP TABLE IF EXISTS chat_messages_new"); } catch (e) {}
      await query.run(`CREATE TABLE chat_messages_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        user_id INTEGER,
        status TEXT NOT NULL DEFAULT 'approved',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_pending INTEGER NOT NULL DEFAULT 0,
        is_rejected INTEGER NOT NULL DEFAULT 0,
        reviewed_at DATETIME,
        guest_id TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      await query.run(`INSERT INTO chat_messages_new (id, content, user_id, status, created_at, is_pending, is_rejected, reviewed_at, guest_id) SELECT id, content, user_id, status, created_at, is_pending, is_rejected, reviewed_at, guest_id FROM chat_messages`);
      await query.run("DROP TABLE chat_messages");
      await query.run("ALTER TABLE chat_messages_new RENAME TO chat_messages");
      console.log('[DB Migration] chat_messages.user_id migrated to allow NULL successfully');
    }
  } catch (e) {
    console.error('[DB Migration] Failed to migrate chat_messages.user_id:', e.message);
  }

  await ensureColumn(db, query, 'user_credit', 'chat_cooldown_until', 'DATETIME');
  await ensureColumn(db, query, 'user_credit', 'consecutive_rejects', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'user_credit', 'violation_count', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'user_credit', 'last_violation_at', 'DATETIME');

  const sectionColumns = await query.all('PRAGMA table_info(board_sections)');
  const hasDateCol = sectionColumns.some(c => c.name === 'section_date');
  if (!hasDateCol) {
    await query.run(`ALTER TABLE board_sections ADD COLUMN section_date TEXT`);
  }

  await ensureColumn(db, query, 'roles', 'daily_post_limit', 'INTEGER NOT NULL DEFAULT 10');
  await ensureColumn(db, query, 'roles', 'chat_audit', "TEXT NOT NULL DEFAULT 'full'");
  await ensureColumn(db, query, 'roles', 'review_target_min', 'INTEGER NOT NULL DEFAULT -1');
  await ensureColumn(db, query, 'roles', 'review_target_max', 'INTEGER NOT NULL DEFAULT -1');
  await ensureColumn(db, query, 'roles', 'login_credit', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, query, 'roles', 'max_credit', 'INTEGER NOT NULL DEFAULT -1');
  await ensureColumn(db, query, 'boards', 'name_en', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, query, 'board_sections', 'title_en', "TEXT NOT NULL DEFAULT ''");

  try {
    const tableInfo = await query.all("PRAGMA table_info('boards')");
    const hasDescription = tableInfo.some(col => col.name === 'description');
    if (hasDescription) {
      console.log('[DB Migration] Found description column in boards, removing...');
      try { await query.run("DROP TABLE IF EXISTS boards_new"); } catch (e) {}
      await query.run(`CREATE TABLE boards_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        name_en TEXT NOT NULL DEFAULT '',
        color TEXT NOT NULL DEFAULT '#4f46e5',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
      await query.run(`INSERT INTO boards_new (id, slug, name, name_en, color, sort_order, created_at) SELECT id, slug, name, name_en, color, sort_order, created_at FROM boards`);
      await query.run("DROP TABLE boards");
      await query.run("ALTER TABLE boards_new RENAME TO boards");
      console.log('[DB Migration] boards table description column removed successfully');
    } else {
      console.log('[DB Migration] boards table already without description column');
    }
  } catch (e) {
    console.error('[DB Migration] Failed to remove description column:', e.message);
  }

  for (const role of defaultRoles) {
    await query.run(
      `INSERT OR REPLACE INTO roles (level, min_credit, max_credit, name, badge_color, is_admin, daily_post_limit, chat_audit, review_target_min, review_target_max, login_credit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [role.level, role.min_credit, role.max_credit, role.name, role.badge_color, role.is_admin, role.daily_post_limit, role.chat_audit, role.review_target_min, role.review_target_max, role.login_credit]
    );
  }

  for (let index = 0; index < boardSeeds.length; index += 1) {
    const board = boardSeeds[index];
    await query.run(
      `INSERT OR IGNORE INTO boards (slug, name, name_en, color, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [board.slug, board.name, board.name_en, board.color, index + 1]
    );

    const savedBoard = await query.get('SELECT id FROM boards WHERE slug = ?', [board.slug]);

    for (const section of Object.keys(sectionTitles)) {
      await query.run(
        `INSERT OR IGNORE INTO board_sections (board_id, section, title, title_en, content)
         VALUES (?, ?, ?, ?, ?)`,
        [savedBoard.id, section, sectionTitles[section], sectionTitlesEn[section], '']
      );
    }
  }

  const existingAdmin = await query.get("SELECT id FROM users WHERE name = 'Admin'");
  if (!existingAdmin) {
    const adminPasswordHash = await bcrypt.hash('!Vnk3cU1a$~P', 10);
    await query.run(
      `INSERT INTO users (email, name, grade, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)`,
      ['admin@basischina.com', 'Admin', 'G12', adminPasswordHash, 'admin', 6]
    );
    const adminRow = await query.get("SELECT id FROM users WHERE name = 'Admin'");
    if (adminRow) {
      await extraEnsureCreditRecord(adminRow.id);
      await query.run('UPDATE user_credit SET credit = 1000 WHERE user_id = ?', [adminRow.id]);
    }
  }
}

module.exports = {
  createDatabaseHelpers,
  initializeDatabase,
  ensureColumn,
  boardSeeds,
  sectionTitles,
  sectionTitlesEn,
  defaultRoles
};
