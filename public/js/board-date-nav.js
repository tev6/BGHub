const CJDateNav = {
  currentDate: null,
  boardSlug: null,
  todayStr: null,
  locale: 'zh',

  init(boardSlug, initialDate, locale) {
    this.boardSlug = boardSlug;
    this.currentDate = initialDate;
    this.todayStr = new Date().toISOString().split('T')[0];
    this.locale = locale || 'zh';

    this.bindEvents();
    this.updateNextButtonState();
  },

  bindEvents() {
    const prevBtn = document.getElementById('cj-prev-btn');
    const nextBtn = document.getElementById('cj-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigate(-1));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigate(1));
    }
  },

  navigate(delta) {
    const current = new Date(this.currentDate);
    current.setDate(current.getDate() + delta);
    const newDate = current.toISOString().split('T')[0];

    if (delta > 0 && newDate > this.todayStr) {
      return;
    }

    this.loadDate(newDate);
  },

  async loadDate(dateStr) {
    try {
      const response = await fetch(`/boards/${this.boardSlug}/cj?date=${dateStr}`);
      if (!response.ok) {
        throw new Error('Failed to load CJ content');
      }

      const data = await response.json();
      this.currentDate = dateStr;
      this.updateDisplay(dateStr, data);
      this.updateNextButtonState();
      history.replaceState(null, '', `/boards/${this.boardSlug}`);
    } catch (error) {
      console.error('Error loading CJ:', error);
    }
  },

  updateDisplay(dateStr, data) {
    const displayEl = document.getElementById('cj-date-display');
    if (displayEl) {
      displayEl.textContent = this.formatDateDisplay(dateStr);
    }

    this.updateCJContent(data.sections);

    const prevBtn = document.getElementById('cj-prev-btn');
    if (prevBtn) {
      prevBtn.dataset.date = data.dateNav.prevDate;
    }
  },

  updateCJContent(sections) {
    ['IC', 'HW', 'A'].forEach(sectionKey => {
      const section = sections[sectionKey];
      const contentEl = document.querySelector(`.section-card[data-section="${sectionKey}"] .section-markdown`);
      const titleEl = document.querySelector(`.section-card[data-section="${sectionKey}"] h2`);
      const updatedEl = document.querySelector(`.section-card[data-section="${sectionKey}"] .helper-text`);

      if (contentEl) {
        if (section && section.content) {
          contentEl.innerHTML = this.renderMarkdown(section.content);
        } else {
          const emptyText = this.locale === 'en' ? 'Not yet filled' : '暂未填写';
          contentEl.innerHTML = `<p class="empty-state">${emptyText}</p>`;
        }
      }

      if (titleEl && section) {
        titleEl.textContent = section.title || sectionKey;
      }

      if (updatedEl && section && section.updated_at) {
        const label = this.locale === 'en' ? 'Updated at' : '更新于';
        updatedEl.textContent = `${label} ${this.formatDateTime(section.updated_at)}`;
      }
    });
  },

  formatDateDisplay(dateStr) {
    if (dateStr === this.todayStr) {
      return this.locale === 'en' ? 'Today' : '今天';
    }

    const today = new Date(this.todayStr);
    const target = new Date(dateStr);
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return this.locale === 'en' ? 'Yesterday' : '昨天';
    }
    if (diffDays === 2) {
      return this.locale === 'en' ? 'Day before yesterday' : '前天';
    }

    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}`;
  },

  formatDateTime(dateStr) {
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  },

  updateNextButtonState() {
    const nextBtn = document.getElementById('cj-next-btn');
    if (nextBtn) {
      if (this.currentDate >= this.todayStr) {
        nextBtn.classList.add('disabled');
        nextBtn.setAttribute('aria-disabled', 'true');
      } else {
        nextBtn.classList.remove('disabled');
        nextBtn.removeAttribute('aria-disabled');
      }
    }
  },

  renderMarkdown(content) {
    if (!content) return '';
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  },

  getCurrentDate() {
    return this.currentDate;
  }
};

window.CJDateNav = CJDateNav;