const express = require('express');
const bcrypt = require('bcryptjs');

function createAuthRoutes({ query, sendVerificationEmail, creditService, setFlash }) {
  const router = express.Router();

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  }

  function parseDateValue(value) {
    return value ? new Date(value) : null;
  }

  function wantsJson(req) {
    return req.path.startsWith('/api/');
  }

  async function autoUnbanOnLogin(userId) {
    const banRecord = await query.get('SELECT * FROM user_bans WHERE user_id = ?', [userId]);

    if (banRecord && banRecord.expires_at) {
      if (parseDateValue(banRecord.expires_at) <= new Date()) {
        await query.run('DELETE FROM user_bans WHERE user_id = ?', [userId]);
        await query.run('UPDATE users SET banned_until = NULL WHERE id = ?', [userId]);
        return true;
      }
    }

    return false;
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

  router.get('/login', (req, res) => {
    res.render('login', {
      pageTitle: '登录',
      formMode: 'login',
      errors: []
    });
  });

  router.post('/api/register/send-code', async (req, res) => {
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

  router.get('/register', (req, res) => {
    res.render('register', {
      pageTitle: '注册',
      formMode: 'register',
      errors: [],
      formData: {}
    });
  });

  router.post('/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim();
    const grade = String(req.body.grade || '').trim();
    const className = String(req.body.class_name || '').trim();
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

    if (['G6', 'G7', 'G8'].includes(grade) && !className) {
      errors.push('G6-G8 年级必须选择班级');
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
      'INSERT INTO users (email, name, grade, class_name, password_hash, role, role_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [email, name, grade, className || null, passwordHash, role, roleLevel]
    );

    await creditService.ensureCreditRecord(result.lastID);
    req.session.userId = result.lastID;

    if (wantsJson(req)) {
      const user = await getUserProfile(result.lastID);
      res.status(201).json({ user });
      return;
    }

    setFlash(req, 'success', role === 'admin' ? '已创建管理员账号并登录' : '注册成功，欢迎加入 BG Hub');
    res.redirect('/');
  });

  router.post('/login', async (req, res) => {
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
    await creditService.ensureCreditRecord(user.id);
    await creditService.applyDailyLoginCredit(user.id);

    if (wantsJson(req)) {
      res.json({ user: await getUserProfile(user.id) });
      return;
    }

    setFlash(req, 'success', `欢迎回来，${user.name}`);
    res.redirect('/');
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      if (wantsJson(req)) {
        res.json({ ok: true });
        return;
      }

      res.redirect('/');
    });
  });

  return router;
}

module.exports = createAuthRoutes;