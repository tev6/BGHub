# Tasks - 中英文切换功能实施

## 任务概述

实现全站中英文切换功能，包括：翻译文件创建、前端i18n逻辑、样式优化、导航按钮添加、所有视图文件的中文排查与替换。

---

## 第一阶段：基础设施

- [ ] Task 1.1: 创建 server/locales/ 目录结构
- [ ] Task 1.2: 创建 server/locales/zh.json 中文翻译文件（包含所有页面文本）
- [ ] Task 1.3: 创建 server/locales/en.json 英文翻译文件
- [ ] Task 1.4: 创建 public/js/i18n.js 前端国际化逻辑脚本
- [ ] Task 1.5: 添加语言切换按钮的CSS样式到 style.css

---

## 第二阶段：后端集成

- [ ] Task 2.1: 在 app.js 中添加语言中间件，解析请求的语言参数
- [ ] Task 2.2: 修改 app.js 将当前语言(locale)传递到所有模板
- [ ] Task 2.3: 确保静态资源路由正确加载 i18n.js

---

## 第三阶段：视图文件全面排查

需要逐一检查并修改以下文件中的硬编码中文文本：

### 核心布局文件
- [ ] Task 3.1: 修改 views/partials/header.ejs — 添加语言切换按钮，文本改为 i18n 占位符
- [ ] Task 3.2: 修改 views/partials/footer.ejs — 页脚文本国际化

### 首页与布局
- [ ] Task 3.3: 修改 views/home.ejs — 首页所有中文文本
- [ ] Task 3.4: 修改 views/search.ejs — 搜索结果页中文文本

### 论坛系统
- [ ] Task 3.5: 修改 views/forum.ejs — 互助广场页中文文本
- [ ] Task 3.6: 修改 views/forum-detail.ejs — 帖子详情页中文文本
- [ ] Task 3.7: 修改 views/forum-form.ejs — 发帖/编辑页中文文本

### CJ模块
- [ ] Task 3.8: 修改 views/board.ejs — 学科板块页中文文本
- [ ] Task 3.9: 修改 views/homeworks.ejs — 作业看板中文文本
- [ ] Task 3.10: 修改 views/exams.ejs — 考试日历中文文本
- [ ] Task 3.11: 修改 views/resources.ejs — 课件库中文文本
- [ ] Task 3.12: 修改 views/schedule.ejs — 课程表中文文本

### 用户功能
- [ ] Task 3.13: 修改 views/login.ejs — 登录页中文文本
- [ ] Task 3.14: 修改 views/register.ejs — 注册页中文文本
- [ ] Task 3.15: 修改 views/notifications.ejs — 通知中心中文文本
- [ ] Task 3.16: 修改 views/messages.ejs — 私信页中文文本
- [ ] Task 3.17: 修改 views/favorites.ejs — 收藏页中文文本
- [ ] Task 3.18: 修改 views/dashboard.ejs — 用户面板中文文本
- [ ] Task 3.19: 修改 views/review.ejs — 审核面板中文文本
- [ ] Task 3.20: 修改 views/admin/users.ejs — 用户管理页中文文本

---

## 第四阶段：测试验证

- [ ] Task 4.1: 验证语言切换按钮样式正确显示
- [ ] Task 4.2: 验证点击切换后页面文本立即更新，无闪烁
- [ ] Task 4.3: 验证刷新页面后语言偏好保持
- [ ] Task 4.4: 验证重新打开浏览器后自动应用上次选择的语言
- [ ] Task 4.5: 验证所有页面文本均已正确翻译，无遗漏

---

## 任务依赖

- Task 1.1 → Task 1.2, Task 1.3, Task 1.4, Task 1.5（并行）
- Task 1.3, Task 1.4 → Task 2.1, Task 2.2, Task 2.3（并行）
- Task 2.x → Task 3.x（第三阶段可并行处理各文件）
- Task 3.x → Task 4.x
