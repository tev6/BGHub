# Checklist - 完整权限系统实现

## 任务1：移除匿名发布和标记已解决

- [x] forum-form.ejs 中匿名发布复选框已移除
- [x] forum-detail.ejs 中标记已解决按钮已移除
- [x] 现有帖子仍正常显示（不显示匿名/已解决UI）

---

## 任务2：数据库结构

- [x] ip_bans 表已创建，包含 ip_address, reason, fail_count, banned_at, expires_at, created_by
- [x] user_bans 表已创建，包含 user_id, reason, ban_count, banned_at, expires_at, created_by
- [x] reports 表已创建，包含 reporter_id, target_type, target_id, reason, status, reviewer_id, review_result, created_at, reviewed_at
- [x] review_appeals 表已创建，包含 user_id, content_type, content_id, appeal_reason, status, reviewer_id, review_note, credit_restored, credit_compensation, created_at, reviewed_at
- [x] daily_stats 表已创建，包含 user_id, stat_date, posts_count, chat_count, cj_count, resource_count, login_credit_received, credit_capped
- [x] credit_caps 表已创建
- [x] user_credit 表已添加 violation_count 和 last_violation_at 字段

---

## 任务3：角色等级与信用分

### 等级定义正确
- [x] LV0: 信用分0，每日5条聊天，全审核
- [x] LV1: 信用分1-10，每日20条聊天，AI审核
- [x] LV2: 信用分11-40，每日40条总发布，AI审核
- [x] LV3: 信用分41-100，每日60条总发布，免审(可举报)，需注册7天
- [x] LV4: 信用分101-250，每日80条总发布，免审(举报人工)，需注册30天
- [x] LV5: 信用分251-500，每日100条总发布，完全免审，500分上限
- [x] LV5.5: 特殊授予，无限制，临时禁言/锁定
- [x] LV6: 最高权限，无限制

### 信用分机制
- [x] changeCredit 函数正确实现信用分增减
- [x] 升级时信用分超过上限自动调整为上限值
- [x] 降级时信用分低于新等级上限
- [x] LV3 注册未满7天信用上限100，超出暂存
- [x] LV4 注册未满30天信用上限250，超出暂存
- [x] 每日登录奖励：LV1:1分, LV2:2分, LV3:3分, LV4:4分

### LV5.5/LV6特殊等级
- [x] LV5.5由LV6管理员单独授予
- [x] LV5.5不可通过信用分升级获得
- [x] LV5.5撤销后信用分清零

---

## 任务4：发布限流

- [x] 每日发布计数按类型正确记录
- [x] 发布前检查剩余次数
- [x] 超出限制返回错误
- [x] 每日凌晨(00:00)重置计数
- [x] LV0每日5条聊天限制生效
- [x] LV1每日20条聊天+AI审核CJ
- [x] LV2每日40条总发布
- [x] LV3每日60条总发布
- [x] LV4每日80条总发布
- [x] LV5每日100条总发布
- [x] LV5.5/LV6无限制

---

## 任务5：内容审核

### AI审核
- [x] AI审核函数正确识别违规内容
- [x] LV0消息先发后审，审核失败撤回
- [x] LV1聊天/CJ需AI审核
- [x] LV2聊天/CJ/文章需AI审核
- [x] LV3+直接发布，被举报后触发审核

### 审核通过奖励
- [x] 聊天消息审核成功+1分
- [x] CJ内容审核成功+3分
- [x] 文章内容审核成功+5分

### 审核失败惩罚
- [x] 聊天消息审核失败-3分
- [x] CJ内容审核失败-5分
- [x] 文章内容审核失败-10分
- [x] 审核失败触发封禁递进

### 内容撤回
- [x] 审核失败后内容立即隐藏
- [x] 用户收到审核失败通知

---

## 任务6：人工审核与复审

- [x] 审核队列按时间顺序排列
- [x] LV3可审核LV2的复审申请
- [x] LV4可审核LV1-LV3的复审申请及内容
- [x] LV5可审核所有内容(LV0-LV4)
- [x] LV5不可审核自己发布的内容
- [x] LV5.5可临时禁言用户(1小时-3天)
- [x] LV5.5可临时锁定内容
- [x] LV6可覆盖任何审核结果

---

## 任务7：举报系统

- [x] 文章详情页有举报按钮
- [x] 聊天消息有举报按钮
- [x] CJ内容有举报按钮
- [x] 资源页面有举报按钮
- [x] 举报表单包含原因选择
- [x] 举报成功后通知审核者
- [x] 恶意举报判定(连续3次无效)
- [x] 恶意举报者-5分
- [x] 有效举报者+1~3分
- [x] 我的举报记录页面

---

## 任务8：申诉系统

- [x] LV1+可对误判内容申诉
- [x] 申诉表单包含申诉原因
- [x] 申诉后内容暂时隐藏
- [x] 申诉进入人工队列
- [x] 申诉成功：补回信用分+1~3分补偿
- [x] 申诉失败：额外-3分
- [x] 我的申诉记录页面

---

## 任务9：封禁系统

### IP封禁
- [x] IP封禁检查中间件生效
- [x] 第1次违规封禁5分钟
- [x] 第2次违规封禁30分钟
- [x] 第3次及以上封禁6小时
- [x] 24小时内失败审核超30次封禁6小时
- [x] 封禁期间只能浏览+登录注册
- [x] 管理员可解禁IP

### 用户封禁
- [x] 用户封禁检查生效
- [x] 第1次违规封禁1分钟
- [x] 第2次违规封禁10分钟
- [x] 第3次及以上封禁1小时
- [x] 封禁24小时后计数刷新
- [x] 管理员可解禁用户

### 自动解禁
- [x] 封禁到期自动解禁
- [x] 用户登录自动解禁IP封禁

---

## 任务10：前端UI

- [x] 设置页面显示当前权限详情
- [x] 权限说明卡片正确显示
- [x] 升级进度条正确计算
- [x] 各内容页有举报入口
- [x] LV3+可见审核面板入口
- [x] 举报表单模态框
- [x] 申诉表单模态框
- [x] 封禁状态提示

---

## 任务11：API接口

- [x] POST /api/reports 正确创建举报
- [x] GET /api/reports/my 返回举报列表
- [x] POST /api/appeals 正确创建申诉
- [x] GET /api/appeals/my 返回申诉列表
- [x] GET /api/review/queue 返回审核队列(含权限过滤)
- [x] POST /api/review/:id/approve 审核通过
- [x] POST /api/review/:id/reject 审核拒绝
- [x] POST /api/review/:id/appeal-decide 申诉裁决
- [x] POST /api/admin/ban-user 封禁用户
- [x] POST /api/admin/unban-user 解禁用户
- [x] POST /api/admin/ban-ip 封禁IP
- [x] POST /api/admin/unban-ip 解禁IP
