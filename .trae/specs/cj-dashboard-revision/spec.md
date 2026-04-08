# CJ时间机制、审核页面修复与Dashboard改版

## Why
1. CJ内容每日不同，需要时间机制保存每天的CJ记录并支持历史查看
2. 审核页面访问 /review 404，需要确保路由正确
3. Dashboard页面UI需要改进，使用卡片式设计

## What Changes

### 1. CJ时间机制
- CJ内容按日期存储，每天有独立的CJ记录
- 新的一天自动创建空白CJ，用户可编辑
- 保留历史CJ记录，用户可选择日期查看
- 主页和CJ页面都添加日期选择功能

### 2. 审核页面修复
- 确保 /review 路由存在并正确渲染
- 移除 /admin/review 路由改为 /review

### 3. Dashboard UI改版
- 将纯文本布局改为卡片式设计
- 使用现有的 .card 组件
- 优化信息层级和间距

## Impact
- Affected specs: 学生社区信用等级与权限完整说明
- Affected code: app.js, views/home.ejs, views/board.ejs, views/review.ejs, public/css/style.css

## Database Schema Changes

### board_sections 表修改
```sql
ALTER TABLE board_sections ADD COLUMN section_date TEXT NOT NULL DEFAULT (date('now'));
```
- 添加 section_date 字段标识日期
- 默认值为当天日期
- 唯一约束变为 (board_id, section, section_date)

### New Queries
- 按日期查询CJ: `WHERE section_date = ?`
- 按日期范围查询历史: `WHERE section_date BETWEEN ? AND ?`

## ADDED Requirements

### Requirement: CJ时间机制
系统必须支持按日期存储和查看CJ内容。

#### Scenario: 用户访问CJ页面
- **WHEN** 用户访问 /boards/:slug
- **THEN** 显示当前日期的CJ内容，并有日期选择器

#### Scenario: 用户编辑CJ
- **WHEN** 用户提交CJ编辑
- **THEN** 保存到当前日期的记录，不影响历史数据

#### Scenario: 用户查看历史CJ
- **WHEN** 用户选择过去日期
- **THEN** 显示该日期的CJ内容（只读）

#### Scenario: 新的一天
- **WHEN** 日期变更（如跨午夜）
- **THEN** 自动创建新的空白CJ记录（如果不存在）

### Requirement: 审核页面可访问
系统必须确保 /review 页面可正常访问。

#### Scenario: LV3+用户访问审核页面
- **WHEN** 用户访问 /review
- **THEN** 显示审核面板页面

### Requirement: Dashboard卡片式UI
Dashboard页面必须使用卡片式布局。

#### Scenario: 用户访问Dashboard
- **WHEN** 用户访问首页或Dashboard页面
- **THEN** 内容以卡片形式展示
