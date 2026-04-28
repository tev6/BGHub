# 权限系统错误修复规范

## 问题描述

当前测试发现多个权限系统相关错误未彻底修复，需要进行系统性排查和修复。

### 错误 #3：LV1可以访问/forum/new页面
**现象**：LV1用户可以访问发布文章页面，但根据权限文档，LV1用户不可发布文章。

**根本原因分析**：权限检查逻辑可能存在问题，需要验证 `needsAIAudit` 函数和 `requireLevel` 中间件的行为。

### 错误 #4：LV2/LV3文章未进入待人工审核队列
**现象**：LV2和LV3发布的文章通过AI审核后，未出现在"待人工审核"队列中，而是出现在"AI审核中"队列。

**根本原因分析**：
- 审核队列 API 的查询条件可能有问题
- `review_items` 表的 `ai_reviewed` 字段设置不正确
- 创建 `review_item` 时 `ai_reviewed` 参数传递错误

### 错误 #5：LV3发布文章没有AI审核日志
**现象**：LV3发布文章后，服务器日志没有输出AI审核详细信息。

**根本原因分析**：
- `needsAIAudit('post')` 可能没有包含 LV3
- AI审核流程可能没有正确触发

### 错误 #6：LV4发布文章没有经过AI审核
**现象**：LV4发布文章没有经过AI审核就直接发布了。

**根本原因分析**：
- `needsAIAudit('post')` 可能没有包含 LV4
- LV4应该经过AI审核但直接发布，不需要人工复审

### 错误 #7：LV1/LV2无法发布CJ
**现象**：LV1和LV2用户访问/cj页面后，没有"编辑"按钮。

**根本原因分析**：
- 前端模板 `cj/subject.ejs` 和 `cj/index.ejs` 中的权限检查条件可能是 `role_level >= 3`
- CJ路由的 `requireLevel(3)` 可能需要调整为 `requireLevel(1)`

### 错误 #8：LV0-LV3访问资源上传页面显示不存在
**现象**：LV0-LV3用户访问/upload或/resources/new时显示404。

**需求**：显示友好的权限不足提示页面。

## 修改内容

### 1. 修复错误 #3：LV1权限检查
- 检查 `app.js` 中 `/forum/new` GET路由的权限检查
- 检查 `createOrUpdatePost` 函数开头的权限检查
- 确保 LV1 (< LV2) 被正确拦截

### 2. 修复错误 #4：审核队列逻辑
- 检查 `createReviewItem` 函数调用是否正确传入 `aiReviewed` 参数
- 检查审核队列 API 查询条件 `ai_reviewed = 1` 是否正确
- 确保 LV2/LV3 文章通过AI审核后正确进入人工队列

### 3. 修复错误 #5：LV3 AI审核
- 确认 `needsAIAudit('post', level)` 中 `level >= 2 && level <= 4` 包含LV3
- 添加必要的日志输出

### 4. 修复错误 #6：LV4 AI审核
- 确认 `needsAIAudit('post', level)` 中 `level >= 2 && level <= 4` 包含LV4
- LV4: AI审核后直接发布，不进人工队列

### 5. 修复错误 #7：CJ编辑权限
- 修改 `server/routes/cj.js` 中 `/edit` 路由的 `requireLevel(3)` 为 `requireLevel(1)`
- 修改前端模板中的按钮显示条件 `user.role_level >= 3` 为 `user.role_level >= 1`
- 确认 `needsAIAudit('cj')` 包含 LV1 和 LV2

### 6. 修复错误 #8：资源上传权限提示
- 创建或修改资源上传路由，处理 LV0-LV3 用户的访问
- 显示友好的权限不足提示

## 影响范围

### 受影响的文件
- `app.js` - 权限检查逻辑
- `server/routes/cj.js` - CJ路由权限
- `server/routes/forum.js` - 论坛路由
- `server/routes/homeworks.js` - 作业路由
- `server/routes/resources.js` - 资源路由
- `views/cj/subject.ejs` - CJ页面模板
- `views/cj/index.ejs` - CJ首页模板

## 权限矩阵（根据文档）

| 等级 | 文章发布 | CJ发布 | 资源上传 |
|-----|--------|-------|--------|
| LV0 | 不可 | 不可 | 不可 |
| LV1 | 不可 | AI初审+人工复审 | 不可 |
| LV2 | AI初审+人工复审 | AI初审+人工复审 | 不可 |
| LV3 | AI审核+人工复审 | AI审核 | 不可 |
| LV4 | AI审核(直接发布) | AI审核 | 人工审核 |
| LV5 | AI审核(直接发布) | AI审核 | 直接发布 |

## 审核队列显示逻辑

| 用户等级 | AI审核 | 进入人工队列 | 审核面板显示位置 |
|---------|-------|-----------|--------------|
| LV2 | 是 | 是 | 待人工审核 |
| LV3 | 是 | 是 | 待人工审核 |
| LV4 | 是 | 否 | 直接发布 |
| LV5 | 是 | 否 | 直接发布 |
