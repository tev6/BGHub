# 任务清单：app.js 模块化重构 - 第二阶段

## Phase 1: 移除重复路由

- [x] 1.1 移除 `/forum` 重复路由
  - [x] 1.1.1 确认 `server/routes/forum.js` 已包含所有论坛路由
  - [x] 1.1.2 删除 app.js 中 1638-1926 行的论坛路由代码
  - [x] 1.1.3 验证论坛功能正常

- [x] 1.2 移除 `/boards` 重复路由
  - [x] 1.2.1 确认 `server/routes/boards.js` 已包含所有板块路由
  - [x] 1.2.2 删除 app.js 中 1945-2125 行的板块路由代码
  - [x] 1.2.3 验证板块功能正常

- [x] 1.3 移除 `/homeworks` 重复路由
  - [x] 1.3.1 确认 `server/routes/homeworks.js` 已包含所有作业路由
  - [x] 1.3.2 删除 app.js 中 2125-2203 行的作业路由代码
  - [x] 1.3.3 验证作业功能正常

- [x] 1.4 移除 `/search` 重复路由
  - [x] 1.4.1 确认 `server/routes/search.js` 已包含搜索路由
  - [x] 1.4.2 删除 app.js 中 2203-2213 行的搜索路由代码
  - [x] 1.4.3 验证搜索功能正常

## Phase 2: 迁移 Settings 路由

- [x] 2.1 创建 Settings 路由模块
  - [x] 2.1.1 创建 `server/routes/settings.js`
  - [x] 2.1.2 实现 `createSettingsRoutes` 工厂函数
  - [x] 2.1.3 迁移 GET `/settings` 路由
  - [x] 2.1.4 迁移 POST `/api/settings/grade` 路由
  - [x] 2.1.5 迁移 POST `/api/settings/class` 路由
  - [x] 2.1.6 迁移 POST `/api/settings/deactivate` 路由
  - [x] 2.1.7 迁移 POST `/api/settings/locale` 路由

- [x] 2.2 注册 Settings 路由
  - [x] 2.2.1 在 `server/routes/index.js` 中导入 settings 路由
  - [x] 2.2.2 注册 `/settings` 和 `/api/settings` 路由
  - [x] 2.2.3 删除 app.js 中的 settings 路由代码

- [x] 2.3 验证 Settings 功能
  - [x] 2.3.1 验证设置页面正常显示
  - [x] 2.3.2 验证更改年级功能
  - [x] 2.3.3 验证更改班级功能
  - [x] 2.3.4 验证注销账户功能
  - [x] 2.3.5 验证更改语言功能

## Phase 3: 拆分 helpers 对象

- [x] 3.1 创建权限工具模块
  - [x] 3.1.1 创建 `server/utils/permissions.js`
  - [x] 3.1.2 迁移 `canManagePost` 函数
  - [x] 3.1.3 迁移 `canMarkBestAnswer` 函数
  - [x] 3.1.4 更新 `server/utils/index.js` 导出

- [x] 3.2 创建验证工具模块
  - [x] 3.2.1 创建 `server/utils/validation.js`
  - [x] 3.2.2 迁移 `validateEmail` 函数
  - [x] 3.2.3 迁移 `parseDateValue` 函数
  - [x] 3.2.4 更新 `server/utils/index.js` 导出

- [x] 3.3 创建请求工具模块
  - [x] 3.3.1 创建 `server/utils/request.js`
  - [x] 3.3.2 迁移 `setFlash` 函数
  - [x] 3.3.3 迁移 `wantsJson` 函数
  - [x] 3.3.4 迁移 `respondError` 函数
  - [x] 3.3.5 更新 `server/utils/index.js` 导出

- [ ] 3.4 创建审核工具模块
  - [ ] 3.4.1 创建 `server/utils/review-helpers.js`
  - [ ] 3.4.2 迁移 `createReviewItem` 函数
  - [ ] 3.4.3 迁移 `countDailyActions` 函数
  - [ ] 3.4.4 迁移 `countDailyChatSubmissions` 函数
  - [ ] 3.4.5 更新 `server/utils/index.js` 导出

- [ ] 3.5 创建数据工具模块
  - [ ] 3.5.1 创建 `server/utils/data-helpers.js`
  - [ ] 3.5.2 迁移 `getBoardById` 函数
  - [ ] 3.5.3 迁移 `getBoardBySlug` 函数
  - [ ] 3.5.4 迁移 `getBoards` 函数（如未在 dashboardService）
  - [ ] 3.5.5 迁移 `getPostDetail` 函数
  - [ ] 3.5.6 更新 `server/utils/index.js` 导出

- [ ] 3.6 更新依赖引用
  - [ ] 3.6.1 更新 app.js 中的 helpers 引用
  - [ ] 3.6.2 更新 server/routes/index.js 中的 helpers 引用
  - [ ] 3.6.3 删除 app.js 中的 helpers 对象定义

## Phase 4: 迁移其他小型路由

- [x] 4.1 迁移 Dashboard 路由
  - [x] 4.1.1 创建 `server/routes/dashboard.js`
  - [x] 4.1.2 迁移 GET `/dashboard` 路由
  - [x] 4.1.3 在 `server/routes/index.js` 中注册路由
  - [x] 4.1.4 删除 app.js 中的 dashboard 路由代码

- [x] 4.2 迁移 Notifications 路由
  - [x] 4.2.1 创建 `server/routes/notifications.js`
  - [x] 4.2.2 迁移 GET `/notifications` 路由
  - [x] 4.2.3 迁移通知相关 API 路由
  - [x] 4.2.4 在 `server/routes/index.js` 中注册路由
  - [x] 4.2.5 删除 app.js 中的 notifications 路由代码

- [x] 4.3 迁移 Uploads 路由
  - [x] 4.3.1 创建 `server/routes/uploads.js`
  - [x] 4.3.2 迁移 GET `/uploads/:filename` 路由
  - [x] 4.3.3 在 `server/routes/index.js` 中注册路由
  - [x] 4.3.4 删除 app.js 中的 uploads 路由代码

## Phase 5: 清理与验证

- [x] 5.1 清理 app.js
  - [x] 5.1.1 移除未使用的导入
  - [x] 5.1.2 移除未使用的变量和函数
  - [ ] 5.1.3 确保代码行数 < 500 行 (当前: 2636 行，仍有 29 个 API 路由需迁移)

- [x] 5.2 集成测试
  - [x] 5.2.1 运行所有现有测试
  - [x] 5.2.2 验证主页访问正常
  - [x] 5.2.3 验证论坛功能正常
  - [x] 5.2.4 验证设置页面正常
  - [x] 5.2.5 验证通知功能正常

- [ ] 5.3 更新文档
  - [ ] 5.3.1 更新 AGENTS.md 中的路由说明
  - [ ] 5.3.2 更新 server/utils/index.js 的导出说明

---

## 任务依赖关系

- [任务 1.x] 无依赖，可并行执行
- [任务 2.x] 依赖 [任务 1.x] 完成
- [任务 3.x] 可与 [任务 2.x] 并行执行
- [任务 4.x] 依赖 [任务 1.x] 完成
- [任务 5.x] 依赖所有前置任务完成

## 并行执行建议

以下任务可以并行执行：
- [任务 1.1]、[任务 1.2]、[任务 1.3]、[任务 1.4]（移除重复路由）
- [任务 2.1] 和 [任务 3.x]（迁移 Settings 和拆分 helpers）
- [任务 4.1]、[任务 4.2]、[任务 4.3]（迁移其他小型路由）
