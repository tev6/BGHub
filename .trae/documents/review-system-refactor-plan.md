# 举报审核系统重构计划

## 一、问题诊断

### 1.1 当前系统架构分析

**数据库表结构：**
- `review_items` - 审核项表（item_type, item_id, status, ai_reviewed）
- `review_actions` - 审核操作记录
- `review_appeals` - 申诉记录
- `reports` - 举报记录

**核心文件：**
- `server/services/moderation.js` - AI审核服务
- `server/routes/admin.js` - 审核API端点
- `server/routes/forum.js` - 帖子发布与审核触发
- `views/review.ejs` - 审核面板前端

### 1.2 发现的问题

#### 问题1：举报数据同步问题
- **现象**：用户提交举报后，审核面板"举报管理"页面无法实时显示
- **原因**：
  - 举报数据写入 `reports` 表后，前端没有实时刷新机制
  - 没有WebSocket通知或轮询机制
  - 前端只在页面加载时获取一次数据

#### 问题2：AI审核状态流转问题
- **现象**：AI审核完成后无法正确流转至"待审核"页面
- **原因**：
  - `ai_reviewed` 字段仅标记是否经过AI审核，但状态流转逻辑不完整
  - AI审核通过后，`review_items.status` 仍为 `pending`，但前端区分了"AI审核中"和"待审核"
  - 缺少明确的状态流转触发机制

#### 问题3：状态标识不完整
- **现象**：文章缺少完整的状态标识
- **原因**：
  - 当前只有 `review_status`（pending/approved/rejected）
  - 缺少"AI审核中"、"审核失败"等中间状态
  - 前端无法准确显示内容状态

#### 问题4：代码结构问题
- 审核逻辑分散在多个文件中
- 缺乏统一的状态管理机制
- 没有完善的错误处理和日志记录

---

## 二、重构方案

### 2.1 状态管理重构

#### 新的状态模型

```
内容状态 (review_status):
├── pending_ai      # 等待AI审核
├── ai_reviewing    # AI审核中
├── ai_rejected     # AI审核未通过
├── pending_human   # 等待人工审核
├── approved        # 已通过
└── rejected        # 已驳回
```

#### 状态流转图

```
[用户提交内容]
       │
       ▼
┌─────────────────┐
│  pending_ai     │ ← LV0-LV1: 聊天消息
└─────────────────┘
       │
       ▼
┌─────────────────┐
│  ai_reviewing   │ ← 调用AI审核API
└─────────────────┘
       │
       ├──────────────────────┐
       ▼                      ▼
┌─────────────────┐   ┌─────────────────┐
│  ai_rejected    │   │  pending_human  │
│  (可申诉)       │   │  (等待人工审核) │
└─────────────────┘   └─────────────────┘
                            │
                            ▼
                      ┌─────────────────┐
                      │  approved       │
                      └─────────────────┘
                            │
                            ▼
                      ┌─────────────────┐
                      │  rejected       │
                      └─────────────────┘
```

### 2.2 数据库结构优化

#### 修改 review_items 表

```sql
ALTER TABLE review_items ADD COLUMN review_stage TEXT DEFAULT 'pending_human';
-- review_stage: 'pending_ai' | 'ai_reviewing' | 'pending_human' | 'approved' | 'rejected'

ALTER TABLE review_items ADD COLUMN ai_result TEXT;
-- ai_result: 'pass' | 'reject' | null

ALTER TABLE review_items ADD COLUMN ai_reason TEXT;
-- AI审核原因/理由
```

#### 修改 posts/chat_messages/resources 表

```sql
-- 统一使用 review_status 字段，扩展状态值
-- pending_ai, ai_reviewing, ai_rejected, pending_human, approved, rejected
```

### 2.3 服务层重构

#### 创建 server/services/reviewService.js

```javascript
// 核心审核服务
module.exports = {
  // 提交内容进入审核流程
  submitForReview(itemType, itemId, userId, content),
  
  // AI审核处理
  processAIReview(itemType, itemId),
  
  // 人工审核处理
  processHumanReview(itemId, reviewerId, decision, reason),
  
  // 状态流转
  transitionStatus(itemId, fromStatus, toStatus),
  
  // 获取审核队列
  getReviewQueue(reviewerLevel, filters),
  
  // 实时通知
  notifyReviewUpdate(itemId, action)
};
```

#### 创建 server/services/reportService.js

```javascript
// 举报服务
module.exports = {
  // 提交举报
  submitReport(reporterId, targetType, targetId, reason),
  
  // 处理举报
  processReport(reportId, reviewerId, decision, reason),
  
  // 获取举报队列
  getReportQueue(reviewerLevel, filters),
  
  // 检查举报阈值
  checkReportThreshold(targetUserId)
};
```

### 2.4 API端点重构

#### 审核相关API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/review/queue` | GET | 获取审核队列（合并pending和ai-reviewing） |
| `/api/review/items/:id` | GET | 获取审核项详情 |
| `/api/review/items/:id/approve` | POST | 通过审核 |
| `/api/review/items/:id/reject` | POST | 驳回审核 |
| `/api/review/stats` | GET | 获取审核统计 |

#### 举报相关API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/reports` | POST | 提交举报 |
| `/api/reports/queue` | GET | 获取举报队列 |
| `/api/reports/:id/verify` | POST | 举报成立 |
| `/api/reports/:id/dismiss` | POST | 举报驳回 |

### 2.5 前端重构

#### 审核面板优化

1. **合并审核队列**：将"AI审核中"和"待审核"合并为统一队列，通过状态标签区分
2. **实时更新**：添加轮询或WebSocket实时更新机制
3. **状态标识**：为每个审核项显示完整状态标识

#### 状态标签设计

```html
<span class="status-tag status-pending-ai">等待AI审核</span>
<span class="status-tag status-ai-reviewing">AI审核中</span>
<span class="status-tag status-ai-rejected">AI审核未通过</span>
<span class="status-tag status-pending-human">等待人工审核</span>
<span class="status-tag status-approved">已通过</span>
<span class="status-tag status-rejected">已驳回</span>
```

### 2.6 实时同步机制

#### 方案：WebSocket + 轮询降级

```javascript
// 审核面板实时更新
class ReviewPanelUpdater {
  constructor() {
    this.ws = null;
    this.pollInterval = null;
    this.init();
  }
  
  init() {
    if (window.WebSocket) {
      this.connectWebSocket();
    } else {
      this.startPolling();
    }
  }
  
  connectWebSocket() {
    this.ws = new WebSocket('/ws/review');
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'new_report' || data.type === 'review_update') {
        this.refreshList();
      }
    };
    this.ws.onerror = () => this.startPolling();
  }
  
  startPolling() {
    this.pollInterval = setInterval(() => {
      this.refreshList();
    }, 30000); // 30秒轮询
  }
}
```

---

## 三、实施步骤

### 阶段一：数据库迁移（预计1小时）

1. 创建数据库迁移脚本
2. 添加新字段到 review_items 表
3. 迁移现有数据到新状态模型
4. 验证数据完整性

### 阶段二：服务层重构（预计3小时）

1. 创建 `server/services/reviewService.js`
2. 创建 `server/services/reportService.js`
3. 重构 `server/services/moderation.js`
4. 添加状态流转逻辑

### 阶段三：API端点重构（预计2小时）

1. 重构审核相关API
2. 重构举报相关API
3. 添加实时通知API
4. 更新路由注册

### 阶段四：前端重构（预计2小时）

1. 更新审核面板UI
2. 添加状态标签组件
3. 实现实时更新机制
4. 优化用户体验

### 阶段五：测试与验证（预计2小时）

1. 编写单元测试
2. 编写集成测试
3. 功能测试
4. 性能测试

---

## 四、测试计划

### 4.1 单元测试

- [ ] reviewService 状态流转测试
- [ ] reportService 举报处理测试
- [ ] moderation AI审核测试
- [ ] 权限验证测试

### 4.2 集成测试

- [ ] 完整审核流程测试
- [ ] 举报流程测试
- [ ] 申诉流程测试
- [ ] 权限边界测试

### 4.3 功能测试场景

| 场景 | 操作 | 预期结果 |
|------|------|----------|
| LV1发布聊天消息 | 提交消息 | 进入AI审核队列 |
| AI审核通过 | 自动流转 | 进入人工审核队列 |
| AI审核拒绝 | 自动流转 | 标记为AI未通过，可申诉 |
| LV3审核通过 | 人工审核 | 内容发布，通知用户 |
| 用户提交举报 | 填写举报 | 实时显示在审核面板 |
| LV4处理举报 | 审核举报 | 更新状态，通知相关用户 |

---

## 五、文件变更清单

### 新增文件

- `server/services/reviewService.js` - 审核服务
- `server/services/reportService.js` - 举报服务
- `server/middleware/reviewAuth.js` - 审核权限中间件
- `db/migrations/002_review_system_refactor.sql` - 数据库迁移
- `tests/review.test.js` - 审核系统测试
- `tests/report.test.js` - 举报系统测试

### 修改文件

- `server/database/index.js` - 数据库初始化
- `server/routes/admin.js` - 审核API重构
- `server/routes/forum.js` - 帖子发布流程
- `server/routes/chat.js` - 聊天消息流程
- `server/routes/resources.js` - 资源发布流程
- `views/review.ejs` - 审核面板UI
- `views/report-modal.ejs` - 举报模态框

---

## 六、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 数据迁移失败 | 高 | 先备份，分批迁移，回滚机制 |
| AI服务不可用 | 中 | 降级策略，直接进入人工审核 |
| 高并发性能问题 | 中 | 队列机制，异步处理 |
| 权限绕过 | 高 | 完善权限验证，审计日志 |

---

## 七、验收标准

1. ✅ 举报提交后实时显示在审核面板
2. ✅ AI审核完成后正确流转到人工审核队列
3. ✅ 所有内容显示完整的状态标识
4. ✅ 审核流程符合权限文档要求
5. ✅ 测试覆盖率 ≥ 80%
6. ✅ 无高优先级bug
