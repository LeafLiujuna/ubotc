# ubotc · 钟楼谜团在线魔典

一个面向《染·钟楼谜团》的在线魔典与联机游戏前端，基于 Vue 3、TypeScript 和 Pinia 构建。支持房间管理、剧本导入、角色分配、座位编排、个人魔典笔记、夜间信息传递、提名投票及实时语音聊天，帮助说书人组织对局、玩家记录与交流。


## 主要功能

- 说书人游戏桌、角色与阵营分配、座位调整和提示标记。
- 自定义 JSON 剧本、角色信息及夜间行动参考。
- 个人魔典笔记、夜间信息传递和身份揭晓。
- 提名投票、倒计时、文字交流及实时语音。
- 玩家登录、房间列表、个人资料与设备偏好设置。
- 桌面与移动端布局、快捷键及减少动画选项。

## 本地开发

环境要求：Node.js `20.19.x`，npm `10.5` 至 `10.x`。仓库提供 `.nvmrc`。

```sh
npm ci
cp .env.example .env
npm run dev
```

Windows PowerShell 可使用 `Copy-Item .env.example .env` 复制环境变量示例。

开发服务默认运行在 `http://localhost:8081`。

### 服务连接配置

`.env.example` 只包含公开配置示例，不包含账号凭据。

- HTTP 大厅接口：默认通过 Vite 将 `/api` 和 `/auth` 代理到 `http://localhost:8085`；可通过 `VITE_API_BASE_URL` 指定接口地址。
- 游戏实时连接：由兼容的大厅服务返回游戏节点地址。
- 语音连接：由游戏服务返回连接信息，也可使用 `VITE_LIVEKIT_ENDPOINT` 覆盖公开入口。
- `VITE_AUTH_MODE=local` 仅适用于开发，并要求配套服务开启本地登录；它不会绕过服务端身份校验。

所有 `VITE_*` 环境变量都会进入浏览器构建产物，请仅配置可公开的前端参数。

## 检查与构建

```sh
npm run check    # ESLint、类型检查和单元测试
npm run build    # 类型检查及生产构建，输出到 dist/
npm run preview  # 本地预览生产构建
```

浏览器测试位于 `e2e/`，需要先启动前端；涉及登录和房间的场景还需要兼容的服务。

```sh
npx playwright install chromium
npx playwright test
```

部署时请为 Vue Router 配置 history 回退，将前端页面路由回退到 `index.html`，并单独配置 API 与实时连接的服务入口。

## 目录

```text
src/          游戏页面、组件、状态管理、接口客户端和资源
public/       公共静态资源
tests/        单元测试
e2e/          浏览器测试及视觉基准
docs/         游戏操作及剧本格式参考
LICENSES/     保留的原项目许可证文本
```

## 来源与许可

本项目基于 [Town Square](https://github.com/limpy01/townsquare) 相关前端代码持续开发，保留原有作者信息。继承代码的 `GPL-3.0` 授权标识保留在 `package.json` 中，原项目许可证文本见 [LICENSES/GPL-3.0.txt](LICENSES/GPL-3.0.txt)；本仓库已有的 [LICENSE](LICENSE) 同时保留。

剧本与角色格式说明见 [docs/script-format.md](docs/script-format.md)。游戏名称、角色文本与美术资源的权利归各自权利人所有；本项目为非官方工具，与 The Pandemonium Institute 无隶属关系。
