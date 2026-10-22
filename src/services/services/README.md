# 服务封装模块

## 简介

服务封装模块是前端框架的核心模块之一，负责按业务领域封装后端服务。它提供了统一的接口调用规范，使得其他开发人员能够高效地封装和调用后端 API。

## 功能特性

- 按业务领域划分服务模块
- 统一的接口命名规范
- 统一的错误处理
- 模块化设计，便于扩展

## 服务列表

### 房间服务 (roomService)

处理房间相关的操作，如获取房间列表、创建房间、加入房间、离开房间等。

### 用户服务 (userService)

处理用户相关的操作，如获取用户信息、更新用户信息、删除用户等。

### 认证服务 (authService)

处理认证相关的操作，如登录、注册、登出、刷新 token 等。

## 使用方法

### 安装

服务封装模块已经集成在前端框架中，无需单独安装。

### 导入

```javascript
import services from '@/services/services'

// 或者单独导入某个服务
import roomService from '@/services/services/room'
import userService from '@/services/services/user'
import authService from '@/services/services/auth'
```

### 基本用法

#### 房间服务

```javascript
// 获取房间列表
const rooms = await services.room.getRooms()
console.log('Rooms:', rooms)

// 创建房间
const newRoom = await services.room.createRoom({
  name: '新房间',
  password: '123456'
})
console.log('Created room:', newRoom)

// 加入房间
const joinResult = await services.room.joinRoom('123', '123456')
console.log('Join result:', joinResult)

// 离开房间
const leaveResult = await services.room.leaveRoom('123')
console.log('Leave result:', leaveResult)
```

#### 用户服务

```javascript
// 获取用户信息
const user = await services.user.getUser('1')
console.log('User:', user)

// 更新用户信息
const updatedUser = await services.user.updateUser('1', {
  name: 'John Doe Updated'
})
console.log('Updated user:', updatedUser)

// 删除用户
const deleteResult = await services.user.deleteUser('1')
console.log('Delete result:', deleteResult)
```

#### 认证服务

```javascript
// 登录
const loginResult = await services.auth.login('username', 'password')
console.log('Login result:', loginResult)

// 注册
const registerResult = await services.auth.register({
  username: 'newuser',
  password: '123456',
  email: 'newuser@example.com'
})
console.log('Register result:', registerResult)

// 登出
const logoutResult = await services.auth.logout()
console.log('Logout result:', logoutResult)

// 刷新 token
const refreshResult = await services.auth.refreshToken()
console.log('Refresh token result:', refreshResult)
```

## 最佳实践

1. 按业务领域划分服务模块
2. 使用统一的命名规范
3. 为每个服务提供详细的文档
4. 处理好错误处理和边界情况
5. 保持服务模块的独立性和可扩展性

## 扩展服务

要添加新的服务模块，只需在 `services` 目录下创建新的服务文件，然后在 `index.js` 中导出即可。

例如，添加一个游戏服务：

```javascript
// src/services/services/game.js
import apiClient from '../api'

const gameService = {
  // 游戏相关的方法
}

export default gameService

// src/services/services/index.js
import roomService from './room'
import userService from './user'
import authService from './auth'
import gameService from './game'

const services = {
  room: roomService,
  user: userService,
  auth: authService,
  game: gameService
}

export default services
```
