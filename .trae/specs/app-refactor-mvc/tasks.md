# 任务清单：app.js 模块化重构

## Phase 1: 创建 Controller 层基础设施

- [x] 1.1 创建 server/controllers 目录
  - [x] 1.1.1 创建 server/controllers/index.js（Controller 导出）

## Phase 2: 提取 Service 层业务逻辑

- [x] 2.1 创建 DashboardService
  - [x] 2.1.1 创建 server/services/dashboard.js
  - [x] 2.1.2 从 app.js 提取 getDashboardData 函数
  - [x] 2.1.3 提取 getHomeStats、getCJData、getArticlesData 等辅助函数

- [x] 2.2 创建 WebSocketService
  - [x] 2.2.1 创建 server/services/websocket.js
  - [x] 2.2.2 从 app.js 提取 setupWebSocket 函数
  - [x] 2.2.3 提取 WebSocket 连接管理逻辑
  - [x] 2.2.4 提取消息广播和用户通知逻辑

- [x] 2.3 创建 EmailService
  - [x] 2.3.1 创建 server/services/email.js
  - [x] 2.3.2 从 app.js 提取 sendVerificationEmail 函数
  - [x] 2.3.3 封装 Resend API 调用

- [x] 2.4 更新 server/services/index.js
  - [x] 2.4.1 导出新增的 Service

## Phase 3: 创建 Controller 层

- [x] 3.1 创建 HomeController
  - [x] 3.1.1 创建 server/controllers/homeController.js
  - [x] 3.1.2 实现 index 方法处理主页请求
  - [x] 3.1.3 提取日期导航逻辑

- [x] 3.2 创建 ReviewController
  - [x] 3.2.1 创建 server/controllers/reviewController.js
  - [x] 3.2.2 实现 index 方法处理审核面板请求
  - [x] 3.2.3 提取审核项加载逻辑

- [x] 3.3 更新 server/controllers/index.js
  - [x] 3.3.1 导出所有 Controller

## Phase 4: 创建路由模块

- [x] 4.1 创建主页路由
  - [x] 4.1.1 创建 server/routes/home.js
  - [x] 4.1.2 挂载 HomeController

- [x] 4.2 创建审核路由
  - [x] 4.2.1 创建 server/routes/review.js
  - [x] 4.2.2 挂载 ReviewController

- [x] 4.3 更新 server/routes/index.js
  - [x] 4.3.1 注册新增的路由模块

## Phase 5: 重构 app.js

- [x] 5.1 移除已迁移的业务逻辑
  - [x] 5.1.1 移除 getDashboardData 函数
  - [x] 5.1.2 移除主页路由定义
  - [x] 5.1.3 移除审核面板路由定义
  - [x] 5.1.4 移除 setupWebSocket 函数
  - [x] 5.1.5 移除 sendVerificationEmail 函数

- [x] 5.2 更新依赖注入
  - [x] 5.2.1 导入新的 Service 和 Controller
  - [x] 5.2.2 更新 registerRoutes 调用

- [x] 5.3 精简 app.js
  - [x] 5.3.1 确保只保留应用配置和启动逻辑
  - [x] 5.3.2 验证代码行数 < 500 行

## Phase 6: 编写测试

- [x] 6.1 Service 层测试
  - [x] 6.1.1 创建 tests/services/dashboard.test.js
  - [x] 6.1.2 创建 tests/services/websocket.test.js
  - [x] 6.1.3 创建 tests/services/email.test.js

- [x] 6.2 Controller 层测试
  - [x] 6.2.1 创建 tests/controllers/homeController.test.js
  - [x] 6.2.2 创建 tests/controllers/reviewController.test.js

- [x] 6.3 集成测试
  - [x] 6.3.1 验证主页访问正常
  - [x] 6.3.2 验证审核面板访问正常
  - [x] 6.3.3 验证 WebSocket 连接正常

## Phase 7: 文档更新

- [x] 7.1 更新 AGENTS.md
  - [x] 7.1.1 添加 Controller 层说明
  - [x] 7.1.2 更新 Service 层说明

- [x] 7.2 创建重构文档
  - [x] 7.2.1 记录模块划分
  - [x] 7.2.2 记录接口定义

---

## 任务依赖关系

- [任务 2.1] 必须在 [任务 3.1] 之前完成
- [任务 2.2] 必须在 [任务 5.1.4] 之前完成
- [任务 2.3] 必须在 [任务 5.1.5] 之前完成
- [任务 3.1] 必须在 [任务 4.1] 之前完成
- [任务 3.2] 必须在 [任务 4.2] 之前完成
- [任务 4.1-4.2] 必须在 [任务 5.2] 之前完成
- [任务 5.1-5.2] 必须在 [任务 6.1-6.2] 之前完成

## 并行执行建议

以下任务可以并行执行：
- [任务 2.1]、[任务 2.2]、[任务 2.3]（Service 层提取）
- [任务 3.1]、[任务 3.2]（Controller 层创建）
- [任务 6.1.1]、[任务 6.1.2]、[任务 6.1.3]（Service 测试）
- [任务 6.2.1]、[任务 6.2.2]（Controller 测试）
