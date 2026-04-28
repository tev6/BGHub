require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
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

marked.setOptions({
  gfm: true,
  breaks: true
});

const resend = new Resend(process.env.RESEND_API_KEY);

const {
  createDatabaseHelpers,
  initializeDatabase: initDatabaseFromModule,
  boardSeeds,
  sectionTitles,
  sectionTitlesEn
} = require('./server/database');

const {
  slugify,
  stripHtml,
  excerpt,
  extractFirstImageUrl,
  buildCountdown,
  renderMarkdown,
  formatDate
} = require('./server/utils');

const {
  requireAuth,
  requireStaff,
  requireLevel,
  isStaff,
  getUserLevel,
  wantsJson: wantsJsonMiddleware,
  respondError
} = require('./server/middleware/auth');

const { createCreditService } = require('./server/services/credit');

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function ensureColumn() {}

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
      fileSize: 100 * 1024 * 1024
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
      const result = await resend.emails.send({
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
      console.log(`[Email] Verification code sent to ${userEmail}, id: ${result.data?.id}`);
      return code;
    } catch (error) {
      console.error(`[Email] Failed to send verification email to ${userEmail}:`);
      console.error(`[Email] Status: ${error.status || 'N/A'}, Message: ${error.message}`);
      console.error(`[Email] Error name: ${error.name}, Code: ${error.code || 'N/A'}`);
      return null;
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
    if (!user || !post) return false;
    if (user.id === post.user_id) return true;
    if (user.role_level === 6) return true;
    return false;
  }

  function canMarkBestAnswer(user, post) {
    if (!user || !post) return false;
    if (user.id === post.user_id) return true;
    if (user.role_level === 6) return true;
    return false;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
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

  async function banLv1BottomOut(userId) {
    const now = new Date();
    const existingBan = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    const banDurations = [5, 15, 45, 180, 720];
    let banCount = 1;
    let durationMinutes = banDurations[0];

    if (existingBan) {
      const bannedAt = parseDateValue(existingBan.banned_at);
      const hoursSinceBan = (now - bannedAt) / (1000 * 60 * 60);

      if (hoursSinceBan > 24) {
        banCount = 1;
      } else {
        banCount = Math.min((existingBan.ban_count || 0) + 1, banDurations.length);
      }
    }

    durationMinutes = banDurations[banCount - 1] || banDurations[banDurations.length - 1];
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    if (existingBan) {
      await query.run(
        'UPDATE user_bans SET ban_count = ?, banned_at = ?, expires_at = ?, reason = ? WHERE user_id = ?',
        [banCount, now.toISOString(), expiresAt.toISOString(), 'LV1用户积分触底禁言', userId]
      );
    } else {
      await query.run(
        'INSERT INTO user_bans (user_id, reason, ban_count, banned_at, expires_at) VALUES (?, ?, ?, ?, ?)',
        [userId, 'LV1用户积分触底禁言', banCount, now.toISOString(), expiresAt.toISOString()]
      );
    }

    await query.run('UPDATE users SET banned_until = ? WHERE id = ?', [expiresAt.toISOString(), userId]);

    return { success: true, banCount, durationMinutes, expiresAt };
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

    if (user && user.role_level === 1 && actualDelta < 0 && creditRow.credit === 1) {
      await banLv1BottomOut(userId);
      return { credit: 1, delta: 0, banned: true, banReason: 'LV1用户积分触底禁言' };
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

  async function auditContent(title, body, type) {
    console.log('[auditContent] 被调用, type:', type, 'title:', String(title).substring(0, 50));

    if (!title || typeof title !== 'string') {
      return { passed: false, reason: '内容为空' };
    }

    if (hasSensitiveContent(title) || (body && hasSensitiveContent(body))) {
      return { passed: false, reason: '包含敏感词' };
    }

    try {
      let modResult;
      switch (type) {
        case 'chat':
          modResult = await moderateChatMessage(title);
          break;
        case 'cj':
          modResult = await moderateContent(title, '这是CJ板块的课程内容');
          break;
        case 'post':
          modResult = await moderatePost(title, body || '');
          break;
        case 'resource':
          modResult = await moderateResource(title, body || '');
          break;
        default:
          modResult = { decision: 'PASS', reason: '未知类型，默认通过' };
      }

      console.log('[auditContent] 审核结果:', modResult);
      return {
        passed: modResult.decision === 'PASS',
        reason: modResult.reason || ''
      };
    } catch (error) {
      console.error('[auditContent] AI审核异常:', error);
      return { passed: false, reason: 'AI审核异常，请稍后重试' };
    }
  }

  function needsAIAudit(userLevel, type) {
    const level = Number(userLevel || 0);

    switch (type) {
      case 'chat':
        return level <= 1;
      case 'cj':
        return level >= 1 && level < 5;
      case 'post':
        return level >= 2 && level <= 4;
      case 'resource':
        return level <= 2;
      case 'homework':
        return level >= 1 && level < 5.5;
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
      resource: 'resource_count',
      report: 'reports_count',
      appeal: 'appeals_count'
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

  async function getDailyReportAppealLimit(user, type) {
    const userLevel = getUserLevel(user);

    if (userLevel < 1) {
      return { allowed: false, limit: 0, current: 0, reason: 'LV0用户不可使用此功能' };
    }

    if (userLevel === 6 || userLevel === 55) {
      return { allowed: true, limit: -1, current: 0 };
    }

    let limit = 5;
    if (type === 'appeal') {
      if (userLevel === 1 || userLevel === 2) limit = 2;
      else if (userLevel === 3) limit = 3;
      else if (userLevel === 4) limit = 5;
      else if (userLevel >= 5) limit = -1;
    } else {
      if (userLevel >= 3 && userLevel <= 4) limit = 10;
      else if (userLevel >= 5) limit = 20;
    }

    const today = currentDateKey();

    const stats = await query.get(
      'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
      [user.id, today]
    );

    const field = type === 'report' ? 'reports_count' : 'appeals_count';
    const current = stats ? Number(stats[field]) || 0 : 0;

    if (limit === -1) {
      return { allowed: true, limit: -1, current };
    }

    return {
      allowed: current < limit,
      limit,
      current
    };
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

  async function createReviewItem(itemType, itemId, userId, aiReviewed = false) {
    const result = await query.run(
      'INSERT INTO review_items (item_type, item_id, created_by, ai_reviewed) VALUES (?, ?, ?, ?)',
      [itemType, itemId, userId, aiReviewed ? 1 : 0]
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

  async function getBoards(dateStr = null, gradeContext = null, showAllClasses = false) {
    let sections;
    const sevenDaysAgo = new Date(Date.now() + 8 * 60 * 60 * 1000 - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (dateStr) {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = ?
        AND board_sections.section_date >= ?
        ORDER BY board_sections.board_id, board_sections.section
      `, [dateStr, sevenDaysAgo]);
    } else {
      sections = await query.all(`
        SELECT board_sections.*, users.name AS updater_name
        FROM board_sections
        LEFT JOIN users ON users.id = board_sections.updated_by
        WHERE board_sections.section_date = date('now', 'localtime')
        ORDER BY board_sections.board_id, board_sections.section
      `);
    }

    let boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');

    if (gradeContext && gradeContext.grade) {
      const grade = gradeContext.grade;
      const isG6G8 = ['G6', 'G7', 'G8'].includes(grade);
      const userClass = gradeContext.class_name;

      const permissions = await query.all(`
        SELECT board_id, is_shared FROM subject_grade_permissions WHERE grade = ?
      `, [grade]);

      const permMap = new Map(permissions.map(p => [p.board_id, p.is_shared]));
      boards = boards.filter(board => permMap.has(board.id));

      if (isG6G8) {
        const classes = await query.all(
          'SELECT class_name FROM grade_classes WHERE grade = ? ORDER BY sort_order, class_name',
          [grade]
        );

        const expandedBoards = [];
        for (const board of boards) {
          const isShared = permMap.get(board.id);
          if (isShared) {
            expandedBoards.push({
              ...board,
              display_name: board.name,
              display_name_en: board.name_en,
              is_shared: true,
              class_name: null
            });
          } else {
            if (showAllClasses) {
              for (const cls of classes) {
                expandedBoards.push({
                  ...board,
                  display_name: `${board.name}(${cls.class_name})`,
                  display_name_en: `${board.name_en}(${cls.class_name})`,
                  is_shared: false,
                  class_name: cls.class_name
                });
              }
            } else if (userClass) {
              expandedBoards.push({
                ...board,
                display_name: `${board.name}(${userClass})`,
                display_name_en: `${board.name_en}(${userClass})`,
                is_shared: false,
                class_name: userClass
              });
            }
          }
        }
        boards = expandedBoards;
      } else {
        boards = boards.map(board => ({
          ...board,
          display_name: board.name,
          display_name_en: board.name_en,
          is_shared: true,
          class_name: null
        }));
      }
    } else {
      boards = boards.map(board => ({
        ...board,
        display_name: board.name,
        display_name_en: board.name_en,
        is_shared: true,
        class_name: null
      }));
    }

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

  async function getDashboardData(user, dateStr = null, gradeContext = null, showAllClasses = false) {
    const boards = await getBoards(dateStr, gradeContext, showAllClasses);
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
      SELECT chat_messages.*, 
             COALESCE(users.name, '游客' || COALESCE(chat_messages.guest_id, '')) AS author_name
      FROM chat_messages
      LEFT JOIN users ON users.id = chat_messages.user_id
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

  async function getBoardDetail(slug, user, dateStr = null, gradeContext = null) {
    const board = await getBoardBySlug(slug);

    if (!board) {
      return null;
    }

    if (gradeContext && gradeContext.grade) {
      const perm = await query.get(
        'SELECT id FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
        [board.id, gradeContext.grade]
      );
      if (!perm) {
        return null;
      }
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

    const referer = req.get('Referer');
    const redirectUrl = referer && !referer.includes(req.originalUrl) ? referer : '/';
    setFlash(req, 'error', message);
    res.redirect(redirectUrl);
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
  app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    const fs = require('fs');

    if (!fs.existsSync(filePath)) {
      res.status(404).send('File not found');
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(filePath);
  });
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

  app.use(cookieParser());

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
          SELECT users.id, users.email, users.name, users.grade, users.class_name, users.role, users.role_level, users.created_at,
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

      let gradeContext = null;
      let userLocale = 'zh';
      if (req.user) {
        gradeContext = {
          grade: req.user.grade,
          class_name: req.user.class_name
        };
        if (req.user.locale) {
          userLocale = req.user.locale;
        }
      } else {
        const gradeCookie = req.cookies.grade_context;
        if (gradeCookie) {
          try {
            gradeContext = JSON.parse(gradeCookie);
          } catch (e) {}
        }
      }

      req.gradeContext = gradeContext;
      res.locals.user = req.user;
      res.locals.flash = flash;
      res.locals.currentPath = req.path;
      res.locals.locale = userLocale;
      res.locals.gradeContext = gradeContext;
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use(checkUserBan);

  const { registerRoutes } = require('./server/routes');

  const creditService = {
    clampCredit,
    currentDateKey,
    ensureCreditRecord,
    syncUserLevel,
    changeCredit,
    applyDailyLoginCredit,
    checkCreditCap,
    applyContentCredit
  };

  const { createServices } = require('./server/services');
  const { moderateChatMessage, moderatePost, moderateResource, moderateContent } = require('./server/services/moderation');
  
  const notificationService = {
    createNotification: async (userId, title, content, type) => {
      await query.run(
        'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
        [userId, title, content, type]
      );
    }
  };

  const moderation = { moderateChatMessage, moderatePost, moderateResource, moderateContent };

  const reviewService = require('./server/services/reviewService').createReviewService({
    query,
    creditService,
    notificationService,
    moderation,
    getUserLevel
  });

  const reportService = require('./server/services/reportService').createReportService({
    query,
    creditService,
    notificationService,
    getUserLevel
  });

  const helpers = {
    getUserLevel,
    validateEmail,
    canManagePost: (user, post) => Boolean(user && (user.id === post.user_id || isStaff(user))),
    canMarkBestAnswer: (user, post) => Boolean(user && (user.id === post.user_id || isStaff(user))),
    setFlash,
    wantsJson,
    respondError,
    parseDateValue,
    runTransaction,
    autoUnbanOnLogin,
    getSupercodeLock,
    clearSupercodeLock,
    bumpSupercodeFailure,
    createReviewItem,
    countDailyActions,
    countDailyChatSubmissions,
    getBoardById,
    getBoardBySlug,
    getBoards,
    getDashboardData,
    getForumPosts,
    getPostDetail,
    getBoardDetail,
    searchAll,
    getUserProfile,
    getDailyStats,
    checkDailyLimit,
    incrementDailyCount,
    getDailyReportAppealLimit,
    checkCreditCap,
    checkIpBan,
    checkUserBan
  };

  registerRoutes(app, {
    query,
    getBoards,
    getBoardById,
    getBoardDetail,
    getBoardBySlug,
    creditService,
    reviewService,
    reportService,
    notificationService,
    renderMarkdown,
    formatDate,
    buildCountdown,
    excerpt,
    ensureColumn,
    requireAuth,
    requireStaff,
    requireLevel,
    isStaff,
    upload,
    setFlash,
    sendVerificationEmail,
    respondError,
    wantsJson,
    sectionTitles,
    sectionTitlesEn,
    needsAIAudit,
    auditContent,
    applyContentCredit,
    helpers,
    getUserLevel
  });

  app.get('/', async (req, res) => {
    const dateStr = req.query.date || null;
    const showAllClasses = req.query.showAllClasses === 'true';
    const dashboard = await getDashboardData(req.user, dateStr, req.gradeContext, showAllClasses);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    if (dateStr && dateStr < sevenDaysAgoStr) {
      return res.redirect(`/?date=${sevenDaysAgoStr}`);
    }

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const diffDays = Math.round((today - selectedDateObj) / (1000 * 60 * 60 * 24));

    function formatDisplayDate(dateObj, diffDays, locale) {
      const m = dateObj.getMonth() + 1;
      const d = dateObj.getDate();
      const y = dateObj.getFullYear();
      const formatted = `${m}/${d}/${y}`;
      if (diffDays === 0) return locale === 'en' ? `Today ${formatted}` : `今天 ${formatted}`;
      if (diffDays === 1) return locale === 'en' ? `Yesterday ${formatted}` : `昨天 ${formatted}`;
      if (diffDays === 2) return locale === 'en' ? `2 days ago ${formatted}` : `前天 ${formatted}`;
      return formatted;
    }

    let display = formatDisplayDate(selectedDateObj, diffDays, res.locals.locale);

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr;
    const isFuture = selectedDateObj.getTime() > today.getTime();

    res.render('home', {
      pageTitle: '主页',
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
      res.status(400).json({ error: '请输入有效的邮箱地址' });
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
      errors.push('请输入有效的邮箱地址');
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
      pageTitle: '文章',
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
    const userLevel = getUserLevel(req.user);
    if (userLevel < 2) {
      if (wantsJson(req)) {
        res.status(403).json({ error: '您的等级不足以发布文章，请提升信用分后再试' });
        return;
      }
      return res.status(403).render('error-permission-post', {
        pageTitle: '权限不足',
        statusCode: 403,
        message: null
      });
    }
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
    const userLevel = getUserLevel(req.user);
    if (userLevel < 2) {
      respondError(req, res, 403, '您的等级不足以编辑帖子，请提升信用分后再试');
      return;
    }
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
    const userLevel = getUserLevel(req.user);
    if (mode === 'create' && userLevel < 2) {
      if (wantsJson(req)) {
        res.status(403).json({ errors: ['您的等级不足以发布文章，请提升信用分后再试'] });
        return;
      }
      respondError(req, res, 403, '您的等级不足以发布文章，请提升信用分后再试');
      return;
    }

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
      if (userLevel < 2) {
        if (wantsJson(req)) {
          res.status(403).json({ errors: ['您的等级不足以编辑帖子，请提升信用分后再试'] });
          return;
        }
        respondError(req, res, 403, '您的等级不足以编辑帖子，请提升信用分后再试');
        return;
      }
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

    const needsAIAuditResult = needsAIAudit(userLevel, 'post');

    if (needsAIAuditResult) {
      console.log(`[Post] LV${userLevel} 用户发布文章，进入AI审核流程`);
      const auditResult = await auditContent(title, content, 'post');
      console.log(`[Post] AI审核结果:`, auditResult);
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

    const reviewStatus = userLevel >= 4 ? 'approved' : 'pending';
    console.log(`[Post] 用户等级: LV${userLevel}, 审核状态: ${reviewStatus}, AI审核: ${needsAIAuditResult}`);
    const result = await query.run(`
      INSERT INTO posts (board_id, title, content, post_type, is_anonymous, user_id, review_status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, content, postType, isAnonymous, req.user.id, reviewStatus]);

    if (reviewStatus !== 'approved') {
      console.log(`[Post] 帖子 ${result.lastID} 进入人工审核队列，ai_reviewed=${needsAIAuditResult}`);
      await createReviewItem('post', result.lastID, req.user.id, needsAIAuditResult);
    } else {
      console.log(`[Post] 帖子 ${result.lastID} 直接发布`);
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
      comments: detail.comments,
      isStaff: isStaff(req.user)
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
    res.redirect(`/forum/${req.params.id}#reply-section`);
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
    const detail = await getBoardDetail(req.params.slug, req.user, dateStr, req.gradeContext);

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

    function formatDisplayDate(dateObj, diffDays, locale) {
      const m = dateObj.getMonth() + 1;
      const d = dateObj.getDate();
      const y = dateObj.getFullYear();
      const formatted = `${m}/${d}/${y}`;
      if (diffDays === 0) return locale === 'en' ? `Today ${formatted}` : `今天 ${formatted}`;
      if (diffDays === 1) return locale === 'en' ? `Yesterday ${formatted}` : `昨天 ${formatted}`;
      if (diffDays === 2) return locale === 'en' ? `2 days ago ${formatted}` : `前天 ${formatted}`;
      return formatted;
    }

    let display = formatDisplayDate(selectedDateObj, diffDays, res.locals.locale);

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isToday = !dateStr || dateStr === todayStr;
    const isFuture = selectedDateObj.getTime() > today.getTime();

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

  app.get('/boards/:slug/cj', async (req, res) => {
    const dateStr = req.query.date || null;
    const detail = await getBoardDetail(req.params.slug, req.user, dateStr, req.gradeContext);

    if (!detail) {
      res.status(404).json({ error: '学科板块不存在' });
      return;
    }

    const cstOffset = 8 * 60 * 60 * 1000;
    const today = new Date(Date.now() + cstOffset);
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    let selectedDateObj = null;
    if (dateStr) {
      selectedDateObj = new Date(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
    } else {
      selectedDateObj = new Date(today);
    }

    const prevDateObj = new Date(selectedDateObj);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const nextDateObj = new Date(selectedDateObj);
    nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDate = nextDateObj.toISOString().split('T')[0];

    const isFuture = selectedDateObj.getTime() >= today.getTime();
    const isWithinRange = dateStr && dateStr >= sevenDaysAgoStr && dateStr <= todayStr;
    const canGoPrev = dateStr && dateStr > sevenDaysAgoStr;

    res.json({
      sections: detail.sections,
      dateNav: {
        prevDate,
        nextDate,
        isFuture,
        isWithinRange,
        canGoPrev,
        sevenDaysAgo: sevenDaysAgoStr,
        today: todayStr
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
    const sectionDate = String(req.body.date || '').trim();
    const isToday = !sectionDate;

    if (!sectionTitles[section]) {
      respondError(req, res, 400, 'CJ 分区不合法');
      return;
    }

    if (needsAIAudit(req.user.role_level, 'cj')) {
      const auditResult = await auditContent(content, '', 'cj');
      if (!auditResult.passed) {
        respondError(req, res, 403, `内容违规：${auditResult.reason}`);
        return;
      }
      await applyContentCredit(req.user.id, 'cj', true);
    }

    const existing = await query.get(`
      SELECT id FROM board_sections
      WHERE board_id = ? AND section = ?
    `, [detail.board.id, section]);

    const effectiveDate = isToday ? "date('now', 'localtime')" : sectionDate;

    if (existing) {
      await query.run(`
        UPDATE board_sections
        SET section_date = ?, title = ?, content = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [effectiveDate, title || sectionTitles[section], content, req.user.id, existing.id]);
    } else {
      await query.run(`
        INSERT INTO board_sections (board_id, section, section_date, title, content, updated_by, updated_at)
        VALUES (?, ?, ${isToday ? "date('now', 'localtime')" : '?'}, ?, ?, ?, CURRENT_TIMESTAMP)
      `, isToday ? [detail.board.id, section, title || sectionTitles[section], content, req.user.id] : [detail.board.id, section, sectionDate, title || sectionTitles[section], content, req.user.id]);
    }

    setFlash(req, 'success', `${sectionTitles[section]} 已更新`);
    res.redirect(`/boards/${req.params.slug}`);
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
    res.json(await getDashboardData(req.user, null, req.gradeContext));
  });

  app.get('/api/boards', async (req, res) => {
    res.json({ boards: await getBoards(null, req.gradeContext) });
  });

  app.get('/api/classes', async (req, res) => {
    const grade = req.query.grade || (req.gradeContext && req.gradeContext.grade);
    if (!grade) {
      res.json([]);
      return;
    }
    const classes = await query.all(
      'SELECT class_name FROM grade_classes WHERE grade = ? ORDER BY sort_order, class_name',
      [grade]
    );
    res.json(classes.map(c => c.class_name));
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

    if (req.user.role_level === 0) {
      res.status(403).json({ error: 'LV0用户无法点赞，请先登录升级为LV1' });
      return;
    }

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
    const externalUrl = String(req.body.external_url || '').trim();
    const resourceType = String(req.body.resource_type || '').trim();
    const board = await getBoardById(boardId);
    const hasFile = Boolean(req.file);

    if (!board || !title) {
      res.status(400).json({ error: '请选择学科并填写标题' });
      return;
    }

    if (resourceType === 'external' && !externalUrl) {
      res.status(400).json({ error: '请输入外部链接' });
      return;
    }

    if (resourceType === 'file' && !hasFile) {
      res.status(400).json({ error: '请上传文件' });
      return;
    }

    if (!resourceType || (!externalUrl && !hasFile)) {
      res.status(400).json({ error: '请选择资源类型并提供相应内容' });
      return;
    }

    if (hasFile && req.file.size > 100 * 1024 * 1024) {
      res.status(400).json({ error: '文件大小不能超过 100MB' });
      return;
    }

    let initialStatus = 'pending';
    let needsHumanReview = false;

    if (isStaff(req.user)) {
      initialStatus = 'approved';
    } else if (getUserLevel(req.user) === 4) {
      needsHumanReview = true;
    } else if (needsAIAudit(getUserLevel(req.user), 'resource')) {
      const auditResult = await auditContent(title, description, 'resource');
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
        board_id, title, description, file_name, file_path, external_url, status, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [boardId, title, description, fileName, filePath, externalUrl, initialStatus, req.user.id]);

    if (needsHumanReview) {
      await createReviewItem('resource', result.lastID, req.user.id, false);
    }

    res.status(201).json({ resourceId: result.lastID, status: initialStatus });
  });

  app.get('/api/chat/messages/:id/status', async (req, res) => {
    const messageId = Number(req.params.id);
    const message = await query.get(
      'SELECT id, status, is_rejected FROM chat_messages WHERE id = ?',
      [messageId]
    );

    if (!message) {
      res.status(404).json({ error: '消息不存在' });
      return;
    }

    res.json({
      id: message.id,
      status: message.is_rejected ? 'rejected' : message.status
    });
  });

  app.post('/api/chat/messages', async (req, res) => {
    const content = String(req.body.content || '').trim();

    if (content.length < 1 || content.length > 200) {
      res.status(400).json({ error: '聊天内容需在 1-200 个字符之间' });
      return;
    }

    const isAuthenticated = !!(req.user && req.user.id);
    const userLevel = isAuthenticated ? req.user.role_level : 0;
    const userId = isAuthenticated ? req.user.id : null;

    let guestId = null;
    if (!isAuthenticated) {
      guestId = req.cookies.guest_id;
      if (!guestId) {
        guestId = 'G' + Math.floor(100000000 + Math.random() * 900000000).toString();
        res.cookie('guest_id', guestId, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
      }
    }

    if (isAuthenticated && userLevel >= 2) {
      const result = await query.run(
        'INSERT INTO chat_messages (content, user_id, status, is_pending) VALUES (?, ?, ?, ?)',
        [content, userId, 'approved', 0]
      );
      res.status(201).json({
        message: {
          id: result.lastID,
          content,
          author_name: req.user.name,
          created_at: new Date().toISOString(),
          created_at_display: new Date().toLocaleString('zh-CN'),
          canDelete: true
        }
      });
      return;
    }

    if (isAuthenticated) {
      const creditInfo = await query.get('SELECT chat_cooldown_until, consecutive_rejects FROM user_credit WHERE user_id = ?', [userId]);
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
    }

    const needsReview = userLevel <= 1;
    const initialStatus = needsReview ? 'pending' : 'approved';

    const result = await query.run(
      'INSERT INTO chat_messages (content, user_id, status, is_pending, guest_id) VALUES (?, ?, ?, ?, ?)',
      [content, userId, initialStatus, needsReview ? 1 : 0, guestId]
    );

    if (needsReview) {
      const messageId = result.lastID;

      auditContent(content, '', 'chat').then(async (auditResult) => {
        if (!auditResult.passed) {
          await query.run(
            'UPDATE chat_messages SET is_rejected = 1, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            [messageId]
          );

          if (isAuthenticated) {
            const creditInfo = await query.get('SELECT consecutive_rejects FROM user_credit WHERE user_id = ?', [userId]);
            const consecutiveRejects = (creditInfo?.consecutive_rejects || 0) + 1;
            const cooldownMinutes = Math.min(30, 5 * consecutiveRejects);

            await query.run(
              'UPDATE user_credit SET chat_cooldown_until = datetime(CURRENT_TIMESTAMP, ?), consecutive_rejects = ? WHERE user_id = ?',
              [`+${cooldownMinutes} minutes`, consecutiveRejects, userId]
            );

            await applyContentCredit(userId, 'chat', false);
          }

          if (isAuthenticated) {
            req.app.locals.sendToUser && req.app.locals.sendToUser(userId, {
              type: 'chat_rejected',
              messageId,
              reason: auditResult.reason
            });
          }
        } else {
          console.log('[Chat] AI审核通过, messageId:', messageId, 'userLevel:', userLevel);
          await query.run(
            'UPDATE chat_messages SET status = ?, is_pending = 0, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['approved', messageId]
          );

          if (isAuthenticated) {
            await query.run(
              'UPDATE user_credit SET consecutive_rejects = 0 WHERE user_id = ?',
              [userId]
            );
            await applyContentCredit(userId, 'chat', true);

            req.app.locals.sendToUser && req.app.locals.sendToUser(userId, {
              type: 'chat_approved',
              messageId
            });
          }
        }
      });

      const responseMessage = userLevel === 0
        ? '你的消息正在由AI审核中，审核完成后可以发布下一条'
        : '消息已提交审核';

      res.status(201).json({
        pending: true,
        messageId: result.lastID,
        message: responseMessage
      });
    } else {
      const message = await query.get(`
        SELECT chat_messages.*, COALESCE(users.name, '游客') AS author_name
        FROM chat_messages
        LEFT JOIN users ON users.id = chat_messages.user_id
        WHERE chat_messages.id = ?
      `, [result.lastID]);

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

  app.delete('/api/chat/messages/:id', async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: '请先登录' });
      return;
    }

    const messageId = Number(req.params.id);
    const message = await query.get('SELECT * FROM chat_messages WHERE id = ?', [messageId]);

    if (!message) {
      res.status(404).json({ error: '消息不存在' });
      return;
    }

    if (message.user_id !== req.user.id && req.user.role_level !== 6) {
      res.status(403).json({ error: '没有权限删除此消息' });
      return;
    }

    await query.run('DELETE FROM chat_messages WHERE id = ?', [messageId]);
    res.json({ ok: true });
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

    await query.run(
      'UPDATE notifications SET is_read = 1, read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );

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

  app.get('/api/stats/views', async (req, res) => {
    const stats = await query.get('SELECT view_count FROM site_stats WHERE id = 1');
    res.json({ viewCount: stats ? stats.view_count : 0 });
  });

  app.post('/api/stats/record-view', async (req, res) => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const viewToken = req.cookies.view_token || String(now);
    const lastViewTime = parseInt(req.cookies.last_view_time || '0', 10);

    if (lastViewTime > oneMinuteAgo) {
      const stats = await query.get('SELECT view_count FROM site_stats WHERE id = 1');
      res.json({ viewCount: stats ? stats.view_count : 0, recorded: false });
      return;
    }

    await query.run('UPDATE site_stats SET view_count = view_count + 1, last_view_at = CURRENT_TIMESTAMP WHERE id = 1');
    const stats = await query.get('SELECT view_count FROM site_stats WHERE id = 1');

    res.cookie('view_token', viewToken, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });
    res.cookie('last_view_time', String(now), { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true });

    res.json({ viewCount: stats ? stats.view_count : 0, recorded: true });
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

    const today = new Date().toISOString().split('T')[0];
    const level = user.role_level;

    let reportLimit = 0;
    if (level >= 5) reportLimit = 20;
    else if (level >= 3) reportLimit = 10;
    else if (level >= 1) reportLimit = 5;

    let appealLimit = 0;
    if (level >= 5) appealLimit = -1;
    else if (level >= 4) appealLimit = 5;
    else if (level >= 3) appealLimit = 3;

    const todayReports = await query.get(`
      SELECT COUNT(*) AS count FROM reports
      WHERE reporter_id = ? AND date(created_at) = ?
    `, [req.user.id, today]);

    const todayAppeals = await query.get(`
      SELECT COUNT(*) AS count FROM review_appeals
      WHERE user_id = ? AND date(created_at) = ?
    `, [req.user.id, today]);

    const reportUsed = todayReports ? todayReports.count : 0;
    const appealUsed = todayAppeals ? todayAppeals.count : 0;
    const reportRemaining = reportLimit > 0 ? Math.max(0, reportLimit - reportUsed) : 0;
    const appealRemaining = appealLimit === -1 ? -1 : Math.max(0, appealLimit - appealUsed);

    const locale = res.locals.locale || 'zh';
    let usageGuideContent = '';
    try {
      const path = require('path');
      const fs = require('fs');
      const guidePath = path.join(__dirname, 'docs', `usage-guide.${locale}.md`);
      usageGuideContent = fs.readFileSync(guidePath, 'utf8');
    } catch (e) {
      try {
        const fallback = require('path').join(__dirname, 'docs', 'usage-guide.zh.md');
        usageGuideContent = require('fs').readFileSync(fallback, 'utf8');
      } catch (e2) {
        usageGuideContent = '';
      }
    }

    res.render('settings', {
      pageTitle: 'settings.title',
      currentPath: '/settings',
      user: {
        ...user,
        role_name: roleInfo ? roleInfo.name : 'LV' + user.role_level,
        credit: credit ? credit.credit : 0
      },
      credit,
      creditHistory,
      roleInfo,
      nextLevel,
      allRoles,
      reportLimit,
      reportUsed,
      reportRemaining,
      appealLimit,
      appealUsed,
      appealRemaining,
      usageGuideContent
    });
  });

  app.post('/api/settings/grade', requireAuth, async (req, res) => {
    const { grade, password } = req.body;
    const user = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    if (!/^G(6|7|8|9|10|11|12)$/.test(grade)) {
      res.status(400).json({ error: '无效的年级' });
      return;
    }

    await query.run('UPDATE users SET grade = ? WHERE id = ?', [grade, req.user.id]);
    res.json({ ok: true });
  });

  app.post('/api/settings/class', requireAuth, async (req, res) => {
    const { class_name, password } = req.body;
    const user = await query.get('SELECT password_hash, grade FROM users WHERE id = ?', [req.user.id]);

    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      res.status(403).json({ error: '密码验证失败' });
      return;
    }

    if (!['G6', 'G7', 'G8'].includes(user.grade)) {
      res.status(400).json({ error: '只有 G6-G8 年级需要班级' });
      return;
    }

    if (!class_name) {
      res.status(400).json({ error: '班级不能为空' });
      return;
    }

    const validClass = await query.get(
      'SELECT id FROM grade_classes WHERE grade = ? AND class_name = ?',
      [user.grade, class_name.toUpperCase()]
    );
    if (!validClass) {
      res.status(400).json({ error: '该班级不存在' });
      return;
    }

    await query.run('UPDATE users SET class_name = ? WHERE id = ?', [class_name.toUpperCase(), req.user.id]);
    res.json({ ok: true });
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

  app.post('/api/settings/locale', requireAuth, async (req, res) => {
    const locale = req.body.locale === 'en' ? 'en' : 'zh';
    await query.run('UPDATE users SET locale = ? WHERE id = ?', [locale, req.user.id]);
    res.json({ ok: true, locale });
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

    let typeFilter = '';
    if (userLevel === 3) {
      typeFilter = "AND ri.item_type IN ('chat', 'homework')";
    } else if (userLevel === 4) {
      typeFilter = "AND ri.item_type IN ('chat', 'post', 'homework', 'resource')";
    } else if (userLevel >= 5) {
      typeFilter = "AND ri.item_type IN ('chat', 'post', 'homework', 'resource')";
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

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri WHERE ri.status = 'pending' ${typeFilter}
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

  async function getReportTargetInfo(targetType, targetId) {
    if (targetType === 'post') {
      return await query.get('SELECT user_id FROM posts WHERE id = ?', [targetId]);
    } else if (targetType === 'comment') {
      return await query.get('SELECT user_id FROM comments WHERE id = ?', [targetId]);
    } else if (targetType === 'chat') {
      return await query.get('SELECT user_id FROM chat_messages WHERE id = ?', [targetId]);
    } else if (targetType === 'resource') {
      return await query.get('SELECT user_id FROM resources WHERE id = ?', [targetId]);
    } else if (targetType === 'cj') {
      return await query.get('SELECT created_by AS user_id FROM board_sections WHERE id = ?', [targetId]);
    }
    return null;
  }

  function getReportMinReviewerLevel(reportedUserLevel) {
    const level = Number(reportedUserLevel || 0);
    if (level <= 2) return 3;
    if (level === 3) return 4;
    if (level === 4) return 5;
    if (level === 5) return 5;
    if (level === 55) return 6;
    return 5;
  }

  app.post('/api/reports', requireAuth, async (req, res) => {
    const limitResult = await getDailyReportAppealLimit(req.user, 'report');
    if (!limitResult.allowed) {
      res.status(429).json({
        error: `今日举报次数已用完（${limitResult.limit}次），将于明日凌晨重置`
      });
      return;
    }

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

    const targetInfo = await getReportTargetInfo(targetType, targetId);
    const targetUserId = targetInfo ? targetInfo.user_id : null;

    let minReviewerLevel = 4;
    if (targetUserId) {
      const targetUser = await query.get('SELECT role_level FROM users WHERE id = ?', [targetUserId]);
      if (targetUser) {
        minReviewerLevel = getReportMinReviewerLevel(targetUser.role_level);
      }
    }

    const result = await query.run(
      'INSERT INTO reports (reporter_id, target_type, target_id, target_user_id, reason, min_reviewer_level) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, targetType, targetId, targetUserId, reason, minReviewerLevel]
    );

    await incrementDailyCount(req.user.id, 'report');

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

  app.post('/api/appeals', requireAuth, requireLevel(3), async (req, res) => {
    const limitResult = await getDailyReportAppealLimit(req.user, 'appeal');
    if (!limitResult.allowed) {
      res.status(429).json({
        error: `今日申诉次数已用完（${limitResult.limit}次），将于明日凌晨重置`
      });
      return;
    }

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

    await incrementDailyCount(req.user.id, 'appeal');

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

  app.get('/api/review/ai-reviewing', requireAuth, requireLevel(3), async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = 20;
    const offset = (page - 1) * limit;
    const typeFilter = req.query.type ? `AND ri.item_type = '${req.query.type}'` : '';

    const items = await query.all(`
      SELECT ri.*,
             u.name AS author_name
      FROM review_items ri
      JOIN users u ON u.id = ri.created_by
      WHERE ri.status = 'pending' AND ri.ai_reviewed = 0 ${typeFilter}
      ORDER BY datetime(ri.created_at) DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const countRow = await query.get(`
      SELECT COUNT(*) AS total FROM review_items ri WHERE ri.status = 'pending' AND ri.ai_reviewed = 0 ${typeFilter}
    `);

    res.json({
      items,
      pagination: {
        page,
        totalPages: Math.ceil((countRow ? countRow.total : 0) / limit),
        totalItems: countRow ? countRow.total : 0
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
    await initDatabaseFromModule(db, query, ensureCreditRecord);

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
  app.locals.initializeDatabase = initDatabaseFromModule;
  app.locals.startServer = startServer;

  return {
    app,
    db,
    query,
    initializeDatabase: initDatabaseFromModule,
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
