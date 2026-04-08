# 用户设置页面 & 聊天审核系统改造计划

## 任务概述

### 1. 删除私信页面
- 删除 `/messages` 路由及所有相关 API 路由
- 从导航栏移除私信入口（如有）

### 2. 新增用户设置页面
- 创建 `/settings` 路由（需要登录）
- 创建 `views/settings.ejs` 视图文件
- 显示用户信息：等级、积分、账户信息
- 显示积分变动历史记录
- 提供注销账户选项

### 3. 改造聊天审核系统
- **LV0 用户**：
  - 发送消息后进入待审核状态，显示"审核完成后可以发送下条消息"
  - 审核失败：自动撤回消息、增加递减冷却时间、扣除积分
  - 审核成功：增加积分
- **LV1 用户**：可连续发送，但发送后仍进行审核
- **LV2+ 用户**：保持现有逻辑或微调

### 4. CJ 页面显示优化
- 主页 CJ 卡片始终显示 "IC"、"HW"、"A"
- 不再根据语言切换显示"课前预习"、"课后作业"、"公告"

---

## 详细实施步骤

### 第一阶段：删除私信页面

#### 1.1 删除私信相关路由（app.js）
```javascript
// 删除以下路由：
// - app.get('/messages')
// - app.get('/messages/:id')
// - app.post('/api/conversations')
// - app.post('/api/conversations/:id/messages')
// - app.post('/api/conversations/:id/read')
```

#### 1.2 删除私信相关视图文件
```bash
# 删除 views/messages.ejs（如果存在）
```

#### 1.3 更新导航栏
- 从 header 移除私信入口（如有）

---

### 第二阶段：创建用户设置页面

#### 2.1 创建新路由 (app.js)
```javascript
app.get('/settings', requireAuth, async (req, res) => {
  // 获取用户信息
  const user = await query.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  // 获取积分信息
  const credit = await query.get('SELECT * FROM user_credit WHERE user_id = ?', [req.user.id]);
  // 获取积分变动历史（最近50条）
  const creditHistory = await query.all(`
    SELECT * FROM credit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `, [req.user.id]);

  res.render('settings', {
    pageTitle: '用户设置',
    user,
    credit,
    creditHistory
  });
});
```

#### 2.2 创建 POST 注销账户路由
```javascript
app.post('/api/settings/deactivate', requireAuth, async (req, res) => {
  // 将用户状态设为 deactivated 或删除用户
  // 根据业务需求决定是软删除还是硬删除
});
```

#### 2.3 创建视图文件 (views/settings.ejs)
- 用户信息卡片：显示头像、昵称、邮箱、年级、注册时间
- 等级信息卡片：当前等级、等级名称、徽章颜色
- 积分信息卡片：当前积分、积分变动趋势
- 积分历史列表：显示每条积分变动的原因、时间和数值
- 注销账户按钮（需二次确认）

---

### 第三阶段：改造聊天审核系统

#### 3.1 修改 chat_messages 表结构
```sql
ALTER TABLE chat_messages ADD COLUMN is_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN is_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN reviewed_at DATETIME;
```

#### 3.2 添加用户冷却时间字段
```sql
ALTER TABLE user_credit ADD COLUMN chat_cooldown_until DATETIME;
ALTER TABLE user_credit ADD COLUMN consecutive_rejects INTEGER NOT NULL DEFAULT 0;
```

#### 3.3 修改聊天发送 API
```javascript
app.post('/api/chat/messages', requireAuth, async (req, res) => {
  const content = String(req.body.content || '').trim();
  const userLevel = req.user.role_level;

  // 检查冷却时间
  if (userLevel === 0) {
    const cooldown = await query.get(
      'SELECT chat_cooldown_until FROM user_credit WHERE user_id = ?',
      [req.user.id]
    );
    if (cooldown && new Date(cooldown.chat_cooldown_until) > new Date()) {
      res.status(429).json({ error: '请等待冷却时间结束', cooldownUntil: cooldown.chat_cooldown_until });
      return;
    }
  }

  // 插入消息，LV0 和 LV1 需要审核
  const needsReview = userLevel <= 1;
  const status = needsReview ? 'pending' : 'approved';

  const result = await query.run(
    'INSERT INTO chat_messages (content, user_id, status, is_pending) VALUES (?, ?, ?, ?)',
    [content, req.user.id, status, needsReview ? 1 : 0]
  );

  if (needsReview) {
    // 异步审核
    moderateChatMessage(content).then(modResult => {
      if (modResult.decision === 'REJECT') {
        // 审核失败：标记为已拒绝、设置冷却、扣积分
        query.run('UPDATE chat_messages SET is_rejected = 1, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [result.lastID]);
        const consecutiveRejects = await query.get('SELECT consecutive_rejects FROM user_credit WHERE user_id = ?', [req.user.id]);
        const newConsecutive = (consecutiveRejects?.consecutive_rejects || 0) + 1;
        const cooldownMinutes = Math.min(30, 5 * newConsecutive); // 5, 10, 15, 20, 25, 30 分钟
        const creditDeduct = Math.min(10, 2 * newConsecutive); // 2, 4, 6, 8, 10 积分

        query.run('UPDATE user_credit SET chat_cooldown_until = datetime(CURRENT_TIMESTAMP, ?), consecutive_rejects = ? WHERE user_id = ?',
          [`+${cooldownMinutes} minutes`, newConsecutive, req.user.id]);
        changeCredit(req.user.id, -creditDeduct, '聊天内容违规', null);

        res.json({
          success: false,
          message: '内容审核未通过',
          cooldownMinutes,
          creditDeduct
        });
      } else {
        // 审核成功：标记为已通过、增加积分
        query.run('UPDATE chat_messages SET status = "approved", is_pending = 0, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [result.lastID]);
        query.run('UPDATE user_credit SET consecutive_rejects = 0 WHERE user_id = ?', [req.user.id]);
        changeCredit(req.user.id, 1, '正确审核聊天内容', null);

        res.json({
          success: true,
          message: '审核完成，可以发送下条消息'
        });
      }
    });

    // LV0 用户必须等待审核
    if (userLevel === 0) {
      res.json({
        pending: true,
        message: '审核完成后可以发送下条消息'
      });
    }
  } else {
    res.json({ success: true, message });
  }
});
```

#### 3.4 修改获取聊天消息 API
```javascript
// 只返回未被拒绝的消息
'WHERE chat_messages.status IN ("approved", "visible_pending") AND chat_messages.is_rejected = 0'
```

---

### 第四阶段：CJ 页面显示优化

#### 4.1 修改 home.ejs 中的 CJ 显示
```ejs
<!-- 将 -->
<span data-i18n="board.ic">课前预习</span>
<!-- 改为 -->
<span class="cj-label">IC</span>
```

#### 4.2 更新翻译文件
- 从翻译文件中移除 `board.ic`、`board.hw`、`board.a` 的中文翻译
- 或保留但不使用

---

## 文件清单

### 新增文件
- `views/settings.ejs` - 用户设置页面

### 修改文件
- `app.js` - 添加 settings 路由、修改聊天审核逻辑、删除私信路由
- `public/js/app.js` - 更新聊天客户端逻辑
- `views/home.ejs` - CJ 显示优化
- `server/locales/zh.json` - 移除/更新翻译
- `server/locales/en.json` - 移除/更新翻译

### 删除文件
- `views/messages.ejs`（如果存在）

---

## 验证清单

- [ ] 私信页面和路由已删除
- [ ] 用户设置页面可正常访问
- [ ] 设置页面显示正确的用户信息
- [ ] 积分历史记录正确显示
- [ ] LV0 用户发送消息后显示等待审核提示
- [ ] LV0 审核失败消息自动隐藏
- [ ] LV0 审核失败后冷却时间递增
- [ ] LV0 审核失败后积分扣除
- [ ] LV1 用户可连续发送但仍审核
- [ ] LV2+ 用户正常发送
- [ ] 主页 CJ 卡片显示 IC/HW/A
