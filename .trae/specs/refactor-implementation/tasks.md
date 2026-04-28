# 任务清单：BG Hub 技术改进实施

## Phase 1: 项目结构重组

- [x] 1.1 创建目录结构
  - [x] 1.1.1 创建 server/routes/api 目录
  - [x] 1.1.2 创建 server/services 目录
  - [x] 1.1.3 创建 server/middleware 目录
  - [x] 1.1.4 创建 server/models 目录
  - [x] 1.1.5 创建 server/utils 目录
  - [x] 1.1.6 创建 server/database 目录

- [x] 1.2 创建数据库初始化模块
  - [x] 1.2.1 创建 server/database/index.js（从 app.js 提取 initializeDatabase）
  - [x] 1.2.2 创建数据库索引迁移脚本

- [x] 1.3 创建工具函数模块
  - [x] 1.3.1 创建 server/utils/index.js（导出所有工具函数）
  - [x] 1.3.2 创建 server/utils/markdown.js（Markdown 渲染 + 净化增强）
  - [x] 1.3.3 创建 server/utils/sanitize.js（XSS 防护增强）
  - [x] 1.3.4 创建 server/utils/date.js（日期格式化）

## Phase 2: i18n 统一方案

- [x] 2.1 创建翻译键规范文档
  - [x] 2.1.1 定义翻译键命名空间规则

- [x] 2.2 更新翻译文件结构
  - [x] 2.2.1 重构 server/locales/zh.json（按命名空间组织）
  - [x] 2.2.2 重构 server/locales/en.json（按命名空间组织）

- [x] 2.3 创建 i18n 中间件
  - [x] 2.3.1 创建 server/middleware/locale.js
  - [x] 2.3.2 在 app.js 中集成语言环境中间件

- [x] 2.4 更新前端 i18n
  - [x] 2.4.1 更新 public/js/i18n.js（使用统一的翻译键）
  - [x] 2.4.2 更新 views/partials/header.ejs 语言切换组件

## Phase 3: 模块化拆分

- [x] 3.1 创建服务层
  - [x] 3.1.1 创建 server/services/index.js
  - [x] 3.1.2 移动 server/services/moderation.js
  - [x] 3.1.3 创建 server/services/credit.js（积分逻辑）
  - [x] 3.1.4 创建 server/services/notification.js（通知服务）

- [x] 3.2 创建中间件层
  - [x] 3.2.1 创建 server/middleware/index.js
  - [x] 3.2.2 移动认证中间件（requireAuth, requireStaff, requireLevel）
  - [x] 3.2.3 移动积分中间件（applyDailyLoginCredit）

- [x] 3.3 创建路由层
  - [x] 3.3.1 创建 server/routes/index.js（路由汇总）
  - [x] 3.3.2 移动认证路由到 server/routes/auth.js
  - [x] 3.3.3 移动论坛路由到 server/routes/forum.js
  - [x] 3.3.4 移动学科板块路由到 server/routes/boards.js
  - [x] 3.3.5 移动作业路由到 server/routes/homeworks.js
  - [x] 3.3.6 移动考试路由到 server/routes/exams.js（注：原 app.js 中不存在独立 exams 路由）
  - [x] 3.3.7 移动资源路由到 server/routes/resources.js
  - [x] 3.3.8 移动聊天路由到 server/routes/chat.js
  - [x] 3.3.9 移动搜索路由到 server/routes/search.js
  - [x] 3.3.10 移动管理后台路由到 server/routes/admin.js

- [x] 3.4 创建 API 路由
  - [x] 3.4.1 创建 server/routes/api/index.js
  - [x] 3.4.2 移动 API 认证路由
  - [x] 3.4.3 移动 API 论坛路由
  - [x] 3.4.4 移动 API 作业路由
  - [x] 3.4.5 移动 API 资源路由

- [x] 3.5 重构 app.js 主入口
  - [x] 3.5.1 精简 app.js（移除路由逻辑）
  - [x] 3.5.2 导入拆分后的模块

## Phase 4: 数据库索引优化

- [x] 4.1 创建索引迁移脚本
  - [x] 4.1.1 创建 db/migrations/001_add_indexes.sql
  - [x] 4.1.2 添加所有高频查询索引

- [x] 4.2 更新数据库初始化逻辑
  - [x] 4.2.1 在 server/database/index.js 中集成索引创建

## Phase 5: XSS 防护增强

- [x] 5.1 创建 sanitize 工具
  - [x] 5.1.1 实现 HTML 净化函数
  - [x] 5.1.2 实现头像 URL 验证函数

- [x] 5.2 更新 Markdown 渲染
  - [x] 5.2.1 在 server/utils/markdown.js 中增强链接安全
  - [x] 5.2.2 添加图片 URL 验证

- [x] 5.3 统一内容净化流程
  - [x] 5.3.1 更新所有用户输入点的净化调用
  - [x] 5.3.2 更新评论、帖子、资源等内容的渲染

## Phase 6: 深色模式完善

- [x] 6.1 扩展 CSS 变量
  - [x] 6.1.1 在 style.css 中添加深色模式变量覆盖

- [x] 6.2 更新 Markdown 样式
  - [x] 6.2.1 添加 .markdown-body 深色模式样式

- [x] 6.3 测试验证
  - [x] 6.3.1 验证所有页面元素在深色模式下的显示
  - [x] 6.3.2 验证 Markdown 内容主题切换

## 任务依赖关系

- [任务 1.1] 必须在 [任务 1.2] 之前完成
- [任务 1.3] 必须在 [任务 3.1] 之前完成
- [任务 2.1-2.3] 必须在 [任务 2.4] 之前完成
- [任务 3.1-3.2] 必须在 [任务 3.3] 之前完成
- [任务 3.3] 必须在 [任务 3.5] 之前完成
- [任务 5.1] 必须在 [任务 5.3] 之前完成

## 并行执行建议

以下任务可以并行执行：
- [任务 3.3.2]-[任务 3.3.10]（所有路由拆分）
- [任务 3.4.2]-[任务 3.4.5]（所有 API 路由拆分）
- [任务 6.1]-[任务 6.2]（深色模式完善）

---

## 实施总结

### 已完成的模块化拆分

| 模块类型 | 文件路径 | 说明 |
|----------|----------|------|
| 工具函数 | server/utils/index.js | slugify, stripHtml, excerpt, date, markdown 等 |
| XSS 防护 | server/utils/sanitize.js | sanitizeHtml, sanitizeAvatarUrl 等 |
| 数据库 | server/database/index.js | initializeDatabase, createDatabaseHelpers |
| 服务层 | server/services/index.js | creditService, notificationService |
| 中间件 | server/middleware/index.js | requireAuth, requireStaff, requireLevel |
| i18n | server/middleware/locale.js | 语言切换中间件 |
| 路由 | server/routes/index.js | 路由汇总注册 |
| API | server/routes/api/index.js | 所有 REST API 端点 |

### 新增文件列表

```
server/
├── database/
│   └── index.js              # 数据库初始化
├── utils/
│   ├── index.js              # 工具函数导出
│   ├── slugify.js            # URL slug 工具
│   ├── stripHtml.js          # HTML 标签移除
│   ├── excerpt.js            # 文本摘要
│   ├── extractFirstImageUrl.js # 图片 URL 提取
│   ├── date.js               # 日期格式化
│   ├── markdown.js           # Markdown 渲染（增强版）
│   └── sanitize.js           # XSS 防护
├── middleware/
│   ├── index.js              # 中间件导出
│   ├── auth.js               # 认证中间件
│   └── locale.js             # i18n 中间件
├── services/
│   ├── index.js              # 服务导出
│   ├── credit.js             # 积分服务
│   ├── notification.js        # 通知服务
│   └── moderation.js         # AI 审核服务
└── routes/
    ├── index.js              # 路由汇总
    ├── auth.js               # 认证路由
    ├── forum.js              # 论坛路由
    ├── boards.js             # 板块路由
    ├── homeworks.js          # 作业路由
    ├── resources.js          # 资源路由
    ├── chat.js               # 聊天路由
    ├── search.js             # 搜索路由
    ├── admin.js              # 管理后台路由
    └── api/
        └── index.js          # API 路由

db/migrations/
└── 001_add_indexes.sql       # 数据库索引
```

### 深色模式增强

在 style.css 中添加了以下深色模式样式：
- `.markdown-body` 链接颜色
- `.markdown-body code` 代码块背景
- `.markdown-body pre` 预格式化块
- `.markdown-body blockquote` 引用块
- `.markdown-body img` 图片
- `.markdown-body table` 表格
