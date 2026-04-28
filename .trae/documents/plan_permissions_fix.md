# 权限系统高优先级修复计划

## 任务概述

根据 `学生社区信用等级与权限完整说明.md` 文档，修复以下高优先级问题：

1. **聊天消息无 AI 审核** - LV0-2 用户聊天消息应先审后发或先发后审
2. **举报每日上限未实现** - LV1-2: 5次, LV3-4: 10次, LV5-5.5: 20次, LV6: 无限制
3. **申诉每日上限未实现** - LV1-2: 2次, LV3: 3次, LV4: 5次, LV5+: 无限制
4. **作业权限未限制** - LV0 不可发布作业

---

## 修改文件清单

| 文件 | 修改类型 |
|-----|---------|
| `server/database/index.js` | 新增字段 |
| `server/services/helpers.js` | 扩展 checkDailyLimit |
| `server/routes/chat.js` | 添加 AI 审核流程 |
| `server/routes/homeworks.js` | 添加等级验证 |
| `server/routes/admin.js` | 添加举报/申诉频率限制 |
| `app.js` | 添加举报/申诉 API 端点频率限制 |

---

## 详细步骤

### Step 1: 扩展 daily_stats 表

**文件**: `server/database/index.js`

在 `daily_stats` 表中新增两个字段：
- `reports_count` - 当日举报次数
- `appeals_count` - 当日申诉次数

```sql
ALTER TABLE daily_stats ADD COLUMN reports_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN appeals_count INTEGER NOT NULL DEFAULT 0;
```

需要在数据库初始化时检查并添加这两列。

---

### Step 2: 扩展 checkDailyLimit 函数

**文件**: `server/services/helpers.js`

在 `fieldMap` 中新增：
```javascript
const fieldMap = {
  post: 'posts_count',
  chat: 'chat_count',
  cj: 'cj_count',
  resource: 'resource_count',
  report: 'reports_count',     // 新增
  appeal: 'appeals_count'      // 新增
};
```

---

### Step 3: 新增 getDailyReportAppealLimit 函数

**文件**: `server/services/helpers.js`

根据文档创建独立的举报/申诉限制查询函数：

```javascript
async function getDailyReportAppealLimit(user, type) {
  const userLevel = getUserLevel(user);

  // 举报权限检查
  if (userLevel < 1) {
    return { allowed: false, limit: 0, current: 0, reason: 'LV0用户不可举报' };
  }

  // LV6 无限制
  if (userLevel === 6 || userLevel === 55) {
    return { allowed: true, limit: -1, current: 0 };
  }

  // 根据等级获取举报上限
  let limit = 5; // 默认 LV1-2
  if (userLevel >= 3 && userLevel <= 4) limit = 10;
  else if (userLevel >= 5) limit = 20;

  const today = new Date().toISOString().slice(0, 10);
  const field = type === 'report' ? 'reports_count' : 'appeals_count';

  const stats = await query.get(
    'SELECT * FROM daily_stats WHERE user_id = ? AND stat_date = ?',
    [user.id, today]
  );

  const current = stats ? Number(stats[field]) || 0 : 0;

  return {
    allowed: current < limit,
    limit,
    current
  };
}
```

---

### Step 4: 修改聊天消息发布流程

**文件**: `server/routes/chat.js`

根据文档：
- **LV0**: 先审后发（AI审）- 消息进入 pending
- **LV1-LV2**: 先发后审（AI审）- 消息直接可见，后台 AI 审核，违规自动撤回
- **LV3+**: 免审

```javascript
// 在 createChatRoutes 中修改
router.post('/chat/messages', requireAuth, async (req, res) => {
  const content = String(req.body.content || '').trim();
  const userLevel = getUserLevel(req.user);

  if (content.length < 1 || content.length > 200) {
    respondError(req, res, 400, '聊天内容需在 1-200 个字符之间');
    return;
  }

  // LV0: 先审后发
  if (userLevel === 0) {
    const auditResult = await auditContent(content, 'chat');
    if (!auditResult.passed) {
      // AI 审核不通过，消息进入 rejected 状态
      await query.run(
        'INSERT INTO chat_messages (content, user_id, status, is_rejected) VALUES (?, ?, ?, ?)',
        [content, req.user.id, 'pending', 1]
      );
      respondError(req, res, 403, `内容违规：${auditResult.reason}`);
      return;
    }
    // AI 审核通过，进入 pending 等待人工确认
    await query.run(
      'INSERT INTO chat_messages (content, user_id, status) VALUES (?, ?, ?)',
      [content, req.user.id, 'pending']
    );
    await createReviewItem('chat', result.lastID, req.user.id);
    setFlash(req, 'success', '消息已提交审核');
    res.redirect('/chat');
    return;
  }

  // LV1-LV2: 先发后审
  if (userLevel <= 2) {
    // 先直接发布
    await query.run(
      'INSERT INTO chat_messages (content, user_id, status) VALUES (?, ?, ?)',
      [content, req.user.id, 'visible_pending']
    );

    // 后台异步 AI 审核
    const auditResult = await auditContent(content, 'chat');
    if (!auditResult.passed) {
      // 违规，撤回消息
      await query.run(
        'UPDATE chat_messages SET is_rejected = 1, status = ? WHERE id = ?',
        ['rejected', result.lastID]
      );
      await changeCredit(req.user.id, -3, '聊天消息AI审核不通过', null);
    } else {
      // 审核通过，更新状态
      await query.run(
        'UPDATE chat_messages SET status = ? WHERE id = ?',
        ['approved', result.lastID]
      );
    }
    res.redirect('/chat');
    return;
  }

  // LV3+: 直接发布
  await query.run(
    'INSERT INTO chat_messages (content, user_id, status) VALUES (?, ?, ?)',
    [content, req.user.id, 'approved']
  );
  res.redirect('/chat');
});
```

---

### Step 5: 添加举报 API 频率限制

**文件**: `app.js` 中的 `/api/reports` 端点

在举报提交逻辑前添加：

```javascript
app.post('/api/reports', requireAuth, async (req, res) => {
  // 1. 频率限制检查
  const limitResult = await getDailyReportAppealLimit(req.user, 'report');
  if (!limitResult.allowed) {
    res.status(429).json({
      error: `今日举报次数已用完（${limitResult.limit}次），将于明日凌晨重置`
    });
    return;
  }

  // ... 现有逻辑 ...

  // 2. 举报成功后 incrementDailyCount
  if (result.success) {
    await incrementDailyCount(req.user.id, 'report');
  }
});
```

---

### Step 6: 添加申诉 API 频率限制

**文件**: `app.js` 或 `server/routes/admin.js`

在申诉提交逻辑前添加：

```javascript
// 在提交申诉前检查
const limitResult = await getDailyReportAppealLimit(req.user, 'appeal');
if (!limitResult.allowed) {
  res.status(429).json({
    error: `今日申诉次数已用完（${limitResult.limit}次），将于明日凌晨重置`
  });
  return;
}
```

---

### Step 7: 添加作业创建等级验证

**文件**: `server/routes/homeworks.js`

```javascript
router.post('/', requireAuth, async (req, res) => {
  const userLevel = getUserLevel(req.user);

  // LV0 不可发布作业
  if (userLevel === 0) {
    respondError(req, res, 403, 'LV0用户不可发布作业');
    return;
  }

  // 现有逻辑继续...
});
```

---

### Step 8: 数据库迁移脚本

**文件**: `db/migrate_permissions_fix.sql`

```sql
-- 为 daily_stats 表添加举报和申诉计数字段
ALTER TABLE daily_stats ADD COLUMN reports_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN appeals_count INTEGER NOT NULL DEFAULT 0;
```

---

## 实现顺序

1. ✅ 数据库迁移脚本（新增字段）
2. ✅ helpers.js 扩展 `checkDailyLimit` + 新增 `getDailyReportAppealLimit`
3. ✅ homeworks.js 添加 LV0 限制
4. ✅ chat.js 添加 AI 审核流程
5. ✅ app.js/admin.js 添加举报频率限制
6. ✅ app.js/admin.js 添加申诉频率限制

---

## 注意事项

- AI 审核使用已有的 `moderateChatMessage` 函数（Kouri API）
- `changeCredit` 和 `incrementDailyCount` 已有实现，可直接调用
- `getDailyReportAppealLimit` 需要在 helpers.js 中导出
- 所有频率限制在凌晨 0 点重置（通过 `stat_date` 字段实现）