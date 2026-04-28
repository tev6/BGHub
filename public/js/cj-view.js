const CJView = {
  currentSubject: null,
  currentDate: null,
  todayStr: null,
  sevenDaysAgoStr: null,
  locale: 'zh',

  init(subject, currentDate, locale) {
    this.currentSubject = subject;
    this.currentDate = currentDate || this.getTodayStr();
    this.todayStr = this.getTodayStr();
    this.locale = locale || 'zh';

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    this.sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    this.bindEvents();
    this.updateNavButtons();
  },

  bindEvents() {
    const prevBtn = document.getElementById('cj-prev-btn');
    const nextBtn = document.getElementById('cj-next-btn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigateDate(-1));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigateDate(1));
    }
  },

  navigateDate(delta) {
    const current = new Date(this.currentDate);
    current.setDate(current.getDate() + delta);
    const newDate = current.toISOString().split('T')[0];

    if (delta > 0 && newDate > this.todayStr) {
      return;
    }

    if (delta < 0 && newDate < this.sevenDaysAgoStr) {
      return;
    }

    this.loadContent(newDate);
  },

  async loadContent(dateStr) {
    try {
      const url = `/cj/api?subject=${this.currentSubject}&date=${dateStr}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load');

      const data = await response.json();
      this.currentDate = dateStr;

      this.updateDisplay(dateStr, data.sections);
      this.updateNavButtons();

      const newUrl = `/cj/subject?subject=${this.currentSubject}&date=${dateStr}`;
      history.pushState({ subject: this.currentSubject, date: dateStr }, '', newUrl);
    } catch (error) {
      console.error('Error loading CJ:', error);
    }
  },

  updateDisplay(dateStr, sections) {
    const displayEl = document.getElementById('cj-date-display');
    if (displayEl) {
      displayEl.textContent = this.formatDateDisplay(dateStr);
    }

    ['IC', 'HW', 'A'].forEach(sectionKey => {
      const section = sections[sectionKey];
      const contentEl = document.querySelector(`.cj-section-block[data-section="${sectionKey}"] .section-markdown`);
      if (contentEl) {
        if (section && section.content) {
          contentEl.innerHTML = this.renderMarkdown(section.content);
        } else {
          contentEl.innerHTML = '<p class="empty-state">暂未填写</p>';
        }
      }
    });
  },

  updateNavButtons() {
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

    const prevBtn = document.getElementById('cj-prev-btn');
    if (prevBtn) {
      if (this.currentDate <= this.sevenDaysAgoStr) {
        prevBtn.classList.add('disabled');
        prevBtn.setAttribute('aria-disabled', 'true');
      } else {
        prevBtn.classList.remove('disabled');
        prevBtn.removeAttribute('aria-disabled');
      }
    }
  },

  formatDateDisplay(dateStr) {
    if (dateStr === this.todayStr) return this.locale === 'en' ? 'Today' : '今天';

    const today = new Date(this.todayStr);
    const target = new Date(dateStr);
    const diffDays = Math.round((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return this.locale === 'en' ? 'Yesterday' : '昨天';
    if (diffDays === 2) return this.locale === 'en' ? '2 days ago' : '前天';
    return dateStr;
  },

  getTodayStr() {
    return new Date().toISOString().split('T')[0];
  },

  renderMarkdown(content) {
    if (!content) return '';
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }
};

document.addEventListener('DOMContentLoaded', function() {
  if (window.CJ_SUBJECT) {
    CJView.init(window.CJ_SUBJECT, window.CJ_CURRENT_DATE, window.CJ_LOCALE);
  }
});

window.addEventListener('popstate', function(e) {
  if (e.state && e.state.subject && e.state.date) {
    CJView.currentSubject = e.state.subject;
    CJView.loadContent(e.state.date);
  }
});

window.CJView = CJView;