# 学生社区信用等级与权限完整实现

## Why
用户需要一个完整的信用等级系统，包含发布限制、内容审核、举报机制和封禁机制，以确保社区健康发展。

## What Changes

### 1. 角色等级重设计
将现有 LV0-LV6 扩展为包含 LV5.5 特殊等级的完整体系，信用分范围和权限如下：

| 等级 | 信用分范围 | 每日发布上限 | 审核级别 | 特殊权限 |
|------|-----------|-------------|---------|---------|
| LV0 | 0 | 5条聊天 | 全审核 | IP封禁 |
| LV1 | 1-10 | 20条聊天 | AI审核 | 每日1分登录奖励 |
| LV2 | 11-40 | 40条总发布 | AI审核 | 每日2分登录奖励 |
| LV3 | 41-100 | 60条总发布 | 免审(可举报) | 审核LV2, 7天注册 |
| LV4 | 101-250 | 80条总发布 | 免审(举报人工) | 审核LV1-3, 30天注册 |
| LV5 | 251-500 | 100条总发布 | 完全免审 | 审核所有, 500分上限 |
| LV5.5 | 特殊 | 无限制 | 完全免审 | 临时禁言/锁定, 特殊授予 |
| LV6 | 最高 | 无限制 | 全权限 | 管理员, 最高权限 |

### 2. 审核机制
- **LV0**: 聊天消息先发后审（先发后AI审）
- **LV1**: 聊天/CJ需AI审核，成功+1分，失败-3分封禁
- **LV2**: AI审核聊天/CJ/文章，成功+3/5分，失败-5分
- **LV3+**: 直接发布，被举报后才审核

### 3. 举报机制
所有用户可举报内容，举报判定：
- 被举报内容经审核确认违规：举报者+1~3分
- 连续3次无效举报：举报者-5分

### 4. 申诉机制
- LV1+可对误判内容申诉
- 申诉成功：补回信用分+补偿
- 申诉失败：额外扣3分

### 5. 封禁机制
- **IP封禁**: 5分钟→30分钟→6小时（按失败次数递进）
- **用户封禁**: 1分钟→10分钟→1小时（按违规次数递进）
- 超过30次失败审核：封禁IP 6小时
- 封禁24小时后刷新计数

### 6. 移除功能
- 移除匿名发布选项
- 移除标记已解决按钮

## Impact
- Affected specs: 学生社区信用等级与权限完整说明
- Affected code: app.js, database schema, views/*, public/css/style.css

## ADDED Requirements

### Requirement: 角色等级系统
系统必须实现完整的8个等级（LV0-LV6 + LV5.5），每个等级有独立的信用分范围、发布限制和审核权限。

#### Scenario: 用户登录
- **WHEN** 用户登录系统
- **THEN** 系统显示用户当前等级、信用分、每日剩余发布次数

#### Scenario: 信用分变动
- **WHEN** 用户发布内容被审核（通过/失败）
- **THEN** 系统根据当前等级规则增减信用分，并检查是否触发升级/降级

#### Scenario: 等级升级
- **WHEN** 用户信用分达到当前等级上限
- **THEN** 系统自动升级用户等级，更新权限

#### Scenario: 等级降级
- **WHEN** 用户信用分低于当前等级下限
- **THEN** 系统自动降级用户等级

### Requirement: 发布限流
系统必须限制用户每日发布数量，超出限制时阻止发布。

#### Scenario: 达到每日限制
- **WHEN** 用户当日发布数量达到等级上限
- **THEN** 系统返回错误"今日发布次数已用完"

### Requirement: 内容审核
系统必须根据用户等级对内容进行不同级别的审核。

#### Scenario: LV0用户发送聊天消息
- **WHEN** LV0用户发送聊天消息
- **THEN** 消息先显示在聊天区，然后进行AI审核；审核失败则撤回消息

#### Scenario: LV1用户发布CJ内容
- **WHEN** LV1用户提交CJ内容
- **THEN** 内容进入AI审核队列，审核通过后发布，失败则扣除5分

### Requirement: 举报功能
所有登录用户可举报违规内容。

#### Scenario: 用户举报内容
- **WHEN** 用户点击举报按钮选择举报原因
- **THEN** 系统创建举报记录，通知审核者

#### Scenario: 恶意举报判定
- **WHEN** 举报者连续3次举报被判定为无效
- **THEN** 举报者被扣除5信用分

### Requirement: 申诉功能
LV1+用户可对误判内容申诉。

#### Scenario: 用户申诉
- **WHEN** 用户对被错误审核的内容发起申诉
- **THEN** 内容进入人工复审队列，申诉期间内容暂时隐藏

#### Scenario: 申诉成功
- **WHEN** 人工复审确认内容无违规
- **THEN** 恢复内容，补回扣除的信用分，并额外补偿1-3分

#### Scenario: 申诉失败
- **WHEN** 人工复审确认内容违规
- **THEN** 额外扣除3分（恶意申诉）

### Requirement: IP封禁
系统必须对频繁违规的IP实施渐进式封禁。

#### Scenario: IP封禁递进
- **WHEN** IP地址触发封禁（第N次违规）
- **THEN** 封禁时长递进：5分钟→30分钟→6小时，封禁计数24小时后刷新

#### Scenario: 严重违规IP封禁
- **WHEN** IP地址在24小时内失败审核次数超过30次
- **THEN** 直接封禁该IP 6小时，只能通过登录/注册解除

### Requirement: 用户封禁
系统必须对频繁违规的用户实施渐进式封禁。

#### Scenario: 用户封禁递进
- **WHEN** 用户触发封禁（第N次违规）
- **THEN** 封禁时长递进：1分钟→10分钟→1小时，封禁期间用户可浏览但不能发布

## MODIFIED Requirements

### Requirement: 匿名发布功能
**Modification**: 完全移除，前端不再显示匿名选项

### Requirement: 标记已解决功能
**Modification**: 完全移除，前端不再显示该按钮

## Database Schema Changes

### New Tables

```sql
-- IP封禁记录
CREATE TABLE ip_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL DEFAULT '',
    fail_count INTEGER NOT NULL DEFAULT 0,
    banned_at DATETIME NOT NULL,
    expires_at DATETIME,
    created_by INTEGER,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

-- 用户封禁记录
CREATE TABLE user_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    ban_count INTEGER NOT NULL DEFAULT 0,
    banned_at DATETIME NOT NULL,
    expires_at DATETIME,
    created_by INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

-- 举报记录
CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL, -- post/comment/chat/resource/cj
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending/reviewed/dismissed
    reviewer_id INTEGER,
    review_result TEXT, -- valid/invalid/malicious
    created_at DATETIME NOT NULL,
    reviewed_at DATETIME,
    FOREIGN KEY(reporter_id) REFERENCES users(id),
    FOREIGN KEY(reviewer_id) REFERENCES users(id)
);

-- 申诉记录
CREATE TABLE review_appeals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content_type TEXT NOT NULL, -- post/comment/chat/resource/cj
    content_id INTEGER NOT NULL,
    appeal_reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    reviewer_id INTEGER,
    review_note TEXT,
    credit_restored INTEGER DEFAULT 0,
    credit_compensation INTEGER DEFAULT 0,
    created_at DATETIME NOT NULL,
    reviewed_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(reviewer_id) REFERENCES users(id)
);

-- 每日统计（用于发布计数和信用上限）
CREATE TABLE daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stat_date TEXT NOT NULL, -- YYYY-MM-DD格式
    posts_count INTEGER NOT NULL DEFAULT 0,
    chat_count INTEGER NOT NULL DEFAULT 0,
    cj_count INTEGER NOT NULL DEFAULT 0,
    resource_count INTEGER NOT NULL DEFAULT 0,
    login_credit_received INTEGER NOT NULL DEFAULT 0,
    credit_capped INTEGER NOT NULL DEFAULT 0, -- 超上限暂存的信用分
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, stat_date)
);

-- 用户信用分超限记录（用于LV3/LV4注册时间限制）
CREATE TABLE credit_caps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    excess_credit INTEGER NOT NULL DEFAULT 0,
    released_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
```

### Modified Tables

```sql
-- user_credit 表增加字段
ALTER TABLE user_credit ADD COLUMN violation_count INTEGER DEFAULT 0;
ALTER TABLE user_credit ADD COLUMN last_violation_at DATETIME;

-- posts 表保留字段但前端不展示
-- is_anonymous, is_resolved 字段保留但不再使用
```

## API Endpoints

### 举报相关
- `POST /api/reports` - 提交举报
- `GET /api/reports/my` - 查看我的举报记录

### 申诉相关
- `POST /api/appeals` - 提交申诉
- `GET /api/appeals/my` - 查看我的申诉记录

### 审核相关 (LV3+)
- `GET /api/review/queue` - 获取审核队列
- `POST /api/review/:id/approve` - 审核通过
- `POST /api/review/:id/reject` - 审核拒绝
- `POST /api/review/:id/appeal-decide` - 申诉裁决

### 管理相关 (LV6)
- `POST /api/admin/ban-user` - 封禁用户
- `POST /api/admin/unban-user` - 解禁用户
- `POST /api/admin/ban-ip` - 封禁IP
- `POST /api/admin/unban-ip` - 解禁IP
- `POST /api/admin/adjust-credit` - 调整信用分
- `POST /api/admin/grant-lv55` - 授予LV5.5
- `POST /api/admin/revoke-lv55` - 撤销LV5.5
