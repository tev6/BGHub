# app.js 模块化重构 - 第二阶段检查清单

## Phase 1: 重复路由移除

- [x] `/forum` 路由已从 app.js 移除，功能由 server/routes/forum.js 提供
- [x] `/boards` 路由已从 app.js 移除，功能由 server/routes/boards.js 提供
- [x] `/homeworks` 路由已从 app.js 移除，功能由 server/routes/homeworks.js 提供
- [x] `/search` 路由已从 app.js 移除，功能由 server/routes/search.js 提供

## Phase 2: Settings 路由迁移

- [x] server/routes/settings.js 已创建
- [x] GET `/settings` 路由正常工作
- [x] POST `/api/settings/grade` 路由正常工作
- [x] POST `/api/settings/class` 路由正常工作
- [x] POST `/api/settings/deactivate` 路由正常工作
- [x] POST `/api/settings/locale` 路由正常工作
- [x] settings 路由已在 server/routes/index.js 注册
- [x] app.js 中 settings 路由代码已删除

## Phase 3: helpers 对象拆分

- [x] server/utils/permissions.js 已创建并导出权限函数
- [x] server/utils/validation.js 已创建并导出验证函数
- [x] server/utils/request.js 已创建并导出请求处理函数
- [ ] server/utils/review-helpers.js 已创建并导出审核辅助函数
- [ ] server/utils/data-helpers.js 已创建并导出数据获取函数
- [x] server/utils/index.js 已更新导出
- [ ] app.js 中 helpers 对象已删除
- [ ] 所有引用 helpers 的代码已更新

## Phase 4: 其他路由迁移

- [x] server/routes/dashboard.js 已创建
- [x] GET `/dashboard` 路由正常工作
- [x] server/routes/notifications.js 已创建
- [x] GET `/notifications` 路由正常工作
- [x] 通知相关 API 路由正常工作
- [x] server/routes/uploads.js 已创建
- [x] GET `/uploads/:filename` 路由正常工作

## Phase 5: 最终验证

- [ ] app.js 代码行数 < 500 行 (当前: 2636 行，仍有 29 个 API 路由需迁移)
- [x] 所有现有测试通过
- [x] 论坛功能正常
- [x] 设置页面功能正常
- [x] 通知功能正常
- [x] 仪表盘功能正常
- [x] 文件上传功能正常
- [ ] AGENTS.md 已更新
