require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const marked = require('marked');
const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify')(new JSDOM('').window);
const { WebSocketServer } = require('ws');

const { moderateChatMessage, moderatePost, moderateResource, moderateContent } = require('./server/services/moderation');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

marked.setOptions({
  gfm: true,
  breaks: true
});

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '');
}

function excerpt(value, length = 120) {
  const plain = stripHtml(value).replace(/\s+/g, ' ').trim();
  return plain.length <= length ? plain : `${plain.slice(0, length)}…`;
}

function extractFirstImageUrl(value) {
  const match = String(value || '').match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+src=["']([^"']+)["']/i);
  return match ? (match[1] || match[2] || '') : '';
}

function buildCountdown(dateValue) {
  if (!dateValue) {
    return '待定';
  }

  const target = new Date(dateValue);
  const diff = target.getTime() - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));

  if (days > 1) {
    return `还剩 ${days} 天`;
  }

  if (days === 1) {
    return '明天';
  }

  if (days === 0) {
    return '今天';
  }

  return `已过 ${Math.abs(days)} 天`;
}

function renderMarkdown(content) {
  if (!content) {
    return '';
  }

  return DOMPurify.sanitize(marked.parse(String(content).trim()));
}

function formatDate(dateValue, includeTime = false) {
  if (!dateValue) {
    return '—';
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return includeTime
    ? date.toLocaleString('zh-CN', { hour12: false })
    : date.toLocaleDateString('zh-CN');
}

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

function createApp(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const publicDir = path.join(rootDir, 'public');
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const sessionDir = options.sessionDir || path.join(dataDir, 'sessions');
  const uploadDir = options.uploadDir || path.join(publicDir, 'uploads');
  const dbPath = options.dbPath || path.join(dataDir, 'bigz-hub-mvp.db');

  ensureDirectory(dataDir);
  ensureDirectory(sessionDir);
  ensureDirectory(uploadDir);

  const db = new sqlite3.Database(dbPath);
  const query = createDatabaseHelpers(db);
  const app = express();

  const upload = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        callback(null, uploadDir);
      },
      filename(req, file, callback) {
        const extension = path.extname(file.originalname || '');
        const safeBase = slugify(path.basename(file.originalname || 'resource', extension)) || 'resource';
        callback(null, `${Date.now()}-${safeBase}${extension}`);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  });

  async function sendVerificationEmail(userEmail) {
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxxxxxxxx') {
      console.log('[Email] Resend API key not configured, skipping verification email');
      return null;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await query.run(
      'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)',
      [userEmail, code, expiresAt.toISOString()]
    );

    try {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: userEmail,
        subject: 'BG Hub 注册验证码',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #3255c4;">BG Hub 注册验证码</h2>
            <p>您好，感谢您注册 BG Hub！</p>
            <p>您的验证码是：<strong style="font-size: 24px; color: #3255c4;">${code}</strong></p>
            <p>验证码将在 <strong>10 分钟</strong>后过期，请尽快完成验证。</p>
            <p>如果这不是您本人的操作，请忽略此邮件。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">此邮件由系统自动发送，请勿回复。</p>
          </div>
        `
      });
      console.log(`[Email] Verification code sent to ${userEmail}`);
      return code;
    } catch (error) {
      console.error('[Email] Failed to send verification email:', error.message);
      return null;
    }
  }

  const boardSeeds = [
    { slug: 'mathematics', name: '数学', name_en: 'Mathematics', description: 'AP 微积分、代数、统计与数学笔记', color: '#5b7cfa' },
    { slug: 'english', name: '英语', name_en: 'English', description: '文学阅读、写作任务与课堂资料', color: '#f97316' },
    { slug: 'physics', name: '物理', name_en: 'Physics', description: '实验、习题与考试提醒', color: '#06b6d4' },
    { slug: 'chemistry', name: '化学', name_en: 'Chemistry', description: '公式、实验安全与课堂安排', color: '#10b981' },
    { slug: 'biology', name: '生物', name_en: 'Biology', description: '章节重点、实验作业与资料整理', color: '#84cc16' },
    { slug: 'history', name: '历史', name_en: 'History', description: '阅读任务、讨论题与考试节点', color: '#a855f7' },
    { slug: 'economics', name: '经济', name_en: 'Economics', description: '案例分析、作业与课堂公告', color: '#ec4899' },
    { slug: 'computer-science', name: '计算机', name_en: 'Computer Science', description: '编程任务、实验要求与资源分享', color: '#0f172a' },
    { slug: 'other', name: '其他', name_en: 'Other', description: '跨学科内容与通用学习资源', color: '#64748b' }
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

  async function ensureColumn(tableName, columnName, definition) {
    const columns = await query.all(`PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      await query.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  async function initializeDatabase() {
    await query.run('PRAGMA foreign_keys = ON');

    await query.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await ensureColumn('users', 'role_level', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('users', 'banned_until', 'DATETIME');
    await ensureColumn('users', 'muted_until', 'DATETIME');

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
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

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

    await ensureColumn('review_items', 'payload', "TEXT NOT NULL DEFAULT ''");

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

    await ensureColumn('reports', 'review_result', 'TEXT');

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

    await ensureColumn('review_appeals', 'credit_restored', 'INTEGER DEFAULT 0');
    await ensureColumn('review_appeals', 'credit_compensation', 'INTEGER DEFAULT 0');

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
      description TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#4f46e5',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    await query.run(`CREATE TABLE IF NOT EXISTS board_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      section_date TEXT NOT NULL DEFAULT (date('now')),
      title TEXT NOT NULL,
      title_en TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      updated_by INTEGER,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(board_id, section, section_date),
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

    await query.run(`CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
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
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await ensureColumn('posts', 'review_status', "TEXT NOT NULL DEFAULT 'approved'");
    await ensureColumn('posts', 'like_count', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('posts', 'dislike_count', 'INTEGER NOT NULL DEFAULT 0');

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

    await ensureColumn('comments', 'status', "TEXT NOT NULL DEFAULT 'approved'");

    await query.run(`CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    await ensureColumn('chat_messages', 'status', "TEXT NOT NULL DEFAULT 'approved'");
    await ensureColumn('chat_messages', 'is_pending', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('chat_messages', 'is_rejected', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('chat_messages', 'reviewed_at', 'DATETIME');

    await ensureColumn('user_credit', 'chat_cooldown_until', 'DATETIME');
    await ensureColumn('user_credit', 'consecutive_rejects', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('user_credit', 'violation_count', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('user_credit', 'last_violation_at', 'DATETIME');

    const sectionColumns = await query.all('PRAGMA table_info(board_sections)');
    const hasDateCol = sectionColumns.some(c => c.name === 'section_date');
    if (!hasDateCol) {
      await query.run(`ALTER TABLE board_sections ADD COLUMN section_date TEXT`);
    }

    await ensureColumn('roles', 'daily_post_limit', 'INTEGER NOT NULL DEFAULT 10');
    await ensureColumn('roles', 'chat_audit', "TEXT NOT NULL DEFAULT 'full'");
    await ensureColumn('roles', 'review_target_min', 'INTEGER NOT NULL DEFAULT -1');
    await ensureColumn('roles', 'review_target_max', 'INTEGER NOT NULL DEFAULT -1');
    await ensureColumn('roles', 'login_credit', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('roles', 'max_credit', 'INTEGER NOT NULL DEFAULT -1');
    await ensureColumn('boards', 'name_en', "TEXT NOT NULL DEFAULT ''");
    await ensureColumn('board_sections', 'title_en', "TEXT NOT NULL DEFAULT ''");

    const defaultRoles = [
      { level: 0,  min_credit: 0,    max_credit: 0,     name: 'LV0',  badge_color: '#94a3b8', is_admin: 0, daily_post_limit: 5,   chat_audit: 'full',  review_target_min: -1, review_target_max: -1, login_credit: 0 },
      { level: 1,  min_credit: 1,    max_credit: 10,    name: 'LV1',  badge_color: '#64748b', is_admin: 0, daily_post_limit: 20,  chat_audit: 'ai',    review_target_min: -1, review_target_max: -1, login_credit: 1 },
      { level: 2,  min_credit: 11,   max_credit: 40,    name: 'LV2',  badge_color: '#3255a4', is_admin: 0, daily_post_limit: 40,  chat_audit: 'ai',    review_target_min: -1, review_target_max: -1, login_credit: 2 },
      { level: 3,  min_credit: 41,   max_credit: 100,   name: 'LV3',  badge_color: '#0ea5e9', is_admin: 0, daily_post_limit: 60,  chat_audit: 'none',  review_target_min: 0, review_target_max: 2, login_credit: 3 },
      { level: 4,  min_credit: 101,  max_credit: 250,   name: 'LV4',  badge_color: '#16a34a', is_admin: 0, daily_post_limit: 80,  chat_audit: 'none',  review_target_min: 0, review_target_max: 3, login_credit: 4 },
      { level: 5,  min_credit: 251, max_credit: 500,   name: 'LV5',  badge_color: '#f59e0b', is_admin: 0, daily_post_limit: 100, chat_audit: 'none',  review_target_min: 0, review_target_max: 5, login_credit: 4 },
      { level: 55, min_credit: -1,   max_credit: -1,    name: 'LV5.5', badge_color: '#8b5cf6', is_admin: 0, daily_post_limit: 999, chat_audit: 'none',  review_target_min: 0, review_target_max: 5, login_credit: 0 },
      { level: 6,  min_credit: 2000, max_credit: -1,    name: 'LV6',  badge_color: '#dc2626', is_admin: 1, daily_post_limit: 999, chat_audit: 'none',  review_target_min: 0, review_target_max: 55, login_credit: 0 }
    ];

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
        `INSERT OR IGNORE INTO boards (slug, name, name_en, description, color, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [board.slug, board.name, board.name_en, board.description, board.color, index + 1]
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
        await ensureCreditRecord(adminRow.id);
        await query.run('UPDATE user_credit SET credit = 1000 WHERE user_id = ?', [adminRow.id]);
      }
    }
  }

  function setFlash(req, type, message) {
    req.session.flash = { type, message };
  }

  function getUserLevel(user) {
    return Math.max(0, Number(user && user.role_level != null ? user.role_level : 0));
  }

  function isStaff(user) {
    return getUserLevel(user) >= 3;
  }

  function canManagePost(user, post) {
    return Boolean(user && (user.id === post.user_id || isStaff(user)));
  }

  function canMarkBestAnswer(user, post) {
    return Boolean(user && (user.id === post.user_id || isStaff(user)));
  }

  function validateEmail(email) {
    return /@(basischina\.com|gmail\.com)$/i.test(String(email || '').trim());
  }

  function clampCredit(value) {
    return Math.max(0, Math.min(1000, Number(value || 0)));
  }

  function currentDateKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseDateValue(value) {
    return value ? new Date(value) : null;
  }

  function hasSensitiveContent(content) {
    const sensitiveWords = ['政治', '赌博', '辱骂', '作弊', '外挂'];
    return sensitiveWords.some((word) => String(content || '').includes(word));
  }

  async function runTransaction(callback) {
    await query.run('BEGIN IMMEDIATE TRANSACTION');
    try {
      const result = await callback();
      await query.run('COMMIT');
      return result;
    } catch (error) {
      await query.run('ROLLBACK');
      throw error;
    }
  }

  async function ensureCreditRecord(userId) {
    await query.run('INSERT OR IGNORE INTO user_credit (user_id, credit) VALUES (?, 0)', [userId]);
    return query.get('SELECT * FROM user_credit WHERE user_id = ?', [userId]);
  }

  async function syncUserLevel(userId) {
    const creditRow = await ensureCreditRecord(userId);
    const existingUser = await query.get('SELECT role_level, role FROM users WHERE id = ?', [userId]);

    if (existingUser.role_level === 55 || existingUser.role_level === 6) {
      return existingUser.role_level;
    }

    if (existingUser.role_level === 1) {
      return existingUser.role_level;
    }

    const roleRow = await query.get(`
      SELECT *
      FROM roles
      WHERE min_credit <= ? AND level NOT IN (55, 6)
      ORDER BY level DESC
      LIMIT 1
    `, [creditRow.credit]);

    const nextLevel = roleRow ? roleRow.level : 1;
    const nextRole = nextLevel >= 5 ? 'moderator' : 'student';

    if (existingUser.role_level !== nextLevel || existingUser.role !== nextRole) {
      await query.run('UPDATE users SET role_level = ?, role = ? WHERE id = ?', [nextLevel, nextRole, userId]);
      const user = await query.get('SELECT email FROM users WHERE id = ?', [userId]);
      const newRole = await query.get('SELECT name FROM roles WHERE level = ?', [nextLevel]);
      await query.run(
        'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
        [userId, '等级变更通知', `你的权限等级已更新为 ${newRole.name}`, 'system']
      );
      await query.run(
        'INSERT INTO email_outbox (to_email, subject, content) VALUES (?, ?, ?)',
        [user.email, '等级变更通知', `你的权限等级已更新为 ${newRole.name}`]
      );
    }

    return nextLevel;
  }

  async function changeCredit(userId, delta, reason, reviewerId = null) {
    const user = await query.get('SELECT role_level FROM users WHERE id = ?', [userId]);
    if (user && (user.role_level === 55 || user.role_level === 6)) {
      return { credit: 0, delta: 0, skipped: true };
    }

    const creditRow = await ensureCreditRecord(userId);
    let actualDelta = Number(delta || 0);

    const roleInfo = await query.get('SELECT min_credit FROM roles WHERE level = ?', [user.role_level]);
    const minCredit = roleInfo ? Math.max(0, roleInfo.min_credit) : 0;

    if (creditRow.credit + actualDelta < minCredit) {
      actualDelta = minCredit - creditRow.credit;
    }

    if (creditRow.credit + actualDelta < 0) {
      actualDelta = -creditRow.credit;
    }

    const nextCredit = creditRow.credit + actualDelta;
    await query.run(
      'UPDATE user_credit SET credit = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [nextCredit, userId]
    );
    await query.run(
      'INSERT INTO credit_log (user_id, delta, reason, reviewer_id) VALUES (?, ?, ?, ?)',
      [userId, actualDelta, reason, reviewerId]
    );
    await syncUserLevel(userId);
    return { credit: nextCredit, delta: actualDelta };
  }

  const AUDIT_CREDIT_REWARDS = {
    chat: 1,
    cj: 3,
    post: 5,
    resource: 3
  };

  const AUDIT_CREDIT_PENALTIES = {
    chat: -3,
    cj: -5,
    post: -10,
    resource: -5
  };

  async function auditContent(content, type) {
    if (!content || typeof content !== 'string') {
      return { passed: false, reason: '内容为空' };
    }

    if (hasSensitiveContent(content)) {
      return { passed: false, reason: '包含敏感词' };
    }

    try {
      let modResult;
      switch (type) {
        case 'chat':
          modResult = await moderateChatMessage(content);
          break;
        case 'cj':
          modResult = await moderateContent(content, '这是CJ板块的课程内容');
          break;
        case 'post':
        case 'resource':
          modResult = await moderatePost(content, '');
          break;
        default:
          modResult = { decision: 'PASS', reason: '未知类型，默认通过' };
      }

      return {
        passed: modResult.decision === 'PASS',
        reason: modResult.reason || ''
      };
    } catch (error) {
      console.error('[auditContent] AI审核异常:', error);
      return { passed: true, reason: 'AI审核异常，默认通过' };
    }
  }

  function needsAIAudit(userLevel, type) {
    const level = Number(userLevel || 0);

    if (level >= 3) {
      return false;
    }

    switch (type) {
      case 'chat':
        return level <= 1;
      case 'cj':
        return level <= 1;
      case 'post':
        return level <= 2;
      case 'resource':
        return level <= 2;
      default:
        return false;
    }
  }

  async function withdrawContent(type, id) {
    const itemId = Number(id);
    if (!itemId || itemId <= 0) {
      return false;
    }

    switch (type) {
      case 'chat':
        await query.run(
          'UPDATE chat_messages SET status = ?, is_rejected = 1, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['withdrawn', itemId]
        );
        return true;
      case 'cj':
        await query.run(
          'UPDATE board_sections SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          ['[此内容已被撤回]', itemId]
        );
        return true;
      case 'post':
        await query.run(
          "UPDATE posts SET review_status = ?, status = 'hidden' WHERE id = ?",
          ['withdrawn', itemId]
        );
        return true;
      case 'resource':
        await query.run(
          "UPDATE resources SET status = 'withdrawn' WHERE id = ?",
          [itemId]
        );
        return true;
      default:
        return false;
    }
  }

  async function applyContentCredit(userId, type, approved) {
    const creditType = type === 'cj' ? 'cj' : type;
    const delta = approved
      ? (AUDIT_CREDIT_REWARDS[creditType] || 0)
      : (AUDIT_CREDIT_PENALTIES[creditType] || 0);

    if (delta === 0) {
      return { credit: 0, delta: 0, skipped: true };
    }

    const reason = approved
      ? `${getContentTypeName(type)}审核通过奖励`
      : `${getContentTypeName(type)}审核失败扣减`;

    return changeCredit(userId, delta, reason, null);
  }

  function getContentTypeName(type) {
    const names = {
      chat: '聊天消息',
      cj: 'CJ内容',
      post: '文章',
      resource: '资源'
    };
    return names[type] || '内容';
  }

  async function getUserProfile(userId) {
    return query.get(`
      SELECT users.id, users.email, users.name, users.grade, users.role, users.role_level, users.created_at,
             users.banned_until, users.muted_until,
             COALESCE(user_credit.credit, 0) AS credit,
             user_credit.last_login_date,
             roles.name AS role_name,
             roles.badge_color AS badge_color,
             roles.is_admin AS is_admin
      FROM users
      LEFT JOIN user_credit ON user_credit.user_id = users.id
      LEFT JOIN roles ON roles.level = users.role_level
      WHERE users.id = ?
    `, [userId]);
  }

  async function getDailyStats(userId) {
    const today = currentDateKey();
    let stats = await query.get(
      'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
      [userId, today]
    );

    if (!stats) {
      await query.run(
        `INSERT OR IGNORE INTO daily_stats (user_id, stat_date, posts_count, chat_count, cj_count, resource_count, login_credit_received, credit_capped)
         VALUES (?, ?, 0, 0, 0, 0, 0, 0)`,
        [userId, today]
      );
      stats = await query.get(
        'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
        [userId, today]
      );
    }

    return stats;
  }

  async function checkDailyLimit(user, type) {
    const userLevel = getUserLevel(user);
    const roleInfo = await query.get('SELECT daily_post_limit FROM roles WHERE level = ?', [userLevel]);

    if (!roleInfo || userLevel >= 6 || userLevel === 55) {
      return { allowed: true, limit: -1, current: 0 };
    }

    const stats = await getDailyStats(user.id);
    const fieldMap = {
      post: 'posts_count',
      chat: 'chat_count',
      cj: 'cj_count',
      resource: 'resource_count'
    };

    const field = fieldMap[type];
    if (!field) {
      return { allowed: false, limit: 0, current: 0 };
    }

    const current = Number(stats[field]) || 0;
    const limit = Number(roleInfo.daily_post_limit) || 0;

    return {
      allowed: current < limit,
      limit,
      current
    };
  }

  async function incrementDailyCount(userId, type) {
    const today = currentDateKey();
    const fieldMap = {
      post: 'posts_count',
      chat: 'chat_count',
      cj: 'cj_count',
      resource: 'resource_count'
    };

    const field = fieldMap[type];
    if (!field) {
      return;
    }

    await query.run(
      `INSERT INTO daily_stats (user_id, stat_date, ${field})
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, stat_date) DO UPDATE SET ${field} = ${field} + 1`,
      [userId, today]
    );
  }

  async function applyDailyLoginCredit(userId) {
    const user = await query.get('SELECT role_level FROM users WHERE id = ?', [userId]);
    if (!user) {
      return false;
    }

    const roleInfo = await query.get('SELECT login_credit FROM roles WHERE level = ?', [user.role_level]);
    const loginCreditAmount = roleInfo ? Number(roleInfo.login_credit) : 0;

    if (loginCreditAmount <= 0) {
      return false;
    }

    const creditRow = await ensureCreditRecord(userId);
    const today = currentDateKey();

    if (creditRow.last_login_date === today) {
      return false;
    }

    const userLevel = getUserLevel(user);
    const creditCapInfo = await query.get('SELECT max_credit FROM roles WHERE level = ?', [userLevel]);
    const creditCap = creditCapInfo && creditCapInfo.max_credit >= 0 ? Number(creditCapInfo.max_credit) : -1;

    let actualCredit = loginCreditAmount;
    let capped = false;

    if (creditCap >= 0 && creditRow.credit >= creditCap) {
      actualCredit = 0;
      capped = true;
    } else if (creditCap >= 0 && creditRow.credit + loginCreditAmount > creditCap) {
      actualCredit = Math.max(0, creditCap - creditRow.credit);
      capped = actualCredit === 0;
    }

    await query.run(
      'UPDATE user_credit SET last_login_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [today, userId]
    );

    if (actualCredit > 0) {
      await changeCredit(userId, actualCredit, '每日登录奖励', null);
    }

    const todayStats = await getDailyStats(userId);
    await query.run(
      'UPDATE daily_stats SET login_credit_received = ?, credit_capped = ? WHERE user_id = ? AND stat_date = ?',
      [loginCreditAmount, capped ? 1 : 0, userId, today]
    );

    return true;
  }

  async function checkCreditCap(user) {
    const userLevel = getUserLevel(user);
    const creditCapInfo = await query.get('SELECT max_credit FROM roles WHERE level = ?', [userLevel]);
    const creditCap = creditCapInfo && creditCapInfo.max_credit >= 0 ? Number(creditCapInfo.max_credit) : -1;

    if (creditCap < 0) {
      return { capped: false, excess: 0 };
    }

    const creditRow = await ensureCreditRecord(user.id);
    const currentCredit = Number(creditRow.credit) || 0;

    if (currentCredit <= creditCap) {
      return { capped: false, excess: 0 };
    }

    const excessCredit = currentCredit - creditCap;

    const existingCap = await query.get('SELECT * FROM credit_caps WHERE user_id = ?', [user.id]);
    if (!existingCap) {
      await query.run(
        'INSERT INTO credit_caps (user_id, excess_credit, released_at) VALUES (?, ?, NULL)',
        [user.id, excessCredit]
      );
    } else {
      await query.run(
        'UPDATE credit_caps SET excess_credit = ? WHERE user_id = ?',
        [excessCredit, user.id]
      );
    }

    return { capped: true, excess: excessCredit };
  }

  async function getSupercodeLock(email) {
    const record = await query.get('SELECT * FROM supercode_lockouts WHERE email = ?', [email]);
    if (!record) {
      return null;
    }
    if (record.locked_until && parseDateValue(record.locked_until) > new Date()) {
      return record;
    }
    return null;
  }

  async function clearSupercodeLock(email) {
    await query.run('DELETE FROM supercode_lockouts WHERE email = ?', [email]);
  }

  async function checkIpBan(req, res, next) {
    const ip = req.headers['x-forwarded-for']
      ? String(req.headers['x-forwarded-for']).split(',')[0].trim()
      : (req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');

    if (!ip) {
      next();
      return;
    }

    const banRecord = await query.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ip]);

    if (banRecord) {
      if (banRecord.expires_at && parseDateValue(banRecord.expires_at) > new Date()) {
        const remainingMinutes = Math.ceil((parseDateValue(banRecord.expires_at) - new Date()) / 60000);
        res.status(403).json({
          error: 'IP已被封禁',
          reason: banRecord.reason,
          remainingMinutes
        });
        return;
      }

      await query.run('DELETE FROM ip_bans WHERE ip_address = ?', [ip]);
    }

    next();
  }

  async function checkUserBan(req, res, next) {
    if (!req.user) {
      next();
      return;
    }

    const banRecord = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [req.user.id]);

    if (banRecord) {
      if (banRecord.expires_at && parseDateValue(banRecord.expires_at) > new Date()) {
        const remainingMinutes = Math.ceil((parseDateValue(banRecord.expires_at) - new Date()) / 60000);
        res.status(403).json({
          error: '账号已被封禁',
          reason: banRecord.reason,
          remainingMinutes
        });
        return;
      }

      await query.run('DELETE FROM user_bans WHERE user_id = ?', [req.user.id]);
    }

    next();
  }

  async function banIp(ip, reason, createdBy) {
    const now = new Date();
    const existingBan = await query.get('SELECT * FROM ip_bans WHERE ip_address = ?', [ip]);

    if (existingBan) {
      const bannedAt = parseDateValue(existingBan.banned_at);
      const hoursSinceBan = (now - bannedAt) / (1000 * 60 * 60);

      if (hoursSinceBan > 24) {
        await query.run(
          'UPDATE ip_bans SET fail_count = 0, banned_at = ?, expires_at = ?, reason = ?, created_by = ? WHERE ip_address = ?',
          [now.toISOString(), null, reason, createdBy, ip]
        );
        return { success: true, newBanCount: 0, duration: null };
      }

      const newFailCount = existingBan.fail_count + 1;
      let durationMinutes;

      if (newFailCount >= 30) {
        durationMinutes = 6 * 60;
      } else if (newFailCount >= 3) {
        durationMinutes = 6 * 60;
      } else if (newFailCount === 2) {
        durationMinutes = 30;
      } else {
        durationMinutes = 5;
      }

      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      await query.run(
        'UPDATE ip_bans SET fail_count = ?, banned_at = ?, expires_at = ?, reason = ?, created_by = ? WHERE ip_address = ?',
        [newFailCount, now.toISOString(), expiresAt.toISOString(), reason, createdBy, ip]
      );

      return { success: true, newBanCount: newFailCount, duration: durationMinutes };
    }

    await query.run(
      'INSERT INTO ip_bans (ip_address, reason, fail_count, banned_at, expires_at, created_by) VALUES (?, ?, 1, ?, ?, ?)',
      [ip, reason, now.toISOString(), null, createdBy]
    );

    return { success: true, newBanCount: 0, duration: null };
  }

  async function banUser(userId, reason, createdBy) {
    const now = new Date();
    const existingBan = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    if (existingBan) {
      const bannedAt = parseDateValue(existingBan.banned_at);
      const hoursSinceBan = (now - bannedAt) / (1000 * 60 * 60);

      if (hoursSinceBan > 24) {
        await query.run(
          'UPDATE user_bans SET ban_count = 0, banned_at = ?, expires_at = ?, reason = ?, created_by = ? WHERE user_id = ?',
          [now.toISOString(), null, reason, createdBy, userId]
        );
        return { success: true, newBanCount: 0, duration: null };
      }

      const newBanCount = existingBan.ban_count + 1;
      let durationMinutes;

      if (newBanCount === 1) {
        durationMinutes = 1;
      } else if (newBanCount === 2) {
        durationMinutes = 10;
      } else {
        durationMinutes = 60;
      }

      const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
      await query.run(
        'UPDATE user_bans SET ban_count = ?, banned_at = ?, expires_at = ?, reason = ?, created_by = ? WHERE user_id = ?',
        [newBanCount, now.toISOString(), expiresAt.toISOString(), reason, createdBy, userId]
      );

      await query.run('UPDATE users SET banned_until = ? WHERE id = ?', [expiresAt.toISOString(), userId]);

      return { success: true, newBanCount, duration: durationMinutes };
    }

    await query.run(
      'INSERT INTO user_bans (user_id, reason, ban_count, banned_at, expires_at, created_by) VALUES (?, ?, 1, ?, ?, ?)',
      [userId, reason, now.toISOString(), null, createdBy]
    );

    return { success: true, newBanCount: 0, duration: null };
  }

  async function unbanIp(ip) {
    await query.run('DELETE FROM ip_bans WHERE ip_address = ?', [ip]);
  }

  async function unbanUser(userId) {
    await query.run('DELETE FROM user_bans WHERE user_id = ?', [userId]);
    await query.run('UPDATE users SET banned_until = NULL WHERE id = ?', [userId]);
  }

  async function autoUnbanOnLogin(userId) {
    const banRecord = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    if (banRecord && banRecord.expires_at) {
      if (parseDateValue(banRecord.expires_at) <= new Date()) {
        await unbanUser(userId);
        return true;
      }
    }

    return false;
  }

  async function bumpSupercodeFailure(email) {
    const current = await query.get('SELECT * FROM supercode_lockouts WHERE email = ?', [email]);
    const nextCount = (current ? current.failed_count : 0) + 1;
    const lockedUntil = nextCount >= 5 ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null;
    await query.run(
      `INSERT INTO supercode_lockouts (email, failed_count, locked_until)
       VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET failed_count = excluded.failed_count, locked_until = excluded.locked_until`,
      [email, nextCount, lockedUntil]
    );
  }

  function loadSupercodeValue() {
    const configFile = path.join(rootDir, 'server', 'config', 'supercode.ts');
    if (!fs.existsSync(configFile)) {
      return '';
    }
    const source = fs.readFileSync(configFile, 'utf8');
    const encrypted = (source.match(/encrypted:\s*'([^']+)'/) || [])[1];
    const secret = (source.match(/secret:\s*'([^']+)'/) || [])[1];
    const iv = (source.match(/iv:\s*'([^']+)'/) || [])[1];
    if (!encrypted || !secret || !iv) {
      return '';
    }
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      crypto.createHash('sha256').update(secret).digest(),
      Buffer.from(iv, 'hex')
    );
    return `${decipher.update(encrypted, 'hex', 'utf8')}${decipher.final('utf8')}`;
  }

  async function createReviewItem(itemType, itemId, userId) {
    const result = await query.run(
      'INSERT INTO review_items (item_type, item_id, created_by) VALUES (?, ?, ?)',
      [itemType, itemId, userId]
    );
    return result.lastID;
  }

  async function countDailyActions(userId, tableName) {
    const row = await query.get(
      `SELECT COUNT(*) AS count FROM ${tableName} WHERE created_by = ? AND date(created_at) = date('now', 'localtime')`,
      [userId]
    );
    return row ? row.count : 0;
  }

  async function countDailyChatSubmissions(userId) {
    const row = await query.get(
      `SELECT COUNT(*) AS count FROM chat_messages WHERE user_id = ? AND date(created_at) = date('now', 'localtime')`,
      [userId]
    );
    return row ? row.count : 0;
  }

  async function getBoardById(boardId) {
    return query.get('SELECT * FROM boards WHERE id = ?', [boardId]);
  }

  async function getBoardBySlug(slug) {
    return query.get('SELECT * FROM boards WHERE slug = ?', [slug]);
  }

  async function getBoards(dateStr = null) {
    let sections;
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = ?
        ORDER BY board_sections.board_id, board_sections.section
      `, [dateStr]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.board_id, board_sections.section
      `);
    }

    const boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');
    const sectionMap = new Map();

    sections.forEach((section) => {
      if (!sectionMap.has(section.board_id)) {
        sectionMap.set(section.board_id, {});
      }

      sectionMap.get(section.board_id)[section.section] = section;
    });

    return boards.map((board) => ({
      ...board,
      sections: sectionMap.get(board.id) || {}
    }));
  }

  async function getDashboardData(user, dateStr = null) {
    const boards = await getBoards(dateStr);
    const statsRows = await Promise.all([
      query.get('SELECT COUNT(*) AS count FROM exams'),
      query.get('SELECT COUNT(*) AS count FROM homeworks'),
      query.get("SELECT COUNT(*) AS count FROM resources WHERE status = 'approved'"),
      query.get('SELECT COUNT(*) AS count FROM posts')
    ]);

    const upcomingExams = await query.all(`
      SELECT exams.*, boards.name AS board_name, boards.slug AS board_slug
      FROM exams
      JOIN boards ON boards.id = exams.board_id
      ORDER BY datetime(exam_date) ASC
      LIMIT 6
    `);

    const dueHomeworks = await query.all(`
      SELECT homeworks.*, boards.name AS board_name, boards.slug AS board_slug,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      JOIN boards ON boards.id = homeworks.board_id
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
      LIMIT 6
    `, [user ? user.id : -1]);

    const recentPosts = await query.all(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      WHERE posts.review_status = 'approved'
      GROUP BY posts.id
      ORDER BY datetime(posts.created_at) DESC
      LIMIT 6
    `);

    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      WHERE resources.status = 'approved'
      ORDER BY datetime(resources.created_at) DESC
      LIMIT 6
    `);

    const chatMessages = await query.all(`
      SELECT chat_messages.*, users.name AS author_name
      FROM chat_messages
      JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.status IN ('approved', 'visible_pending') AND chat_messages.is_rejected = 0
      AND datetime(chat_messages.created_at) > datetime('now', '-24 hours')
      ORDER BY datetime(chat_messages.created_at) ASC
      LIMIT 8
    `);

    return {
      boards,
      stats: {
        exams: statsRows[0].count,
        homeworks: statsRows[1].count,
        resources: statsRows[2].count,
        posts: statsRows[3].count
      },
      upcomingExams,
      dueHomeworks,
      recentPosts,
      resources,
      chatMessages
    };
  }

  async function getForumPosts(filters = {}) {
    const conditions = [];
    const params = [];

    conditions.push("posts.review_status = 'approved'");

    if (filters.subject) {
      conditions.push('boards.slug = ?');
      params.push(filters.subject);
    }

    if (filters.query) {
      conditions.push('(posts.title LIKE ? OR posts.content LIKE ?)');
      params.push(`%${filters.query}%`, `%${filters.query}%`);
    }

    if (filters.type) {
      conditions.push('posts.post_type = ?');
      params.push(filters.type);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = filters.sort === 'hot'
      ? 'comment_count DESC, posts.view_count DESC, datetime(posts.updated_at) DESC'
      : 'datetime(posts.created_at) DESC';

    return query.all(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      ${whereClause}
      GROUP BY posts.id
      ORDER BY ${orderBy}
    `, params);
  }

  async function getPostDetail(postId) {
    const post = await query.get(`
      SELECT posts.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS author_name, users.email AS author_email
      FROM posts
      JOIN boards ON boards.id = posts.board_id
      JOIN users ON users.id = posts.user_id
      WHERE posts.id = ?
    `, [postId]);

    if (!post) {
      return null;
    }

    const comments = await query.all(`
      SELECT comments.*, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.post_id = ?
      ORDER BY comments.is_best DESC, datetime(comments.created_at) ASC
    `, [postId]);

    return { post, comments };
  }

  async function getBoardDetail(slug, user, dateStr = null) {
    const board = await getBoardBySlug(slug);

    if (!board) {
      return null;
    }

    let sections;
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.board_id = ? AND board_sections.section_date = ?
        ORDER BY board_sections.section
      `, [board.id, dateStr]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.board_id = ? AND board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.section
      `, [board.id]);
    }

    const sectionMap = {};
    sections.forEach((section) => {
      sectionMap[section.section] = section;
    });

    const exams = await query.all(`
      SELECT * FROM exams
      WHERE board_id = ?
      ORDER BY datetime(exam_date) ASC
      LIMIT 8
    `, [board.id]);

    const homeworks = await query.all(`
      SELECT homeworks.*,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      WHERE homeworks.board_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
      LIMIT 8
    `, [user ? user.id : -1, board.id]);

    const resources = await query.all(`
      SELECT resources.*, users.name AS uploader_name
      FROM resources
      LEFT JOIN users ON users.id = resources.uploaded_by
      WHERE resources.board_id = ?
        AND (resources.status = 'approved' OR resources.uploaded_by = ?)
      ORDER BY datetime(resources.created_at) DESC
      LIMIT 8
    `, [board.id, user ? user.id : -1]);

    const posts = await query.all(`
      SELECT posts.*, users.name AS author_name,
             COUNT(comments.id) AS comment_count
      FROM posts
      JOIN users ON users.id = posts.user_id
      LEFT JOIN comments ON comments.post_id = posts.id
      WHERE posts.board_id = ?
      GROUP BY posts.id
      ORDER BY datetime(posts.created_at) DESC
      LIMIT 8
    `, [board.id]);

    return {
      board,
      sections: sectionMap,
      exams,
      homeworks,
      resources,
      posts
    };
  }

  async function searchAll(term) {
    const keyword = `%${term}%`;

    const [posts, resources, exams, homeworks, sections] = await Promise.all([
      query.all(`
        SELECT posts.id, posts.title, posts.post_type, boards.name AS board_name
        FROM posts
        JOIN boards ON boards.id = posts.board_id
        WHERE posts.title LIKE ? OR posts.content LIKE ?
        ORDER BY datetime(posts.updated_at) DESC
        LIMIT 8
      `, [keyword, keyword]),
      query.all(`
        SELECT resources.id, resources.title, boards.name AS board_name, resources.status
        FROM resources
        JOIN boards ON boards.id = resources.board_id
        WHERE resources.status = 'approved'
          AND (resources.title LIKE ? OR resources.description LIKE ? OR resources.teacher LIKE ?)
        ORDER BY datetime(resources.created_at) DESC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT exams.id, exams.title, exams.exam_type, exams.exam_date, boards.name AS board_name
        FROM exams
        JOIN boards ON boards.id = exams.board_id
        WHERE exams.title LIKE ? OR exams.description LIKE ? OR exams.teacher LIKE ?
        ORDER BY datetime(exams.exam_date) ASC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT homeworks.id, homeworks.title, homeworks.deadline, boards.name AS board_name
        FROM homeworks
        JOIN boards ON boards.id = homeworks.board_id
        WHERE homeworks.title LIKE ? OR homeworks.content LIKE ? OR homeworks.teacher LIKE ?
        ORDER BY datetime(homeworks.deadline) ASC
        LIMIT 8
      `, [keyword, keyword, keyword]),
      query.all(`
        SELECT boards.slug, boards.name, board_sections.section, board_sections.title
        FROM board_sections
        JOIN boards ON boards.id = board_sections.board_id
        WHERE board_sections.title LIKE ? OR board_sections.content LIKE ?
        ORDER BY boards.sort_order ASC
        LIMIT 8
      `, [keyword, keyword])
    ]);

    return {
      posts,
      resources,
      exams,
      homeworks,
      sections
    };
  }

  function wantsJson(req) {
    return req.path.startsWith('/api/');
  }

  function respondError(req, res, statusCode, message) {
    if (wantsJson(req)) {
      res.status(statusCode).json({ error: message });
      return;
    }

    if (statusCode >= 500) {
      res.status(statusCode).render('login', {
        pageTitle: '系统错误',
        formMode: null,
        errors: [message]
      });
      return;
    }

    setFlash(req, 'error', message);
    res.redirect('back');
  }

  function requireAuth(req, res, next) {
    if (!req.user) {
      if (wantsJson(req)) {
        res.status(401).json({ error: '请先登录' });
        return;
      }

      setFlash(req, 'error', '请先登录后再继续');
      res.redirect('/login');
      return;
    }

    next();
  }

  function requireStaff(req, res, next) {
    if (!isStaff(req.user)) {
      respondError(req, res, 403, '当前账号没有该操作权限');
      return;
    }

    next();
  }

  function requireLevel(level) {
    return function guard(req, res, next) {
      const userLv = getUserLevel(req.user);
      let hasAccess = false;
      if (level <= 5) {
        hasAccess = userLv >= level || userLv === 55;
      } else {
        hasAccess = userLv === 6;
      }
      if (!hasAccess) {
        respondError(req, res, 403, '当前账号没有该操作权限');
        return;
      }
      next();
    };
  }

  const rateLimiterState = new Map();

  function rateLimit({ windowMs, max, keyPrefix }) {
    return async function limiter(req, res, next) {
      const userId = req.user ? req.user.id : null;
      const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '');
      const routeKey = `${keyPrefix}:${req.method}:${req.path}`;
      const identity = userId ? `u:${userId}` : `ip:${ip}`;
      const key = `${routeKey}:${identity}`;
      const now = Date.now();
      const entry = rateLimiterState.get(key) || { count: 0, startAt: now };

      if (now - entry.startAt > windowMs) {
        entry.count = 0;
        entry.startAt = now;
      }

      entry.count += 1;
      rateLimiterState.set(key, entry);

      if (entry.count > max) {
        await query.run('INSERT INTO rate_limit_log (user_id, ip, route) VALUES (?, ?, ?)', [userId, ip, routeKey]);
        res.status(429).json({ error: '请求过于频繁，请稍后再试' });
        return;
      }

      next();
    };
  }

  app.set('view engine', 'ejs');
  app.set('views', path.join(rootDir, 'views'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(publicDir));
  app.use('/locales', express.static(path.join(__dirname, 'server', 'locales')));
  app.use('/uploads', express.static(uploadDir));
  app.use(session({
    store: new SQLiteStore({
      db: 'sessions.db',
      dir: sessionDir,
      concurrentDB: true
    }),
    secret: process.env.SESSION_SECRET || 'development-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    }
  }));

  app.locals.renderMarkdown = renderMarkdown;
  app.locals.excerpt = excerpt;
  app.locals.extractFirstImageUrl = extractFirstImageUrl;
  app.locals.formatDate = formatDate;
  app.locals.buildCountdown = buildCountdown;
  app.locals.isStaff = isStaff;

  app.use(checkIpBan);

  app.use(async (req, res, next) => {
    try {
      const flash = req.session.flash || null;
      delete req.session.flash;

      req.user = null;

      if (req.session.userId) {
        req.user = await query.get(`
          SELECT users.id, users.email, users.name, users.grade, users.role, users.role_level, users.created_at,
                 COALESCE(user_credit.credit, 0) AS credit,
                 roles.name AS role_name,
                 roles.badge_color AS badge_color,
                 roles.is_admin AS is_admin
          FROM users
          LEFT JOIN user_credit ON user_credit.user_id = users.id
          LEFT JOIN roles ON roles.level = users.role_level
          WHERE users.id = ?
        `, [req.session.userId]);
      }

      res.locals.user = req.user;
      res.locals.flash = flash;
      res.locals.currentPath = req.path;
      res.locals.locale = req.query.locale || 'zh';
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use(checkUserBan);

  app.get('/', async (req, res) => {
    const dateStr = req.query.date || null;
    const dashboard = await getDashboardData(req.user, dateStr);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));

    let display = '今天';
    if (diffDays === 1) display = '昨天';
    else if (diffDays === 2) display = '前天';
    else if (diffDays > 2) display = dateStr;
    else if (diffDays < 0) display = dateStr;

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr;
    const isFuture = selectedDateObj.getTime() >= today.getTime();

    res.render('home', {
      pageTitle: '校园学习助手',
      homeStats: dashboard.stats,
      dateNavData: {
        display,
        prevDate,
        nextDate,
        isToday,
        isFuture
      },
      ...dashboard
    });
  });

  app.get('/review', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const userLevel = getUserLevel(req.user);

    let statusFilter = "status = 'pending'";
    if (userLevel === 3) {
      statusFilter = "status = 'pending' AND item_type = 'chat'";
    }

    const items = await query.all(`
      SELECT review_items.*,
             users.name AS author_name,
             reviewer.name AS reviewer_name
      FROM review_items
      JOIN users ON users.id = review_items.created_by
      LEFT JOIN users AS reviewer ON reviewer.id = review_items.reviewer_id
      WHERE ${statusFilter}
      ORDER BY datetime(review_items.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_items WHERE ${statusFilter}
    `);

    const appealsPage = Math.max(1, Number(req.query.appeals_page || 1));
    const appealsLimit = 20;
    const appealsOffset = (appealsPage - 1) * appealsLimit;

    let appealsFilter = "status = 'pending'";
    if (userLevel === 3) {
      appealsFilter = "status = 'pending' AND content_type = 'chat'";
    } else if (userLevel === 4) {
      appealsFilter = "status = 'pending' AND content_type IN ('chat', 'post')";
    }

    const appeals = await query.all(`
      SELECT review_appeals.*,
             users.name AS author_name
      FROM review_appeals
      JOIN users ON users.id = review_appeals.user_id
      WHERE ${appealsFilter}
      ORDER BY datetime(review_appeals.created_at) DESC
      LIMIT ? OFFSET ?
    `, [appealsLimit, appealsOffset]);

    const appealsCount = await query.get(`
      SELECT COUNT(*) AS total FROM review_appeals WHERE ${appealsFilter}
    `);

    res.render('review', {
      pageTitle: '审核面板',
      items,
      appeals,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      },
      appealsPagination: {
        page: appealsPage,
        totalPages: Math.ceil(appealsCount.total / appealsLimit),
        totalItems: appealsCount.total
      }
    });
  });

  app.get('/login', (req, res) => {
    res.render('login', {
      pageTitle: '登录',
      formMode: 'login',
      errors: []
    });
  });

  app.post('/api/register/send-code', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!validateEmail(email)) {
      res.status(400).json({ error: '请使用学校邮箱或 Gmail 邮箱注册' });
      return;
    }

    const exists = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) {
      res.status(400).json({ error: '该邮箱已注册' });
      return;
    }

    await sendVerificationEmail(email);
    res.json({ message: '验证码已发送' });
  });

  app.get('/register', (req, res) => {
    res.render('register', {
      pageTitle: '注册',
      formMode: 'register',
      errors: [],
      formData: {}
    });
  });

  app.post('/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const grade = String(req.body.grade || '').trim();
    const errors = [];

    if (!validateEmail(email)) {
      errors.push('请使用学校邮箱或 Gmail 邮箱注册');
    }

    if (name.length < 2) {
      errors.push('昵称至少需要 2 个字符');
    }

    if (!/^G(6|7|8|9|10|11|12)$/.test(grade)) {
      errors.push('年级仅支持 G6-G12');
    }

    if (password.length < 8) {
      errors.push('密码至少需要 8 位');
    }

    const confirmPassword = String(req.body.confirmPassword || '');
    if (password !== confirmPassword) {
      errors.push('两次输入的密码不一致');
    }

    const code = String(req.body.verificationCode || '').trim();
    if (!code) {
      errors.push('请输入验证码');
    } else {
      const codeRecord = await query.get(
        'SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expires_at > datetime("now") ORDER BY created_at DESC LIMIT 1',
        [email, code]
      );
      if (!codeRecord) {
        errors.push('验证码无效或已过期');
      }
    }

    const exists = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) {
      errors.push('该邮箱已注册');
    }

    if (errors.length) {
      if (wantsJson(req)) {
        res.status(400).json({ errors });
        return;
      }

      res.status(400).render('register', {
        pageTitle: '注册',
        formMode: 'register',
        errors,
        formData: { email, name, grade }
      });
      return;
    }

    const userCount = await query.get('SELECT COUNT(*) AS count FROM users');
    let roleLevel = 1;
    let role = 'student';

    if (userCount.count === 0) {
      roleLevel = 6;
      role = 'admin';
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query.run(
      'INSERT INTO users (email, name, grade, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?)',
      [email, name, grade, passwordHash, role, roleLevel]
    );

    await ensureCreditRecord(result.lastID);
    req.session.userId = result.lastID;

    if (wantsJson(req)) {
      const user = await getUserProfile(result.lastID);
      res.status(201).json({ user });
      return;
    }

    setFlash(req, 'success', role === 'admin' ? '已创建管理员账号并登录' : '注册成功，欢迎加入 BG Hub');
    res.redirect('/');
  });

  app.post('/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      if (wantsJson(req)) {
        res.status(401).json({ error: '邮箱或密码错误' });
        return;
      }

      res.status(401).render('login', {
        pageTitle: '登录',
        formMode: 'login',
        errors: ['邮箱或密码错误']
      });
      return;
    }

    if (user.banned_until && parseDateValue(user.banned_until) > new Date()) {
      if (wantsJson(req)) {
        res.status(403).json({ error: '账号已被封禁' });
        return;
      }

      res.status(403).render('login', {
        pageTitle: '登录',
        formMode: 'login',
        errors: ['账号已被封禁']
      });
      return;
    }

    req.session.userId = user.id;
    await autoUnbanOnLogin(user.id);
    await ensureCreditRecord(user.id);
    await applyDailyLoginCredit(user.id);

    if (wantsJson(req)) {
      res.json({ user: await getUserProfile(user.id) });
      return;
    }

    setFlash(req, 'success', `欢迎回来，${user.name}`);
    res.redirect('/');
  });

  app.post('/logout', (req, res) => {
    req.session.destroy(() => {
      if (wantsJson(req)) {
        res.json({ ok: true });
        return;
      }

      res.redirect('/');
    });
  });

  app.get('/forum', async (req, res) => {
    const boards = await getBoards();
    const posts = await getForumPosts({
      query: String(req.query.q || '').trim(),
      subject: String(req.query.subject || '').trim(),
      sort: String(req.query.sort || 'latest').trim(),
      type: String(req.query.type || '').trim()
    });

    res.render('forum', {
      pageTitle: '互助广场',
      boards,
      posts,
      filters: {
        q: String(req.query.q || '').trim(),
        subject: String(req.query.subject || '').trim(),
        sort: String(req.query.sort || 'latest').trim(),
        type: String(req.query.type || '').trim()
      }
    });
  });

  app.get('/forum/new', requireAuth, async (req, res) => {
    const boards = await getBoards();
    res.render('forum-form', {
      pageTitle: '发布帖子',
      boards,
      mode: 'create',
      post: null,
      errors: []
    });
  });

  app.get('/forum/:id/edit', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限编辑');
      return;
    }

    const boards = await getBoards();
    res.render('forum-form', {
      pageTitle: '编辑帖子',
      boards,
      mode: 'edit',
      post: detail.post,
      errors: []
    });
  });

  async function createOrUpdatePost(req, res, mode) {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const boardId = Number(req.body.board_id || 0);
    const postType = String(req.body.post_type || 'question').trim();
    const isAnonymous = req.body.is_anonymous ? 1 : 0;
    const errors = [];
    const boards = await getBoards();
    const board = await getBoardById(boardId);

    if (!board) {
      errors.push('请选择有效的学科板块');
    }

    if (title.length < 4) {
      errors.push('标题至少需要 4 个字符');
    }

    if (content.length < 10) {
      errors.push('正文至少需要 10 个字符');
    }

    if (!['question', 'note', 'share'].includes(postType)) {
      errors.push('帖子类型不合法');
    }

    let existingPost = null;

    if (mode === 'edit') {
      existingPost = await getPostDetail(req.params.id);
      if (!existingPost || !canManagePost(req.user, existingPost.post)) {
        respondError(req, res, 404, '帖子不存在或没有权限编辑');
        return;
      }
    }

    if (errors.length) {
      if (wantsJson(req)) {
        res.status(400).json({ errors });
        return;
      }

      res.status(400).render('forum-form', {
        pageTitle: mode === 'edit' ? '编辑帖子' : '发布帖子',
        boards,
        mode,
        post: mode === 'edit'
          ? { ...existingPost.post, title, content, board_id: boardId, post_type: postType, is_anonymous: isAnonymous }
          : { title, content, board_id: boardId, post_type: postType, is_anonymous: isAnonymous },
        errors
      });
      return;
    }

    if (mode === 'edit') {
      await query.run(`
        UPDATE posts
        SET board_id = ?, title = ?, content = ?, post_type = ?, is_anonymous = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [boardId, title, content, postType, isAnonymous, req.params.id]);

      if (wantsJson(req)) {
        const detail = await getPostDetail(req.params.id);
        res.json({ post: detail.post });
        return;
      }

      setFlash(req, 'success', '帖子已更新');
      res.redirect(`/forum/${req.params.id}`);
      return;
    }

    if (needsAIAudit(getUserLevel(req.user), 'post')) {
      const auditResult = await auditContent(`${title}\n\n${content}`, 'post');
      if (!auditResult.passed) {
        if (wantsJson(req)) {
          res.status(403).json({ errors: [`内容违规：${auditResult.reason}`] });
          return;
        }
        res.status(403).render('forum-form', {
          pageTitle: '发布帖子',
          boards,
          mode: 'create',
          post: { title, content, board_id: boardId, post_type: postType, is_anonymous: isAnonymous },
          errors: [`内容违规：${auditResult.reason}`]
        });
        return;
      }
      await applyContentCredit(req.user.id, 'post', true);
    }

    const reviewStatus = getUserLevel(req.user) >= 2 ? 'approved' : 'pending';
    const result = await query.run(`
      INSERT INTO posts (board_id, title, content, post_type, is_anonymous, user_id, review_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, postType, isAnonymous, req.user.id, reviewStatus]);

    if (reviewStatus !== 'approved') {
      await createReviewItem('post', result.lastID, req.user.id);
    }

    if (wantsJson(req)) {
      const detail = await getPostDetail(result.lastID);
      res.status(201).json({ post: detail.post });
      return;
    }

    setFlash(req, 'success', reviewStatus === 'approved' ? '帖子已发布' : '帖子已提交审核');
    res.redirect(`/forum/${result.lastID}`);
  }

  app.post('/forum/posts', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'create');
  });

  app.post('/forum/:id/edit', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'edit');
  });

  app.get('/forum/:id', async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    if (detail.post.review_status !== 'approved' && !(req.user && (req.user.id === detail.post.user_id || isStaff(req.user)))) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    await query.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [req.params.id]);
    const boards = await getBoards();
    res.render('forum-detail', {
      pageTitle: detail.post.title,
      boards,
      post: {
        ...detail.post,
        view_count: detail.post.view_count + 1
      },
      comments: detail.comments
    });
  });

  app.post('/forum/:id/comments', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      respondError(req, res, 404, '帖子不存在');
      return;
    }

    if (content.length < 2) {
      respondError(req, res, 400, '回复内容至少需要 2 个字符');
      return;
    }

    const result = await query.run(`
      INSERT INTO comments (post_id, content, user_id)
      VALUES (?, ?, ?)
    `, [req.params.id, content, req.user.id]);

    if (wantsJson(req)) {
      const comment = await query.get(`
        SELECT comments.*, users.name AS author_name
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE comments.id = ?
      `, [result.lastID]);
      res.status(201).json({ comment });
      return;
    }

    setFlash(req, 'success', '回复已发布');
    res.redirect(`/forum/${req.params.id}`);
  });

  app.post('/forum/:postId/comments/:commentId/best', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.postId);

    if (!detail || !canMarkBestAnswer(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限操作');
      return;
    }

    await query.run('UPDATE comments SET is_best = 0 WHERE post_id = ?', [req.params.postId]);
    await query.run('UPDATE comments SET is_best = 1 WHERE id = ? AND post_id = ?', [req.params.commentId, req.params.postId]);
    setFlash(req, 'success', '已设置为最佳答案');
    res.redirect(`/forum/${req.params.postId}`);
  });

  app.post('/forum/:id/delete', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      respondError(req, res, 404, '帖子不存在或没有权限删除');
      return;
    }

    await query.run('DELETE FROM posts WHERE id = ?', [req.params.id]);

    if (wantsJson(req)) {
      res.json({ ok: true });
      return;
    }

    setFlash(req, 'success', '帖子已删除');
    res.redirect('/forum');
  });

  app.get('/boards', requireAuth, requireLevel(4), async (req, res) => {
    const boards = await getBoards();
    res.render('boards', {
      pageTitle: 'CJ 管理',
      currentPath: '/boards',
      boards,
      user: req.user
    });
  });

  app.get('/boards/:slug', async (req, res) => {
    const dateStr = req.query.date || null;
    const detail = await getBoardDetail(req.params.slug, req.user, dateStr);

    if (!detail) {
      respondError(req, res, 404, '学科板块不存在');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));

    let display = '今天';
    if (diffDays === 1) display = '昨天';
    else if (diffDays === 2) display = '前天';
    else if (diffDays > 2) display = dateStr;
    else if (diffDays < 0) display = dateStr;

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr || dateStr === todayStr;
    const isFuture = selectedDateObj.getTime() >= today.getTime();

    res.render('board', {
      pageTitle: `${detail.board.name} CJ`,
      detail,
      sectionTitles,
      sectionTitlesEn,
      dateNavData: {
        display,
        prevDate,
        nextDate,
        isToday: isToday && !dateStr,
        isFuture: isFuture
      }
    });
  });

  app.post('/boards/:slug/sections', requireAuth, async (req, res) => {
    const detail = await getBoardDetail(req.params.slug, req.user);

    if (!detail) {
      respondError(req, res, 404, '学科板块不存在');
      return;
    }

    if (!isStaff(req.user)) {
      respondError(req, res, 403, '当前仅管理员或审核员可维护 CJ 结构化内容');
      return;
    }

    const section = String(req.body.section || '').trim();
    const title = String(req.body.title || sectionTitles[section] || '').trim();
    const content = String(req.body.content || '').trim();
    const sectionDate = String(req.body.date || "date('now', 'localtime')").trim();

    if (!sectionTitles[section]) {
      respondError(req, res, 400, 'CJ 分区不合法');
      return;
    }

    if (needsAIAudit(req.user.role_level, 'cj')) {
      const auditResult = await auditContent(content, 'cj');
      if (!auditResult.passed) {
        respondError(req, res, 403, `内容违规：${auditResult.reason}`);
        return;
      }
      await applyContentCredit(req.user.id, 'cj', true);
    }

    if (sectionDate === "date('now', 'localtime')") {
      await query.run(`
        INSERT INTO board_sections (board_id, section, section_date, title, content, updated_by, updated_at)
        VALUES (?, ?, date('now', 'localtime'), ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(board_id, section, section_date)
        DO UPDATE SET title = excluded.title, content = excluded.content, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [detail.board.id, section, title || sectionTitles[section], content, req.user.id]);
    } else {
      await query.run(`
        INSERT INTO board_sections (board_id, section, section_date, title, content, updated_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(board_id, section, section_date)
        DO UPDATE SET title = excluded.title, content = excluded.content, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP
      `, [detail.board.id, section, sectionDate, title || sectionTitles[section], content, req.user.id]);
    }

    setFlash(req, 'success', `${sectionTitles[section]} 已更新`);
    res.redirect(`/boards/${req.params.slug}`);
  });

  app.get('/chat', async (req, res) => {
    await query.run(`
      DELETE FROM chat_messages
      WHERE datetime(created_at) < datetime('now', '-24 hours')
      AND is_rejected = 1
    `);

    const chatMessages = await query.all(`
      SELECT chat_messages.*, users.name AS author_name
      FROM chat_messages
      JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.status IN ('approved', 'visible_pending') AND chat_messages.is_rejected = 0
      AND datetime(chat_messages.created_at) > datetime('now', '-24 hours')
      ORDER BY datetime(chat_messages.created_at) ASC
    `);

    res.render('chat', {
      pageTitle: '聊天',
      currentPath: '/chat',
      chatMessages
    });
  });

  app.get('/homeworks', (req, res) => {
    res.redirect('/');
  });

  app.post('/homeworks', requireAuth, requireStaff, async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const deadline = String(req.body.deadline || '').trim();
    const attachmentUrl = String(req.body.attachment_url || '').trim();
    const board = await getBoardById(boardId);

    if (!board || !title || !content || !deadline) {
      respondError(req, res, 400, '作业信息不完整');
      return;
    }

    await query.run(`
      INSERT INTO homeworks (board_id, title, content, teacher, deadline, attachment_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, teacher, deadline, attachmentUrl, req.user.id]);

    if (wantsJson(req)) {
      res.status(201).json({ ok: true });
      return;
    }

    setFlash(req, 'success', '作业已创建');
    res.redirect('/homeworks');
  });

  app.post('/homeworks/:id/toggle', requireAuth, async (req, res) => {
    const homework = await query.get('SELECT * FROM homeworks WHERE id = ?', [req.params.id]);

    if (!homework) {
      respondError(req, res, 404, '作业不存在');
      return;
    }

    const existing = await query.get(`
      SELECT * FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (existing && existing.is_completed === 1) {
      await query.run(`
        UPDATE homework_statuses
        SET is_completed = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [existing.id]);
    } else if (existing) {
      await query.run(`
        UPDATE homework_statuses
        SET is_completed = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [existing.id]);
    } else {
      await query.run(`
        INSERT INTO homework_statuses (homework_id, user_id, is_completed)
        VALUES (?, ?, 1)
      `, [req.params.id, req.user.id]);
    }

    if (wantsJson(req)) {
      const status = await query.get(`
        SELECT is_completed
        FROM homework_statuses
        WHERE homework_id = ? AND user_id = ?
      `, [req.params.id, req.user.id]);
      res.json({ is_completed: status ? status.is_completed === 1 : false });
      return;
    }

    setFlash(req, 'success', '作业状态已更新');
    res.redirect('/homeworks');
  });

  app.get('/resources/new', requireAuth, requireLevel(3), async (req, res) => {
    const boards = await getBoards();
    res.render('resources-form', {
      pageTitle: '上传资源',
      currentPath: '/resources/new',
      boards,
      isNew: true
    });
  });

  app.get('/resources', async (req, res) => {
    const boards = await getBoards();
    const filters = {
      subject: String(req.query.subject || '').trim(),
      q: String(req.query.q || '').trim()
    };
    const conditions = ['(resources.status = \'approved\' OR resources.uploaded_by = ?)'];
    const params = [req.user ? req.user.id : -1];

    if (filters.subject) {
      conditions.push('boards.slug = ?');
      params.push(filters.subject);
    }

    if (filters.q) {
      conditions.push('(resources.title LIKE ? OR resources.description LIKE ? OR resources.teacher LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`, `%${filters.q}%`);
    }

    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug,
             users.name AS uploader_name
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      LEFT JOIN users ON users.id = resources.uploaded_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY resources.like_count DESC, datetime(resources.created_at) DESC
    `, params);

    res.render('resources', {
      pageTitle: '课件库',
      boards,
      resources,
      filters
    });
  });

  app.post('/resources', requireAuth, upload.single('resourceFile'), async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const externalUrl = String(req.body.external_url || '').trim();
    const board = await getBoardById(boardId);
    const hasFile = Boolean(req.file);
    const status = isStaff(req.user) ? 'approved' : 'pending';

    if (!board || !title || (!hasFile && !externalUrl)) {
      respondError(req, res, 400, '请至少提供标题与文件或资源链接');
      return;
    }

    const filePath = hasFile ? `/uploads/${req.file.filename}` : '';
    const fileName = hasFile ? req.file.originalname : '';

    await query.run(`
      INSERT INTO resources (
        board_id, title, description, teacher, file_name, file_path, external_url, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, description, teacher, fileName, filePath, externalUrl, status, req.user.id]);

    if (wantsJson(req)) {
      res.status(201).json({ ok: true, status });
      return;
    }

    setFlash(req, 'success', status === 'approved' ? '资源已上传' : '资源已提交，等待审核');
    res.redirect('/resources');
  });

  app.get('/resources/:id/download', async (req, res) => {
    const resource = await query.get('SELECT * FROM resources WHERE id = ?', [req.params.id]);

    if (!resource || resource.status !== 'approved') {
      respondError(req, res, 404, '资源不存在');
      return;
    }

    await query.run('UPDATE resources SET download_count = download_count + 1 WHERE id = ?', [req.params.id]);

    if (resource.external_url) {
      res.redirect(resource.external_url);
      return;
    }

    if (resource.file_path) {
      res.redirect(resource.file_path);
      return;
    }

    respondError(req, res, 404, '资源文件不存在');
  });

  app.post('/resources/:id/like', requireAuth, async (req, res) => {
    const resource = await query.get('SELECT * FROM resources WHERE id = ?', [req.params.id]);

    if (!resource) {
      respondError(req, res, 404, '资源不存在');
      return;
    }

    await query.run('UPDATE resources SET like_count = like_count + 1 WHERE id = ?', [req.params.id]);

    if (wantsJson(req)) {
      const latest = await query.get('SELECT like_count FROM resources WHERE id = ?', [req.params.id]);
      res.json({ like_count: latest.like_count });
      return;
    }

    res.redirect('/resources');
  });

  app.post('/chat/messages', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();

    if (content.length < 1 || content.length > 200) {
      respondError(req, res, 400, '聊天内容需在 1-200 个字符之间');
      return;
    }

    await query.run('INSERT INTO chat_messages (content, user_id) VALUES (?, ?)', [content, req.user.id]);

    if (wantsJson(req)) {
      res.status(201).json({ ok: true });
      return;
    }

    res.redirect('/');
  });

  app.get('/search', async (req, res) => {
    const term = String(req.query.q || '').trim();

    res.render('search', {
      pageTitle: '搜索结果',
      term,
      results: term ? await searchAll(term) : null
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const grade = String(req.body.grade || '').trim();
    const errors = [];

    if (!validateEmail(email)) {
      errors.push('请使用学校邮箱或 Gmail 邮箱注册');
    }

    if (name.length < 2) {
      errors.push('昵称至少需要 2 个字符');
    }

    if (!/^G(6|7|8|9|10|11|12)$/.test(grade)) {
      errors.push('年级仅支持 G6-G12');
    }

    if (password.length < 8) {
      errors.push('密码至少需要 8 位');
    }

    const exists = await query.get('SELECT id FROM users WHERE email = ?', [email]);
    if (exists) {
      errors.push('该邮箱已注册');
    }

    if (errors.length) {
      res.status(400).json({ errors });
      return;
    }

    const userCount = await query.get('SELECT COUNT(*) AS count FROM users');
    const role = userCount.count === 0 ? 'admin' : 'student';
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query.run(
      'INSERT INTO users (email, name, grade, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [email, name, grade, passwordHash, role]
    );

    req.session.userId = result.lastID;
    const user = await query.get('SELECT id, email, name, grade, role FROM users WHERE id = ?', [result.lastID]);
    res.status(201).json({ user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    req.session.userId = user.id;
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        grade: user.grade,
        role: user.role
      }
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get('/api/dashboard', async (req, res) => {
    res.json(await getDashboardData(req.user));
  });

  app.get('/api/boards', async (req, res) => {
    res.json({ boards: await getBoards() });
  });

  app.get('/api/forum/posts', async (req, res) => {
    res.json({
      posts: await getForumPosts({
        query: String(req.query.q || '').trim(),
        subject: String(req.query.subject || '').trim(),
        sort: String(req.query.sort || 'latest').trim(),
        type: String(req.query.type || '').trim()
      })
    });
  });

  app.post('/api/forum/posts', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'create');
  });

  app.get('/api/forum/posts/:id', async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    res.json(detail);
  });

  app.post('/api/forum/posts/:id/like', requireAuth, async (req, res) => {
    const postId = Number(req.params.id);
    const userId = req.user.id;

    const post = await query.get('SELECT id FROM posts WHERE id = ?', [postId]);
    if (!post) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    const existing = await query.get(
      'SELECT * FROM post_reactions WHERE post_id = ? AND user_id = ?',
      [postId, userId]
    );

    if (existing) {
      if (existing.reaction_type === 'like') {
        await query.run('DELETE FROM post_reactions WHERE id = ?', [existing.id]);
        await query.run('UPDATE posts SET like_count = MAX(0, like_count - 1) WHERE id = ?', [postId]);
        res.json({ liked: false, like_count: await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]).then(r => r ? r.like_count : 0) });
      } else {
        await query.run('UPDATE post_reactions SET reaction_type = ? WHERE id = ?', ['like', existing.id]);
        await query.run('UPDATE posts SET like_count = like_count + 1, dislike_count = MAX(0, dislike_count - 1) WHERE id = ?', [postId]);
        const row = await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]);
        res.json({ liked: true, like_count: row ? row.like_count : 0 });
      }
    } else {
      await query.run(
        'INSERT INTO post_reactions (post_id, user_id, reaction_type) VALUES (?, ?, ?)',
        [postId, userId, 'like']
      );
      await query.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [postId]);
      const row = await query.get('SELECT like_count FROM posts WHERE id = ?', [postId]);
      res.json({ liked: true, like_count: row ? row.like_count : 0 });
    }
  });

  app.put('/api/forum/posts/:id', requireAuth, async (req, res) => {
    await createOrUpdatePost(req, res, 'edit');
  });

  app.delete('/api/forum/posts/:id', requireAuth, async (req, res) => {
    const detail = await getPostDetail(req.params.id);

    if (!detail || !canManagePost(req.user, detail.post)) {
      res.status(404).json({ error: '帖子不存在或没有权限删除' });
      return;
    }

    await query.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  app.post('/api/forum/posts/:id/comments', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const detail = await getPostDetail(req.params.id);

    if (!detail) {
      res.status(404).json({ error: '帖子不存在' });
      return;
    }

    if (content.length < 2) {
      res.status(400).json({ error: '回复内容至少需要 2 个字符' });
      return;
    }

    const result = await query.run(`
      INSERT INTO comments (post_id, content, user_id)
      VALUES (?, ?, ?)
    `, [req.params.id, content, req.user.id]);

    const comment = await query.get(`
      SELECT comments.*, users.name AS author_name
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.id = ?
    `, [result.lastID]);

    if (detail.post.author_id !== req.user.id) {
      await query.run(
        'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
        [detail.post.author_id, '收到新回复', `有人在您的帖子"${detail.post.title}"下回复了`, 'interaction']
      );

      if (req.app.locals.sendToUser) {
        req.app.locals.sendToUser(detail.post.author_id, {
          type: 'notification',
          title: '收到新回复',
          content: `有人在您的帖子"${detail.post.title}"下回复了`
        });
      }
    }

    res.status(201).json({ comment });
  });

  app.get('/api/homeworks', async (req, res) => {
    const homeworks = await query.all(`
      SELECT homeworks.*, boards.name AS board_name, boards.slug AS board_slug,
             CASE WHEN homework_statuses.is_completed = 1 THEN 1 ELSE 0 END AS is_completed
      FROM homeworks
      JOIN boards ON boards.id = homeworks.board_id
      LEFT JOIN homework_statuses
        ON homework_statuses.homework_id = homeworks.id
       AND homework_statuses.user_id = ?
      ORDER BY datetime(homeworks.deadline) ASC
    `, [req.user ? req.user.id : -1]);
    res.json({ homeworks });
  });

  app.post('/api/homeworks', requireAuth, requireStaff, async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const deadline = String(req.body.deadline || '').trim();
    const attachmentUrl = String(req.body.attachment_url || '').trim();
    const board = await getBoardById(boardId);

    if (!board || !title || !content || !deadline) {
      res.status(400).json({ error: '作业信息不完整' });
      return;
    }

    const result = await query.run(`
      INSERT INTO homeworks (board_id, title, content, teacher, deadline, attachment_url, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, teacher, deadline, attachmentUrl, req.user.id]);

    res.status(201).json({ homeworkId: result.lastID });
  });

  app.post('/api/homeworks/:id/toggle', requireAuth, async (req, res) => {
    const homework = await query.get('SELECT * FROM homeworks WHERE id = ?', [req.params.id]);

    if (!homework) {
      res.status(404).json({ error: '作业不存在' });
      return;
    }

    const existing = await query.get(`
      SELECT * FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);

    if (existing && existing.is_completed === 1) {
      await query.run('UPDATE homework_statuses SET is_completed = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
    } else if (existing) {
      await query.run('UPDATE homework_statuses SET is_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [existing.id]);
    } else {
      await query.run('INSERT INTO homework_statuses (homework_id, user_id, is_completed) VALUES (?, ?, 1)', [req.params.id, req.user.id]);
    }

    const status = await query.get(`
      SELECT is_completed
      FROM homework_statuses
      WHERE homework_id = ? AND user_id = ?
    `, [req.params.id, req.user.id]);
    res.json({ is_completed: status ? status.is_completed === 1 : false });
  });

  app.get('/api/resources', async (req, res) => {
    const offset = Math.max(0, Number(req.query.offset || 0));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 50)));
    const resources = await query.all(`
      SELECT resources.*, boards.name AS board_name, boards.slug AS board_slug
      FROM resources
      JOIN boards ON boards.id = resources.board_id
      WHERE resources.status = 'approved'
      ORDER BY resources.like_count DESC, datetime(resources.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    res.json({ resources });
  });

  app.post('/api/resources', requireAuth, upload.single('resourceFile'), async (req, res) => {
    const boardId = Number(req.body.board_id || 0);
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const teacher = String(req.body.teacher || '').trim();
    const externalUrl = String(req.body.external_url || '').trim();
    const board = await getBoardById(boardId);
    const hasFile = Boolean(req.file);

    if (!board || !title || (!hasFile && !externalUrl)) {
      res.status(400).json({ error: '请至少提供标题与文件或资源链接' });
      return;
    }

    let initialStatus = 'pending';
    if (isStaff(req.user)) {
      initialStatus = 'approved';
    } else if (needsAIAudit(getUserLevel(req.user), 'resource')) {
      const auditResult = await auditContent(`${title}\n\n${description}`, 'resource');
      if (!auditResult.passed) {
        res.status(403).json({ error: `内容违规：${auditResult.reason}` });
        return;
      }
      await applyContentCredit(req.user.id, 'resource', true);
      initialStatus = 'approved';
    }

    const filePath = hasFile ? `/uploads/${req.file.filename}` : '';
    const fileName = hasFile ? req.file.originalname : '';
    const result = await query.run(`
      INSERT INTO resources (
        board_id, title, description, teacher, file_name, file_path, external_url, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, description, teacher, fileName, filePath, externalUrl, initialStatus, req.user.id]);

    res.status(201).json({ resourceId: result.lastID, status: initialStatus });
  });

  app.post('/api/chat/messages', requireAuth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    const userLevel = req.user.role_level;

    if (content.length < 1 || content.length > 200) {
      res.status(400).json({ error: '聊天内容需在 1-200 个字符之间' });
      return;
    }

    const creditInfo = await query.get('SELECT chat_cooldown_until, consecutive_rejects FROM user_credit WHERE user_id = ?', [req.user.id]);
    if (creditInfo && creditInfo.chat_cooldown_until) {
      const cooldownTime = new Date(creditInfo.chat_cooldown_until);
      if (cooldownTime > new Date()) {
        const remainingMinutes = Math.ceil((cooldownTime - new Date()) / 60000);
        res.status(429).json({
          error: '请等待冷却时间结束',
          cooldownMinutes: remainingMinutes
        });
        return;
      }
    }

    const needsReview = needsAIAudit(userLevel, 'chat');
    const initialStatus = needsReview ? 'pending' : 'approved';

    const result = await query.run(
      'INSERT INTO chat_messages (content, user_id, status, is_pending) VALUES (?, ?, ?, ?)',
      [content, req.user.id, initialStatus, needsReview ? 1 : 0]
    );

    const message = await query.get(`
      SELECT chat_messages.*, users.name AS author_name
      FROM chat_messages
      JOIN users ON users.id = chat_messages.user_id
      WHERE chat_messages.id = ?
    `, [result.lastID]);

    if (needsReview) {
      auditContent(content, 'chat').then(async (auditResult) => {
        if (!auditResult.passed) {
          await query.run(
            'UPDATE chat_messages SET is_rejected = 1, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [result.lastID]
          );

          const consecutiveRejects = (creditInfo?.consecutive_rejects || 0) + 1;
          const cooldownMinutes = Math.min(30, 5 * consecutiveRejects);

          await query.run(
            'UPDATE user_credit SET chat_cooldown_until = datetime(CURRENT_TIMESTAMP, ?), consecutive_rejects = ? WHERE user_id = ?',
            [`+${cooldownMinutes} minutes`, consecutiveRejects, req.user.id]
          );

          await applyContentCredit(req.user.id, 'chat', false);

          if (userLevel === 0) {
            req.app.locals.sendToUser && req.app.locals.sendToUser(req.user.id, {
              type: 'chat_rejected',
              messageId: result.lastID,
              reason: auditResult.reason,
              cooldownMinutes
            });
          }
        } else {
          await query.run(
            'UPDATE chat_messages SET status = "approved", is_pending = 0, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [result.lastID]
          );

          await query.run(
            'UPDATE user_credit SET consecutive_rejects = 0 WHERE user_id = ?',
            [req.user.id]
          );

          await applyContentCredit(req.user.id, 'chat', true);

          req.app.locals.sendToUser && req.app.locals.sendToUser(req.user.id, {
            type: 'chat_approved',
            messageId: result.lastID
          });
        }
      });

      if (userLevel === 0) {
        res.status(201).json({
          pending: true,
          messageId: result.lastID,
          message: '审核完成后可以发送下条消息'
        });
      } else {
        res.status(201).json({
          pending: true,
          messageId: result.lastID,
          message: '消息已提交审核'
        });
      }
    } else {
      res.status(201).json({
        message: {
          id: message.id,
          content: message.content,
          author_name: message.author_name,
          created_at: message.created_at,
          created_at_display: formatDate(message.created_at, true)
        }
      });
    }
  });

  app.get('/api/search', async (req, res) => {
    const term = String(req.query.q || '').trim();
    res.json({
      term,
      results: term ? await searchAll(term) : { posts: [], resources: [], exams: [], homeworks: [], sections: [] }
    });
  });

  app.get('/notifications', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || 'all';

    let typeFilter = '';
    if (type === 'unread') {
      typeFilter = "AND is_read = 0";
    } else if (type === 'review') {
      typeFilter = "AND notification_type = 'review'";
    } else if (type === 'system') {
      typeFilter = "AND notification_type = 'system'";
    } else if (type === 'interaction') {
      typeFilter = "AND notification_type = 'interaction'";
    }

    const notifications = await query.all(`
      SELECT * FROM notifications
      WHERE user_id = ? ${typeFilter}
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? ${typeFilter}
    `, [req.user.id]);

    res.render('notifications', {
      pageTitle: '通知中心',
      notifications,
      currentType: type,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  app.get('/api/notifications', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const type = req.query.type || 'all';

    let typeFilter = '';
    if (type === 'unread') {
      typeFilter = "AND is_read = 0";
    } else if (type === 'review') {
      typeFilter = "AND notification_type = 'review'";
    } else if (type === 'system') {
      typeFilter = "AND notification_type = 'system'";
    } else if (type === 'interaction') {
      typeFilter = "AND notification_type = 'interaction'";
    }

    const notifications = await query.all(`
      SELECT * FROM notifications
      WHERE user_id = ? ${typeFilter}
      ORDER BY datetime(created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    res.json({ notifications });
  });

  app.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    const row = await query.get(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ count: row.count });
  });

  app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    const notification = await query.get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!notification) {
      res.status(404).json({ error: '通知不存在' });
      return;
    }

    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ?',
      [req.params.id]
    );

    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ ok: true });
  });

  app.get('/api/search/history', requireAuth, async (req, res) => {
    const history = await query.all(`
      SELECT * FROM search_history WHERE user_id = ? ORDER BY datetime(created_at) DESC LIMIT 10
    `, [req.user.id]);
    res.json({ history });
  });

  app.delete('/api/search/history/:id', requireAuth, async (req, res) => {
    await query.run('DELETE FROM search_history WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  });

  app.get('/api/search/trending', async (req, res) => {
    const trending = await query.all(`
      SELECT * FROM trending_searches ORDER BY search_count DESC LIMIT 10
    `);
    res.json({ trending });
  });

  app.get('/api/schedules', async (req, res) => {
    const grade = req.query.grade || 'G9';

    const schedule = await query.get(
      'SELECT * FROM schedules WHERE grade = ? ORDER BY created_at DESC LIMIT 1',
      [grade]
    );

    if (!schedule) {
      res.json({ schedule: null, items: [] });
      return;
    }

    const items = await query.all(`
      SELECT * FROM schedule_items WHERE schedule_id = ? ORDER BY day_of_week, period
    `, [schedule.id]);

    res.json({ schedule, items });
  });

  app.post('/api/schedules', requireAuth, requireLevel(6), async (req, res) => {
    const { semester, grade, items = [] } = req.body;

    await query.run('DELETE FROM schedules WHERE semester = ? AND grade = ?', [semester, grade]);

    const result = await query.run(
      'INSERT INTO schedules (semester, grade) VALUES (?, ?)',
      [semester, grade]
    );
    const scheduleId = result.lastID;

    for (const item of items) {
      await query.run(`
        INSERT INTO schedule_items (schedule_id, day_of_week, period, subject, teacher, room, start_time, end_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [scheduleId, item.day_of_week, item.period, item.subject, item.teacher || '', item.room || '', item.start_time, item.end_time]);
    }

    const newItems = await query.all('SELECT * FROM schedule_items WHERE schedule_id = ?', [scheduleId]);
    const newSchedule = await query.get('SELECT * FROM schedules WHERE id = ?', [scheduleId]);
    res.json({ schedule: newSchedule, items: newItems });
  });

  app.get('/settings', requireAuth, async (req, res) => {
    const user = await query.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const credit = await query.get('SELECT * FROM user_credit WHERE user_id = ?', [req.user.id]);
    const creditHistory = await query.all(`
      SELECT cl.*, u.name AS reviewer_name
      FROM credit_log cl
      LEFT JOIN users u ON u.id = cl.reviewer_id
      WHERE cl.user_id = ?
      ORDER BY datetime(cl.created_at) DESC
      LIMIT 50
    `, [req.user.id]);
    const roleInfo = await query.get('SELECT * FROM roles WHERE level = ?', [user.role_level]);
    const nextLevel = await query.get(`
      SELECT * FROM roles WHERE min_credit > ? AND level NOT IN (55, 6) ORDER BY min_credit ASC LIMIT 1
    `, [credit ? credit.credit : 0]);
    const allRoles = await query.all(`
      SELECT * FROM roles WHERE level NOT IN (55, 6) ORDER BY level ASC
    `);

    res.render('settings', {
      pageTitle: 'settings.title',
      currentPath: '/settings',
      user,
      credit,
      creditHistory,
      roleInfo,
      nextLevel,
      allRoles
    });
  });

  app.post('/api/settings/deactivate', requireAuth, async (req, res) => {
    const password = String(req.body.password || '');
    const user = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    await query.run('UPDATE users SET banned_until = datetime(CURRENT_TIMESTAMP, "+100 years") WHERE id = ?', [req.user.id]);
    req.session.destroy();
    res.json({ success: true });
  });

  app.get('/dashboard', requireAuth, requireLevel(3), async (req, res) => {
    const userLevel = getUserLevel(req.user);
    const userId = req.user.id;

    const pendingCount = await query.get(
      "SELECT COUNT(*) AS count FROM review_items WHERE status = 'pending'"
    );

    const myReviewsToday = await query.get(
      "SELECT COUNT(*) AS count FROM review_actions WHERE reviewer_id = ? AND DATE(created_at) = DATE('now')",
      [userId]
    );

    const myPendingPosts = await query.get(
      "SELECT COUNT(*) AS count FROM posts WHERE user_id = ? AND review_status = 'pending'",
      [userId]
    );

    const reviewStats = await query.get(
      "SELECT COUNT(*) AS count FROM review_actions WHERE reviewer_id = ?",
      [userId]
    );

    let targetMin = 0;
    let targetMax = 0;
    if (userLevel <= 5 && userLevel >= 3) {
      const roleInfo = await query.get('SELECT review_target_min, review_target_max FROM roles WHERE level = ?', [userLevel]);
      if (roleInfo) {
        targetMin = roleInfo.review_target_min;
        targetMax = roleInfo.review_target_max;
      }
    }

    res.render('dashboard', {
      pageTitle: '我的面板',
      currentPath: '/dashboard',
      userLevel,
      pendingCount: pendingCount.count,
      myReviewsToday: myReviewsToday.count,
      myPendingPosts: myPendingPosts.count,
      reviewStats: reviewStats.count,
      targetMin,
      targetMax
    });
  });

  app.get('/api/review/items', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const userLevel = getUserLevel(req.user);

    let statusFilter = "ri.status = 'pending'";
    if (userLevel === 3) {
      statusFilter = "ri.status = 'pending' AND ri.item_type = 'chat'";
    } else if (userLevel === 4) {
      statusFilter = "ri.status = 'pending' AND ri.item_type IN ('chat', 'post')";
    }

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name,
             r.name AS reviewer_name
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      LEFT JOIN users r ON r.id = ri.reviewer_id
      WHERE ${statusFilter}
      ORDER BY datetime(ri.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri WHERE ${statusFilter}
    `);

    res.json({
      items,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  app.get('/api/review/items/:id', requireAuth, requireLevel(3), async (req, res) => {
    const item = await query.get(`
      SELECT ri.*,
             u.name AS author_name,
             u.email AS author_email
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ri.id = ?
    `, [req.params.id]);

    if (!item) {
      res.status(404).json({ error: '审核项不存在' });
      return;
    }

    let content = null;
    if (item.item_type === 'post') {
      content = await query.get('SELECT * FROM posts WHERE id = ?', [item.item_id]);
    } else if (item.item_type === 'chat') {
      content = await query.get('SELECT * FROM chat_messages WHERE id = ?', [item.item_id]);
    } else if (item.item_type === 'resource') {
      content = await query.get('SELECT * FROM resources WHERE id = ?', [item.item_id]);
    }

    const history = await query.all(`
      SELECT ra.*, u.name AS reviewer_name
      FROM review_actions ra
      JOIN users u ON u.id = ra.reviewer_id
      WHERE ra.review_id = ?
      ORDER BY datetime(ra.created_at) DESC
    `, [req.params.id]);

    res.json({ item, content, history });
  });

  app.post('/api/review/items/:id/approve', requireAuth, requireLevel(3), rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'review' }), async (req, res) => {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 10 || reason.length > 200) {
      res.status(400).json({ error: '审核理由需在 10-200 个字符之间' });
      return;
    }

    const item = await query.get('SELECT * FROM review_items WHERE id = ?', [req.params.id]);
    if (!item) {
      res.status(404).json({ error: '审核项不存在' });
      return;
    }

    if (item.status !== 'pending') {
      res.status(400).json({ error: '该审核项已处理' });
      return;
    }

    const userLevel = getUserLevel(req.user);
    if (userLevel === 3 && item.item_type !== 'chat') {
      res.status(403).json({ error: 'LV3 只能审核聊天消息' });
      return;
    }

    await runTransaction(async () => {
      await query.run(
        "UPDATE review_items SET status = 'approved', reviewer_id = ?, decision_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.user.id, reason, req.params.id]
      );
      await query.run(
        'INSERT INTO review_actions (review_id, reviewer_id, action, reason) VALUES (?, ?, ?, ?)',
        [req.params.id, req.user.id, 'approve', reason]
      );

      if (item.item_type === 'post') {
        await query.run("UPDATE posts SET review_status = 'approved' WHERE id = ?", [item.item_id]);
      } else if (item.item_type === 'chat') {
        await query.run("UPDATE chat_messages SET status = 'approved' WHERE id = ?", [item.item_id]);
      } else if (item.item_type === 'resource') {
        await query.run("UPDATE resources SET status = 'approved' WHERE id = ?", [item.item_id]);
      }

      const creditDelta = userLevel === 3 ? 5 : 3;
      await changeCredit(item.created_by, creditDelta, `审核通过奖励`, req.user.id);
    });

    await query.run(
      'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
      [item.created_by, '内容审核通过', `您的${item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源'}已通过审核`, 'review']
    );

    if (req.app.locals.sendToUser) {
      req.app.locals.sendToUser(item.created_by, {
        type: 'notification',
        title: '内容审核通过',
        content: `您的${item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源'}已通过审核`
      });
    }

    res.json({ ok: true, message: '审核通过' });
  });

  app.post('/api/review/items/:id/reject', requireAuth, requireLevel(3), rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'review' }), async (req, res) => {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 10 || reason.length > 200) {
      res.status(400).json({ error: '审核理由需在 10-200 个字符之间' });
      return;
    }

    const item = await query.get('SELECT * FROM review_items WHERE id = ?', [req.params.id]);
    if (!item) {
      res.status(404).json({ error: '审核项不存在' });
      return;
    }

    if (item.status !== 'pending') {
      res.status(400).json({ error: '该审核项已处理' });
      return;
    }

    const userLevel = getUserLevel(req.user);
    if (userLevel === 3 && item.item_type !== 'chat') {
      res.status(403).json({ error: 'LV3 只能审核聊天消息' });
      return;
    }

    await runTransaction(async () => {
      await query.run(
        "UPDATE review_items SET status = 'rejected', reviewer_id = ?, decision_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [req.user.id, reason, req.params.id]
      );
      await query.run(
        'INSERT INTO review_actions (review_id, reviewer_id, action, reason) VALUES (?, ?, ?, ?)',
        [req.params.id, req.user.id, 'reject', reason]
      );

      const creditDelta = userLevel === 3 ? -5 : -3;
      await changeCredit(item.created_by, creditDelta, `审核驳回扣减`, req.user.id);
    });

    await query.run(
      'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
      [item.created_by, '内容审核未通过', `您的${item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源'}未通过审核: ${reason}`, 'review']
    );

    if (req.app.locals.sendToUser) {
      req.app.locals.sendToUser(item.created_by, {
        type: 'notification',
        title: '内容审核未通过',
        content: `您的${item.item_type === 'post' ? '帖子' : item.item_type === 'chat' ? '聊天消息' : '资源'}未通过审核`
      });
    }

    res.json({ ok: true, message: '审核驳回' });
  });

  app.post('/api/reports', requireAuth, async (req, res) => {
    const targetType = String(req.body.target_type || '').trim();
    const targetId = Number(req.body.target_id || 0);
    const reason = String(req.body.reason || '').trim();

    const validTypes = ['post', 'comment', 'chat', 'resource', 'cj'];
    if (!validTypes.includes(targetType) || !targetId || reason.length < 5) {
      res.status(400).json({ error: '请提供有效的举报类型、目标ID和原因（至少5个字符）' });
      return;
    }

    const existing = await query.get(
      'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ? AND status = \'pending\'',
      [req.user.id, targetType, targetId]
    );
    if (existing) {
      res.status(400).json({ error: '您已举报过该内容，请等待处理结果' });
      return;
    }

    const result = await query.run(
      'INSERT INTO reports (reporter_id, target_type, target_id, reason) VALUES (?, ?, ?, ?)',
      [req.user.id, targetType, targetId, reason]
    );

    const invalidReportCount = await query.get(`
      SELECT COUNT(*) AS count FROM reports
      WHERE reporter_id = ? AND review_result = 'invalid'
      AND datetime(created_at) > datetime('now', '-30 days')
    `, [req.user.id]);

    if (invalidReportCount && invalidReportCount.count >= 3) {
      await changeCredit(req.user.id, -5, '恶意举报处罚（30天内3次无效举报）', null);
      await query.run(
        'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
        [req.user.id, '举报信用提醒', '您因恶意举报被扣除5分信用分', 'system']
      );
      res.status(201).json({ id: result.lastID, warning: '恶意举报检测，已扣除5分信用分' });
      return;
    }

    res.status(201).json({ id: result.lastID, message: '举报已提交，感谢您的反馈' });
  });

  app.get('/api/reports/my', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;

    const reports = await query.all(`
      SELECT r.*,
             reviewer.name AS reviewer_name
      FROM reports r
      LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id
      WHERE r.reporter_id = ?
      ORDER BY datetime(r.created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const countRow = await query.get(
      'SELECT COUNT(*) AS total FROM reports WHERE reporter_id = ?',
      [req.user.id]
    );

    res.json({
      reports,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  app.post('/api/appeals', requireAuth, requireLevel(1), async (req, res) => {
    const contentType = String(req.body.content_type || '').trim();
    const contentId = Number(req.body.content_id || 0);
    const appealReason = String(req.body.appeal_reason || '').trim();

    const validTypes = ['post', 'comment', 'chat', 'resource'];
    if (!validTypes.includes(contentType) || !contentId || appealReason.length < 10) {
      res.status(400).json({ error: '请提供有效的内容类型、内容ID和申诉原因（至少10个字符）' });
      return;
    }

    const existing = await query.get(
      'SELECT id FROM review_appeals WHERE user_id = ? AND content_type = ? AND content_id = ? AND status = \'pending\'',
      [req.user.id, contentType, contentId]
    );
    if (existing) {
      res.status(400).json({ error: '您已申诉过该内容，请等待处理结果' });
      return;
    }

    const result = await query.run(
      'INSERT INTO review_appeals (user_id, content_type, content_id, appeal_reason) VALUES (?, ?, ?, ?)',
      [req.user.id, contentType, contentId, appealReason]
    );

    if (contentType === 'post') {
      await query.run("UPDATE posts SET review_status = 'hidden' WHERE id = ?", [contentId]);
    } else if (contentType === 'comment') {
      await query.run('UPDATE comments SET status = \'hidden\' WHERE id = ?', [contentId]);
    } else if (contentType === 'chat') {
      await query.run("UPDATE chat_messages SET status = 'hidden' WHERE id = ?", [contentId]);
    } else if (contentType === 'resource') {
      await query.run("UPDATE resources SET status = 'hidden' WHERE id = ?", [contentId]);
    }

    res.status(201).json({ id: result.lastID, message: '申诉已提交，内容暂时隐藏等待审核' });
  });

  app.get('/api/appeals/my', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;

    const appeals = await query.all(`
      SELECT ra.*,
             reviewer.name AS reviewer_name
      FROM review_appeals ra
      LEFT JOIN users reviewer ON reviewer.id = ra.reviewer_id
      WHERE ra.user_id = ?
      ORDER BY datetime(ra.created_at) DESC
      LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    const countRow = await query.get(
      'SELECT COUNT(*) AS total FROM review_appeals WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      appeals,
      pagination: {
        page,
        totalPages: Math.ceil(countRow.total / limit),
        totalItems: countRow.total
      }
    });
  });

  app.get('/api/review/queue', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const userLevel = getUserLevel(req.user);

    let typeFilter = '';
    if (userLevel === 3) {
      typeFilter = "AND ri.item_type = 'chat'";
    } else if (userLevel === 4) {
      typeFilter = "AND ri.item_type IN ('chat', 'post')";
    }

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name,
             r.name AS reviewer_name
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      LEFT JOIN users r ON r.id = ri.reviewer_id
      WHERE ri.status = 'pending' ${typeFilter}
      ORDER BY datetime(ri.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const appeals = await query.all(`
      SELECT ra.*,
             u.name AS appellant_name,
             reviewer.name AS reviewer_name
      FROM review_appeals ra
      JOIN users u ON u.id = ra.user_id
      LEFT JOIN users reviewer ON reviewer.id = ra.reviewer_id
      WHERE ra.status = 'pending'
      ORDER BY datetime(ra.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const reviewCount = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri WHERE ri.status = 'pending' ${typeFilter}
    `);

    const appealCount = await query.get(
      'SELECT COUNT(*) AS total FROM review_appeals WHERE status = \'pending\''
    );

    res.json({
      items,
      appeals,
      counts: {
        reviewItems: reviewCount ? reviewCount.total : 0,
        appeals: appealCount ? appealCount.total : 0
      },
      pagination: {
        page,
        totalPages: Math.ceil((reviewCount ? reviewCount.total : 0) / limit),
        totalItems: reviewCount ? reviewCount.total : 0
      }
    });
  });

  app.post('/api/review/:id/appeal-decide', requireAuth, requireLevel(3), rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'appeal' }), async (req, res) => {
    const appealId = Number(req.params.id);
    const decision = String(req.body.decision || '').trim();
    const reviewNote = String(req.body.review_note || '').trim();

    if (!['approve', 'reject'].includes(decision)) {
      res.status(400).json({ error: '无效的裁决决定' });
      return;
    }

    if (reviewNote.length < 5 || reviewNote.length > 200) {
      res.status(400).json({ error: '审核备注需在 5-200 个字符之间' });
      return;
    }

    const appeal = await query.get('SELECT * FROM review_appeals WHERE id = ?', [appealId]);
    if (!appeal) {
      res.status(404).json({ error: '申诉项不存在' });
      return;
    }

    if (appeal.status !== 'pending') {
      res.status(400).json({ error: '该申诉已处理' });
      return;
    }

    const userLevel = getUserLevel(req.user);

    await runTransaction(async () => {
      if (decision === 'approve') {
        await query.run(
          "UPDATE review_appeals SET status = 'approved', reviewer_id = ?, review_note = ?, credit_restored = 1, credit_compensation = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [req.user.id, reviewNote, Math.floor(Math.random() * 3) + 1, appealId]
        );

        if (appeal.content_type === 'post') {
          await query.run("UPDATE posts SET review_status = 'approved' WHERE id = ?", [appeal.content_id]);
        } else if (appeal.content_type === 'comment') {
          await query.run("UPDATE comments SET status = 'approved' WHERE id = ?", [appeal.content_id]);
        } else if (appeal.content_type === 'chat') {
          await query.run("UPDATE chat_messages SET status = 'approved' WHERE id = ?", [appeal.content_id]);
        } else if (appeal.content_type === 'resource') {
          await query.run("UPDATE resources SET status = 'approved' WHERE id = ?", [appeal.content_id]);
        }

        await changeCredit(appeal.user_id, 1, '申诉成功-恢复信用', req.user.id);
        await changeCredit(appeal.user_id, appeal.credit_compensation || 0, '申诉补偿', req.user.id);
      } else {
        await query.run(
          "UPDATE review_appeals SET status = 'rejected', reviewer_id = ?, review_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [req.user.id, reviewNote, appealId]
        );

        await changeCredit(appeal.user_id, -3, '申诉失败额外处罚', req.user.id);
      }
    });

    await query.run(
      'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
      [appeal.user_id, '申诉裁决', `您的${appeal.content_type}申诉已被${decision === 'approve' ? '通过' : '驳回'}: ${reviewNote}`, 'review']
    );

    if (req.app.locals.sendToUser) {
      req.app.locals.sendToUser(appeal.user_id, {
        type: 'notification',
        title: '申诉裁决',
        content: `您的${appeal.content_type}申诉已被${decision === 'approve' ? '通过' : '驳回'}`
      });
    }

    res.json({ ok: true, message: `申诉已${decision === 'approve' ? '通过' : '驳回'}` });
  });

  app.get('/api/admin/logs', requireAuth, requireLevel(5), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const logs = await query.all(`
      SELECT al.*, u.name AS admin_name, tu.name AS target_name
      FROM admin_log al
      JOIN users u ON u.id = al.admin_user_id
      LEFT JOIN users tu ON tu.id = al.target_user_id
      ORDER BY datetime(al.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    res.json({ logs });
  });

  app.post('/api/admin/credit', requireAuth, requireLevel(6), async (req, res) => {
    const targetUserId = Number(req.body.user_id || 0);
    const delta = Number(req.body.delta || 0);
    const password = String(req.body.password || '');
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (!password) {
      res.status(400).json({ error: '请提供操作密码' });
      return;
    }

    const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    const target = await query.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!target) {
      res.status(404).json({ error: '目标用户不存在' });
      return;
    }

    const result = await changeCredit(targetUserId, delta, '管理员操作', req.user.id);

    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `credit_change:${delta}`, targetUserId, ip]
    );

    res.json({ ok: true, new_credit: result.credit });
  });

  app.post('/api/admin/ban', requireAuth, requireLevel(6), async (req, res) => {
    const targetUserId = Number(req.body.user_id || 0);
    const days = Number(req.body.days || 0);
    const reason = String(req.body.reason || '');
    const password = String(req.body.password || '');
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (!password) {
      res.status(400).json({ error: '请提供操作密码' });
      return;
    }

    const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    const bannedUntil = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
    await query.run('UPDATE users SET banned_until = ? WHERE id = ?', [bannedUntil, targetUserId]);

    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `ban:${days}days:${reason}`, targetUserId, ip]
    );

    res.json({ ok: true, banned_until: bannedUntil });
  });

  app.get('/admin/users', requireAuth, requireLevel(6), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const search = String(req.query.q || '').trim();

    let where = '';
    let params = [];
    if (search) {
      where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    const total = await query.get(`SELECT COUNT(*) AS count FROM users u ${where}`, params);
    const users = await query.all(`
      SELECT u.id, u.name, u.email, u.grade, u.role_level, u.banned_until, u.created_at,
             r.name AS role_name, r.badge_color,
             COALESCE(uc.credit, 0) AS credit
      FROM users u
      LEFT JOIN roles r ON r.level = u.role_level
      LEFT JOIN user_credit uc ON uc.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    res.render('admin/users', {
      pageTitle: '用户管理',
      currentPath: '/admin/users',
      users,
      total: total.count,
      page,
      pages: Math.ceil(total.count / limit),
      search
    });
  });

  app.get('/api/admin/users', requireAuth, requireLevel(6), async (req, res) => {
    const search = String(req.query.q || '').trim();
    let where = '';
    let params = [];
    if (search) {
      where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    const users = await query.all(`
      SELECT u.id, u.name, u.email, u.grade, u.role_level, u.banned_until, u.created_at,
             r.name AS role_name,
             COALESCE(uc.credit, 0) AS credit
      FROM users u
      LEFT JOIN roles r ON r.level = u.role_level
      LEFT JOIN user_credit uc ON uc.user_id = u.id
      ${where}
      ORDER BY u.created_at DESC
      LIMIT 50
    `, params);

    res.json({ users });
  });

  app.post('/api/admin/users/:id/role', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const newLevel = Number(req.body.level);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (![1, 2, 3, 4, 5, 55, 6].includes(newLevel)) {
      res.status(400).json({ error: '无效的等级值' });
      return;
    }

    if (targetId === req.user.id) {
      res.status(400).json({ error: '不能修改自己的等级' });
      return;
    }

    const newRole = await query.get('SELECT min_credit FROM roles WHERE level = ?', [newLevel]);
    const newCredit = newRole ? newRole.min_credit : 0;
    if (newCredit < 0) {
      const maxCreditRole = await query.get('SELECT min_credit FROM roles WHERE level = 5');
      await query.run(
        'UPDATE user_credit SET credit = ? WHERE user_id = ?',
        [maxCreditRole ? maxCreditRole.min_credit : 0, targetId]
      );
    } else {
      await query.run(
        'UPDATE user_credit SET credit = ? WHERE user_id = ?',
        [newCredit, targetId]
      );
    }

    await query.run('UPDATE users SET role_level = ? WHERE id = ?', [newLevel, targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, `set_role:${newLevel}`, targetId, ip]
    );

    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/grant-lv55', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    await query.run('UPDATE users SET role_level = 55 WHERE id = ?', [targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'grant_lv55', targetId, ip]
    );

    res.json({ ok: true });
  });

  app.post('/api/admin/users/:id/revoke-lv55', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    await query.run('UPDATE users SET role_level = 5 WHERE id = ?', [targetId]);
    const lv5Role = await query.get('SELECT min_credit FROM roles WHERE level = 5');
    await query.run(
      'UPDATE user_credit SET credit = ? WHERE user_id = ?',
      [lv5Role ? lv5Role.min_credit : 0, targetId]
    );
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'revoke_lv55', targetId, ip]
    );

    res.json({ ok: true });
  });

  app.delete('/api/admin/users/:id', requireAuth, requireLevel(6), async (req, res) => {
    const targetId = Number(req.params.id);
    const ip = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';

    if (targetId === req.user.id) {
      res.status(400).json({ error: '不能删除自己' });
      return;
    }

    await query.run('DELETE FROM users WHERE id = ?', [targetId]);
    await query.run(
      'INSERT INTO admin_log (admin_user_id, action, target_user_id, ip) VALUES (?, ?, ?, ?)',
      [req.user.id, 'delete_user', targetId, ip]
    );

    res.json({ ok: true });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    if (wantsJson(req)) {
      res.status(500).json({ error: '服务器内部错误' });
      return;
    }

    res.status(500).send('服务器内部错误');
  });

  app.use((req, res) => {
    if (wantsJson(req)) {
      res.status(404).json({ error: '接口不存在' });
      return;
    }

    res.status(404).send('页面不存在');
  });

  async function startServer(startOptions = {}) {
    await initializeDatabase();

    const port = startOptions.port ?? Number(process.env.PORT || 3000);
    const host = startOptions.host ?? process.env.HOST ?? '0.0.0.0';

    return new Promise((resolve) => {
      const server = app.listen(port, host, () => {
        setupWebSocket(server);
        resolve(server);
      });
    });
  }

  const clients = new Map();

  function setupWebSocket(server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const userId = url.searchParams.get('userId');

      if (userId) {
        clients.set(Number(userId), ws);
      }

      ws.on('close', () => {
        if (userId) {
          clients.delete(Number(userId));
        }
      });
    });
  }

  function sendToUser(userId, data) {
    const ws = clients.get(Number(userId));
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  app.locals.sendToUser = sendToUser;

  app.locals.db = db;
  app.locals.query = query;
  app.locals.initializeDatabase = initializeDatabase;
  app.locals.startServer = startServer;

  return {
    app,
    db,
    query,
    initializeDatabase,
    startServer,
    paths: {
      dbPath,
      dataDir,
      uploadDir,
      sessionDir
    }
  };
}

if (require.main === module) {
  const { startServer } = createApp();
  startServer()
    .then((server) => {
      const address = server.address();
      const host = typeof address === 'object' && address ? address.address : '0.0.0.0';
      const port = typeof address === 'object' && address ? address.port : process.env.PORT || 3000;
      console.log(`BG Hub running on http://${host}:${port}`);
    })
    .catch((error) => {
      console.error('Failed to start BG Hub:', error);
      process.exit(1);
    });
}

module.exports = {
  createApp
};
