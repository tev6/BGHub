# CJ 模块班级隔离功能规范

## Why

当前 CJ 模块虽然已有班级隔离的数据库字段支持（`subject_grade_permissions.is_shared` 和 `board_sections.class_name`），但前端展示和用户交互层面缺少以下功能：

1. **学科名称未显示班级区分**：用户无法直观看到学科属于哪个班级
2. **无法查看其他班级内容**：用户只能看到自己班级的 CJ，无法切换查看其他班级
3. **缺少班级切换 UI**：主页和学科详情页都没有班级切换按钮

## What Changes

### 1. 学科名称添加班级后缀

对于 G6-G8 年级且未勾选共享的学科，在显示名称后添加 `(班级名)` 后缀：
- 例如：`Physics(A)`、`Physics(B)`、`Physics(C)`、`Physics(D)`

### 2. 主页 CJ 模块添加"显示其他班"按钮

- G6-G8 用户：显示切换按钮，点击可查看所有班级的 CJ 内容
- G9-G12 用户：不显示此按钮（无班级隔离）
- 未登录用户：在选择年级班级后，同样显示切换按钮

### 3. 学科详情页添加班级切换功能

- 在学科 CJ 页面添加班级切换按钮组
- 用户可快速切换查看不同班级的同一学科内容
- 编辑时只能编辑自己班级的内容

## Impact

- **Affected specs**: 学生社区信用等级与权限完整说明
- **Affected code**:
  - `server/routes/cj.js` - CJ 路由逻辑
  - `app.js` - 主页 CJ 数据获取逻辑
  - `views/home.ejs` - 主页 CJ 模块
  - `views/cj/index.ejs` - CJ 首页
  - `views/cj/subject.ejs` - 学科详情页
  - `views/cj/edit.ejs` - 编辑页
  - `public/css/style.css` - 相关样式
  - `public/js/cj-view.js` - 前端交互逻辑
  - `server/locales/zh.json` - 中文翻译
  - `server/locales/en.json` - 英文翻译

## ADDED Requirements

### Requirement: 学科名称班级后缀显示

系统必须为 G6-G8 年级未共享的学科显示班级后缀。

#### Scenario: G6-G8 用户查看未共享学科
- **GIVEN** 用户为 G6-G8 年级
- **AND** 学科未勾选共享
- **WHEN** 用户查看 CJ 列表
- **THEN** 学科名称显示为 `学科名(班级名)` 格式
- **AND** 用户只看到自己班级的学科

#### Scenario: G6-G8 用户查看共享学科
- **GIVEN** 用户为 G6-G8 年级
- **AND** 学科已勾选共享
- **WHEN** 用户查看 CJ 列表
- **THEN** 学科名称不添加班级后缀
- **AND** 所有班级看到相同内容

#### Scenario: G9-G12 用户查看学科
- **GIVEN** 用户为 G9-G12 年级
- **WHEN** 用户查看 CJ 列表
- **THEN** 学科名称不添加班级后缀
- **AND** 不显示"显示其他班"按钮

### Requirement: 主页"显示其他班"按钮

系统必须在主页 CJ 模块提供班级切换功能。

#### Scenario: G6-G8 用户切换班级显示
- **GIVEN** 用户为 G6-G8 年级
- **WHEN** 用户点击"显示其他班"按钮
- **THEN** 显示所有班级的学科内容
- **AND** 按钮文字变为"仅显示本班"

#### Scenario: G6-G8 用户切换回本班
- **GIVEN** 用户已点击"显示其他班"
- **WHEN** 用户点击"仅显示本班"按钮
- **THEN** 仅显示用户所属班级的学科内容

#### Scenario: 未登录用户切换班级显示
- **GIVEN** 未登录用户已选择年级和班级
- **WHEN** 用户点击"显示其他班"按钮
- **THEN** 显示所选年级所有班级的学科内容

### Requirement: 学科详情页班级切换

系统必须在学科详情页提供班级切换功能。

#### Scenario: 用户查看其他班级 CJ
- **GIVEN** 用户在学科详情页
- **AND** 该学科未共享
- **WHEN** 用户点击其他班级按钮
- **THEN** 显示该班级的 CJ 内容
- **AND** URL 更新为 `?subject=xxx&class=A`

#### Scenario: 用户编辑 CJ 权限控制
- **GIVEN** 用户在查看其他班级的 CJ
- **WHEN** 用户点击编辑按钮
- **THEN** 只能编辑自己班级的 CJ 内容
- **AND** 不能编辑其他班级的内容

### Requirement: 数据查询逻辑更新

系统必须根据班级隔离设置正确查询数据。

#### Scenario: 查询未共享学科的班级数据
- **GIVEN** 学科未共享
- **AND** 用户班级为 A
- **WHEN** 系统查询 CJ 数据
- **THEN** 只返回 `class_name = 'A'` 或 `class_name IS NULL` 的记录

#### Scenario: 查询共享学科的数据
- **GIVEN** 学科已共享
- **WHEN** 系统查询 CJ 数据
- **THEN** 返回所有记录，不按班级过滤

## MODIFIED Requirements

### Requirement: getBoards 函数

**现状**：返回用户年级有权限的所有学科

**改进**：对于 G6-G8 年级未共享学科，按班级分组返回

```javascript
// 返回格式变更
{
  id: 1,
  name: "Physics",
  name_en: "Physics",
  display_name: "Physics(A)",  // 新增：带班级后缀的显示名
  class_name: "A",             // 新增：所属班级
  is_shared: false             // 新增：是否共享
}
```

### Requirement: getSectionsForBoard 函数

**现状**：根据 `gradeContext` 过滤班级数据

**改进**：支持 `showAllClasses` 参数，允许查看所有班级内容

## Technical Notes

### 数据库查询变更

```sql
-- 获取学科列表（带班级信息）
SELECT 
  b.*,
  sgp.is_shared,
  gc.class_name as display_class
FROM boards b
LEFT JOIN subject_grade_permissions sgp ON b.id = sgp.board_id AND sgp.grade = ?
LEFT JOIN grade_classes gc ON gc.grade = ? AND (sgp.is_shared = 1 OR gc.class_name = ?)
WHERE sgp.id IS NOT NULL
ORDER BY b.sort_order, b.name

-- 获取所有班级的 CJ 数据（显示其他班时）
SELECT * FROM board_sections
WHERE board_id = ? AND section_date = ?
ORDER BY class_name, section
```

### 前端状态管理

```javascript
// cj-view.js 新增状态
CJView.showAllClasses = false;  // 是否显示所有班级
CJView.currentClass = 'A';      // 当前查看的班级

// 切换班级显示
CJView.toggleShowAllClasses = function() {
  CJView.showAllClasses = !CJView.showAllClasses;
  CJView.refreshBoardList();
};
```

### URL 参数设计

```
/cj?showAllClasses=true          # 显示所有班级
/cj/subject?subject=physics&class=B  # 查看特定班级的学科
```
