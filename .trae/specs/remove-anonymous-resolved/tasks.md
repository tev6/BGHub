# Tasks

## 任务1：移除匿名发布和标记已解决功能

- [ ] Task 1.1: 修改 forum-form.ejs - 移除匿名发布复选框
- [ ] Task 1.2: 修改 forum-detail.ejs - 移除标记已解决按钮
- [ ] Task 1.3: 验证功能已移除

---

## 任务2：实现完整权限与审核系统

### 2.1 数据库结构更新
- [ ] Task 2.1.1: 创建 ip_bans 表（IP封禁记录）
- [ ] Task 2.1.2: 创建 user_bans 表（用户封禁记录）
- [ ] Task 2.1.3: 创建 reports 表（举报记录）
- [ ] Task 2.1.4: 创建 review_appeals 表（申诉记录）
- [ ] Task 2.1.5: 创建 daily_stats 表（每日统计，用于信用分上限控制）

### 2.2 角色等级与信用分重设计
- [ ] Task 2.2.1: 更新 roles 表结构和默认角色数据
- [ ] Task 2.2.2: 更新 user_credit 表结构（添加相关字段）
- [ ] Task 2.2.3: 实现信用分增减逻辑
- [ ] Task 2.2.4: 实现等级自动升降逻辑
- [ ] Task 2.2.5: 实现注册时间校验（LV3需7天，LV4需30天）

### 2.3 发布权限与限流
- [ ] Task 2.3.1: 实现每日发布限流（按类型：聊天/CJ/文章/资源）
- [ ] Task 2.3.2: 实现信用分不足时的发布限制
- [ ] Task 2.3.3: 添加每日登录信用分奖励

### 2.4 审核机制
- [ ] Task 2.4.1: 实现AI内容审核（聊天消息、CJ、文章）
- [ ] Task 2.4.2: 实现人工审核队列
- [ ] Task 2.4.3: 实现LV3-LV5的复审权限
- [ ] Task 2.4.4: 实现举报后审核流程
- [ ] Task 2.4.5: 实现申诉机制

### 2.5 封禁机制
- [ ] Task 2.5.1: 实现IP封禁（按失败次数递增封禁时长）
- [ ] Task 2.5.2: 实现用户封禁（按违规次数递增封禁时长）
- [ ] Task 2.5.3: 实现自动解禁逻辑
- [ ] Task 2.5.4: 实现管理员解禁接口

### 2.6 举报机制
- [ ] Task 2.6.1: 实现文章举报
- [ ] Task 2.6.2: 实现聊天消息举报
- [ ] Task 2.6.3: 实现CJ模块举报
- [ ] Task 2.6.4: 实现资源举报
- [ ] Task 2.6.5: 实现恶意举报判定（连续3次无效举报）

### 2.7 前端UI更新
- [ ] Task 2.7.1: 更新设置页面显示当前权限
- [ ] Task 2.7.2: 添加举报按钮到各内容类型
- [ ] Task 2.7.3: 添加审核面板（LV3+）
- [ ] Task 2.7.4: 添加申诉入口

### 2.8 API接口
- [ ] Task 2.8.1: POST /api/reports - 提交举报
- [ ] Task 2.8.2: GET /api/review/queue - 获取审核队列
- [ ] Task 2.8.3: POST /api/review/:id/approve - 审核通过
- [ ] Task 2.8.4: POST /api/review/:id/reject - 审核拒绝
- [ ] Task 2.8.5: POST /api/appeals - 提交申诉
- [ ] Task 2.8.6: POST /api/admin/unban - 解禁用户/IP

## Task Dependencies
- Task 2.2 依赖 Task 2.1
- Task 2.3 依赖 Task 2.2
- Task 2.4 依赖 Task 2.2 和 Task 2.3
- Task 2.5 依赖 Task 2.4
- Task 2.6 依赖 Task 2.4 和 Task 2.5
- Task 2.7 依赖 Task 2.2, 2.4, 2.6
- Task 2.8 依赖 Task 2.1-2.7
