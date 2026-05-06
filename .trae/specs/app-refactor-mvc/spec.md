# app.js 模块化重构规范

## Why

当前 `app.js` 仍然包含约 3700 行代码，虽然部分路由已迁移至 `server/routes/`，但仍有大量业务逻辑直接定义在 app.js 中：
- 主页路由 (`/`) 及其数据获取逻辑
- 审核面板路由 (`/review`) 及其处理逻辑
- 仪表盘数据获取函数 (`getDashboardData`)
- WebSocket 实时通信逻辑
- 大量辅助函数和中间件配置

这些代码需要按照 MVC 架构模式迁移至 Controller 层和 Service 层，以提高代码可维护性和可测试性。

## What Changes

### 新增 Controller 层
- **HomeController** - 处理主页相关请求
- **ReviewController** - 处理审核面板相关请求
- **DashboardController** - 处理仪表盘数据请求

### 新增 Service 层
- **DashboardService** - 仪表盘数据聚合逻辑
- **WebSocketService** - WebSocket 连接管理
- **EmailService** - 邮件发送逻辑

### 重构 app.js
- 精简为应用入口文件（约 200-300 行）
- 只保留应用配置、中间件注册、路由挂载
- 移除所有业务逻辑

### 新增测试
- Controller 单元测试
- Service 单元测试
- 集成测试

## Impact

- **Affected specs**: 用户系统、审核系统、仪表盘系统、WebSocket 通信
- **Affected code**:
  - `app.js` → 精简为入口文件
  - 新增 `server/controllers/` 目录
  - 新增 `server/services/dashboard.js`
  - 新增 `server/services/websocket.js`
  - 新增 `server/services/email.js`
  - 新增 `tests/controllers/` 目录
  - 新增 `tests/services/` 目录

---

## ADDED Requirements

### Requirement: Controller 层设计

系统应提供独立的 Controller 层处理 HTTP 请求，每个 Controller 负责特定业务领域的请求处理。

#### Scenario: HomeController 处理主页请求
- **WHEN** 用户访问 `/`
- **THEN** HomeController.index() 方法处理请求并渲染主页

#### Scenario: ReviewController 处理审核面板请求
- **WHEN** LV3+ 用户访问 `/review`
- **THEN** ReviewController.index() 方法处理请求并渲染审核面板

### Requirement: Service 层设计

系统应提供独立的 Service 层封装业务逻辑，Service 应是无状态的纯函数集合。

#### Scenario: DashboardService 聚合数据
- **WHEN** Controller 需要获取仪表盘数据
- **THEN** DashboardService.getDashboardData() 返回聚合后的统计数据

#### Scenario: WebSocketService 管理连接
- **WHEN** 用户建立 WebSocket 连接
- **THEN** WebSocketService 处理连接、消息分发、断开等事件

### Requirement: app.js 精简

app.js 应只包含应用配置和启动逻辑，不包含业务逻辑。

#### Scenario: 应用启动
- **WHEN** 执行 `node app.js`
- **THEN** 应用正确加载配置、注册中间件、挂载路由、启动服务器

#### Scenario: 业务逻辑修改
- **WHEN** 开发者需要修改主页数据获取逻辑
- **THEN** 只需修改 DashboardService，无需触碰 app.js

### Requirement: 测试覆盖

重构后的代码应有完整的测试覆盖。

#### Scenario: Controller 测试
- **WHEN** 运行 `npm test`
- **THEN** 所有 Controller 方法被测试覆盖

#### Scenario: Service 测试
- **WHEN** 运行 `npm test`
- **THEN** 所有 Service 方法被测试覆盖

---

## MODIFIED Requirements

### Requirement: 路由注册

**现状**：部分路由在 `server/routes/index.js` 注册，部分直接在 app.js 中定义

**改进**：
- 所有路由统一在 `server/routes/index.js` 注册
- app.js 只调用 `registerRoutes(app, dependencies)`

---

## REMOVED Requirements

无

---

## Technical Notes

### 目录结构

```
server/
├── controllers/
│   ├── index.js              # Controller 导出
│   ├── homeController.js     # 主页 Controller
│   ├── reviewController.js   # 审核面板 Controller
│   └── dashboardController.js # 仪表盘 Controller
├── services/
│   ├── index.js              # Service 导出（已存在，需更新）
│   ├── dashboard.js          # 仪表盘数据服务
│   ├── websocket.js          # WebSocket 服务
│   └── email.js              # 邮件服务
└── routes/
    ├── index.js              # 路由注册（已存在，需更新）
    ├── home.js               # 主页路由（新增）
    └── review.js             # 审核路由（新增）

tests/
├── controllers/
│   ├── homeController.test.js
│   └── reviewController.test.js
└── services/
    ├── dashboard.test.js
    └── websocket.test.js
```

### 迁移策略

1. **逐步迁移**：每次迁移一个功能模块，确保功能正常
2. **保持兼容**：迁移过程中所有 API 端点保持不变
3. **测试先行**：先编写测试，再进行迁移
4. **回滚准备**：保留原代码注释，便于回滚

### 依赖注入

Controller 和 Service 通过依赖注入获取所需依赖：

```javascript
// server/controllers/homeController.js
function createHomeController({ dashboardService, renderMarkdown, formatDate }) {
  return {
    async index(req, res) {
      const data = await dashboardService.getDashboardData(req.user, req.gradeContext);
      res.render('home', data);
    }
  };
}
```

### 迁移顺序

1. 提取 `getDashboardData` 到 DashboardService
2. 提取主页路由到 HomeController
3. 提取审核面板路由到 ReviewController
4. 提取 WebSocket 逻辑到 WebSocketService
5. 提取邮件逻辑到 EmailService
6. 精简 app.js
7. 编写测试
