# AI 审核系统修复规范

## 问题描述

### 问题 1：AI 审核未真正执行
- 发布文章时显示"AI审核已通过"，但实际上 AI 审核模块可能没有正确调用
- 帖子没有进入人工审核队列
- 没有报错机制来显示 AI 审核是否真正执行

### 问题 2：LV0 未登录用户聊天消息报错
- 错误：`SQLITE_CONSTRAINT: NOT NULL constraint failed: chat_messages.user_id`
- LV0 用户发送消息时 `user_id` 为 `null`，但数据库有 NOT NULL 约束
- LV0 用户发送消息后没有正确的状态提示

### 问题 3：审核状态提示不正确
- LV0 用户发送消息后应显示："你的消息正在由AI审核中，审核完成后可以发布下一条"
- 需要在 AI 审核完成前阻止用户发送下一条消息

## 修改内容

### 1. 修复 chat_messages 表 user_id 约束
- 修改 `server/database/index.js` 中的 `chat_messages` 表定义
- 移除 `user_id` 的 NOT NULL 约束，允许为 NULL（表示未登录用户）

### 2. 修复 AI 审核调用逻辑
- 保留现有的 `OpenAI` 调用方式（已经是正确的 Kouri API 格式）
- 添加详细的日志记录来验证 AI 审核是否真正执行
- 添加错误处理确保 AI 审核失败时有明确的错误提示

### 3. 修复 LV0 用户聊天消息流程
- LV0 用户发送消息时 `user_id` 设置为 `NULL`
- 消息直接插入，状态为 `pending`
- 返回给用户："你的消息正在由AI审核中，审核完成后可以发布下一条"
- 前端显示审核中状态，并阻止用户发送下一条消息直到审核完成

### 4. 修复帖子发布的 AI 审核流程
- 确保 AI 审核真正执行并记录日志
- AI 审核通过后，根据用户等级决定是否进入人工审核队列
- LV0-LV2 用户：AI 审核 → 人工审核队列 → 人工审核 → 发布
- LV3+ 用户：AI 审核 → 直接发布

### 5. 前端状态显示修复
- 聊天消息发送后：
  - 已登录用户（LV1+）：显示"消息已提交审核"
  - 未登录用户（LV0）：显示"你的消息正在由AI审核中，审核完成后可以发布下一条"
- 帖子发布后：
  - LV0-LV2：显示"帖子已提交审核，请等待人工审核"
  - LV3+：显示"帖子已发布"

## 技术细节

### 数据库修改
```sql
-- chat_messages 表
-- 修改 user_id 允许 NULL
ALTER TABLE chat_messages MODIFY COLUMN user_id INTEGER;
```

### AI 审核日志
```javascript
console.log('[AI审核] 开始审核:', { type, content: content.substring(0, 50) });
console.log('[AI审核] 审核结果:', result);
```

### LV0 用户聊天流程
1. 用户提交聊天消息（未登录）
2. 插入消息到数据库，状态为 `pending`，`user_id = NULL`
3. 返回前端："你的消息正在由AI审核中"
4. 异步执行 AI 审核
5. 审核通过：更新状态为 `visible_pending`，用户可以发送下一条
6. 审核拒绝：更新状态为 `rejected`

## 影响范围

### 受影响的文件
- `server/database/index.js` - chat_messages 表定义
- `server/routes/api/index.js` - 聊天消息 API
- `app.js` - 帖子发布 AI 审核逻辑
- `server/services/moderation.js` - AI 审核服务
- `views/chat.ejs` - 聊天页面前端状态显示
- `public/js/app.js` - 聊天前端交互

### 测试要点
1. 未登录用户可以发送聊天消息
2. LV0 用户发送消息后显示正确的审核提示
3. AI 审核真正执行（查看服务器日志）
4. 帖子发布后根据用户等级进入正确的审核流程