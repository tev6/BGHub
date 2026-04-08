# 布局优化计划

## 目标
消除首页左右两侧多余留白，充分利用页面宽度，调整CJ卡片为双列显示，禁用文章加载动画。

## 修改文件
- `z:\BGHub\1.0.1\public\css\style.css`
- `z:\BGHub\1.0.1\views\home.ejs`

---

## 具体步骤

### 1. 导航栏和页面容器宽度调整
**目标**: 让header和主内容区域向左右延展，填充页面宽度

**CSS修改** (line 52-57):
```css
/* 修改前 */
.header-shell,
.page-shell,
.footer-shell {
  width: min(1240px, calc(100% - 32px));
  margin: 0 auto;
}

/* 修改后 - 移除max-width限制 */
.header-shell,
.footer-shell {
  width: calc(100% - 32px);
  margin: 0 auto;
}

.page-shell {
  width: 100%;
  padding-left: 0;
  padding-right: 0;
}
```

### 2. 主内容区域布局调整
**目标**: 让三栏布局充分利用可用空间

**CSS修改** (home-layout部分):
```css
/* 修改前 */
.home-layout {
  display: grid;
  grid-template-columns: minmax(260px, 30vw) 1fr minmax(220px, 25vw);
  gap: 16px;
  align-items: start;
}

/* 修改后 - 增大左右两侧宽度比例 */
.home-layout {
  display: grid;
  grid-template-columns: minmax(320px, 35vw) 1fr minmax(280px, 28vw);
  gap: 20px;
  align-items: start;
}
```

### 3. CJ提醒区域改为双列显示
**目标**: 每行显示两个学科卡片

**CSS修改** (cj-list部分):
```css
/* 修改前 */
.cj-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 修改后 */
.cj-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
```

**同时调整cj-card尺寸**:
```css
.cj-card {
  padding: 10px;
  border-radius: 6px;
}
```

### 4. 文章区域禁用加载动画
**目标**: 移除骨架屏shimmer动画效果

**CSS修改** (article-media部分):
```css
/* 修改 - 移除 is-loading 动画类或禁用动画 */
.article-media.is-loading::after {
  /* 移除shimmer动画代码 */
  display: none;
}
```

**同时在home.ejs中** (line 39):
```html
<!-- 修改前 -->
<div class="article-media is-loading">

<!-- 修改后 - 直接显示内容 -->
<div class="article-media">
```

### 5. 响应式断点调整
**目标**: 确保移动端布局合理

**CSS修改** (在@media max-width: 1080px块中):
```css
@media (max-width: 1080px) {
  /* ... existing rules ... */

  .home-layout {
    grid-template-columns: 1fr 1fr; /* 双列CJ + 文章占满 */
  }

  .cj-panel,
  .right-column {
    width: 100%;
    max-width: none;
    height: auto;
  }

  .cj-list {
    grid-template-columns: repeat(2, 1fr); /* 移动端也保持双列 */
  }
}

@media (max-width: 768px) {
  .home-layout {
    grid-template-columns: 1fr;
  }

  .cj-list {
    grid-template-columns: repeat(2, 1fr); /* 保持双列 */
  }
}
```

---

## 验证检查清单
- [ ] 导航栏完全填充页面宽度
- [ ] 主内容区域无左右留白
- [ ] CJ卡片双列显示正常
- [ ] 文章加载无动画闪烁
- [ ] 响应式布局(>1080px, 768-1080px, <768px)均正常
- [ ] 功能正常使用(聊天、发帖、资源加载等)
