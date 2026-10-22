# 游戏操作完整文档 — GameController 设计参考

> 本文档基于项目前端代码（Vuex + Pinia 状态管理、WebSocket 通信、HTTP API）总结所有游戏操作，为编写 `GameController`（游戏控制器）提供完整依据。

---

## 一、游戏概念总览

本项目是 **Blood on the Clocktower** 的在线改编版（UBOTC）。核心角色分为：

| 角色 | 说明 |
|------|------|
| **说书人 (Storyteller / ST / Host)** | 游戏主持人，拥有全部控制权限 |
| **玩家 (Player)** | 入座参与游戏的普通玩家 |
| **旁观者 (Spectator)** | 未入座或仅观看的玩家 |

关键数据结构：
- `Player` — 包含 `id, name, image, role, isDead, isVoteless, reminders, stReminders, votes, pronouns, chatGroup, isTalking, isWraith, isUsingWraith, isAllowRole` 等
- `Session` — 房间会话状态，包含 `sessionId, seatId, playerId, nomination, votes, lockedVote, votingSpeed, isNight, isSecretVote, isReview, timer` 等
- `Grimoire` — 游戏全局开关（夜间/白天、静音、缩放等）
- `Fabled` — 第一个始终是说书人

---

## 二、通信架构

使用 **WebSocket（`LiveSession`）** 进行实时操作通信，消息格式统一为 JSON 数组：

```json
[command, params, feedbackId]
```

- **广播**：`_send(command, params)` — 发送给房间内所有人
- **私信**：`_sendDirect(playerId, command, params)` — 发送给指定玩家
- **请求**：`_request(command, playerId, params)` — 向服务端请求信息
- **上传文件**：`_uploadFile(command, playerId, params)` — 上传头像等

另有一个 **HTTP API（`GameApi`）** 用于房间管理、排行等非实时操作。

---

## 三、HTTP API 操作（非实时）

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| `listRooms` | GET | `/api/rooms` | 获取房间列表 |
| `createRoom` | POST | `/api/rooms` | 创建房间 |
| `ownerDiscardRoom` | POST | `/api/rooms/:roomId/discard` | 房主解散房间 |
| `getRoom` | GET | `/api/room/:roomId` | 获取房间详情 |
| `joinRoom` | POST | `/api/room/:roomId/join` | 加入房间（返回 token + 服务器 URL） |
| `listServerLoad` | GET | `/api/servers` | 获取服务器负载 |
| `getGameResult` | GET | `/api/game-result/:id` | 获取游戏结果 |
| `getGameScript` | GET | `/api/game-script/:id` | 获取剧本 |
| `uploadGameScript` | POST | `/api/game-scripts` | 上传自定义剧本 |
| `listRankings` | GET | `/api/rankings?limit=50` | 获取排行榜 |

---

## 四、WebSocket 操作（实时游戏）

### 4.1 房间生命周期

| 操作 | 触发方 | 命令 | 说明 |
|------|--------|------|------|
| `connect(channel)` | 任意 | — | 连接到房间频道（WebSocket 建立） |
| `disconnect()` | 任意 | `bye` | 断开连接，旁观者发送 `bye` 给 host |
| `checkAllowHost()` | 旁观者 | `request → checkAllowHost` | 检查是否可以成为说书人 |
| `checkAllowJoin()` | 旁观者 | `request → checkAllowJoin` | 检查房间是否存在/可加入 |
| `claimSeat(seatIndex)` | 旁观者 | `direct → host → claim` | 请求入座（-1 表示离座） |
| `sendGamestate(playerId)` | 说书人 | `direct → gs` | 推送完整游戏状态给玩家或所有人 |
| `sendEdition(playerId)` | 说书人 | `direct → edition` | 推送剧本信息 |

### 4.2 玩家管理（说书人操作）

| 操作 | 命令 | 载荷 | 说明 |
|------|------|------|------|
| `sendPlayer({player, property, value})` | `player` | `{index, property, value}` | 更新玩家属性（广播） |
| `emptyPlayer({id})` | `leaveSeat` | — | 清空指定玩家的座位（私信给该玩家） |
| `swapPlayer([from, to])` | `swap` | `[from, to]` | 交换两个玩家的座位 |
| `movePlayer([from, to])` | `move` | `[from, to]` | 移动玩家到另一个座位 |
| `removePlayer(payload)` | `remove` | payload | 移除玩家 |
| `distributeRoles()` | `direct` | 各玩家私信角色ID | 分发角色给所有入座玩家 |
| `distributeTypes()` | `direct` | 各玩家私信角色类型 | 分发角色类型图标 |
| `distributeBluffs({all, role, seatNum, playerId})` | `bluff` / `direct` | 恶魔伪装名单 | 分发伪装给恶魔/疯子/爪牙 |
| `distributeGrimoire({all, role, seatNum, playerId})` | `grimoire` / `direct` | 全部角色+提醒标记 | 分发魔典给特定角色 |
| `setIsRole({role, property, value})` | `isRole` / `usingRole` | 角色能力状态 | 设置角色能力状态（如亡魂） |

### 4.3 玩家属性更新

通过 `sendPlayer()` 发送，支持的属性：

| 属性 | 类型 | 说明 | 特殊处理 |
|------|------|------|----------|
| `name` | string | 玩家名称 | 广播 |
| `image` | string | 玩家头像URL | 广播 |
| `id` | string | 玩家ID | 广播 |
| `isDead` | boolean | 是否死亡 | 广播 |
| `isVoteless` | boolean | 是否失去投票权 | 广播 |
| `isSecretVoteless` | boolean | 秘密失去投票权 | 私信给玩家本人 |
| `role` | string (roleId) | 角色ID | 仅旅行者/复盘模式时广播ID，否则移除 |
| `reminders` | array | 提醒标记 | 不发送（说书人本地） |
| `stReminders` | array | 说书人提醒标记 | 仅复盘模式发送 |
| `pronouns` | string | 人称代词 | 广播（有循环保护） |
| `votes` | number | 玩家票数 | 广播 |
| `isWraith` | boolean | 是否为亡魂 | 私信给该玩家 |
| `isUsingWraith` | boolean | 是否在使用亡魂能力 | 私信给该玩家 |
| `isAllowRole` | boolean | 是否允许角色 | 不发送（静态属性） |

### 4.4 投票系统

| 操作 | 触发方 | 命令 | 载荷 | 说明 |
|------|--------|------|------|------|
| `nomination(payload)` | 说书人 | `nomination` | `[nominator, nominee]` 或 `false` | 发起/取消提名 |
| `vote([index])` | 玩家/说书人 | `vote` | `[index, voteValue, fromST]` | 投票/放票（投票值可为 1, -1, true, false） |
| `lockVote()` | 说书人 | `lock` | `[lockedVote, vote]` | 锁定当前投票轮次 |
| `setVotingSpeed(speed)` | 说书人 | `votingSpeed` | 毫秒数 | 设置投票间隔速度 |
| `setVoteInProgress()` | 说书人 | `isVoteInProgress` | boolean | 设置投票进行中状态 |
| `setIsNight()` | 说书人 | `isNight` | boolean | 切换白天/黑夜 |
| `setMarked(playerIndex)` | 说书人 | `marked` | 玩家索引或-1 | 标记处决目标 |
| `clearVoteHistory()` | 说书人 | `clearVoteHistory` | — | 清空投票历史 |
| `setVoteHistoryAllowed()` | 说书人 | `isVoteHistoryAllowed` | boolean | 允许/禁止查看投票历史 |
| `setSecretVote(isSecretVote)` | 说书人 | `secretVote` | boolean | 开启/关闭闭眼投票 |

### 4.5 聊天系统

| 操作 | 触发方 | 命令 | 说明 |
|------|--------|------|------|
| 发送聊天 | 任意 | `chat` (通过消息队列) | 发送私聊消息给指定玩家或说书人 |
| `sendAddGroupChat({chatId, players})` | 说书人 | `addGroupChat` (通过消息队列) | 创建/更新群组聊天 |
| `sendRemoveGroupChat({playerIds})` | 说书人 | `removeGroupChat` (通过消息队列) | 移除群组聊天 |
| `sendRemoveGroupChatMember({chatId, player})` | 说书人 | `removeGroupChatMember` (通过消息队列) | 从群聊中移除成员 |

聊天消息格式：
```json
{
  "message": "内容",
  "sendingPlayerId": "发送者ID",
  "receivingPlayerId": "接收者ID"
}
```

亡魂系统：当存在亡魂时，所有聊天内容会追加 `[亡魂][（X号）消息]` 转发给亡魂；有概率暴露亡魂身份。

### 4.6 游戏状态控制（说书人操作）

| 操作 | 命令 | 说明 |
|------|------|------|
| `sendStates(playerId)` | `states` | 推送自定义状态列表 |
| `sendTeamsNames(playerId)` | `teamsNames` | 推送队伍别名映射 |
| `sendFirstNight(playerId)` | `firstNight` | 推送自定义首夜顺序 |
| `sendOtherNight(playerId)` | `otherNight` | 推送自定义其他夜顺序 |
| `sendFabled()` | `fabled` | 广播传奇角色列表 |
| `setTimer(payload)` | `setTimer` | 设置计时器（总时间） |
| `startTimer(payload)` | `startTimer` | 开始计时器 |
| `stopTimer()` | `stopTimer` | 停止计时器 |
| `setTalking(payload)` | `setTalking` | 设置发言状态（发光动画） |
| `setBootlegger(content)` | `bootlegger` | 设置私货商人描述 |
| `setUseOldOrder(isUseOldOrder)` | `useOldOrder` | 使用旧版夜间顺序 |
| `setUseOldRole(isUseOldRole)` | `useOldRole` | 使用旧版角色能力 |
| `setIsReview(isReview)` | `isReview` | 切换复盘模式 |

### 4.7 语音系统

| 操作 | 说明 |
|------|------|
| 语音信令 | `voice-signal` — WebRTC 信令消息 |
| 语音广播 | `voice-broadcast` — WebRTC 广播消息 |
| 初始化语音 | `voiceService.init(socket, sessionId, playerId, isHost, store)` |
| 创建私聊语音房 | 通过语音模块创建 |
| 加入语音房 | 通过语音模块加入 |
| 退出语音房 | 通过语音模块退出 |

### 4.8 其他操作

| 操作 | 命令 | 说明 |
|------|------|------|
| `ping` | `ping` | 心跳检测，更新延迟和在线人数 |
| `pong` | `pong` | 心跳回复 |
| `uploadAvatar(image)` | `uploadFile → uploadAvatar` | 上传头像图片 |
| `sendPlayerPronouns({player, value})` | `pronouns` | 发送人称代词（有循环保护） |

### 4.9 大厅操作（LiveLobby）

| 操作 | 命令 | 说明 |
|------|------|------|
| `connect()` | — | 连接大厅 WebSocket |
| `disconnect()` | — | 断开大厅连接 |
| `setRooms(roomList)` | `setRooms` | 设置房间列表 |
| `addRoom(roomId)` | `addRoom` | 添加一个房间 |
| `removeRoom(roomId)` | `removeRoom` | 移除一个房间 |

---

## 五、前端状态管理操作（Pinia Stores）

### 5.1 `useGameStore` (Pinia)

| 操作 | 说明 |
|------|------|
| `updatePlayer(userId, player)` | 更新单个玩家状态 |
| `updatePlayers(playerList)` | 批量更新玩家 |
| `deletePlayer(userId)` | 删除玩家 |
| `deletePlayers(userIds)` | 批量删除玩家 |

游戏层状态：
- `level: "prepare" | ...` — 游戏阶段
- `levelDays: number` — 天数
- `players: Record<string, CommonPlayerState>` — 玩家映射
- `dms: Record<string, CommonPlayerState>` — DM 映射
- `seatCount: number` — 座位数
- `currentPlayer: CurrentPlayerState | null` — 当前玩家

### 5.2 `useSessionStore` (Pinia)

主要状态：`sessionId, seatId, isHostAllowed, isJoinAllowed, isRoomActive, isSpectator, isReconnecting, playerCount, ping, playerId, playerName, playerAvatar, claimedSeat, nomination, playerVotes, isRole, votes, lockedVote, votingSpeed, isVoteInProgress, isSecretVote, voteHistory, voteSelected, markedPlayer, isVoteHistoryAllowed, isRolesDistributed, isTypesDistributed, isBluffsDistributed, isGrimoireDistributed, isUseOldOrder, isUseOldRole, isReview, isChatOpen, isTyping, messageQueue, chatHistory, groupChats, inputType, inputModal, inputData, bootlegger, timer, isTalking, speakingPermissions`

主要 actions：
- `hydrateFromVuex()` — 从 Vuex 迁移数据
- `claimSeat(val)` — 认领座位
- `distributeRoles(val)` — 分发角色
- `distributeTypes(val)` — 分发类型
- `setNomination(val)` — 设置提名
- `setVoteInProgress(val)` — 设置投票进行中
- 各种 setter 方法

### 5.3 `usePlayersStore` (Pinia)

主要状态：`players: Player[], fabled: FabledRole[], bluffs: Role[], firstNightOrder, otherNightOrder`

主要 actions：
- `randomize()` — 随机排列玩家座位
- `clearRoles()` — 清空所有玩家角色
- `realivePlayers()` — 复活所有玩家
- `setBluff({index, role})` — 设置伪装角色
- `setFabled({index, fabled})` — 添加/移除传奇角色

---

## 六、Vuex 模块操作

### 6.1 `players` 模块

| Mutations | 说明 |
|-----------|------|
| `add(payload)` | 添加座位/玩家 |
| `remove(index)` | 移除座位 |
| `set(players)` | 设置玩家列表 |
| `clear(emptyFabled)` | 清空所有玩家 |
| `update({player, property, value})` | 更新玩家属性 |
| `empty({player})` | 清空指定玩家的数据 |
| `swap([from, to])` | 交换座位 |
| `move([from, to])` | 移动玩家 |
| `setBluff({index, role})` | 设置伪装 |
| `setFabled({index, fabled})` | 设置传奇角色 |
| `setFirstNight(order)` | 设置首夜顺序 |
| `setOtherNight(order)` | 设置其他夜顺序 |

### 6.2 `session` 模块

| Mutations | 说明 |
|-----------|------|
| `claimSeat(val)` | 认领座位 |
| `nomination(payload)` | 设置提名及投票 |
| `vote([index, vote])` | 记录投票 |
| `lockVote(lock)` | 锁定投票 |
| `addHistory(players)` | 添加投票历史记录 |
| `addVotes(entry)` | 添加票数记录 |
| `clearVoteHistory()` | 清空投票历史 |
| `addGroupChat({chatId, players})` | 添加群聊 |
| `removeGroupChat({chatId})` | 移除群聊 |
| `removeGroupChatMember({chatId, player})` | 移除群聊成员 |
| `createChatHistory(playerId)` | 创建聊天历史 |

### 6.3 全局 mutations

| Mutation | 说明 |
|----------|------|
| `toggleNight(val)` | 切换白天/黑夜 |
| `toggleMenu(val)` | 切换菜单 |
| `toggleMuted(val)` | 切换静音 |
| `toggleModal(name)` | 切换模态框 |
| `setEdition(edition)` | 设置剧本 |
| `setCustomRoles(roles)` | 设置自定义角色 |
| `setSelectedEditions(selected)` | 设置选中剧本合集 |
| `setStates(states)` | 设置自定义状态 |
| `setTeamsNames(names)` | 设置队伍别名 |
| `setFirstNight(order)` | 设置首夜顺序 |
| `setOtherNight(order)` | 设置其他夜顺序 |
| `setZoom(val)` | 设置缩放 |
| `setLatestVersion(val)` | 设置最新版本号 |
| `setBackground(val)` | 设置背景 |
| `setAudioThreshold(val)` | 设置音频阈值 |

---

## 七、模态框系统

| 模态框 | 说明 |
|--------|------|
| `version` | 版本更新提示 |
| `edition` | 选择剧本 |
| `fabled` | 管理传奇角色 |
| `gameState` | 游戏状态 JSON 导出/导入 |
| `nightOrder` | 夜间行动顺序 |
| `reference` | 角色参考 |
| `reminder` | 提醒标记管理 |
| `role` | 单个角色详情 |
| `roles` | 角色配置 |
| `voteHistory` | 投票历史 |
| `settings` | 游戏设置 |
| `input` | 通用输入对话框（alert / confirm / prompt） |
| `groupChat` | 群组聊天 |
| `voice` | 语音聊天 |
| `voiceRoom` | 语音房间管理 |

---

## 八、GameController 职责建议

基于以上分析，`GameController` 应负责以下核心职责：

### 8.1 房间生命周期管理
- 创建/加入/离开/解散房间
- WebSocket 连接建立与重连
- 说书人权限检查与委派
- 座位管理（入座/离座/交换/移动）

### 8.2 游戏配置
- 剧本选择（官方/自定义）
- 角色配置（添加/移除/排序）
- 传奇角色管理（Fabled）
- 夜间顺序/角色能力版本控制
- 私货商人自定义

### 8.3 游戏运行时控制
- 角色分发（角色、类型、伪装、魔典）
- 白天/黑夜切换
- 提名与投票控制
- 计时器管理
- 标记管理（提醒标记、处决标记）
- 玩家状态变更（死亡、投票权、角色变更）

### 8.4 通信系统
- 私聊消息收发
- 群组聊天创建/管理
- 亡魂消息监听与暴露机制
- 语音房间管理

### 8.5 数据持久化与恢复
- 游戏状态导出/导入（JSON）
- 复盘模式
- 投票历史记录

### 8.6 辅助功能
- 心跳检测与延迟监控
- 头像上传
- 人称代词设置
- 发言状态同步
- 操作反馈与错误提示

---

## 九、消息协议完整命令列表

### 客户端→服务端（说书人发出）

```
player, edition, states, teamsNames, firstNight, otherNight,
fabled, gs, stId, nomination, isVoteInProgress, isNight,
isVoteHistoryAllowed, votingSpeed, marked, clearVoteHistory,
vote, lock, swap, move, remove, bluff, grimoire, direct,
request, uploadFile, ping, setTimer, startTimer, stopTimer,
setTalking, secretVote, bootlegger, useOldOrder, useOldRole,
isReview, isRole, usingRole, chat, addGroupChat, removeGroupChat,
removeGroupChatMember, syncPlayersStatus, leaveSeat, pronouns,
claim, getGamestate, getStId, checkAllowHost, checkAllowJoin, bye
```

### 服务端→客户端（玩家接收）

```
gs, stId, edition, states, teamsNames, firstNight, otherNight,
fabled, player, bluff, grimoire, nomination, isNight,
isVoteHistoryAllowed, votingSpeed, marked, clearVoteHistory,
isVoteInProgress, vote, lock, swap, move, remove, isRole,
usingRole, chat, addGroupChat, removeGroupChat, removeGroupChatMember,
syncPlayersStatus, leaveSeat, pronouns, secretVote, bootlegger,
useOldOrder, useOldRole, isReview, setTimer, startTimer, stopTimer,
setTalking, ping, pong, feedback, alertPopup, allowHost, allowJoin,
hostDisconnected, avatarReceived, voice-signal, voice-broadcast
```
