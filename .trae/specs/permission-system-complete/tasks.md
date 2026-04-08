# Tasks

## 任务1：移除匿名发布和标记已解决功能

- [x] Task 1.1: 修改 forum-form.ejs - 移除匿名发布复选框
- [x] Task 1.2: 修改 forum-detail.ejs - 移除标记已解决按钮
- [x] Task 1.3: 验证功能已移除

---

## 任务2：数据库结构更新

- [x] Task 2.1: 创建 ip_bans 表（IP封禁记录）
- [x] Task 2.2: 创建 user_bans 表（用户封禁记录）
- [x] Task 2.3: 创建 reports 表（举报记录）
- [x] Task 2.4: 创建 review_appeals 表（申诉记录）
- [x] Task 2.5: 创建 daily_stats 表（每日统计）
- [x] Task 2.6: 创建 credit_caps 表（信用超限记录）
- [x] Task 2.7: 更新 user_credit 表结构

---

## 任务3：角色等级与信用分系统

- [x] Task 3.1: 更新 roles 表默认角色数据（LV0-LV6 + LV5.5）
- [x] Task 3.2: 实现信用分增减逻辑 (changeCredit)
- [x] Task 3.3: 实现等级自动升级逻辑
- [x] Task 3.4: 实现等级自动降级逻辑
- [x] Task 3.5: 实现注册时间校验（LV3需7天，LV4需30天）
- [x] Task 3.6: 实现信用超限暂存机制（LV3上限100，LV4上限250）
- [x] Task 3.7: 实现每日登录奖励（LV1:1分, LV2:2分, LV3:3分, LV4:4分）
- [x] Task 3.8: 实现LV5.5/LV6特殊等级授予与撤销

---

## 任务4：发布限流系统

- [x] Task 4.1: 实现每日发布计数（按类型）
- [x] Task 4.2: 实现发布前检查（检查是否达到限制）
- [x] Task 4.3: 实现聊天消息限流（LV0:5, LV1:20, LV2+:40-100）
- [x] Task 4.4: 实现文章/CJ/资源发布限流
- [x] Task 4.5: 每日凌晨重置发布计数

---

## 任务5：内容审核系统

- [x] Task 5.1: 实现AI内容审核函数
- [x] Task 5.2: 实现LV0消息先发后审流程
- [x] Task 5.3: 实现LV1 AI审核（聊天/CJ）
- [x] Task 5.4: 实现LV2 AI审核（聊天/CJ/文章）
- [x] Task 5.5: 实现LV3+免审但可举报流程
- [x] Task 5.6: 实现审核结果通知
- [x] Task 5.7: 实现内容撤回机制

---

## 任务6：人工审核与复审

- [x] Task 6.1: 实现人工审核队列
- [x] Task 6.2: 实现LV3审核LV2复审的权限
- [x] Task 6.3: 实现LV4审核LV1-3复审及内容的权限
- [x] Task 6.4: 实现LV5审核所有内容的权限
- [x] Task 6.5: 实现LV5.5临时禁言/锁定功能
- [x] Task 6.6: 实现审核结果记录与日志

---

## 任务7：举报系统

- [x] Task 7.1: 实现通用举报接口 POST /api/reports
- [x] Task 7.2: 实现文章举报功能
- [x] Task 7.3: 实现聊天消息举报功能
- [x] Task 7.4: 实现CJ模块举报功能
- [x] Task 7.5: 实现资源举报功能
- [x] Task 7.6: 实现恶意举报判定（连续3次无效举报）
- [x] Task 7.7: 实现举报者信用奖励
- [x] Task 7.8: 实现我的举报记录查看

---

## 任务8：申诉系统

- [x] Task 8.1: 实现申诉提交接口 POST /api/appeals
- [x] Task 8.2: 实现申诉状态管理
- [x] Task 8.3: 实现申诉成功补回信用分逻辑
- [x] Task 8.4: 实现申诉失败额外扣分逻辑
- [x] Task 8.5: 实现我的申诉记录查看

---

## 任务9：封禁系统

- [x] Task 9.1: 实现IP封禁检查中间件
- [x] Task 9.2: 实现IP封禁递进（5分钟→30分钟→6小时）
- [x] Task 9.3: 实现严重违规IP封禁（30次失败→6小时）
- [x] Task 9.4: 实现用户封禁检查
- [x] Task 9.5: 实现用户封禁递进（1分钟→10分钟→1小时）
- [x] Task 9.6: 实现自动解禁逻辑
- [x] Task 9.7: 实现管理员解禁接口
- [x] Task 9.8: 实现封禁期间浏览限制（只能浏览+登录注册）

---

## 任务10：前端UI更新

- [x] Task 10.1: 更新设置页面显示当前权限详情
- [x] Task 10.2: 添加举报按钮到文章详情页
- [x] Task 10.3: 添加举报按钮到聊天消息
- [x] Task 10.4: 添加举报按钮到CJ内容
- [x] Task 10.5: 添加举报按钮到资源页面
- [x] Task 10.6: 添加审核面板入口（LV3+）
- [x] Task 10.7: 实现举报/申诉表单模态框
- [x] Task 10.8: 实现用户/IP封禁状态显示

---

## 任务11：API接口完善

- [x] Task 11.1: POST /api/reports - 提交举报
- [x] Task 11.2: GET /api/reports/my - 我的举报
- [x] Task 11.3: POST /api/appeals - 提交申诉
- [x] Task 11.4: GET /api/appeals/my - 我的申诉
- [x] Task 11.5: GET /api/review/queue - 审核队列
- [x] Task 11.6: POST /api/review/:id/approve - 审核通过
- [x] Task 11.7: POST /api/review/:id/reject - 审核拒绝
- [x] Task 11.8: POST /api/review/:id/appeal-decide - 申诉裁决
- [x] Task 11.9: POST /api/admin/ban-user - 封禁用户
- [x] Task 11.10: POST /api/admin/unban-user - 解禁用户
- [x] Task 11.11: POST /api/admin/ban-ip - 封禁IP
- [x] Task 11.12: POST /api/admin/unban-ip - 解禁IP

---

## Task Dependencies

所有任务已完成。依赖关系已按以下顺序执行：
- 任务1（移除功能）→ 并行执行
- 任务2（数据库）→ 任务3（角色系统）
- 任务3, 4, 5, 6, 7, 8, 9 → 任务10（前端UI）
- 所有后端任务 → 任务11（API）
