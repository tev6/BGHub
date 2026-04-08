<template>
  <div class="review-panel">
    <div class="review-header">
      <h1>审核面板</h1>
      <span class="helper-text">LV{{ userLevel }} · {{ totalItems }} 条待审</span>
    </div>

    <div class="review-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="review-item card"
        :data-item-id="item.id"
      >
        <div class="review-item-icon">
          <span v-if="item.item_type === 'post'" class="icon-post">📝</span>
          <span v-else-if="item.item_type === 'chat'" class="icon-chat">💬</span>
          <span v-else-if="item.item_type === 'resource'" class="icon-resource">📎</span>
        </div>
        <div class="review-item-body">
          <div class="review-item-meta">
            <span class="tag">{{ typeLabel(item.item_type) }}</span>
            <span>提交者：{{ item.author_name }}</span>
            <span>{{ formatDate(item.created_at, true) }}</span>
          </div>
          <p class="review-item-preview">{{ item.payload || '查看详情' }}</p>
        </div>
        <div class="review-item-actions">
          <button class="btn btn-primary btn-sm" @click="openApprove(item.id)">通过</button>
          <button class="btn btn-danger btn-sm" @click="openReject(item.id)">驳回</button>
          <button class="btn btn-ghost btn-sm" @click="viewDetail(item.id)">详情</button>
        </div>
      </div>

      <div v-if="!items.length" class="empty-state">
        暂无待审核内容
      </div>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <button
        class="btn btn-ghost"
        :disabled="currentPage <= 1"
        @click="goToPage(currentPage - 1)"
      >
        上一页
      </button>
      <span class="page-info">第 {{ currentPage }} / {{ totalPages }} 页</span>
      <button
        class="btn btn-ghost"
        :disabled="currentPage >= totalPages"
        @click="goToPage(currentPage + 1)"
      >
        下一页
      </button>
    </div>

    <div v-if="drawerOpen" class="review-drawer">
      <div class="drawer-backdrop" @click="closeDrawer"></div>
      <div class="drawer-content">
        <div class="drawer-header">
          <h2>审核详情</h2>
          <button class="btn btn-ghost" type="button" @click="closeDrawer">关闭</button>
        </div>
        <div class="drawer-body" v-html="detailContent"></div>
        <div v-if="selectedItemId" class="drawer-footer">
          <div class="form-group">
            <label class="form-label">审核理由（10-200字）</label>
            <textarea
              class="form-control"
              v-model="reviewReason"
              rows="3"
              placeholder="请输入审核理由"
            ></textarea>
          </div>
          <div class="action-row">
            <button class="btn btn-primary" type="button" @click="confirmApprove">
              确认通过
            </button>
            <button class="btn btn-danger" type="button" @click="confirmReject">
              确认驳回
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ReviewPanel',
  props: {
    initialItems: {
      type: Array,
      default: () => []
    },
    userLevel: {
      type: Number,
      default: 0
    },
    initialPage: {
      type: Number,
      default: 1
    },
    totalItems: {
      type: Number,
      default: 0
    },
    totalPages: {
      type: Number,
      default: 1
    }
  },
  data() {
    return {
      items: this.initialItems,
      currentPage: this.initialPage,
      drawerOpen: false,
      detailContent: '',
      selectedItemId: null,
      selectedAction: null,
      reviewReason: ''
    };
  },
  methods: {
    typeLabel(type) {
      const labels = { post: '帖子', chat: '聊天', resource: '资源' };
      return labels[type] || type;
    },
    formatDate(dateValue, includeTime = false) {
      if (!dateValue) return '—';
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return '—';
      return includeTime
        ? date.toLocaleString('zh-CN', { hour12: false })
        : date.toLocaleDateString('zh-CN');
    },
    async goToPage(page) {
      const response = await fetch(`/api/review/items?page=${page}`);
      const payload = await response.json();
      if (payload.items) {
        this.items = payload.items;
        this.currentPage = payload.pagination.page;
      }
    },
    async viewDetail(id) {
      const response = await fetch(`/api/review/items/${id}`);
      const payload = await response.json();
      if (payload.item) {
        this.selectedItemId = id;
        this.selectedAction = null;
        this.reviewReason = '';
        this.detailContent = this.renderDetail(payload);
        this.drawerOpen = true;
      }
    },
    renderDetail(payload) {
      const { item, content, history } = payload;
      let html = `<div class="detail-section">
        <h3>基本信息</h3>
        <p><strong>类型：</strong>${this.typeLabel(item.item_type)}</p>
        <p><strong>提交者：</strong>${item.author_name}</p>
        <p><strong>时间：</strong>${this.formatDate(item.created_at, true)}</p>
      </div>`;

      if (content) {
        if (item.item_type === 'post') {
          html += `<div class="detail-section">
            <h3>内容</h3>
            <h4>${content.title}</h4>
            <p>${content.content}</p>
          </div>`;
        } else if (item.item_type === 'chat') {
          html += `<div class="detail-section">
            <h3>消息内容</h3>
            <p>${content.content}</p>
          </div>`;
        } else if (item.item_type === 'resource') {
          html += `<div class="detail-section">
            <h3>资源信息</h3>
            <p><strong>标题：</strong>${content.title}</p>
            <p><strong>描述：</strong>${content.description}</p>
          </div>`;
        }
      }

      if (history && history.length) {
        html += `<div class="detail-section">
          <h3>审核历史</h3>`;
        history.forEach(h => {
          html += `<div class="history-item">
            <span>${h.reviewer_name}</span>
            <span>${h.action === 'approve' ? '通过' : '驳回'}</span>
            <span>${h.reason}</span>
            <span>${this.formatDate(h.created_at, true)}</span>
          </div>`;
        });
        html += `</div>`;
      }

      return html;
    },
    openApprove(id) {
      this.selectedItemId = id;
      this.selectedAction = 'approve';
      this.reviewReason = '';
      this.detailContent = '<p>请填写审核理由后确认通过。</p>';
      this.drawerOpen = true;
    },
    openReject(id) {
      this.selectedItemId = id;
      this.selectedAction = 'reject';
      this.reviewReason = '';
      this.detailContent = '<p>请填写审核理由后确认驳回。</p>';
      this.drawerOpen = true;
    },
    closeDrawer() {
      this.drawerOpen = false;
      this.selectedItemId = null;
      this.selectedAction = null;
      this.reviewReason = '';
    },
    async confirmApprove() {
      if (this.reviewReason.length < 10 || this.reviewReason.length > 200) {
        alert('审核理由需在 10-200 个字符之间');
        return;
      }
      await this.submitReview('approve');
    },
    async confirmReject() {
      if (this.reviewReason.length < 10 || this.reviewReason.length > 200) {
        alert('审核理由需在 10-200 个字符之间');
        return;
      }
      await this.submitReview('reject');
    },
    async submitReview(action) {
      const endpoint = action === 'approve'
        ? `/api/review/items/${this.selectedItemId}/approve`
        : `/api/review/items/${this.selectedItemId}/reject`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: this.reviewReason })
        });

        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || '操作失败');
        }

        this.closeDrawer();
        this.goToPage(this.currentPage);
      } catch (err) {
        alert(err.message);
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.review-panel {
  max-width: 900px;
  margin: 0 auto;
}

.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 20px 24px;
  background: var(--surface, #ffffff);
  border-radius: var(--radius, 20px);
  border: 1px solid rgba(219, 229, 241, 0.8);
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.review-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
}

.review-item-icon {
  font-size: 24px;
  width: 40px;
  text-align: center;
}

.review-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.review-item-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.9rem;
  color: var(--muted, #64748b);
}

.review-item-preview {
  font-size: 14px;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}

.review-item-actions {
  display: flex;
  gap: 8px;
}

.btn-sm {
  padding: 8px 14px;
  font-size: 0.9rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
}

.page-info {
  color: var(--muted, #64748b);
}

.review-drawer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: flex-end;
}

.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
}

.drawer-content {
  position: relative;
  width: min(480px, 90vw);
  height: 100%;
  background: var(--surface, #ffffff);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--line, #dbe5f1);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.drawer-footer {
  padding: 20px 24px;
  border-top: 1px solid var(--line, #dbe5f1);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(50, 85, 164, 0.12);
  color: var(--primary, rgb(50, 85, 164));
  font-size: 0.8rem;
  font-weight: 700;
}

.empty-state {
  padding: 18px;
  border-radius: 18px;
  background: rgba(50, 85, 164, 0.08);
  color: var(--muted, #64748b);
}
</style>
