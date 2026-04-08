# 移除匿名发布和标记已解决功能

## Why
简化社区功能，减少滥用风险，让内容责任更明确。

## What Changes
- 移除文章/笔记发布时的"匿名发布"选项
- 移除帖子详情页的"标记已解决"按钮
- 数据库 posts 表的 is_anonymous 和 is_resolved 字段保留，但前端不再展示相关UI

## Impact
- Affected specs: 学生社区信用等级与权限完整说明
- Affected code: views/forum-form.ejs, views/forum-detail.ejs, app.js 路由

## ADDED Requirements
### Requirement: 无匿名发布选项
帖子发布表单不再显示匿名发布的复选框。

#### Scenario: 用户发布帖子
- **WHEN** 用户访问 /forum/new 或编辑帖子
- **THEN** 不显示匿名发布选项，帖子默认显示真实作者

### Requirement: 无标记已解决按钮
帖子详情页不显示"标记已解决"按钮。

#### Scenario: 用户查看帖子详情
- **WHEN** 用户访问帖子详情页
- **THEN** 不显示标记已解决按钮

## MODIFIED Requirements
无

## REMOVED Requirements
### Requirement: 匿名发布功能
**Reason**: 简化社区功能，减少滥用
**Migration**: 现有匿名帖子仍显示"匿名同学"

### Requirement: 标记已解决功能
**Reason**: 简化社区功能
**Migration**: 现有帖子的 is_resolved 状态保留但不再可修改
