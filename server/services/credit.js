function createCreditService({ query, getUserLevel }) {
  function clampCredit(value) {
    return Math.max(0, Math.min(1000, Number(value || 0)));
  }

  function currentDateKey() {
    return new Date().toISOString().slice(0, 10);
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

  async function getUserCredit(userId) {
    const creditRow = await ensureCreditRecord(userId);
    return creditRow ? creditRow.credit : 0;
  }

  async function applyDailyLoginCredit(userId) {
    const user = await query.get('SELECT role_level FROM users WHERE id = ?', [userId]);
    if (!user) {
      return false;
    }

    const roleInfo = await query.get('SELECT login_credit, max_credit FROM roles WHERE level = ?', [user.role_level]);
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
    const creditCap = roleInfo && roleInfo.max_credit >= 0 ? Number(roleInfo.max_credit) : -1;

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
    return { capped: true, excess: excessCredit };
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

  function getContentTypeName(type) {
    const names = {
      chat: '聊天消息',
      cj: 'CJ内容',
      post: '文章',
      resource: '资源'
    };
    return names[type] || '内容';
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

  return {
    clampCredit,
    currentDateKey,
    ensureCreditRecord,
    syncUserLevel,
    changeCredit,
    getUserCredit,
    applyDailyLoginCredit,
    checkCreditCap,
    applyContentCredit,
    AUDIT_CREDIT_REWARDS,
    AUDIT_CREDIT_PENALTIES,
    getContentTypeName
  };
}

module.exports = { createCreditService };