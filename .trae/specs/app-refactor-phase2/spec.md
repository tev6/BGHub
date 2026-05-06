# app.js 模块化重构 - 第二阶段

## Why

app.js 仍然包含大量路由定义和业务逻辑（约 3400+ 行），需要继续迁移以实现：
- 代码行数降至 500 行以下
- 消除重复路由定义
- 将 helpers 对象拆分为独立工具模块
- 提高代码可维护性

## What Changes

### 1. 移除重复路由
- **移除 `/forum` 路由**（app.js 1638-1926 行）- 已存在于 `server/routes/forum.js`
- **移除 `/boards` 路由**（app.js 1945-2125 行）- 已存在于 `server/routes/boards.js`
- **移除 `/homeworks` 路由**（app.js 2125-2203 行）- 已存在于 `server/routes/homeworks.js`
- **移除 `/search` 路由**（app.js 2203-2213 行）- 已存在于 `server/routes/search.js`

### 2. 迁移 Settings 路由
- 创建 `server/routes/settings.js`
- 迁移 GET `/settings` - 用户设置页面
- 迁移 POST `/api/settings/grade` - 更改年级
- 迁移 POST `/api/settings/class` - 更改班级
- 迁移 POST `/api/settings/deactivate` - 注销账户
- 迁移 POST `/api/settings/locale` - 更改语言

### 3. 拆分 helpers 对象
将 helpers 对象（30+ 函数）按功能拆分为独立模块：
- `server/utils/permissions.js` - canManagePost, canMarkBestAnswer, isStaff
- `server/utils/validation.js` - validateEmail, parseDateValue
- `server/utils/flash.js` - setFlash, wantsJson, respondError
- `server/utils/review-helpers.js` - createReviewItem, countDailyActions
- `server/utils/data-helpers.js` - getBoardById, getBoardBySlug, getBoards, getPostDetail

### 4. 迁移其他小型路由
- 迁移 `/dashboard` 路由到 `server/routes/dashboard.js`
- 迁移 `/notifications` 路由到 `server/routes/notifications.js`
- 迁移 `/uploads/:filename` 路由

## Impact

- **Affected specs**: app-refactor-mvc
- **Affected code**:
  - `app.js` - 大幅精简
  - `server/routes/index.js` - 注册新路由
  - `server/utils/` - 新增多个工具模块
  - `server/services/index.js` - 更新导出

## ADDED Requirements

### Requirement: Settings Routes Module
系统应提供独立的设置路由模块，处理用户设置相关功能。

#### Scenario: 用户访问设置页面
- **WHEN** 用户访问 `/settings`
- **THEN** 显示用户信息、积分历史、等级信息、使用指南

#### Scenario: 用户更改年级
- **WHEN** 用户提交 POST `/api/settings/grade`
- **THEN** 验证密码后更新用户年级

#### Scenario: 用户更改班级
- **WHEN** G6-G8 用户提交 POST `/api/settings/class`
- **THEN** 验证密码和班级有效性后更新用户班级

### Requirement: Helpers 拆分为独立模块
helpers 对象应按功能拆分为独立的工具模块，便于维护和测试。

#### Scenario: 权限检查
- **WHEN** 调用 `canManagePost(user, post)`
- **THEN** 返回用户是否有权管理帖子

#### Scenario: 数据获取
- **WHEN** 调用 `getBoardById(id)`
- **THEN** 返回对应的学科板块数据

### Requirement: 移除重复路由
app.js 中不应存在与 `server/routes/` 模块重复的路由定义。

#### Scenario: 论坛路由
- **WHEN** 访问 `/forum` 路由
- **THEN** 由 `server/routes/forum.js` 处理，而非 app.js 中的重复定义

## MODIFIED Requirements

### Requirement: app.js 精简
app.js 应只包含应用配置和启动逻辑，代码行数应 < 500 行。

**修改内容**:
- 移除所有已迁移到路由模块的路由定义
- 移除 helpers 对象定义
- 只保留必要的应用初始化代码

## REMOVED Requirements

### Requirement: helpers 对象集中定义
**Reason**: helpers 对象过于庞大，应拆分为独立模块
**Migration**: 将各函数迁移到对应的 `server/utils/` 模块
