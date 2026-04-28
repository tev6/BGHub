# 权限系统错误修复任务列表

## 任务 1：错误 #3 - LV1可以访问/forum/new页面

### 问题
LV1用户可以访问/forum/new页面，但根据权限文档，LV1用户不可发布文章。

### 任务步骤
- [x] 1.1 检查 `app.js` 中 `/forum/new` GET路由的权限检查代码 - **代码已正确：userLevel < 2**
- [x] 1.2 检查 `createOrUpdatePost` 函数开头的权限检查代码 - **代码已正确**
- [x] 1.3 确保 `userLevel < 2` 条件正确拦截LV1用户 - **已验证**
- [ ] 1.4 测试LV1用户访问/forum/new被正确拦截 - **需重启服务器后测试**

---

## 任务 2：错误 #4 - LV2/LV3文章未进入待人工审核队列

### 问题
LV2/LV3发布的文章通过AI审核后，未出现在"待人工审核"队列中。

### 任务步骤
- [x] 2.1 检查 `app.js` 中 `createOrUpdatePost` 函数调用 `createReviewItem` 的代码 - **代码已正确**
- [x] 2.2 确认传入的 `aiReviewed` 参数是 `needsAIAuditResult` (AI审核结果) - **已确认**
- [x] 2.3 检查审核队列API `/api/review/items` 的查询条件 - **代码逻辑正确**
- [x] 2.4 确认 `ai_reviewed = 1` 的项目正确显示在"待人工审核"页面 - **已验证逻辑**
- [ ] 2.5 测试LV2用户发布文章后正确进入人工审核队列 - **需重启服务器后测试**

---

## 任务 3：错误 #5 - LV3发布文章没有AI审核日志

### 问题
LV3发布文章后，服务器日志没有输出AI审核详细信息。

### 任务步骤
- [x] 3.1 检查 `needsAIAudit('post', userLevel)` 函数 - **已确认：level >= 2 && level <= 4 包含LV3**
- [x] 3.2 确认LV3 (level=3) 在 `level >= 2 && level <= 4` 范围内 - **已确认**
- [x] 3.3 检查AI审核日志输出代码是否存在且正确 - **日志代码存在**
- [ ] 3.4 测试LV3用户发布文章时AI审核日志正常输出 - **需重启服务器后测试**

---

## 任务 4：错误 #6 - LV4发布文章没有经过AI审核

### 问题
LV4发布文章没有经过AI审核就直接发布了。

### 任务步骤
- [x] 4.1 检查 `needsAIAudit('post', userLevel)` 函数 - **已确认：level >= 2 && level <= 4 包含LV4**
- [x] 4.2 确认LV4 (level=4) 在 `level >= 2 && level <= 4` 范围内 - **已确认**
- [x] 4.3 检查 `createOrUpdatePost` 中LV4的审核流程 - **AI审核代码存在**
- [x] 4.4 确认LV4文章通过AI审核后直接发布 (reviewStatus='approved') - **已确认**
- [ ] 4.5 测试LV4用户发布文章时AI审核正常进行 - **需重启服务器后测试**

---

## 任务 5：错误 #7 - LV1/LV2无法发布CJ

### 问题
LV1和LV2用户访问/cj页面后，没有"编辑"按钮。

### 任务步骤
- [x] 5.1 检查 `server/routes/cj.js` 中 `/edit` GET路由的 `requireLevel` 参数 - **已修改为 requireLevel(1)**
- [x] 5.2 将 `requireLevel(3)` 修改为 `requireLevel(1)` - **已完成**
- [x] 5.3 检查 `server/routes/cj.js` 中 `/edit` POST路由的 `requireLevel` 参数 - **已确认 requireLevel(1)**
- [x] 5.4 将 `requireLevel(3)` 修改为 `requireLevel(1)` - **已完成**
- [x] 5.5 检查 `views/cj/subject.ejs` 中的按钮显示条件 - **已确认为 role_level >= 1**
- [x] 5.6 将 `user.role_level >= 3` 修改为 `user.role_level >= 1` - **已是正确值**
- [x] 5.7 检查 `views/cj/index.ejs` 中的按钮显示条件 - **已确认为 role_level >= 1**
- [x] 5.8 将 `user.role_level >= 3` 修改为 `user.role_level >= 1` - **已是正确值**
- [x] 5.9 检查 `needsAIAudit('cj', level)` 是否包含LV1和LV2 - **已确认：level >= 1 && level < 5**
- [ ] 5.10 测试LV1/LV2用户可以看到编辑按钮并正常提交CJ - **需重启服务器后测试**

---

## 任务 6：错误 #8 - LV0-LV3访问资源上传页面显示不存在

### 问题
LV0-LV3用户访问资源上传页面时显示404，缺少友好提示。

### 任务步骤
- [x] 6.1 检查 `server/routes/resources.js` 中资源上传路由 - **已检查**
- [x] 6.2 资源路由已有 `requireLevel(4)` 权限检查 - **已修改为 requireLevel(4)**
- [x] 6.3 `requireLevel` 中间件会返回友好的403错误提示 - **已确认**
- [ ] 6.4 测试LV0-LV3用户访问/resources/new时显示友好的权限不足提示 - **需重启服务器后测试**

---

## 任务依赖关系

- 任务 1-6 都需要重启服务器后进行实际测试

---

## 验证方法

1. 启动服务器 `npm start`
2. 使用不同等级账号测试对应功能
3. 检查服务器日志中的AI审核信息
4. 检查审核面板中队列显示是否正确
