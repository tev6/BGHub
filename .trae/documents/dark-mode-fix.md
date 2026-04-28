# 暗黑模式字体颜色修复计划

## 问题分析

### 根本原因
根据代码审查，问题可能有以下几个原因：

1. **`.markdown-body` 样式在暗黑模式下可能未正确应用**
   - 暗黑模式样式定义在 CSS 文件末尾（约第3434行）
   - 可能存在样式优先级问题

2. **`.user-summary` 相关元素的颜色变量**
   - `.user-summary strong` 和 `.user-summary .user-name-link` 使用 `var(--text)`
   - 在 `[data-theme="dark"]` 中 `--text` 已定义为 `#f1f5f9`
   - 可能是父元素 `.user-summary` 的 `color: var(--muted)` 影响了子元素

---

## 修复方案

### 修复1: 加强 `.markdown-body` 暗黑模式样式

**目标**: 确保 markdown 内容在暗黑模式下清晰可见

**修改文件**: `public/css/style.css`

**修改内容**:
1. 将 `[data-theme="dark"] .markdown-body` 样式块移动到文件更早位置，确保优先级足够
2. 添加更具体的样式选择器确保覆盖
3. 为所有 markdown 子元素（h1-h6, p, li, span 等）添加明确的暗黑模式颜色

**具体修改**:
```css
/* 在主样式块中添加暗黑模式覆盖 */
[data-theme="dark"] .markdown-body,
[data-theme="dark"] .markdown-body p,
[data-theme="dark"] .markdown-body span,
[data-theme="dark"] .markdown-body li {
  color: var(--text) !important;
}

[data-theme="dark"] .markdown-body h1,
[data-theme="dark"] .markdown-body h2,
[data-theme="dark"] .markdown-body h3,
[data-theme="dark"] .markdown-body h4,
[data-theme="dark"] .markdown-body h5,
[data-theme="dark"] .markdown-body h6 {
  color: var(--text);
  border-bottom-color: var(--line);
}
```

### 修复2: 确保 `.user-summary` 在暗黑模式下正确显示

**目标**: 修复右上角用户名称在暗黑模式下不可见的问题

**修改文件**: `public/css/style.css`

**修改内容**:
1. 为 `.user-summary` 添加明确的暗黑模式背景色
2. 为 `.user-summary strong` 和 `.user-summary .user-name-link` 添加强制颜色覆盖
3. 确保父元素的 `color: var(--muted)` 不会继承到子元素

```css
[data-theme="dark"] .user-summary {
  background: #374151;
  color: var(--muted);
}

[data-theme="dark"] .user-summary strong,
[data-theme="dark"] .user-summary .user-name-link {
  color: var(--text) !important;
}
```

---

## 实施步骤

1. **修改 `.user-summary` 暗黑模式样式**
   - 在现有 `[data-theme="dark"] .user-summary` 块中添加 `color: var(--muted)`
   - 确保 strong 和 .user-name-link 使用 `color: var(--text) !important`

2. **增强 `.markdown-body` 暗黑模式覆盖**
   - 找到现有 `[data-theme="dark"] .markdown-body` 块
   - 扩展选择器覆盖更多子元素
   - 添加 `!important` 确保优先级

3. **验证修复效果**
   - 清除浏览器缓存
   - 在暗黑模式下测试 about、settings 页面

---

## 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `public/css/style.css` | 添加暗黑模式 `.user-summary` 和 `.markdown-body` 颜色覆盖 |

---

## 预期效果

- **暗黑模式下**:
  - `.markdown-body` 内的所有文字使用 `var(--text)` 颜色（#f1f5f9）
  - `.user-summary` 用户名称使用 `var(--text)` 颜色（#f1f5f9）

- **明亮模式下**:
  - 保持原有样式不变
