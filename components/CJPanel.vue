<template>
  <aside class="cj-panel">
    <div class="panel-head panel-head--compact cj-panel-head">
      <h2>CJ</h2>
      <a href="/search" class="text-link">搜索</a>
    </div>
    <div class="cj-panel-body">
      <div class="cj-list">
        <a
          v-for="board in boards"
          :key="board.id"
          class="cj-card"
          :href="`/boards/${board.slug}`"
        >
          <div class="cj-card-top">
            <strong>{{ board.name }}</strong>
            <span class="board-dot" :style="{ background: board.color }"></span>
          </div>
          <p class="cj-card-copy">{{ board.description }}</p>
          <div class="cj-card-meta">
            <div><span>IC</span><span>{{ formatExcerpt(board.sections.IC?.content) }}</span></div>
            <div><span>HW</span><span>{{ formatExcerpt(board.sections.HW?.content) }}</span></div>
            <div><span>A</span><span>{{ formatExcerpt(board.sections.A?.content) }}</span></div>
          </div>
        </a>
      </div>
    </div>
  </aside>
</template>

<script>
import { excerpt } from '../utils/text.js';

export default {
  name: 'CJPanel',
  props: {
    boards: {
      type: Array,
      required: true
    }
  },
  methods: {
    formatExcerpt(content, length = 36) {
      return excerpt(content, length, '待补充');
    }
  }
};
</script>

<style lang="scss" scoped>
.cj-panel {
  width: 30vw;
  min-width: 260px;
  max-width: 320px;
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  padding: 14px;
  background: var(--surface, #ffffff);
  border: 1px solid rgba(219, 229, 241, 0.8);
  box-shadow: var(--shadow, 0 18px 48px rgba(15, 23, 42, 0.08));

  .cj-panel-body {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .cj-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cj-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(219, 229, 241, 0.9);
    text-decoration: none;
    color: inherit;
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
    }
  }

  .cj-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .cj-card-copy {
    color: var(--muted, #64748b);
    font-size: 0.9rem;
  }

  .cj-card-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--muted, #64748b);

    div {
      display: grid;
      grid-template-columns: 30px 1fr;
      gap: 10px;
    }

    span:first-child {
      color: var(--primary, rgb(50, 85, 164));
      font-weight: 800;
    }
  }

  .board-dot {
    width: 12px;
    height: 12px;
    border-radius: 999px;
  }
}
</style>
