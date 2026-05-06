# app.js 模块化重构检查清单

## Controller 层

- [x] HomeController 正确处理主页请求
- [x] HomeController 正确处理日期导航
- [x] ReviewController 正确处理审核面板请求
- [x] ReviewController 正确处理权限验证
- [x] Controller 通过依赖注入获取 Service

## Service 层

- [x] DashboardService 正确聚合仪表盘数据
- [x] DashboardService 返回正确的统计数据
- [x] WebSocketService 正确管理连接
- [x] WebSocketService 正确广播消息
- [x] EmailService 正确发送验证邮件
- [x] EmailService 正确处理 API 错误

## 路由模块

- [x] 主页路由 `/` 正常工作
- [x] 审核面板路由 `/review` 正常工作
- [x] 所有路由端点与重构前一致
- [x] 路由权限验证正常

## app.js 精简

- [x] app.js 不包含业务逻辑
- [x] app.js 只包含应用配置
- [x] app.js 只包含中间件注册
- [x] app.js 只包含路由挂载
- [ ] app.js 代码行数 < 500 行

## 功能验证

- [x] 主页正常显示
- [x] 仪表盘数据正确
- [x] 审核面板正常显示
- [x] WebSocket 连接正常
- [x] 邮件发送正常
- [x] 所有 API 端点正常响应

## 测试覆盖

- [x] DashboardService 测试通过
- [x] WebSocketService 测试通过
- [x] EmailService 测试通过
- [x] HomeController 测试通过
- [x] ReviewController 测试通过
- [ ] 测试覆盖率 ≥ 80%

## 文档

- [x] AGENTS.md 已更新
- [x] 重构文档已创建
- [x] 接口定义已记录
