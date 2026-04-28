function createNotificationService({ query }) {
  async function createNotification(userId, title, content, type = 'system') {
    await query.run(
      'INSERT INTO notifications (user_id, title, content, notification_type) VALUES (?, ?, ?, ?)',
      [userId, title, content, type]
    );
    return query.get('SELECT * FROM notifications WHERE id = last_insert_rowid()');
  }

  async function getNotifications(userId, { limit = 20, offset = 0, type = null } = {}) {
    let sql = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (type) {
      sql += ' AND notification_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return query.all(sql, params);
  }

  async function getUnreadCount(userId, type = null) {
    let sql = 'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0';
    const params = [userId];

    if (type) {
      sql += ' AND notification_type = ?';
      params.push(type);
    }

    const result = await query.get(sql, params);
    return result ? result.count : 0;
  }

  async function markAsRead(notificationId, userId) {
    const notification = await query.get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (!notification) {
      return false;
    }

    await query.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId]);
    return true;
  }

  async function markAllAsRead(userId) {
    await query.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    return true;
  }

  async function deleteNotification(notificationId, userId) {
    const notification = await query.get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );

    if (!notification) {
      return false;
    }

    await query.run('DELETE FROM notifications WHERE id = ?', [notificationId]);
    return true;
  }

  async function getNotificationById(notificationId, userId) {
    return query.get(
      'SELECT * FROM notifications WHERE id = ? AND user_id = ?',
      [notificationId, userId]
    );
  }

  return {
    createNotification,
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationById
  };
}

module.exports = { createNotificationService };