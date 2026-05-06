# 登录/注册路由迁移规范

## Why

当前 `app.js` 和 `server/routes/auth.js` 中存在重复的登录/注册路由定义：
- `auth.js` 通过 `router.get('/login', ...)` 定义
- `app.js` 通过 `app.get('/login', ...)` 定义

这会导致路由冲突和维护困难。需要删除 `app.js` 中的重复路由，确保所有认证相关路由统一在 `auth.js` 中管理。

## What Changes

### 删除 app.js 中的重复路由
- 删除 `app.get('/login', ...)`
- 删除 `app.post('/api/register/send-code', ...)`
- 删除 `app.get('/register', ...)`
- 删除 `app.post('/register', ...)`
- 删除 `app.post('/login', ...)`
- 删除 `app.post('/logout', ...)`

### 确保 auth.js 功能完整
- 验证 `auth.js` 包含所有必要的认证路由
- 验证依赖函数正确传递

## Impact

- **Affected files**:
  - `app.js` - 删除约 180 行重复代码
  - `server/routes/auth.js` - 已包含完整认证路由（无需修改）

---

## ADDED Requirements

### Requirement: 认证路由统一管理

所有认证相关路由应统一在 `server/routes/auth.js` 中定义。

#### Scenario: 用户访问登录页面
- **WHEN** 用户访问 `/login`
- **THEN** 由 `auth.js` 中的路由处理器响应

#### Scenario: 用户提交注册表单
- **WHEN** 用户提交 `/register` POST 请求
- **THEN** 由 `auth.js` 中的路由处理器处理

---

## MODIFIED Requirements

### Requirement: app.js 路由精简

**现状**：app.js 包含重复的登录/注册路由

**改进**：删除重复路由，只保留 `app.use('/', createAuthRoutes(...))` 调用

---

## REMOVED Requirements

无
