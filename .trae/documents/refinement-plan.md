# BIGZ Hub 细化调整与修复实施计划

## 任务概述

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 调整CJ与文章模块宽度配比 | 高 | 待实施 |
| 2 | 重新设计用户等级系统 + 用户面板 | 高 | 待实施 |
| 3 | 聊天框快捷键修复（Enter发送 Shift+Enter换行） | 中 | 待实施 |
| 4 | 添加用户引导提示（不影响观感） | 中 | 待实施 |

---

## 任务1：调整CJ与文章模块宽度配比

**目标：** CJ模块更宽放更多内容，文章模块收窄

### 实施步骤

1. **修改 [public/css/style.css](file:///z:/BGHub/public/css/style.css) 第474-479行**
   ```css
   /* 当前 */
   grid-template-columns: 1fr 380px 280px;

   /* 改为 */
   grid-template-columns: 1fr 480px 280px;
   ```
   - 文章/笔记列：保持 `1fr`（弹性填充）
   - CJ列：从 `380px` → **`480px`**（增加100px）
   - 右侧列（聊天+资源）：保持 `280px`

2. **验证效果**
   - 确认CJ卡片两列布局下内容显示完整
   - 确认文章卡片不会被挤压

---

## 任务2：重新设计用户等级系统 + 用户面板

**参考文档：** [.trae/USERS.md](file:///z:/BGHub/.trae/USERS.md)

### 2.1 数据库层修改

**文件：** [app.js](file:///z:/BGHub/app.js)

#### A. 更新 `initializeDatabase()` 中的角色定义（第529-537行）

将现有LV定义替换为符合USERS.md的新体系：

```javascript
const defaultRoles = [
  { level: 0, min_credit: 0,    name: 'LV0', badge_color: '#94a3b8', is_admin: 0, daily_post_limit: 0 },
  { level: 1, min_credit: 21,   name: 'LV1', badge_color: '#64748b', is_admin: 0, daily_post_limit: 10 },
  { level: 2, min_credit: 41,   name: 'LV2', badge_color: '#3255a4', is_admin: 0, daily_post_limit: 20 },
  { level: 3, min_credit: 61,  name: 'LV3', badge_color: '#0ea5e9', is_admin: 0, daily_post_limit: 40 },
  { level: 4, min_credit: 81,  name: 'LV4', badge_color: '#16a34a', is_admin: 0, daily_post_limit: 80 },
  { level: 5, min_credit: 101,  name: 'LV5', badge_color: '#f59e0b', is_admin: 0, daily_post_limit: 200 },
  { level: 55, min_credit: -1, name: 'LV5.5', badge_color: '#8b5cf6', is_admin: 0, daily_post_limit: 999 },
  { level: 6, min_credit: 1000, name: 'LV6', badge_color: '#dc2626', is_admin: 1, daily_post_limit: 999 }
];
```

#### B. 修改 `roles` 表结构，添加字段

在 `initializeDatabase()` 中对 `roles` 表执行 ALTER TABLE：
```javascript
await ensureColumn('roles', 'daily_post_limit', 'INTEGER NOT NULL DEFAULT 10');
await ensureColumn('roles', 'chat_audit', 'TEXT NOT NULL DEFAULT "full"'); // full | ai | none
await ensureColumn('roles', 'review_target_min', 'INTEGER NOT NULL DEFAULT -1');
await ensureColumn('roles', 'review_target_max', 'INTEGER NOT NULL DEFAULT -1');
```

#### C. 添加 LV5.5 权限授予/撤销 API

新增端点：
- `POST /api/admin/users/:id/grant-lv55` — 授予LV5.5（需LV6权限）
- `POST /api/admin/users/:id/revoke-lv55` — 撤销LV5.5（需LV6权限）

### 2.2 用户面板（Dashboard）系统

**核心思路：** 每个用户从LV3开始有自己专属的"面板"导航入口

#### A. 新增面板路由

在 [app.js](file:///z:/BGHub/app.js) 中添加：

```javascript
// 用户面板主页（LV3+可见）
app.get('/dashboard', requireAuth, requireLevel(3), async (req, res) => {
  res.render('dashboard', {
    pageTitle: '我的面板',
    // 传递用户当前可操作的统计数据
  });
});
```

#### B. 创建面板视图 [views/dashboard.ejs](file:///z:/BGHub/views/dashboard.ejs)

面板内容根据用户等级动态显示：

| LV | 显示模块 |
|----|---------|
| LV3 | 可审核LV0-LV2内容、每日任务、数据统计 |
| LV4 | 可审核LV0-LV3内容、数据趋势 |
| LV5 | 可审核所有LV0-LV5内容、人工复核队列 |
| LV5.5 | 可临时禁言/锁定内容 |
| LV6 | 全权限面板 + 用户管理 + 系统设置 |

#### C. 修改 [views/partials/header.ejs](file:///z:/BGHub/views/partials/header.ejs)

在导航栏中添加"面板"链接（仅LV3+显示）：

```html
<% if (locals.user && locals.user.role_level >= 3) { %>
    <a href="/dashboard" class="<%= currentPath.startsWith('/dashboard') ? 'is-active' : '' %>">面板</a>
<% } %>
```

### 2.3 权限检查函数增强

在 [app.js](file:///z:/BGHub/app.js) 中添加新的权限辅助函数：

```javascript
// 检查用户是否可以审核某等级用户的内容
function canReviewTarget(user, targetLevel) {
  if (!user) return false;
  if (user.role_level === 6) return true; // LV6可审所有人
  if (user.role_level === 55) return targetLevel <= 5; // LV5.5可审LV0-5
  if (user.role_level >= 3) {
    return targetLevel >= user.role_level - 3 && targetLevel <= user.role_level;
  }
  return false;
}

// 检查用户每日发帖限额
async function checkDailyPostLimit(userId) {
  const count = await countDailyActions(userId, 'posts');
  const role = await query.get('SELECT daily_post_limit FROM roles WHERE level = ?', [getUserLevel(await getUserProfile(userId))]);
  return { count, limit: role.daily_post_limit, canPost: count < limit };
}
```

### 2.4 用户管理面板（LV6专享）

新增 `views/admin/users.ejs` 页面，包含：
- 用户列表（分页）
- 搜索用户
- 修改用户等级
- 授予/撤销LV5.5
- 封禁/解封用户

新增API端点：
- `GET /api/admin/users` — 用户列表
- `POST /api/admin/users/:id/role` — 修改用户等级
- `DELETE /api/admin/users/:id` — 删除用户（LV6）

---

## 任务3：聊天框快捷键修复

**问题：** 当前Enter为换行，发送按钮被隐藏
**目标：** `Enter` 直接发送，`Shift+Enter` 换行

### 3.1 修改聊天表单

**文件：** [views/home.ejs](file:///z:/BGHub/views/home.ejs) 第86-90行

```html
<!-- 修改前 -->
<textarea class="form-control" name="content" rows="3" placeholder="发送消息（无刷新）" required></textarea>

<!-- 修改后 -->
<textarea class="form-control" name="content" rows="3"
  placeholder="按 Enter 发送，Shift+Enter 换行"
  data-chat-textarea required></textarea>
<small class="chat-hint">Enter 发送 · Shift+Enter 换行</small>
```

### 3.2 修改前端JS处理逻辑

**文件：** [public/js/app.js](file:///z:/BGHub/public/js/app.js)

找到聊天表单提交逻辑，添加键盘事件处理：

```javascript
// 聊天框键盘事件处理
const chatTextarea = document.querySelector('[data-chat-textarea]');
if (chatTextarea) {
  chatTextarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = chatTextarea.closest('form[data-chat-form]');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  });
}
```

### 3.3 添加快捷键提示样式

**文件：** [public/css/style.css](file:///z:/BGHub/public/css/style.css)

```css
.chat-hint {
  font-size: 0.75rem;
  color: var(--muted);
  text-align: right;
  margin-top: 4px;
}
```

---

## 任务4：添加用户引导提示

**原则：** 轻量、不影响观感、有帮助

### 4.1 各页面引导文案

#### 首页（home.ejs）
- CJ卡片：悬停提示"点击进入学科板块，查看作业、课件、公告"
- 文章卡片：悬停提示"点击查看全文，参与讨论"

#### 互助广场（forum.ejs）
- 页面顶部添加简短使用说明
- 发帖按钮旁添加"如何提问？"提示

#### 用户面板（dashboard.ejs）
- 每个功能模块添加简短说明
- 审核队列说明：当前有多少条待审，审核标准是什么

#### 审核面板（review.ejs）
- 顶部说明审核标准和操作方法
- 通过/驳回按钮旁添加简短说明

### 4.2 实现方式

使用 `data-tooltip` 属性 + CSS实现悬停提示：

```css
[data-tooltip] {
  position: relative;
  cursor: help;
}
[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 10px;
  background: var(--text);
  color: var(--bg);
  font-size: 0.78rem;
  border-radius: 8px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
  z-index: 10;
}
[data-tooltip]:hover::after {
  opacity: 1;
}
```

### 4.3 具体提示文案

| 位置 | 提示内容 |
|------|---------|
| 首页CJ区标题 | "点击学科卡片查看作业、课件、公告" |
| 首页文章区标题 | "浏览同学们分享的学习笔记与讨论" |
| 互助广场发贴按钮 | "分享你的问题或笔记，帮助他人也进步" |
| 面板导航（LV3+） | "参与社区管理，获得额外积分奖励" |
| 审核面板 | "审核他人内容可获得积分，连续正确审核+1分" |

---

## 实施顺序

1. **任务1**（宽度调整）→ 最简单，先完成
2. **任务3**（聊天快捷键）→ 独立修改
3. **任务2**（等级系统+面板）→ 最复杂，最后完成
4. **任务4**（引导提示）→ 随各页面并行添加

---

## 测试验证清单

- [ ] CJ模块宽度增加到480px，内容显示正常
- [ ] 文章模块保持弹性宽度，布局正常
- [ ] 聊天框按Enter能发送消息，Shift+Enter换行
- [ ] LV3以下用户导航栏无"面板"入口
- [ ] LV3+用户导航栏有"面板"入口
- [ ] LV6用户面板可看到用户管理功能
- [ ] 悬停提示显示正常，不遮挡内容
- [ ] 所有页面提示文案不影响正常浏览
