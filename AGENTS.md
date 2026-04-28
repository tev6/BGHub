# BIGZ Hub 技术开发文档 (AGENTS)

[English](AGENTS-en.md) | 中文

---

## 文档说明

本文档面向开发人员和 AI Agents，提供 BIGZ Hub 项目的完整技术架构、实现细节、开发规范和扩展指南。

---

## 第一部分：项目架构

### 1.1 系统架构概览

BIGZ Hub 采用经典的三层 Web 应用架构：

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端层                              │
│  (浏览器 - EJS 模板渲染 / AJAX API 调用)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        应用层                                │
│  (Express 5 - 路由、中间件、业务逻辑)                          │
│  ┌──────────┬──────────┬──────────┬──────────┐            │
│  │ 认证模块  │ 论坛模块  │ 资源模块  │ 管理模块  │            │
│  └──────────┴──────────┴──────────┴──────────┘            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        数据层                               │
│  (SQLite 3 - 表结构、会话存储、文件存储)                       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈详情

| 层级 | 技术方案 | 版本要求 | 说明 |
|------|----------|----------|------|
| 运行时 | Node.js | ≥18.0.0 | 异步非阻塞 I/O |
| Web 框架 | Express | 5.x | 支持 async/await 路由处理器 |
| 模板引擎 | EJS | 3.x | 嵌入式 JavaScript 模板 |
| 数据库 | SQLite3 | 5.x | 本地文件数据库 |
| 会话存储 | express-session + cookie-parser | 最新 | 会话和年级上下文 |
| 密码加密 | bcryptjs | 3.x | 安全密码哈希 |
| Markdown | marked | 15.x | Markdown 转 HTML |
| HTML 净化 | dompurify + jsdom | 3.x / 26.x | XSS 防护 |
| 文件上传 | multer | 2.x | multipart/form-data 处理 |
| 实时通信 | ws | 8.x | WebSocket 实时通知 |
| 测试框架 | node:test | 内置 | Node.js 官方测试 |

### 1.3 核心模块划分

```
app.js (主入口，约 2800+ 行)
│
├── 应用配置
│   ├── createApp() - 应用工厂函数
│   ├── createServer() - HTTP/WebSocket 服务器创建
│   ├── initializeDatabase() - 数据库初始化
│   └── registerRoutes() - 路由注册
│
├── WebSocket 实时通信
│   └── setupWebSocket() - WebSocket 服务器 (ws)
│       ├── 实时通知推送
│       └── 聊天消息广播
│
├── 工具函数 (server/utils/index.js 导出)
│   ├── slugify() - URL 友好字符串
│   ├── stripHtml() - HTML 标签移除
│   ├── excerpt() - 文本摘要提取
│   ├── extractFirstImageUrl() - 图片 URL 提取
│   ├── buildCountdown() - 倒计时计算
│   ├── renderMarkdown() - Markdown 渲染
│   └── formatDate() - 日期格式化
│
├── 业务服务层 (server/services/)
│   ├── creditService - 积分系统
│   │   ├── changeCredit() - 积分变动
│   │   ├── syncUserLevel() - 等级同步
│   │   └── applyDailyLoginCredit() - 每日登录奖励
│   ├── notificationService - 通知系统
│   ├── moderation - AI 内容审核
│   │   ├── moderateChatMessage()
│   │   ├── moderatePost()
│   │   ├── moderateResource()
│   │   └── moderateContent()
│   └── helpers - 通用辅助函数
│       ├── runTransaction() - 事务处理
│       ├── canManagePost() - 帖子管理权限
│       └── canMarkBestAnswer() - 最佳答案标记
│
├── 中间件层 (server/middleware/)
│   ├── requireAuth - 登录验证
│   ├── requireStaff - 权限验证 (LV3+)
│   ├── requireLevel(level) - 等级验证
│   ├── isStaff() - 员工判断
│   └── locale() - 国际化
│
└── 路由层 (server/routes/)
    ├── auth.js - /auth/* 认证路由
    ├── forum.js - /forum/* 互助论坛
    ├── boards.js - /boards/* 学科板块
    ├── cj.js - /cj/* CJ 教学管理
    ├── homeworks.js - /homeworks/* 作业
    ├── resources.js - /resources/* 资源库
    ├── chat.js - /chat/* 实时聊天
    ├── search.js - /search 搜索
    ├── admin.js - /admin/* 管理后台
    └── api/index.js - /api/* REST API
```

---

## 第二部分：数据库设计

### 2.1 ER 关系图

```
users (用户)
    │
    ├── 1:N ──── user_credit (用户积分)
    │                │
    │                └── 1:N ──── credit_log (积分变动日志)
    │
    ├── 1:N ──── posts (帖子)
    │                │
    │                └── 1:N ──── comments (评论)
    │
    ├── 1:N ──── chat_messages (聊天消息)
    │
    ├── 1:N ──── resources (资源)
    │
    ├── 1:N ──── notifications (通知)
    │
    └── 1:N ──── review_items (待审核项)

boards (学科板块)
    │
    └── 1:N ──── board_sections (板块内容区)
    │
    └── 1:N ──── exams (考试)
    │
    └── 1:N ──── homeworks (作业)
    │
    └── 1:N ──── subject_grade_permissions (年级权限)

grade_classes (年级班级)
    │
    └── 属于特定年级 (G6-G8)

subject_grade_permissions (学科年级权限)
    │
    └── 定义学科对各年级的开放情况

roles (角色等级)
    │
    └── 1:N ──── users (用户角色归属)
```

### 2.2 核心表结构

#### users 表

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,           -- 邮箱（唯一标识）
  name TEXT NOT NULL,                    -- 昵称
  grade TEXT NOT NULL,                   -- 年级 G6-G12
  class_name TEXT,                       -- 班级名称 (G6-G8)
  password_hash TEXT NOT NULL,           -- bcrypt 加密密码
  role TEXT NOT NULL DEFAULT 'student',  -- student/moderator/admin
  role_level INTEGER NOT NULL DEFAULT 0, -- LV0-LV6
  created_at DATETIME NOT NULL,          -- 注册时间
  banned_until DATETIME,                 -- 封禁截止时间
  muted_until DATETIME                   -- 禁言截止时间
);
```

#### boards 表

```sql
CREATE TABLE boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,             -- URL 标识 (mathematics, english...)
  name TEXT NOT NULL,                    -- 显示名称
  name_en TEXT NOT NULL DEFAULT '',      -- 英文名称
  color TEXT NOT NULL DEFAULT '#4f46e5', -- UI 颜色标识
  sort_order INTEGER NOT NULL DEFAULT 0, -- 排序权重
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### grade_classes 表

```sql
CREATE TABLE grade_classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade TEXT NOT NULL,                   -- 年级 G6-G8
  class_name TEXT NOT NULL,              -- 班级名称 (A, B, C...)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(grade, class_name)
);
```

#### subject_grade_permissions 表

```sql
CREATE TABLE subject_grade_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,             -- 学科 ID
  grade TEXT NOT NULL,                   -- 年级
  is_shared INTEGER NOT NULL DEFAULT 0,  -- 是否跨班共享 (G6-G8)
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(board_id, grade),
  FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
);
```

#### board_sections 表

```sql
CREATE TABLE board_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  section TEXT NOT NULL,                 -- IC/HW/A
  section_date TEXT NOT NULL DEFAULT (date('now')),
  title TEXT NOT NULL,
  title_en TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  class_name TEXT,                       -- 特定班级 (G6-G8 分班数据)
  updated_by INTEGER,
  updated_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(board_id, section, section_date, class_name)
);
```

#### posts 表

```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,                 -- Markdown 内容
  post_type TEXT NOT NULL DEFAULT 'question', -- question/note/share
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  is_resolved INTEGER NOT NULL DEFAULT 0, -- 是否已解决
  status TEXT NOT NULL DEFAULT 'open',
  review_status TEXT NOT NULL DEFAULT 'approved', -- approved/pending/rejected
  view_count INTEGER NOT NULL DEFAULT 0,
  like_count INTEGER NOT NULL DEFAULT 0,
  dislike_count INTEGER NOT NULL DEFAULT 0,
  user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(board_id) REFERENCES boards(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

#### 积分相关表

```sql
CREATE TABLE roles (
  level INTEGER PRIMARY KEY,              -- LV0-LV6
  min_credit INTEGER NOT NULL,           -- 最低积分要求
  max_credit INTEGER NOT NULL DEFAULT -1,
  name TEXT NOT NULL,                     -- 等级名称
  badge_color TEXT NOT NULL,              -- 徽章颜色
  is_admin INTEGER NOT NULL DEFAULT 0,
  daily_post_limit INTEGER NOT NULL DEFAULT 10,
  chat_audit TEXT NOT NULL DEFAULT 'full',
  review_target_min INTEGER NOT NULL DEFAULT -1,
  review_target_max INTEGER NOT NULL DEFAULT -1,
  login_credit INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_credit (
  user_id INTEGER PRIMARY KEY,
  credit INTEGER NOT NULL DEFAULT 0,      -- 当前积分 (0-1000)
  last_login_date TEXT,                   -- 上次登录日期 (用于每日奖励)
  chat_cooldown_until DATETIME,
  consecutive_rejects INTEGER NOT NULL DEFAULT 0,
  violation_count INTEGER NOT NULL DEFAULT 0,
  last_violation_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,                 -- 积分变动值
  reason TEXT NOT NULL,                   -- 变动原因
  reviewer_id INTEGER,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### 2.3 索引设计

```sql
-- 用户查询优化
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_level ON users(role_level);
CREATE INDEX idx_users_grade ON users(grade);

-- 论坛查询优化
CREATE INDEX idx_posts_board_id ON posts(board_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_review_status ON posts(review_status);

-- 评论查询优化
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- CJ 内容查询优化
CREATE INDEX idx_board_sections_board_id ON board_sections(board_id);
CREATE INDEX idx_board_sections_date ON board_sections(section_date);
CREATE INDEX idx_board_sections_class_name ON board_sections(class_name);

-- 作业查询优化
CREATE INDEX idx_homeworks_board_id ON homeworks(board_id);
CREATE INDEX idx_homeworks_deadline ON homeworks(deadline);

-- 审核查询优化
CREATE INDEX idx_review_items_status ON review_items(status);
CREATE INDEX idx_review_items_created_by ON review_items(created_by);

-- 年级权限查询优化
CREATE INDEX idx_subject_grade_perms_board_id ON subject_grade_permissions(board_id);
CREATE INDEX idx_subject_grade_perms_grade ON subject_grade_permissions(grade);
```

---

## 第三部分：年级班级系统

### 3.1 年级上下文 (gradeContext)

年级上下文用于控制用户可见的学科内容，通过 Cookie 或用户信息传递：

```javascript
// 中间件设置 gradeContext
let gradeContext = null;
if (req.user) {
  // 已登录用户使用其注册年级和班级
  gradeContext = { grade: req.user.grade, class_name: req.user.class_name };
} else {
  // 未登录用户使用 Cookie 中的年级选择
  const gradeCookie = req.cookies.grade_context;
  if (gradeCookie) {
    try { gradeContext = JSON.parse(gradeCookie); } catch (e) {}
  }
}
req.gradeContext = gradeContext;
```

### 3.2 学科可见性过滤

`getBoards` 和 `getBoardDetail` 函数支持根据 `gradeContext` 过滤学科：

```javascript
async function getBoards(dateStr = null, gradeContext = null) {
  let boards = await query.all('SELECT * FROM boards ORDER BY sort_order, name');

  // 如果用户有年级上下文，根据权限过滤学科
  if (gradeContext && gradeContext.grade) {
    const permittedBoards = await query.all(
      'SELECT board_id FROM subject_grade_permissions WHERE grade = ?',
      [gradeContext.grade]
    );
    const permittedBoardIds = new Set(permittedBoards.map(b => b.board_id));
    boards = boards.filter(board => permittedBoardIds.has(board.id));
  }

  return boards;
}
```

### 3.3 权限行为

| 用户状态 | 学科显示 |
|----------|----------|
| 未登录/未选择年级 | 显示全部学科 |
| 已登录/已选择年级 | 只显示该年级开放的学科 |
| 访问特定学科无权限 | 返回 404 |

---

## 第四部分：关键算法与数据流

### 4.1 积分系统算法

#### 每日登录积分奖励

```javascript
async function applyDailyLoginCredit(userId) {
  const creditRow = await ensureCreditRecord(userId);
  const today = currentDateKey();

  if (creditRow.last_login_date === today) {
    return false;
  }

  await query.run(
    'UPDATE user_credit SET last_login_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [today, userId]
  );

  await changeCredit(userId, 10, '每日登录奖励', null);
  return true;
}
```

#### 积分变动与等级同步

```javascript
async function changeCredit(userId, delta, reason, reviewerId) {
  return runTransaction(async () => {
    const creditRow = await ensureCreditRecord(userId);

    let actualDelta = Number(delta || 0);
    if (creditRow.credit >= 999 && actualDelta > 0) {
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta > 1000) {
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta < 0) {
      actualDelta = -creditRow.credit;
    }

    const nextCredit = clampCredit(creditRow.credit + actualDelta);
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
  });
}
```

### 4.2 限流算法

```javascript
function rateLimit({ windowMs, max, keyPrefix }) {
  return async function limiter(req, res, next) {
    const userId = req.user ? req.user.id : null;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const identity = userId ? `u:${userId}` : `ip:${ip}`;

    const routeKey = `${keyPrefix}:${req.method}:${req.path}`;
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
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      return;
    }

    next();
  };
}
```

### 4.3 内容审核流程

```
用户提交内容
      │
      ▼
┌─────────────────┐
│ 权限等级检查     │ ── LV0-LV1 ──► 进入待审核队列
└─────────────────┘
      │
      ▼ (LV2+)
┌─────────────────┐
│ 自动审核通过     │
└─────────────────┘
      │
      ▼
内容发布 / 资源可见
```

### 4.4 Markdown 渲染与安全

```javascript
marked.setOptions({
  gfm: true,
  breaks: true
});

function renderMarkdown(content) {
  if (!content) return '';
  const html = marked.parse(String(content).trim());
  return DOMPurify.sanitize(html);
}
```

---

## 第五部分：API 规范

### 5.1 API 设计原则

- **RESTful 风格**：使用 HTTP 方法语义（GET/POST/PUT/DELETE）
- **JSON 优先**：API 路由返回 JSON，HTML 路由返回页面
- **错误处理一致**：统一错误响应格式 `{ error: string }` 或 `{ errors: string[] }`
- **认证感知**：通过 `wantsJson(req)` 判断返回格式
- **年级感知**：通过 `req.gradeContext` 过滤学科数据

### 5.2 主要 API 端点

#### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/auth/register | 用户注册 | 公开 |
| POST | /api/auth/login | 用户登录 | 公开 |
| POST | /api/auth/logout | 用户登出 | 需登录 |

#### 论坛接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/forum/posts | 获取帖子列表 | 公开 |
| GET | /api/forum/posts/:id | 获取帖子详情 | 公开 |
| POST | /api/forum/posts | 创建帖子 | 需登录 |
| PUT | /api/forum/posts/:id | 编辑帖子 | 需登录 |
| DELETE | /api/forum/posts/:id | 删除帖子 | 需登录 |
| POST | /api/forum/posts/:id/like | 点赞/取消点赞 | 需登录 |
| POST | /api/forum/posts/:id/comments | 添加评论 | 需登录 |

#### 资源与作业接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/resources | 获取资源列表 | 公开 |
| POST | /api/resources | 上传资源 | 需登录 |
| GET | /api/homeworks | 获取作业列表 | 公开 |
| POST | /api/homeworks | 创建作业 | LV3+ |
| POST | /api/homeworks/:id/toggle | 切换完成状态 | 需登录 |

#### 聊天与通知接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/chat/messages | 发送聊天消息 | 需登录 |
| GET | /api/notifications | 获取通知列表 | 需登录 |
| GET | /api/notifications/unread-count | 获取未读数 | 需登录 |
| POST | /api/notifications/:id/read | 标记已读 | 需登录 |
| POST | /api/notifications/read-all | 全部标记已读 | 需登录 |

#### 其他接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/boards | 获取学科板块 | 公开 |
| GET | /api/dashboard | 获取仪表盘数据 | 需登录 |
| GET | /api/search | 全局搜索 | 公开 |

### 5.3 认证请求示例

```javascript
// 注册
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "用户名",
  "grade": "G10"
}

// 登录
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

// 响应
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "用户名",
    "grade": "G10",
    "role": "student"
  }
}
```

### 5.4 权限等级要求

| API 端点 | 权限要求 |
|----------|----------|
| GET /api/* | 公开/需登录 |
| POST /api/forum/posts | 需登录 |
| POST /api/exams | LV3+ (moderator) |
| POST /api/homeworks | LV3+ (moderator) |
| POST /api/resources | 需登录 |
| GET /api/review/items | LV3+ |
| POST /api/review/items/:id/approve | LV3+ |
| GET /api/admin/logs | LV5+ |
| POST /api/admin/credit | LV6 (admin) |
| GET/PUT/POST /api/admin/grades/* | LV6 (admin) |

---

## 第六部分：部署与运维

### 6.1 部署脚本

项目包含两个部署脚本：

#### deploy.py - 代码部署

```bash
# 小更新（保留数据）
python deploy.py -h your-server.com

# 完全重置（替换所有文件）
python deploy.py -h your-server.com --mode full
```

#### sync_db.py - 数据库同步

```bash
# 从服务器下载数据库到本地
python sync_db.py -h your-server.com
```

### 6.2 生产环境检查清单

- [ ] `SESSION_SECRET` 设置为强随机字符串
- [ ] `NODE_ENV=production`
- [ ] 数据库文件定期备份
- [ ] `uploads/` 目录使用独立的持久化存储
- [ ] 配置 Web 服务器反向代理（Nginx）
- [ ] 配置 SSL/TLS 证书
- [ ] 设置日志轮转
- [ ] 配置监控和告警

### 6.3 Nginx 反向代理配置

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 第七部分：开发规范

### 7.1 代码风格

- **使用 2 空格缩进**
- **始终使用分号**
- **关键字后加空格**：`if (condition) {`
- **变量 camelCase，常量 UPPER_SNAKE，文件名 kebab-case**

### 7.2 SQL 规范

```javascript
// 参数化查询防注入
await query.get('SELECT * FROM users WHERE id = ?', [userId]);

// 多值参数
await query.all('SELECT * FROM posts WHERE board_id IN (?, ?, ?)', [id1, id2, id3]);

// 事务处理
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
```

### 7.3 年级上下文使用规范

```javascript
// 在路由中使用 gradeContext
app.get('/api/boards', async (req, res) => {
  const boards = await getBoards(null, req.gradeContext);
  res.json({ boards });
});

// 在业务逻辑中检查权限
async function getBoardDetail(slug, user, dateStr = null, gradeContext = null) {
  const board = await getBoardBySlug(slug);
  if (!board) return null;

  // 如果有年级上下文，检查权限
  if (gradeContext && gradeContext.grade) {
    const perm = await query.get(
      'SELECT id FROM subject_grade_permissions WHERE board_id = ? AND grade = ?',
      [board.id, gradeContext.grade]
    );
    if (!perm) return null;
  }

  // ... 继续获取详情
}
```

---

## 第八部分：文件结构

```
BGHub/
├── app.js                    # 应用主入口 (~2800+ 行)
├── package.json              # 项目配置
├── .env                      # 环境变量（不提交）
├── deploy.py                 # Python 代码部署脚本
├── deploy.sh                 # Shell 代码部署脚本
├── sync_db.py                # Python 数据库同步脚本
├── migrate.js                # 数据库迁移脚本
├── .eslintrc.json            # ESLint 配置
│
├── data/                     # 数据目录
│   └── bigz-hub-mvp.db       # SQLite 数据库文件
│
├── public/                    # 静态资源
│   ├── css/
│   │   └── style.css         # 主样式文件
│   ├── js/
│   │   ├── app.js           # 主前端脚本
│   │   ├── editor.js        # Markdown 编辑器
│   │   ├── grade-selector.js # 年级选择器组件
│   │   ├── i18n.js          # 国际化脚本
│   │   ├── cj-view.js       # CJ 模块视图脚本
│   │   └── board-date-nav.js # 板块日期导航
│   ├── images/
│   │   ├── logo-dark.svg    # 深色主题 Logo
│   │   └── logo-light.svg   # 浅色主题 Logo
│   └── uploads/              # 用户上传文件
│
├── views/                     # EJS 模板
│   ├── partials/
│   │   ├── header.ejs       # 页眉（含 i18n 和主题切换）
│   │   └── footer.ejs       # 页脚
│   ├── admin/
│   │   ├── grades.ejs       # 年级班级管理
│   │   └── users.ejs        # 用户管理
│   ├── cj/                  # CJ 教学管理模块
│   │   ├── index.ejs        # CJ 首页
│   │   ├── select.ejs       # 学科选择
│   │   ├── subject.ejs      # 学科详情
│   │   └── edit.ejs         # 内容编辑
│   ├── home.ejs             # 首页仪表盘
│   ├── login.ejs            # 登录页
│   ├── register.ejs         # 注册页（含年级班级选择）
│   ├── settings.ejs         # 用户设置
│   ├── forum.ejs            # 互助广场
│   ├── forum-form.ejs       # 发帖/编辑页
│   ├── forum-detail.ejs     # 帖子详情
│   ├── board.ejs            # 学科板块
│   ├── boards.ejs           # 全部学科板块
│   ├── exams.ejs            # 考试日历
│   ├── homeworks.ejs        # 作业看板
│   ├── resources.ejs        # 资源库
│   ├── resources-form.ejs   # 资源上传
│   ├── search.ejs           # 搜索结果
│   ├── review.ejs           # 审核面板
│   ├── chat.ejs             # 实时聊天
│   ├── messages.ejs          # 消息中心
│   ├── notifications.ejs    # 通知列表
│   ├── post.ejs             # 帖子展示（旧）
│   ├── new-post.ejs         # 发帖页（旧）
│   ├── create-post.ejs      # 创建帖子
│   ├── dashboard.ejs        # 仪表盘（旧）
│   ├── error.ejs            # 错误页面
│   ├── appeal-modal.ejs     # 申诉弹窗
│   ├── report-modal.ejs     # 举报弹窗
│   └── board-edit.ejs       # 板块编辑
│
├── server/                    # 后端核心代码
│   ├── config/
│   │   └── supercode.js     # 应用配置
│   ├── database/
│   │   └── index.js         # 数据库初始化和迁移
│   ├── locales/
│   │   ├── zh.json          # 中文翻译
│   │   └── en.json          # 英文翻译
│   ├── middleware/
│   │   ├── index.js         # 中间件导出
│   │   ├── auth.js          # 认证中间件 (requireAuth, requireStaff, requireLevel)
│   │   └── locale.js        # 国际化中间件
│   ├── routes/              # 路由模块
│   │   ├── index.js         # 路由注册中心
│   │   ├── auth.js          # 认证路由 (/auth/*)
│   │   ├── forum.js         # 论坛路由 (/forum/*)
│   │   ├── boards.js        # 学科板块路由 (/boards/*)
│   │   ├── cj.js            # CJ 模块路由 (/cj/*)
│   │   ├── homeworks.js     # 作业路由 (/homeworks/*)
│   │   ├── resources.js     # 资源路由 (/resources/*)
│   │   ├── chat.js          # 聊天路由 (/chat/*)
│   │   ├── search.js        # 搜索路由 (/search)
│   │   ├── admin.js         # 管理后台路由
│   │   └── api/
│   │       └── index.js     # REST API 路由 (/api/*)
│   ├── services/            # 业务服务层
│   │   ├── index.js         # 服务导出
│   │   ├── credit.js        # 积分服务 (changeCredit, syncUserLevel)
│   │   ├── helpers.js       # 辅助函数 (runTransaction, canManagePost)
│   │   ├── moderation.js    # 内容审核 (moderateChat, moderatePost)
│   │   └── notification.js  # 通知服务
│   └── utils/               # 工具函数
│       ├── index.js         # 工具导出
│       ├── slugify.js       # URL 友好字符串
│       ├── date.js          # 日期处理 (buildCountdown, formatDate)
│       ├── markdown.js      # Markdown 渲染
│       ├── stripHtml.js     # HTML 标签移除
│       ├── excerpt.js       # 文本摘要提取
│       ├── extractFirstImageUrl.js # 图片 URL 提取
│       └── sanitize.js      # HTML 净化
│
├── components/               # Vue 组件 (Storybook)
│   ├── ArticleList.vue      # 文章列表组件
│   ├── CJPanel.vue          # CJ 面板组件
│   ├── ChatCard.vue         # 聊天卡片组件
│   ├── ResourceCard.vue     # 资源卡片组件
│   └── ReviewPanel.vue      # 审核面板组件
│
├── stories/                  # Storybook 故事文件
│   ├── ArticleList.stories.ts
│   ├── CJPanel.stories.ts
│   ├── ChatCard.stories.ts
│   ├── ResourceCard.stories.ts
│   └── ReviewPanel.stories.ts
│
├── tests/                    # 测试文件
│   ├── app.test.js          # 单元测试
│   ├── permission-test-document.md
│   └── permission-test-error-log.md
│
├── db/                       # 数据库脚本
│   ├── migrations/
│   │   └── 001_add_indexes.sql
│   └── migrate_2.0.0.sql     # 2.0 版本迁移
│
└── docs/                     # 文档
    ├── openapi.yaml         # OpenAPI 规范
    ├── permission-matrix.md  # 权限矩阵
    ├── review-flow.md       # 审核流程
    └── deployment-checklist.md # 部署检查清单
```

### 8.1 路由速查表

| 路由文件 | 路径前缀 | 功能说明 |
|---------|---------|---------|
| auth.js | /auth | 登录、注册、登出 |
| forum.js | /forum | 互助广场、发帖、回帖 |
| boards.js | /boards | 学科板块浏览 |
| cj.js | /cj | CJ 教学管理模块 |
| homeworks.js | /homeworks | 作业管理 |
| resources.js | /resources | 资源库 |
| chat.js | /chat | 实时聊天 |
| search.js | /search | 全局搜索 |
| admin.js | /admin | 管理后台 |
| api/index.js | /api | REST API 接口 |

---

## 附录 A：错误代码

| HTTP 状态码 | 含义 |
|-------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未登录 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 附录 B：环境变量

| 变量名 | 默认值 | 必填 | 说明 |
|--------|--------|------|------|
| `PORT` | 3000 | 否 | 服务端口 |
| `HOST` | 0.0.0.0 | 否 | 监听地址 |
| `SESSION_SECRET` | development-secret | **是** | 会话密钥（生产环境必须设置） |
| `EMAIL_FROM` | noreply@bghub.com | 否 | 邮件发送地址 |
| `RESEND_API_KEY` | - | 否 | Resend API 密钥 |

---

[返回顶部](#bigz-hub-技术开发文档-agents)
