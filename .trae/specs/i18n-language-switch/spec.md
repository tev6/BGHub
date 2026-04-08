# BIGZ Hub 中英文切换功能规范

## Why

当前 BIGZ Hub 仅支持中文界面，面向国际化用户群体需要同时支持中文和英文两种语言，并确保语言切换功能具有记忆性、平滑无闪烁、保持用户当前位置和页面状态。

## What Changes

- 在页面顶部导航栏添加语言切换按钮（中文/English）
- 实现全站所有静态文本的中英文双语切换
- 语言偏好保存在 localStorage 中实现记忆功能
- 切换过程使用 DOM 操作平滑切换，不刷新页面
- 所有中文硬编码文本迁移至国际化翻译文件
- 语言切换按钮具有良好视觉样式（高亮当前选中语言）

## Impact

- **Affected specs**: 所有页面和组件的静态文本内容
- **Affected code**: app.js（添加中间件和路由）、public/js/app.js（前端i18n逻辑）、public/css/style.css（切换按钮样式）、server/locales/（新增翻译文件）、views/（所有ejs模板）

---

## ADDED Requirements

### Requirement: 语言切换按钮

页面右上角或导航栏区域应显示语言切换组件，包含"中文"和"English"两个选项。当选中某语言时，该选项应有明显的高亮样式（背景色或下划线标识）。切换语言后应平滑过渡，不触发页面刷新。

#### Scenario: 语言切换按钮显示
- **WHEN** 用户打开任意页面
- **THEN** 页面右上角应显示语言切换按钮组

#### Scenario: 切换为英文
- **WHEN** 用户点击"English"选项
- **THEN** 页面所有静态文本立即切换为英文，切换按钮中English高亮，用户的语言偏好保存至localStorage

#### Scenario: 切换为中文
- **WHEN** 用户点击"中文"选项
- **THEN** 页面所有静态文本立即切换为中文，切换按钮中"中文"高亮，语言偏好保存至localStorage

#### Scenario: 回访自动应用偏好
- **WHEN** 用户上次选择了英文并关闭浏览器
- **THEN** 用户再次访问时，页面自动显示英文界面

---

### Requirement: 全站文本国际化

所有前端可见的静态文本（不含用户生成内容）均应支持中英文切换，包括但不限于：

1. **导航菜单**: 首页、互助广场、作业看板、CJ、课件库、考试日历、收藏、面板等
2. **按钮文本**: 提交、取消、删除、编辑、发布、搜索、筛选、登录、注册、退出等
3. **提示信息**: 空状态提示、加载提示、错误提示、成功提示
4. **表单标签**: 输入框placeholder、表单标题、字段标签
5. **页面标题**: 各页面的页头标题和副标题
6. **面包屑和导航**: 返回、查看全部等

#### Scenario: 论坛帖子列表页
- **WHEN** 界面语言切换为英文
- **THEN** "查看全部"变为"View All"，"筛选"变为"Filter"，"发布帖子"变为"New Post"

---

### Requirement: 翻译覆盖完整性

翻译文件必须覆盖所有前端可见的硬编码中文文本。需要逐一排查以下文件中的中文内容：

- views/home.ejs
- views/forum.ejs
- views/forum-detail.ejs
- views/forum-form.ejs
- views/board.ejs
- views/homeworks.ejs
- views/exams.ejs
- views/resources.ejs
- views/notifications.ejs
- views/messages.ejs
- views/dashboard.ejs
- views/admin/users.ejs
- views/search.ejs
- views/schedule.ejs
- views/favorites.ejs
- views/review.ejs
- views/login.ejs
- views/register.ejs
- views/partials/header.ejs
- views/partials/footer.ejs

---

## Technical Design

### 目录结构

```
server/
└── locales/
    ├── zh.json      # 中文翻译
    └── en.json      # 英文翻译

public/
├── js/
│   └── i18n.js      # 前端国际化逻辑
```

### 实现方案

1. **翻译文件格式**: JSON 对象，key 为翻译键，value 为翻译文本
2. **前端i18n逻辑**: 页面加载时从 localStorage 读取偏好，动态替换带有 `data-i18n` 属性的元素文本
3. **EJS模板处理**: 导航栏等固定文本在 EJS 渲染时根据语言参数输出，动态内容由前端 JS 处理
4. **切换按钮**: 纯前端实现，点击触发 DOM 更新和 localStorage 保存
