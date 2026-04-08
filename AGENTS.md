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
| 会话存储 | connect-sqlite3 | 0.9.x | SQLite-backed 会话 |
| 密码加密 | bcryptjs | 3.x | 安全密码哈希 |
| Markdown | marked | 15.x | Markdown 转 HTML |
| HTML 净化 | dompurify + jsdom | 3.x / 26.x | XSS 防护 |
| 文件上传 | multer | 2.x | multipart/form-data 处理 |
| 实时通信 | ws | 8.x | WebSocket（待实现） |
| 测试框架 | node:test | 内置 | Node.js 官方测试 |

### 1.3 核心模块划分

```
app.js (主入口)
├── 应用配置模块
│   ├── createApp() - 应用工厂函数
│   ├── 数据库初始化 - initializeDatabase()
│   └── 静态资源与中间件配置
│
├── 工具函数模块
│   ├── slugify() - URL 友好字符串
│   ├── stripHtml() - HTML 标签移除
│   ├── excerpt() - 文本摘要提取
│   ├── extractFirstImageUrl() - 图片 URL 提取
│   ├── buildCountdown() - 倒计时计算
│   ├── renderMarkdown() - Markdown 渲染
│   └── formatDate() - 日期格式化
│
├── 数据库访问层 (createDatabaseHelpers)
│   ├── query.run() - 增删改操作
│   ├── query.get() - 单条查询
│   └── query.all() - 多条查询
│
├── 业务逻辑层
│   ├── 认证模块 - validateEmail, ensureCreditRecord
│   ├── 积分系统 - changeCredit, syncUserLevel
│   ├── 内容管理 - getForumPosts, getPostDetail
│   └── 搜索系统 - searchAll
│
├── 中间件层
│   ├── requireAuth - 登录验证
│   ├── requireStaff - 权限验证
│   ├── requireLevel() - 等级验证
│   └── rateLimit() - 限流控制
│
└── 路由处理层
    ├── GET/POST / - 首页仪表盘
    ├── /auth - 认证路由组
    ├── /forum - 论坛路由组
    ├── /boards - 学科板块路由组
    ├── /exams - 考试路由组
    ├── /homeworks - 作业路由组
    ├── /resources - 资源路由组
    ├── /api/* - REST API 路由组
    └── /admin/* - 管理后台路由组
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
  description TEXT NOT NULL,             -- 板块描述
  color TEXT NOT NULL DEFAULT '#4f46e5', -- UI 颜色标识
  sort_order INTEGER NOT NULL DEFAULT 0, -- 排序权重
  created_at DATETIME NOT NULL
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
  name TEXT NOT NULL,                     -- 等级名称
  badge_color TEXT NOT NULL,              -- 徽章颜色
  is_admin INTEGER NOT NULL DEFAULT 0     -- 是否管理员等级
);

CREATE TABLE user_credit (
  user_id INTEGER PRIMARY KEY,
  credit INTEGER NOT NULL DEFAULT 0,      -- 当前积分 (0-1000)
  last_login_date TEXT,                   -- 上次登录日期 (用于每日奖励)
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE credit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,                 -- 积分变动值
  reason TEXT NOT NULL,                   -- 变动原因
  reviewer_id INTEGER,                     -- 审核人（若是审核奖励）
  created_at DATETIME NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### 2.3 索引设计

```sql
-- 用户查询优化
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_level ON users(role_level);

-- 论坛查询优化
CREATE INDEX idx_posts_board_id ON posts(board_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_posts_review_status ON posts(review_status);

-- 评论查询优化
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);

-- 作业查询优化
CREATE INDEX idx_homeworks_board_id ON homeworks(board_id);
CREATE INDEX idx_homeworks_deadline ON homeworks(deadline);

-- 审核查询优化
CREATE INDEX idx_review_items_status ON review_items(status);
CREATE INDEX idx_review_items_created_by ON review_items(created_by);
```

---

## 第三部分：关键算法与数据流

### 3.1 积分系统算法

#### 每日登录积分奖励

```javascript
async function applyDailyLoginCredit(userId) {
  // 1. 获取用户积分记录
  const creditRow = await ensureCreditRecord(userId);
  const today = currentDateKey(); // YYYY-MM-DD 格式

  // 2. 检查今日是否已领取
  if (creditRow.last_login_date === today) {
    return false; // 已领取
  }

  // 3. 更新登录日期
  await query.run(
    'UPDATE user_credit SET last_login_date = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
    [today, userId]
  );

  // 4. 发放每日奖励
  await changeCredit(userId, 10, '每日登录奖励', null);
  return true;
}
```

#### 积分变动与等级同步

```javascript
async function changeCredit(userId, delta, reason, reviewerId) {
  return runTransaction(async () => {
    // 1. 获取当前积分
    const creditRow = await ensureCreditRecord(userId);

    // 2. 计算实际变动值（上限 1000，下限 0）
    let actualDelta = Number(delta || 0);
    if (creditRow.credit >= 999 && actualDelta > 0) {
      // 已达上限，只能补到 1000
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta > 1000) {
      actualDelta = Math.max(0, 1000 - creditRow.credit);
    } else if (creditRow.credit + actualDelta < 0) {
      actualDelta = -creditRow.credit;
    }

    // 3. 更新积分
    const nextCredit = clampCredit(creditRow.credit + actualDelta);
    await query.run(
      'UPDATE user_credit SET credit = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
      [nextCredit, userId]
    );

    // 4. 记录积分变动日志
    await query.run(
      'INSERT INTO credit_log (user_id, delta, reason, reviewer_id) VALUES (?, ?, ?, ?)',
      [userId, actualDelta, reason, reviewerId]
    );

    // 5. 同步用户等级
    await syncUserLevel(userId);

    return { credit: nextCredit, delta: actualDelta };
  });
}
```

#### 等级同步算法

```javascript
async function syncUserLevel(userId) {
  // 1. 获取当前积分
  const creditRow = await ensureCreditRecord(userId);

  // 2. 查询满足积分条件的最高等级
  const roleRow = await query.get(`
    SELECT * FROM roles
    WHERE min_credit <= ?
    ORDER BY level DESC
    LIMIT 1
  `, [creditRow.credit]);

  // 3. 计算新等级（管理员等级不可降）
  const existingUser = await query.get('SELECT role_level, role FROM users WHERE id = ?', [userId]);
  const nextLevel = existingUser.role_level === 6 ? 6 : (roleRow ? roleRow.level : 0);
  const nextRole = nextLevel >= 6 ? 'admin' : (nextLevel >= 3 ? 'moderator' : 'student');

  // 4. 如果等级有变化，更新并通知
  if (existingUser.role_level !== nextLevel || existingUser.role !== nextRole) {
    await query.run('UPDATE users SET role_level = ?, role = ? WHERE id = ?', [nextLevel, nextRole, userId]);
    // 发送等级变更通知和邮件
  }

  return nextLevel;
}
```

### 3.2 限流算法

```javascript
function rateLimit({ windowMs, max, keyPrefix }) {
  return async function limiter(req, res, next) {
    // 1. 识别用户（登录用户或 IP）
    const userId = req.user ? req.user.id : null;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const identity = userId ? `u:${userId}` : `ip:${ip}`;

    // 2. 构造限流键
    const routeKey = `${keyPrefix}:${req.method}:${req.path}`;
    const key = `${routeKey}:${identity}`;
    const now = Date.now();

    // 3. 检查并更新计数
    const entry = rateLimiterState.get(key) || { count: 0, startAt: now };

    if (now - entry.startAt > windowMs) {
      entry.count = 0;
      entry.startAt = now;
    }

    entry.count += 1;
    rateLimiterState.set(key, entry);

    // 4. 超限则拒绝
    if (entry.count > max) {
      await query.run('INSERT INTO rate_limit_log (user_id, ip, route) VALUES (?, ?, ?)', [userId, ip, routeKey]);
      res.status(429).json({ error: '请求过于频繁，请稍后再试' });
      return;
    }

    next();
  };
}
```

### 3.3 内容审核流程

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

### 3.4 Markdown 渲染与安全

```javascript
// Markdown 配置
marked.setOptions({
  gfm: true,   // GitHub Flavored Markdown
  breaks: true // 换行符转换为 <br>
});

// 安全渲染函数
function renderMarkdown(content) {
  if (!content) return '';

  // 1. Markdown 转 HTML
  const html = marked.parse(String(content).trim());

  // 2. DOMPurify 净化 XSS
  return DOMPurify.sanitize(html);
}
```

---

## 第四部分：API 规范

### 4.1 API 设计原则

- **RESTful 风格**：使用 HTTP 方法语义（GET/POST/PUT/DELETE）
- **JSON 优先**：API 路由返回 JSON，HTML 路由返回页面
- **错误处理一致**：统一错误响应格式 `{ error: string }` 或 `{ errors: string[] }`
- **认证感知**：通过 `wantsJson(req)` 判断返回格式

### 4.2 请求/响应规范

#### 认证请求

```javascript
// 请求
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

// 成功响应 (200)
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "用户名",
    "grade": "G10",
    "role": "student",
    "role_level": 0,
    "credit": 10
  }
}

// 失败响应 (401)
{
  "error": "邮箱或密码错误"
}
```

#### 分页响应

```javascript
// 列表响应（未来版本）
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.3 权限等级要求

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

---

## 第五部分：开发规范

### 5.1 代码风格

#### 缩进与格式

- **使用 2 空格缩进**（不使用 Tab）
- **始终使用分号**
- **单行最多 120 字符**
- **关键字后加空格**：`if (condition) {`

#### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 变量 | camelCase | `userId`, `isActive` |
| 常量 | UPPER_SNAKE | `MAX_FILE_SIZE` |
| 函数 | camelCase | `getUserById()`, `syncUserLevel()` |
| 类/构造函数 | PascalCase | `DatabaseHelper` |
| 文件名 | kebab-case | `app.js`, `user-service.js` |
| SQL 表名 | snake_case | `user_credit`, `credit_log` |
| 配置项 | SCREAMING_SNAKE | `SESSION_SECRET` |

#### 异步处理

```javascript
// ✅ 正确：使用 async/await
async function getUser(id) {
  const user = await query.get('SELECT * FROM users WHERE id = ?', [id]);
  return user;
}

// ❌ 错误：避免嵌套回调
function getUser(id, callback) {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) callback(err);
    callback(null, user);
  });
}
```

#### 错误处理

```javascript
// ✅ 正确：try-catch 在路由处理器中
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ✅ 正确：Promise rejection 处理
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: '服务器内部错误' });
});
```

### 5.2 SQL 规范

```javascript
// ✅ 正确：参数化查询防注入
await query.get('SELECT * FROM users WHERE id = ?', [userId]);

// ❌ 错误：字符串拼接（SQL 注入风险）
await query.get(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ 正确：多值参数
await query.all('SELECT * FROM posts WHERE board_id IN (?, ?, ?)', [id1, id2, id3]);

// ✅ 正确：事务处理
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

### 5.3 路由组织规范

```javascript
// app.js 路由组织示例

// 1. 认证路由
app.get('/login', ...);
app.post('/login', ...);
app.get('/register', ...);
app.post('/register', ...);
app.post('/logout', ...);

// 2. 主要功能路由
app.get('/forum', ...);
app.get('/forum/new', requireAuth, ...);
app.get('/forum/:id', ...);
app.post('/forum/posts', requireAuth, ...);

// 3. API 路由（统一前缀 /api）
app.get('/api/dashboard', ...);
app.get('/api/boards', ...);
app.post('/api/forum/posts', requireAuth, ...);

// 4. 管理后台路由
app.get('/admin/review', requireAuth, requireLevel(3), ...);
app.post('/api/admin/credit', requireAuth, requireLevel(6), ...);
```

### 5.4 中间件顺序

```javascript
// 1. 基础中间件
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 2. 会话中间件
app.use(session({ ... }));

// 3. 应用级中间件（用户认证）
app.use(async (req, res, next) => {
  // 设置 req.user
  next();
});

// 4. 路由处理器

// 5. 错误处理中间件（4 个参数）
app.use((error, req, res, next) => { ... });
```

---

## 第六部分：测试策略

### 6.1 测试框架

使用 Node.js 内置的 `node:test` 模块，无需额外依赖：

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
```

### 6.2 测试用例示例

```javascript
test('注册并自动登录第一个用户', async () => {
  const response = await fetch(`${baseUrl}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'password123',
      name: 'Admin User',
      grade: 'G12'
    })
  });

  const data = await response.json();
  assert.strictEqual(response.status, 201);
  assert.strictEqual(data.user.role, 'admin');
  assert.strictEqual(data.user.role_level, 4);
});
```

### 6.3 测试覆盖范围

| 模块 | 测试用例 |
|------|----------|
| 认证 | 注册、登录、登出、权限检查 |
| 论坛 | 发帖、评论、编辑、删除、搜索 |
| 板块 | 板块获取、CJ 内容更新 |
| 考试 | 创建考试、筛选、倒计时 |
| 作业 | 创建作业、完成状态切换 |
| 资源 | 上传资源、下载计数、点赞 |
| 搜索 | 关键词搜索、多类型结果 |
| 管理 | 审核流程、积分调整、封禁用户 |

### 6.4 测试运行

```bash
npm test
```

---

## 第七部分：性能优化

### 7.1 数据库优化

#### 避免 N+1 查询

```javascript
// ❌ 错误：N+1 查询
const posts = await query.all('SELECT * FROM posts');
for (const post of posts) {
  post.author = await query.get('SELECT name FROM users WHERE id = ?', [post.user_id]);
}

// ✅ 正确：JOIN 查询
const posts = await query.all(`
  SELECT posts.*, users.name AS author_name
  FROM posts
  JOIN users ON users.id = posts.user_id
`);
```

#### 使用索引

```javascript
// 频繁查询的字段添加索引
await query.run('CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id)');
await query.run('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
```

### 7.2 缓存策略

#### 会话缓存

```javascript
// 静态资源设置缓存头
app.use('/public', express.static(publicDir, {
  maxAge: '1d',
  etag: true
}));
```

### 7.3 限流配置

```javascript
// 不同接口设置不同限流策略
app.post('/api/forum/posts', requireAuth, rateLimit({ windowMs: 60000, max: 5, keyPrefix: 'post' }));
app.post('/api/chat/messages', requireAuth, rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'chat' }));
app.post('/api/review/items/:id/approve', requireAuth, requireLevel(3), rateLimit({ windowMs: 60000, max: 10, keyPrefix: 'review' }));
```

---

## 第八部分：安全考虑

### 8.1 XSS 防护

- 所有用户输入的 Markdown 内容通过 `DOMPurify.sanitize()` 净化
- EJS 模板默认转义 HTML

### 8.2 SQL 注入防护

- 所有 SQL 查询使用参数化查询
- 禁止字符串拼接 SQL

### 8.3 CSRF 防护

- 使用 express-session 的签名 cookie
- 表单提交使用 POST 并验证 session

### 8.4 密码安全

- 使用 bcryptjs 加密（cost factor 10）
- 密码最小长度 8 位

### 8.5 敏感操作二次验证

```javascript
// 管理员操作需要额外密码验证
app.post('/api/admin/credit', requireAuth, requireLevel(6), async (req, res) => {
  const password = String(req.body.password || '');
  const admin = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    res.status(403).json({ error: '密码验证失败' });
    return;
  }
  // 执行操作...
});
```

---

## 第九部分：扩展机制

### 9.1 添加新模块

1. **数据库**：在 `initializeDatabase()` 添加新表
2. **路由**：在 `app.js` 添加路由处理器
3. **视图**：在 `views/` 添加 EJS 模板
4. **API**：在 `app.js` `/api/*` 路由组添加 API 端点
5. **测试**：在 `tests/` 添加测试用例

### 9.2 插件式功能扩展

```javascript
// 示例：添加评分功能
async function addRatingFeature(postId, userId, rating) {
  // 1. 创建 rating 表
  await query.run(`
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE(post_id, user_id)
    )
  `);

  // 2. 插入或更新评分
  await query.run(`
    INSERT INTO ratings (post_id, user_id, rating)
    VALUES (?, ?, ?)
    ON CONFLICT(post_id, user_id) DO UPDATE SET rating = excluded.rating
  `, [postId, userId, rating]);

  // 3. 更新帖子平均分
  const avgRating = await query.get(`
    SELECT AVG(rating) as avg FROM ratings WHERE post_id = ?
  `, [postId]);
  await query.run('UPDATE posts SET avg_rating = ? WHERE id = ?', [avgRating.avg, postId]);
}
```

### 9.3 WebSocket 扩展（待实现）

```javascript
// WebSocket 服务器初始化
const { WebSocketServer } = require('ws');

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // 1. 从 cookie 解析 session 获取用户
    // 2. 关联 ws 和 userId
    // 3. 处理消息广播
  });

  return wss;
}

// 广播新消息
function broadcastNewPost(post) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({ type: 'new_post', data: post }));
    }
  });
}
```

---

## 第十部分：部署指南

### 10.1 生产环境检查清单

- [ ] `SESSION_SECRET` 设置为强随机字符串
- [ ] `NODE_ENV=production`
- [ ] 数据库文件 `data/bigz-hub-mvp.db` 定期备份
- [ ] `uploads/` 目录使用独立的持久化存储
- [ ] 配置 Web 服务器反向代理（Nginx）
- [ ] 配置 SSL/TLS 证书
- [ ] 设置日志轮转
- [ ] 配置监控和告警

### 10.2 Nginx 反向代理配置

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

### 10.3 数据库备份

```bash
# 每日备份脚本
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/path/to/backups
cp $PROJECT_DIR/data/bigz-hub-mvp.db $BACKUP_DIR/bigz-hub-mvp-$DATE.db
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
```

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

---

## 附录 C：文件结构

```
1.0.1/
├── app.js                    # 应用主入口 (~2630 行)
├── package.json              # 项目配置
├── .env                      # 环境变量（不提交）
│
├── data/                     # 数据目录
│   ├── bigz-hub-mvp.db       # SQLite 数据库文件
│   └── sessions/             # 会话存储
│
├── public/                   # 静态资源
│   ├── css/
│   │   └── style.css         # 主样式文件
│   ├── js/
│   │   ├── app.js            # 主前端脚本
│   │   └── editor.js         # 编辑器脚本
│   └── uploads/              # 用户上传文件
│
├── views/                    # EJS 模板
│   ├── partials/
│   │   ├── header.ejs        # 页眉
│   │   └── footer.ejs        # 页脚
│   ├── home.ejs              # 首页
│   ├── login.ejs             # 登录页
│   ├── register.ejs          # 注册页
│   ├── forum.ejs             # 帖子列表
│   ├── forum-form.ejs        # 发帖/编辑页
│   ├── forum-detail.ejs      # 帖子详情
│   ├── board.ejs             # 学科板块
│   ├── exams.ejs             # 考试日历
│   ├── homeworks.ejs         # 作业看板
│   ├── resources.ejs         # 资源库
│   ├── search.ejs            # 搜索结果
│   └── review.ejs            # 审核面板
│
├── tests/                    # 测试文件
│   └── app.test.js           # 单元测试
│
├── server/config/            # 服务配置
│   └── supercode.ts          # 管理员隐藏码（加密）
│
├── docs/                     # 文档
│   └── openapi.yaml          # API 文档
│
└── db/                       # 数据库脚本
    └── migrate_2.0.0.sql      # 迁移脚本
```

---

[返回顶部](#bigz-hub-技术开发文档-agents)
