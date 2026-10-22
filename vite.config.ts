import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = env.VITE_API_BASE_URL
  const apiPort = env.VITE_API_PORT
  const usesAbsoluteApiUrl = /^https?:\/\//i.test(apiBaseUrl || '')
  const lobbyTarget = usesAbsoluteApiUrl
    ? new URL(apiBaseUrl).origin
    : apiPort
      ? `http://localhost:${apiPort}`
      : 'http://localhost:8085'

  const proxy = {
    '/api': {
      target: lobbyTarget,
      changeOrigin: true
    },
    '/auth': {
      target: lobbyTarget,
      changeOrigin: true
    }
  }

  // 生产构建默认不输出 sourcemap：避免把完整前端源码随 dist 发布到公网，同时显著减小产物体积。
  // 需要排查线上问题时：BUILD_SOURCEMAP=hidden 只生成 .map 供错误上报使用（产物里不留 sourceMappingURL），
  // BUILD_SOURCEMAP=true 则完全开启。
  const sourcemapMode = process.env.BUILD_SOURCEMAP
  const sourcemap = sourcemapMode === 'hidden'
    ? 'hidden' as const
    : sourcemapMode === 'true'
      ? true
      : mode !== 'production'

  return {
    plugins: [vue()],
    server: {
      host: '0.0.0.0',
      port: 8081,
      proxy
    },
    preview: {
      host: '0.0.0.0',
      port: 8081
    },
    build: {
      outDir: 'dist',
      sourcemap,
      rollupOptions: {
        output: {
          // 把只在游戏桌用到的重量级依赖拆出 Game chunk，缓解首屏进桌的包体积。
          manualChunks: {
            'vendor-livekit': ['livekit-client'],
            'vendor-cropper': ['cropperjs'],
            'vendor-socketio': ['socket.io-client'],
            // 动效库同时服务首页与游戏桌，独立成 chunk 以便两处共享缓存。
            'vendor-motion': ['motion']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      },
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    }
  }
})
