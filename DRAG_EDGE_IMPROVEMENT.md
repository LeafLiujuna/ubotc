# 拖拽图标移至上边缘 - 设计改进

## 改进概述

将实时投票面板的拖拽图标从头部右上角移至顶部边缘，并进行视觉美化，使其与面板整体风格融合。

## 视觉效果对比

### 改进前
- 拖拽按钮位于头部右上角（actions区域内）
- 26px × 26px 的小按钮，带网格点状纹理
- 与状态指示器、关闭按钮并排

### 改进后
- 独立的顶部拖拽边缘条
- 拖拽把手居中显示，32px × 18px
- 整个上边缘区域（24px 高）都可拖拽
- 黄铜色渐变背景，与面板风格一致

## 设计细节

### 1. 拖拽边缘条 `.realtime-vote-drag-edge`

**布局：**
- `position: sticky; top: 0; z-index: 4` - 始终置顶，覆盖在内容上方
- `min-height: 24px` - 提供足够的触摸/点击目标
- `display: flex; align-items: center; justify-content: center` - 把手居中

**视觉：**
- 渐变背景：从 `rgba(201, 169, 98, 0.18)` 渐变到透明
- 底部细边框：`1px solid rgba(201, 169, 98, 0.15)`
- 整体采用黄铜色系，与面板边框和装饰一致

**交互：**
- `cursor: grab` - 悬停时显示抓手图标
- `cursor: grabbing` - 拖拽时显示抓取状态
- `touch-action: none` - 禁用触摸设备的默认滚动行为

### 2. 拖拽把手 `.ts-drag-handle--edge`

**尺寸与形状：**
- 32px × 18px - 横向扁平矩形
- `border-radius: 6px` - 圆角处理，柔和视觉
- `border: 1px solid rgba(216, 172, 94, 0.38)` - 金色边框

**纹理与背景：**
- **点状纹理层**（content-box）：
  ```css
  radial-gradient(circle, rgba(232, 197, 125, 0.75) 1.2px, transparent 1.5px) 
  0 50% / 6px 6px
  ```
  6px 间距的重复点阵图案，模拟皮革或布料质感

- **渐变底色**（border-box）：
  ```css
  linear-gradient(160deg, rgba(62, 44, 30, 0.85), rgba(31, 22, 16, 0.9))
  ```
  深棕色到黑棕色的对角渐变

- **伪元素装饰**（`::before`）：
  水平条纹效果，使用更密集的点状图案
  ```css
  width: 20px; height: 3px;
  background: radial-gradient(circle, rgba(232, 197, 125, 0.6) 1px, transparent 1.2px) 
  0 50% / 5px 3px
  ```

**光影效果：**
- 内发光：`inset 0 1px 0 rgba(255, 255, 255, 0.08)` - 顶部高光
- 外阴影：`0 2px 6px rgba(0, 0, 0, 0.25)` - 轻微浮起感

**悬停状态：**
- 边框变亮：`rgba(216, 172, 94, 0.6)` - 从 0.38 提升到 0.6
- 更强阴影：`0 3px 8px rgba(0, 0, 0, 0.3)` - 增强立体感
- 过渡动画：`transition: all 160ms ease`

**键盘焦点：**
- 金色焦点环：`outline: 2px solid var(--ts-accent-gold, #d8ac5e)`
- 外偏移：`outline-offset: 3px`

### 3. 头部调整

**定位变化：**
```scss
.realtime-vote-header {
  position: sticky;
  top: 24px;  // 之前是 top: 0，现在为拖拽边缘留出空间
  z-index: 3; // 低于拖拽边缘（z-index: 4）
}
```

## 代码结构

### HTML 结构（Vue 模板）

```vue
<div class="realtime-vote-card">
  <!-- 新增：顶部拖拽边缘 -->
  <div ref="dragSurfaceRef" class="realtime-vote-drag-edge">
    <button
      ref="dragHandleRef"
      type="button"
      class="ts-drag-handle ts-drag-handle--edge"
      aria-label="拖动移动实时投票面板，方向键微调，双击复位"
      title="拖动移动面板"
    ></button>
  </div>
  
  <!-- 原有头部，不再包含拖拽按钮 -->
  <header class="realtime-vote-header">
    <div>
      <span class="realtime-vote-kicker">...</span>
      <h2>实时投票</h2>
    </div>
    <div class="realtime-vote-header__actions">
      <!-- 拖拽按钮已移除 -->
      <span class="realtime-vote-status">实时进行</span>
      <button class="realtime-vote-close">关闭</button>
    </div>
  </header>
  
  <!-- 内容区域 -->
  <div class="realtime-vote-content">...</div>
</div>
```

### 脚本（无需修改）

```typescript
const dragSurfaceRef = ref<HTMLElement | null>(null);
const dragHandleRef = ref<HTMLElement | null>(null);

useDraggablePanel("vote", shellRef, dragHandleRef, dragSurfaceRef);
```

`useDraggablePanel` composable 已支持 `surface` 参数，自动处理：
- 整个 `dragSurfaceRef` 区域的鼠标拖拽
- `dragHandleRef` 按钮的键盘操作（方向键、Home、双击复位）
- 自动添加 `.ts-drag-surface` 类和相关事件监听

## 用户体验提升

### 1. 更大的拖拽目标
- **之前**：26px × 26px = 676 平方像素
- **现在**：整个上边缘，约 390px × 24px = 9,360 平方像素
- **提升**：拖拽面积增加约 **14 倍**

### 2. 更符合直觉
- 模拟操作系统窗口标题栏的交互模式
- 用户自然会尝试拖动面板顶部边缘
- 清晰的视觉提示（渐变条 + 居中把手）

### 3. 视觉层次清晰
- 拖拽功能与头部内容分离
- 不干扰状态指示器和关闭按钮的布局
- 把手居中对称，视觉平衡

### 4. 无障碍性
- 保留键盘操作支持
- `aria-label` 提供完整的操作说明
- 焦点样式清晰可见

## 响应式行为

**桌面端（≥ 901px）：**
- 拖拽功能完全启用
- 面板可在视口内自由移动

**移动端（< 901px）：**
- 拖拽功能被 composable 自动禁用
- 面板使用固定定位或文档流布局
- 避免与触摸滚动手势冲突

## 技术实现要点

### 1. 分层渲染
```
z-index: 4  →  .realtime-vote-drag-edge   （拖拽边缘）
z-index: 3  →  .realtime-vote-header        （头部标题）
z-index: 2  →  .realtime-vote-content       （内容区域）
```

### 2. 粘性定位
两个 `position: sticky` 元素堆叠：
- 拖拽边缘：`top: 0`
- 头部：`top: 24px`

滚动时两者都会固定在顶部，保持可见。

### 3. 点状纹理技术
使用 `radial-gradient` 模拟布料/皮革质感：
```css
radial-gradient(circle, 点颜色 点半径, transparent 间距半径) 
偏移 / 横向间距 纵向间距
```

### 4. 多重背景
通过 `background-clip` 分层：
- `content-box` 层：点状纹理（仅在内容区）
- `border-box` 层：渐变底色（覆盖内容+边框）

## 兼容性

- ✅ Chrome/Edge 88+
- ✅ Firefox 85+
- ✅ Safari 14.1+
- ⚠️ 移动端：拖拽功能被 composable 禁用

## 测试验证

### 自动化测试
相关测试文件：`frontend/tests/unit/useDraggablePanel.test.ts`

需要验证的场景：
- ✅ 整个边缘区域触发拖拽
- ✅ 按钮点击不触发拖拽（仅键盘操作）
- ✅ 拖拽结束后位置正确保存
- ✅ 双击边缘复位到初始位置

### 手动测试
1. 访问测试页面：http://localhost:8081/drag-test.html
2. 鼠标悬停到顶部边缘，观察 `grab` 光标
3. 按住鼠标左键拖动，面板跟随移动
4. 释放鼠标，面板停留在新位置
5. 双击顶部边缘，面板复位
6. Tab 聚焦到把手按钮，方向键微调位置

## 相关文件

### 修改的文件
- `frontend/src/components/RealtimeVotePanel.vue` - 主组件
  - 模板：添加 `.realtime-vote-drag-edge` 区域
  - 样式：新增拖拽边缘和把手样式

### 测试文件
- `frontend/public/drag-test.html` - 交互演示页面
- `frontend/tests/unit/useDraggablePanel.test.ts` - 单元测试

### 依赖文件（无需修改）
- `frontend/src/composables/useDraggablePanel.ts` - 拖拽逻辑
- `frontend/src/townsquare-ui.scss` - 全局拖拽样式

## 设计理念

这次改进遵循以下设计原则：

1. **形式追随功能**：拖拽是面板级操作，应在面板最顶部，而非混在头部内容中
2. **视觉一致性**：使用项目既有的黄铜色系和点状纹理
3. **交互标准**：参考操作系统窗口的标题栏拖拽模式
4. **渐进增强**：保留键盘操作，不破坏无障碍性
5. **细节打磨**：悬停反馈、过渡动画、光影效果

## 未来优化方向

- [ ] 考虑添加拖拽边缘的淡入动画（首次显示时）
- [ ] 探索触觉反馈（移动端震动 API）
- [ ] A/B 测试：把手是否需要更明显的图标（如 `⋮⋮`）
- [ ] 考虑为其他浮层组件应用相同的设计模式
