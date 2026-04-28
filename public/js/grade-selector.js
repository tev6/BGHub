window.GradeSelector = {
  currentGrade: null,
  currentClass: null,

  async init() {
    this.gradeSelect = document.getElementById('guest-grade-select');
    this.classSelect = document.getElementById('guest-class-select');
    this.confirmBtn = document.getElementById('grade-confirm-btn');
    this.container = document.getElementById('grade-selector');

    if (!this.gradeSelect) return;

    this.bindEvents();
    await this.loadCurrentContext();
  },

  bindEvents() {
    this.gradeSelect.addEventListener('change', () => this.onGradeChange());
    if (this.confirmBtn) {
      this.confirmBtn.addEventListener('click', () => this.confirmSelection());
    }
  },

  async loadCurrentContext() {
    const res = await fetch('/api/grade-context');
    const data = await res.json();

    if (data.gradeContext) {
      this.currentGrade = data.gradeContext.grade;
      this.currentClass = data.gradeContext.class_name;
      this.gradeSelect.value = this.currentGrade || '';

      if (this.currentGrade && ['G6', 'G7', 'G8'].includes(this.currentGrade)) {
        await this.loadClasses(this.currentGrade);
        if (this.currentClass) {
          this.classSelect.value = this.currentClass;
        }
        this.showClassSelect();
      }
    }
  },

  onGradeChange() {
    const grade = this.gradeSelect.value;
    this.currentGrade = grade;
    this.currentClass = null;

    if (['G6', 'G7', 'G8'].includes(grade)) {
      this.loadClasses(grade);
      this.showClassSelect();
    } else {
      this.hideClassSelect();
    }
  },

  showClassSelect() {
    if (this.classSelect) {
      this.classSelect.style.display = 'inline-block';
      this.classSelect.required = true;
    }
  },

  hideClassSelect() {
    if (this.classSelect) {
      this.classSelect.style.display = 'none';
      this.classSelect.required = false;
      this.classSelect.value = '';
    }
  },

  async loadClasses(grade) {
    if (!this.classSelect) return;

    this.classSelect.innerHTML = '<option value="">加载中...</option>';
    this.classSelect.disabled = true;

    try {
      const res = await fetch('/api/grades/classes?grade=' + encodeURIComponent(grade));
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '加载失败');
      }

      const classes = data.classes || [];
      if (classes.length === 0) {
        this.classSelect.innerHTML = '<option value="">该年级暂无班级配置</option>';
      } else {
        this.classSelect.innerHTML = '<option value="">选择班级</option>';
        classes.forEach(cls => {
          const option = document.createElement('option');
          option.value = cls.class_name;
          option.textContent = 'Class ' + cls.class_name;
          this.classSelect.appendChild(option);
        });
      }
    } catch (err) {
      this.classSelect.innerHTML = '<option value="">加载失败</option>';
    } finally {
      this.classSelect.disabled = false;
    }
  },

  async confirmSelection() {
    const grade = this.gradeSelect.value;
    const className = this.classSelect ? this.classSelect.value : '';

    if (!grade) {
      alert('请选择年级');
      return;
    }

    if (['G6', 'G7', 'G8'].includes(grade) && !className) {
      alert('请选择班级');
      return;
    }

    try {
      const res = await fetch('/api/grade-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: grade,
          class_name: className || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '设置失败');
      }

      this.currentGrade = grade;
      this.currentClass = className || null;

      if (this.container) {
        this.container.style.display = 'none';
      }

      if (window.location.pathname === '/' || window.location.pathname.startsWith('/cj')) {
        window.location.reload();
      }
    } catch (err) {
      alert('设置失败: ' + err.message);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  GradeSelector.init();
});
