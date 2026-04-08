<template>
  <section class="card right-card resource-card">
    <div class="panel-head panel-head--compact">
      <h2>Resource</h2>
      <a href="/resources" class="text-link">进入库</a>
    </div>

    <div class="resource-accordion" ref="resourceList">
      <details
        v-for="resource in displayedResources"
        :key="resource.id"
        class="resource-item"
        open
      >
        <summary>
          <strong>{{ resource.title }}</strong>
          <span class="tag">{{ resource.board_name }}</span>
        </summary>
        <div class="resource-item-body">
          <p>{{ resource.description || '课件 / PPT / 复习资料' }}</p>
          <div class="meta-row">
            <span>下载 {{ resource.download_count }}</span>
            <span>点赞 {{ resource.like_count }}</span>
            <a :href="`/resources/${resource.id}/download`">下载</a>
          </div>
        </div>
      </details>

      <div v-if="!resources.length" class="empty-state">
        暂无资源。
      </div>
    </div>

    <div v-if="hasMore" class="resource-footer">
      <button
        class="btn btn-ghost btn-block"
        type="button"
        @click="loadMore"
        :disabled="loading"
      >
        {{ loading ? '加载中...' : '更多' }}
      </button>
    </div>
  </section>
</template>

<script>
export default {
  name: 'ResourceCard',
  props: {
    resources: {
      type: Array,
      required: true
    },
    initialLimit: {
      type: Number,
      default: 3
    }
  },
  data() {
    return {
      displayCount: this.initialLimit,
      loading: false
    };
  },
  computed: {
    displayedResources() {
      return this.resources.slice(0, this.displayCount);
    },
    hasMore() {
      return this.resources.length > this.displayCount;
    }
  },
  methods: {
    async loadMore() {
      if (this.loading) return;
      this.loading = true;

      try {
        const response = await fetch(`/api/resources?offset=${this.displayCount}&limit=6`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || '加载失败');
        }

        this.$emit('resources-loaded', payload.resources);
        this.displayCount += payload.resources.length;
      } catch (err) {
        console.error('Failed to load more resources:', err);
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.resource-card {
  height: 50%;
  display: flex;
  flex-direction: column;
  padding: 14px;
  overflow: hidden;
}

.resource-accordion {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.resource-item {
  border-radius: 12px;
  border: 1px solid rgba(219, 229, 241, 0.9);
  background: var(--surface-alt, #eef4ff);
  padding: 10px 12px;
  margin-bottom: 10px;

  &[open] {
    summary {
      margin-bottom: 10px;
    }
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }
  }
}

.resource-item-body {
  display: grid;
  gap: 10px;
  color: var(--muted, #64748b);

  p {
    margin: 0;
    font-size: 0.9rem;
  }
}

.meta-row {
  display: flex;
  gap: 12px;
  font-size: 0.85rem;

  a {
    color: var(--primary, rgb(50, 85, 164));
    font-weight: 600;
  }
}

.resource-footer {
  margin-top: auto;
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
  text-align: center;
}
</style>
