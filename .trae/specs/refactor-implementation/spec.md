# BG Hub 技术改进规范

## Why

当前 BG Hub 项目存在以下技术债务需要解决：

1. **app.js 过于庞大**（约 4337 行），所有路由、中间件、业务逻辑集中在单一文件，维护困难
2. **i18n 方案不统一**：服务器端使用 `server/locales/*.json` + EJS 渲染，客户端使用 `public/js/i18n.js`，翻译内容可能不一致
3. **数据库索引缺失**：高频查询字段缺少索引，影响性能
4. **XSS 防护不完整**：部分用户生成内容可能存在 XSS 风险
5. **深色模式覆盖不完整**：第三方内容（Markdown 渲染结果）未应用主题变量

## What Changes

### 模块拆分计划

将 `app.js` 拆分为以下模块：

```
server/
├── app.js                    # 应用入口（约 300 行）
├── routes/
│   ├── index.js              # 路由汇总导出
│   ├── auth.js               # 认证相关路由（约 200 行）
│   ├── forum.js              # 论坛路由（约 300 行）
│   ├── boards.js             # 学科板块路由（约 150 行）
│   ├── homeworks.js          # 作业路由（约 100 行）
│   ├── exams.js              # 考试路由（约 100 行）
│   ├── resources.js          # 资源路由（约 150 行)
│   ├── chat.js               # 聊天路由（约 100 行）
│   ├── search.js             # 搜索路由（约 80 行）
│   ├── admin.js              # 管理后台路由（约 200 行）
│   ├── notifications.js      # 通知路由（约 80 行）
│   └── api/
│       ├── index.js          # API 路由汇总
│       ├── auth.js           # API 认证
│       ├── forum.js          # API 论坛
│       ├── homeworks.js      # API 作业
│       ├── resources.js      # API 资源
│       ├── chat.js           # API 聊天
│       └── search.js         # API 搜索
├── services/
│   ├── index.js              # 服务汇总导出
│   ├── credit.js             # 积分服务（约 100 行）
│   ├── notification.js       # 通知服务（约 80 行）
│   ├── moderation.js         # 内容审核服务
│   ├── email.js              # 邮件服务（约 80 行）
│   └── search.js             # 搜索服务（约 80 行）
├── middleware/
│   ├── index.js              # 中间件汇总导出
│   ├── auth.js               # 认证中间件
│   ├── credit.js             # 积分中间件
│   ├── moderation.js         # 审核中间件
│   └── locale.js             # 语言环境中间件
├── models/
│   ├── index.js              # 模型汇总导出
│   ├── user.js               # 用户模型
│   ├── post.js               # 帖子模型
│   ├── comment.js            # 评论模型
│   ├── resource.js           # 资源模型
│   ├── homework.js           # 作业模型
│   ├── exam.js               # 考试模型
│   └── board.js              # 板块模型
├── database/
│   ├── index.js              # 数据库初始化（约 200 行）
│   ├── schema.sql            # 表结构定义
│   ├── seeds.sql             # 种子数据
│   └── migrations/           # 迁移脚本
│       └── 001_initial.sql
└── utils/
    ├── index.js              # 工具函数导出
    ├── markdown.js           # Markdown 渲染
    ├── validation.js         # 输入验证
    ├── slugify.js            # URL slug 工具
    └── date.js               # 日期格式化
```

### i18n 统一方案

**目标**：建立单一的翻译源，服务器端和客户端共享同一套翻译键值

**实现方式**：
1. 翻译文件统一放在 `server/locales/` 目录
2. 服务器端：通过 Express 中间件在 `res.locals` 注入翻译函数
3. 客户端：通过 `/locales/{lang}.json` 端点提供翻译文件
4. EJS 模板使用 `<%= t('key') %>` 或 `data-i18n` 属性
5. 前端 JS 使用 `i18n.t('key')` 方法

**翻译键命名规范**：
```
{namespace}.{page}.{element}
示例：
- nav.home, nav.forum, nav.login
- auth.emailLabel, auth.passwordPlaceholder
- forum.postTitle, forum.submitButton
- common.save, common.cancel, common.delete
```

### 数据库索引优化

**需要添加的索引**：

```sql
-- 用户查询优化
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_level ON users(role_level);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- 论坛查询优化
CREATE INDEX IF NOT EXISTS idx_posts_board_id ON posts(board_id);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_review_status ON posts(review_status);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

-- 评论查询优化
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);

-- 作业查询优化
CREATE INDEX IF NOT EXISTS idx_homeworks_board_id ON homeworks(board_id);
CREATE INDEX IF NOT EXISTS idx_homeworks_deadline ON homeworks(deadline);
CREATE INDEX IF NOT EXISTS idx_homework_statuses_user ON homework_statuses(user_id);

-- 资源查询优化
CREATE INDEX IF NOT EXISTS idx_resources_board_id ON resources(board_id);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at);

-- 通知查询优化
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- 聊天查询优化
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_status ON chat_messages(status);

-- 积分日志查询优化
CREATE INDEX IF NOT EXISTS idx_credit_log_user_id ON credit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_log_created_at ON credit_log(created_at);

-- 审核查询优化
CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(status);
CREATE INDEX IF NOT EXISTS idx_review_items_created_by ON review_items(created_by);

-- CJ 内容查询优化
CREATE INDEX IF NOT EXISTS idx_board_sections_board_date ON board_sections(board_id, section_date);

-- 私信查询优化
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
```

### XSS 防护增强

**改进措施**：

1. **统一内容净化函数**：创建 `server/utils/sanitize.js`
   ```javascript
   function sanitizeHtml(dirty) {
     return DOMPurify.sanitize(dirty, {
       ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
       ALLOWED_ATTR: ['href', 'target', 'rel']
     });
   }
   ```

2. **用户头像 URL 净化**：确保头像 URL 不包含 JavaScript 协议
   ```javascript
   function sanitizeAvatarUrl(url) {
     if (!url) return '/img/default-avatar.png';
     if (/^javascript:/i.test(url)) return '/img/default-avatar.png';
     return url;
   }
   ```

3. **Markdown 渲染增强**：
   - 移除 Markdown 解析后的原始 HTML 危险标签
   - 自动给外部链接添加 `rel="noopener noreferrer"`
   - 禁用图片远程 URL（仅允许本地或白名单 CDN）

4. **内容审查集成**：
   - 用户生成内容在显示前经过 KOURI API 审查
   - 拒绝包含明显恶意内容的消息

### 深色模式完善

**改进措施**：

1. **CSS 变量扩展**：在 `style.css` 中添加更多 dark mode 变量
   ```css
   [data-theme="dark"] .markdown-body {
     color: var(--text);
     background: transparent;
   }

   [data-theme="dark"] .CodeMirror,
   [data-theme="dark"] pre code {
     background: var(--surface-alt);
     color: var(--text);
   }
   ```

2. **Markdown 渲染内容包装**：
   - Markdown 渲染后的 HTML 使用 `.markdown-body` 类包装
   - 该类继承主题变量，确保内容随主题变化

3. **第三方内容处理**：
   - 用户上传的图片使用懒加载并应用 `loading="lazy"`
   - 外部嵌入内容使用沙盒模式

## Impact

- **Affected specs**: 用户系统、通知系统、论坛系统、聊天系统、搜索系统
- **Affected code**:
  - `app.js` → 拆分为 `server/routes/`、`server/services/`、`server/middleware/`、`server/models/`、`server/utils/`、`server/database/`
  - `public/css/style.css` → 扩展 dark mode CSS 变量
  - `public/js/app.js` → 更新 i18n 集成
  - `views/partials/header.ejs` → 语言切换组件更新
  - `server/locales/*.json` → 统一翻译键

---

## ADDED Requirements

### Requirement: 模块化拆分

app.js 中的代码应按照功能模块拆分为独立的 JavaScript 文件，每个模块负责单一职责。

#### Scenario: 路由模块独立
- **WHEN** 开发者需要修改论坛相关路由
- **THEN** 只需编辑 `server/routes/forum.js`，无需触碰 app.js

#### Scenario: 服务共享
- **WHEN** 多个路由需要使用积分服务
- **THEN** 从 `server/services/index.js` 导入 `creditService` 共享使用

### Requirement: i18n 统一

全站文本翻译应使用统一的翻译键，服务器端和客户端共享同一翻译源。

#### Scenario: 添加新翻译
- **WHEN** 开发者需要在登录页面添加"记住我"复选框
- **THEN** 在 `server/locales/zh.json` 和 `en.json` 中添加 `auth.rememberMe` 键

#### Scenario: 翻译一致性
- **WHEN** 用户切换语言
- **THEN** 服务器渲染的文本和客户端 JS 动态文本保持一致

### Requirement: 数据库索引

数据库表应包含高频查询字段的索引以优化性能。

#### Scenario: 帖子列表查询
- **WHEN** 用户访问论坛首页加载帖子列表
- **THEN** 查询使用 `idx_posts_board_id` 和 `idx_posts_created_at DESC` 索引

### Requirement: XSS 防护

所有用户生成内容必须经过严格净化才能显示。

#### Scenario: 恶意脚本输入
- **WHEN** 用户提交包含 `<script>alert('xss')</script>` 的帖子内容
- **THEN** 渲染时脚本标签被移除，只显示纯文本

### Requirement: 深色模式覆盖

所有页面元素，包括 Markdown 渲染内容，都应支持深色模式。

#### Scenario: Markdown 内容切换主题
- **WHEN** 用户切换到深色模式
- **THEN** 帖子中的 Markdown 渲染内容（代码块、引用等）自动应用深色样式

---

## MODIFIED Requirements

### Requirement: renderMarkdown 函数

**现状**：仅使用 DOMPurify.sanitize 净化

**改进**：
- 添加链接安全处理（rel 属性）
- 图片 URL 验证
- 代码块语法高亮支持深色模式

---

## REMOVED Requirements

无

---

## Technical Notes

### 迁移策略

1. **逐步拆分**：不影响现有功能，逐步将代码移动到新模块
2. **保持 API 兼容**：拆分后所有路由路径保持不变
3. **测试验证**：每次拆分后运行测试确保功能正常
4. **回滚计划**：如拆分失败，保持原 app.js 可用

### 文件命名约定

- **路由文件**：`server/routes/{name}.js`
- **服务文件**：`server/services/{name}.js`
- **中间件文件**：`server/middleware/{name}.js`
- **工具文件**：`server/utils/{name}.js`
- **模型文件**：`server/models/{name}.js`

### 循环依赖避免

- 路由可以导入服务和工具
- 服务可以导入其他服务和工具
- 中间件可以导入服务
- 工具函数应独立，不依赖其他模块
