# AI 审核系统修复检查清单

## 数据库迁移
- [x] `chat_messages.user_id` 列允许 NULL（移除 NOT NULL 约束）
- [x] `chat_messages` 表有 `is_pending` 列
- [x] `reports` 表有 `reviewed_at` 列

## AI 审核服务
- [x] `server/services/moderation.js` 正确使用 OpenAI SDK 调用 Kouri API
- [x] AI 审核有详细的日志记录
- [x] AI 审核失败时有错误处理

## 聊天消息 API
- [x] 未登录用户（LV0）可以发送聊天消息
- [x] LV0 用户消息 `user_id` 为 NULL
- [x] LV0 用户发送消息后返回："你的消息正在由AI审核中，审核完成后可以发布下一条"
- [x] LV1 用户发送消息后返回："消息已提交审核"
- [x] LV2+ 用户消息直接发布

## 帖子发布流程
- [x] AI 审核真正执行（服务器日志可见）
- [x] LV0-LV2 用户帖子进入人工审核队列
- [x] LV3+ 用户帖子 AI 审核后直接发布

## 前端显示
- [x] LV0 用户在聊天区看到审核中提示
- [x] 审核中的消息有视觉标识
- [x] 审核完成后消息正常显示

## 错误处理
- [x] AI 审核异常时不静默失败
- [x] 数据库错误有正确的错误消息
- [x] 没有 `NOT NULL constraint failed` 错误

## 测试验证
- [x] 未登录用户访问 /chat 可以看到聊天表单
- [x] LV2 用户发布帖子后出现在审核队列中
- [x] 服务器日志显示 AI 审核执行记录