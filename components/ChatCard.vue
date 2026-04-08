<template>
  <section class="card right-card chat-card">
    <div class="panel-head panel-head--compact">
      <h2>聊天</h2>
      <span class="helper-text">班级群</span>
    </div>

    <div class="chat-stream" ref="chatStream">
      <div
        v-for="message in messages"
        :key="message.id"
        class="chat-bubble"
      >
        <div class="chat-bubble-head">
          <strong>{{ message.author_name }}</strong>
          <span>{{ formatDate(message.created_at, true) }}</span>
        </div>
        <p>{{ message.content }}</p>
      </div>

      <div v-if="!messages.length" class="empty-state">
        聊天区暂时还没有消息。
      </div>
    </div>

    <form v-if="user" class="chat-form" @submit.prevent="handleSubmit">
      <textarea
        class="form-control"
        v-model="content"
        placeholder="发送消息（无刷新）"
        rows="3"
        required
      ></textarea>
      <button class="btn btn-primary" type="submit" :disabled="sending">
        {{ sending ? '发送中...' : '发送' }}
      </button>
      <div v-if="error" class="chat-error" :class="{ 'show': error }">
        {{ error }}
      </div>
    </form>
    <p v-else class="helper-text">登录后可在聊天区发言。</p>
  </section>
</template>

<script>
export default {
  name: 'ChatCard',
  props: {
    messages: {
      type: Array,
      required: true
    },
    user: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      content: '',
      sending: false,
      error: ''
    };
  },
  methods: {
    formatDate(dateValue, includeTime = false) {
      if (!dateValue) return '—';
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return '—';
      return includeTime
        ? date.toLocaleString('zh-CN', { hour12: false })
        : date.toLocaleDateString('zh-CN');
    },
    async handleSubmit() {
      if (!this.content.trim() || this.sending) return;

      this.sending = true;
      this.error = '';

      const formData = new FormData();
      formData.append('content', this.content.trim());

      try {
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          body: formData
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || '发送失败');
        }

        if (payload.message) {
          this.$emit('message-added', payload.message);
          this.content = '';
          this.$nextTick(() => {
            this.$refs.chatStream.scrollTop = this.$refs.chatStream.scrollHeight;
          });
        }
      } catch (err) {
        this.error = err.message || '发送失败';
        setTimeout(() => {
          this.error = '';
        }, 3000);
      } finally {
        this.sending = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.chat-card {
  height: 50%;
  display: flex;
  flex-direction: column;
  padding: 14px;
  overflow: hidden;
}

.chat-stream {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  max-height: calc(50% - 60px);

  &::-webkit-scrollbar {
    display: none;
  }
}

.chat-bubble {
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--surface-alt, #eef4ff);
  margin-bottom: 12px;

  p {
    margin: 0;
    color: #334155;
  }
}

.chat-bubble-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: var(--muted, #64748b);
  font-size: 0.88rem;

  strong {
    color: var(--text, #111827);
  }
}

.chat-form {
  margin-top: auto;
  display: grid;
  gap: 10px;
  height: 60px;
  grid-template-columns: 1fr 88px;
  align-items: center;

  textarea {
    height: 60px;
    min-height: 60px;
  }
}

.chat-error {
  grid-column: 1 / -1;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger, #dc2626);
  font-weight: 700;
  font-size: 12px;
  display: none;

  &.show {
    display: block;
  }
}

.empty-state {
  padding: 18px;
  border-radius: 18px;
  background: rgba(50, 85, 164, 0.08);
  color: var(--muted, #64748b);
  text-align: center;
}

.helper-text {
  color: var(--muted, #64748b);
  font-size: 0.9rem;
}
</style>
