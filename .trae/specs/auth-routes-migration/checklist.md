# 登录/注册路由迁移检查清单

## 路由删除

- [x] app.js 中 `/login` GET 路由已删除
- [x] app.js 中 `/api/register/send-code` POST 路由已删除
- [x] app.js 中 `/register` GET 路由已删除
- [x] app.js 中 `/register` POST 路由已删除
- [x] app.js 中 `/login` POST 路由已删除
- [x] app.js 中 `/logout` POST 路由已删除

## 功能验证

- [ ] 登录页面 `/login` 正常显示
- [ ] 登录表单提交正常工作
- [ ] 注册页面 `/register` 正常显示
- [ ] 注册表单提交正常工作
- [ ] 登出功能正常工作
- [ ] 验证码发送功能正常工作

## 代码质量

- [x] app.js 代码行数减少
- [x] 无重复路由定义
- [x] auth.js 路由正确注册
