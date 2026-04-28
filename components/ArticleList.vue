<template>
  <section class="article-column">
    <div class="panel-head panel-head--compact">
      <h2>文章 / 笔记</h2>
      <a href="/forum" class="text-link">查看全部</a>
    </div>

    <div class="article-list">
      <article
        v-for="post in posts"
        :key="post.id"
        class="article-card"
      >
        <a :href="`/forum/${post.id}`" class="article-link">
          <div class="article-media" :class="{ 'is-loading': !imageLoaded }">
            <img
              v-if="extractFirstImageUrl(post.content)"
              :src="extractFirstImageUrl(post.content)"
              :alt="post.title"
              loading="lazy"
              decoding="async"
              @load="imageLoaded = true"
              @error="imageLoaded = true"
            />
            <div v-else class="article-media-fallback"></div>
          </div>
          <div class="article-body">
            <div class="article-head">
              <span class="tag">{{ post.board_name }}</span>
              <span class="helper-text">{{ formatDate(post.created_at, true) }}</span>
            </div>
            <h3 class="article-title">{{ post.title }}</h3>
            <p class="article-excerpt">{{ excerpt(post.content, 140) }}</p>
            <div class="article-meta">
              <span>{{ post.is_anonymous ? '匿名同学' : post.author_name }}</span>
              <span>{{ post.comment_count }} 条回复</span>
              <span>{{ post.view_count }} 次浏览</span>
            </div>
          </div>
        </a>
      </article>

      <div v-if="!posts.length" class="empty-state">
        还没有文章或笔记。
      </div>
    </div>
  </section>
</template>

<script>
import { formatDate } from '../utils/date.js';
import { excerpt } from '../utils/text.js';

export default {
  name: 'ArticleList',
  props: {
    posts: {
      type: Array,
      required: true
    }
  },
  data() {
    return {
      imageLoaded: false
    };
  },
  methods: {
    excerpt,
    extractFirstImageUrl(content) {
      if (!content) return '';
      const match = content.match(/!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)|<img[^>]+src=["']([^"']+)["']/i);
      return match ? (match[1] || match[2] || '') : '';
    }
  }
};
</script>

<style lang="scss" scoped>
.article-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.article-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.article-card {
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(219, 229, 241, 0.9);
  overflow: hidden;
  box-shadow: var(--shadow, 0 18px 48px rgba(15, 23, 42, 0.08));
}

.article-link {
  display: grid;
  grid-template-columns: 240px 1fr;
  align-items: stretch;
  text-decoration: none;
  color: inherit;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.article-media {
  position: relative;
  aspect-ratio: 16 / 9;
  background: rgba(219, 229, 241, 0.8);
  overflow: hidden;

  &.is-loading::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, rgba(219, 229, 241, 0.4) 0%, rgba(219, 229, 241, 0.9) 50%, rgba(219, 229, 241, 0.4) 100%);
    animation: shimmer 1.2s infinite;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.article-media-fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(50, 85, 164, 0.12), rgba(219, 229, 241, 0.8));
}

.article-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.article-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.article-title {
  font-size: 16px;
  line-height: 1.35;
}

.article-excerpt {
  font-size: 14px;
  line-height: 1.6;
  color: #334155;
}

.article-meta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--muted, #64748b);
  font-size: 0.9rem;
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

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
</style>
