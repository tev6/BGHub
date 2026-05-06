const ThemeManager = {
  STORAGE_KEY: 'bigz-hub-theme',

  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      this.setTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.setTheme('dark');
    }

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  },

  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  ThemeManager.init();

  const toggle = document.querySelector('[data-nav-toggle]');
  const panel = document.querySelector('[data-nav-panel]');

  if (toggle && panel) {
    toggle.addEventListener('click', () => {
      panel.classList.toggle('is-open');
    });
  }

  document.querySelectorAll('[data-confirm]').forEach((element) => {
    element.addEventListener('submit', (event) => {
      const message = element.getAttribute('data-confirm') || '确定继续吗？';

      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });

  const chatForm = document.querySelector('[data-chat-form]');
  const chatStream = document.querySelector('[data-chat-stream]');
  const chatError = document.querySelector('[data-chat-error]');
  const chatPendingIndicator = document.querySelector('[data-chat-pending]');

  if (chatForm && chatStream) {
    chatForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(chatForm);
      const textArea = chatForm.querySelector('textarea[name="content"]');
      const submitButton = chatForm.querySelector('button[type="submit"]');

      if (!formData.get('content')) {
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
      }

      if (chatError) {
        chatError.hidden = true;
        chatError.textContent = '';
      }

      try {
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: formData.get('content') })
        });

        const payload = await response.json();

        if (!response.ok) {
          if (payload.cooldownMinutes) {
            throw new Error('请等待 ' + payload.cooldownMinutes + ' 分钟后再发送');
          }
          throw new Error(payload.error || '发送失败');
        }

        if (payload.pending) {
          if (chatPendingIndicator) {
            chatPendingIndicator.textContent = payload.message;
            chatPendingIndicator.hidden = false;
          }
          if (textArea) {
            textArea.value = '';
          }
          if (chatForm) {
            chatForm.style.display = 'none';
          }
          if (window.pollMessageStatus && payload.messageId) {
            window.pollMessageStatus(payload.messageId);
          }
        } else if (payload.message) {
          const bubble = document.createElement('div');
          bubble.className = 'chat-bubble';
          if (payload.message.id) {
            bubble.dataset.messageId = payload.message.id;
          }
          
          let deleteBtn = '';
          if (payload.message.canDelete && payload.message.id) {
            deleteBtn = '<button class="chat-delete-btn" onclick="deleteChatMessage(' + payload.message.id + ')" title="删除">🗑️</button>';
          }
          
          bubble.innerHTML = `
            <div class="chat-bubble-head">
              <strong>${payload.message.author_name}</strong>
              <span>${payload.message.created_at_display || new Date().toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })}</span>
              ${deleteBtn}
            </div>
            <p>${payload.message.content}</p>
          `;
          chatStream.appendChild(bubble);
          chatStream.scrollTop = chatStream.scrollHeight;
          if (textArea) {
            textArea.value = '';
          }
        }
      } catch (error) {
        if (chatError) {
          chatError.textContent = error.message || '发送失败';
          chatError.hidden = false;
          window.setTimeout(() => {
            chatError.hidden = true;
            chatError.textContent = '';
          }, 5000);
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });

    if (chatStream && window.WebSocket) {
      window.wsSocket = window.wsSocket || null;
      if (window.wsSocket && window.wsSocket.readyState === 1) {
        window.wsSocket.addEventListener('message', function(event) {
          try {
            var data = JSON.parse(event.data);
            if (data.type === 'chat_approved') {
              var pendingBubble = chatStream.querySelector('[data-pending-id="' + data.messageId + '"]');
              if (pendingBubble) {
                pendingBubble.removeAttribute('data-pending-id');
                pendingBubble.classList.remove('chat-bubble-pending');
                var p = pendingBubble.querySelector('p');
                if (p) p.textContent = p.textContent + ' ✓';
              }
              if (chatPendingIndicator) {
                chatPendingIndicator.hidden = true;
              }
              if (chatForm) {
                chatForm.style.display = '';
              }
              var textArea = chatForm.querySelector('textarea[name="content"]');
              var submitBtn = chatForm.querySelector('[data-chat-submit-btn]');
              if (textArea) textArea.disabled = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '发送';
              }
            } else if (data.type === 'chat_rejected') {
              var pendingBubble2 = chatStream.querySelector('[data-pending-id="' + data.messageId + '"]');
              if (pendingBubble2) {
                pendingBubble2.remove();
              }
              if (chatPendingIndicator) {
                chatPendingIndicator.textContent = '消息未通过审核: ' + (data.reason || '内容违规');
                chatPendingIndicator.style.color = 'var(--danger)';
              }
              if (chatForm) {
                chatForm.style.display = '';
              }
              var textArea2 = chatForm.querySelector('textarea[name="content"]');
              var submitBtn2 = chatForm.querySelector('[data-chat-submit-btn]');
              if (textArea2) textArea2.disabled = false;
              if (submitBtn2) {
                submitBtn2.disabled = false;
                submitBtn2.textContent = '发送';
              }
            }
          } catch (e) {}
        });
      }
    }
  }

  const chatTextarea = document.querySelector('[data-chat-textarea]');
  if (chatTextarea && chatForm) {
    chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });
  }

  document.querySelectorAll('[data-resource-more]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetList = document.querySelector('[data-resource-list]');
      if (!targetList) {
        return;
      }

      const currentOffset = Number(button.getAttribute('data-offset') || '0');
      button.disabled = true;

      try {
        const response = await fetch(`/api/resources?offset=${currentOffset}&limit=6`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : '加载失败');
        }

        const items = payload.resources || [];
        items.forEach((resource) => {
          const details = document.createElement('details');
          details.className = 'resource-item';
          details.innerHTML = `
            <summary>
              <strong>${resource.title}</strong>
              <span class="tag">${resource.board_name}</span>
            </summary>
            <div class="resource-item-body">
              <p>${resource.description || '课件 / PPT / 复习资料'}</p>
              <div class="meta-row">
                <span>下载 ${resource.download_count}</span>
                <span>点赞 ${resource.like_count}</span>
                <a href="/resources/${resource.id}/download">下载</a>
              </div>
            </div>
          `;
          targetList.appendChild(details);
        });

        const nextOffset = currentOffset + items.length;
        button.setAttribute('data-offset', String(nextOffset));

        if (items.length < 6) {
          button.hidden = true;
        }
      } catch (error) {
        button.disabled = false;
      } finally {
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('.article-media.is-loading img').forEach((image) => {
    const container = image.closest('.article-media');
    if (!container) {
      return;
    }

    const clearLoading = () => container.classList.remove('is-loading');
    if (image.complete) {
      clearLoading();
      return;
    }

    image.addEventListener('load', clearLoading, { once: true });
    image.addEventListener('error', clearLoading, { once: true });
  });
});

window.deleteChatMessage = async function(messageId) {
  if (!messageId) return;

  if (!window.confirm('确定要删除这条消息吗？')) {
    return;
  }

  try {
    const response = await fetch('/api/chat/messages/' + messageId, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (!response.ok) {
      alert(result.error || '删除失败');
      return;
    }

    const bubble = document.querySelector('.chat-bubble[data-message-id="' + messageId + '"]');
    if (bubble) {
      bubble.remove();
    }
  } catch (error) {
    alert('删除失败: ' + error.message);
  }
};

window.handleForumCardClick = function(event) {
  const card = event.currentTarget;
  const url = card.dataset.postUrl;
  if (url && !event.target.closest('a')) {
    window.location.href = url;
  }
};
