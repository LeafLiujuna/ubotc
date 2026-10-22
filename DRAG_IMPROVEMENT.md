# 拖拽区域改进说明

## 改进内容

### 问题
之前实时投票面板只能通过右上角的一个 26px × 26px 的小按钮进行拖拽，目标太小，难以操作。

### 解决方案
将整个头部区域（header）设置为可拖拽表面，极大提升了可用性。

## 修改的文件

### 1. `frontend/src/components/RealtimeVotePanel.vue`

**改动：**
- 为 `<header>` 元素添加了 `ref="dragSurfaceRef"`
- 将 `dragSurfaceRef` 传递给 `useDraggablePanel` 的第四个参数

**代码：**
```vue
<!-- 模板中 -->
<header ref="dragSurfaceRef" class="realtime-vote-header">
  <!-- ... -->
</header>

<!-- script 中 -->
const dragSurfaceRef = ref<HTMLElement | null>(null);
useDraggablePanel("vote", shellRef, dragHandleRef, dragSurfaceRef);
```

## 功能说明

### 拖拽区域
现在整个头部区域都可以拖拽，包括：
- ⚖️ 标题文字区域（"说书人裁定" + "实时投票"）
- 状态指示器（"实时进行" 徽章）
- 头部背景空白区域
- 原有的拖拽按钮（仍然保留）

### 交互细节
1. **鼠标拖拽**：在头部任意位置按住鼠标左键并移动即可拖拽面板
2. **光标提示**：头部区域会显示 `grab` 光标，拖拽时变为 `grabbing`
3. **智能排除**：按钮（关闭、拖拽把手）的点击事件不会被拖拽操作干扰
4. **键盘操作**：通过拖拽按钮仍可使用键盘：
   - 方向键：移动 8px（Shift + 方向键：32px）
   - Home：复位到初始位置
   - 双击头部：复位到初始位置

### 视觉反馈
- 拖拽过程中面板添加 `.is-hud-dragging` 类
- 禁用文本选择和过渡动画，确保流畅拖拽体验
- 头部区域鼠标悬停时显示抓手图标

## 技术实现

### useDraggablePanel composable
```typescript
useDraggablePanel(
  id: string,           // "vote" - 面板唯一标识
  panel: Ref,           // shellRef - 面板容器
  handle: Ref,          // dragHandleRef - 键盘操作入口
  surface?: Ref         // dragSurfaceRef - 可拖拽表面（新增）
)
```

### CSS 支持
- `.ts-drag-surface` 类由 `attachDraggablePanel` 自动添加
- 在 `frontend/src/townsquare-ui.scss` 中定义样式
- 包含 `cursor: grab`、`touch-action: none` 等交互样式

## 测试

### 测试页面
创建了独立测试页面 `frontend/public/drag-test.html` 用于演示拖拽功能：
- 可视化展示改进前后的对比
- 提供交互式拖拽演示
- 访问：http://localhost:8081/drag-test.html

### 验证要点
- ✅ 整个头部区域可拖拽
- ✅ 按钮点击不被拖拽干扰
- ✅ 拖拽过程中光标正确变化
- ✅ 面板位置正确更新
- ✅ 拖拽结束后位置持久化到 localStorage

## 响应式设计

**注意**：拖拽功能仅在桌面端（viewport ≥ 901px）启用：
- 移动端（≤ 900px）：面板使用固定布局或文档流布局
- 小屏幕设备上拖拽会与滚动手势冲突，因此禁用

## 其他使用拖拽的组件

项目中其他使用 `useDraggablePanel` 的组件：
1. `RealtimeVotePanel.vue` - ✅ 已改进
2. `TownSquare.vue` - 使用 `attachDraggablePanel`，已包含 surface 参数
3. `GeneralSettings.vue` - 需要检查是否需要类似改进

## 用户体验提升

### 改进前
- 拖拽目标：26px × 26px 小按钮
- 需要精确瞄准右上角按钮
- 在高分辨率屏幕上更难点击

### 改进后  
- 拖拽目标：整个头部区域（约 390px × 70px）
- 无需精确定位，任意抓取头部即可
- 符合用户对窗口拖拽的直觉（标题栏可拖动）
- 拖拽面积增加约 **40 倍**

## 兼容性

- 不影响现有功能
- 向后兼容：旧的拖拽按钮仍然可用
- 渐进增强：添加功能而不改变原有行为

## 相关文件

- `frontend/src/composables/useDraggablePanel.ts` - 拖拽逻辑实现
- `frontend/src/townsquare-ui.scss` - 拖拽相关样式
- `frontend/src/styles/townsquare/_side.scss` - 侧边栏样式
- `frontend/public/drag-test.html` - 测试演示页面
