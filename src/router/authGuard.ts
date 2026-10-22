import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { AuthApi } from '@/api/http/auth'
import { isDev, isLocalLoginEnabled } from '@/config/env'
import { AuthHelper } from '@/helpers/auth'
import { useUserStore } from '@/stores/user'
import { AUTH_LOGIN_KIND_KEY } from '@/auth/session'

type AuthGuardRoute = Pick<RouteLocationNormalized, 'fullPath' | 'meta'> & {
  query?: RouteLocationNormalized['query']
}

export const DEV_PLAYER_CLIENT_ID_KEY = 'ubotc.dev-player-client-id'

function getOrCreateDevPlayerClientId(): string {
  const existing = localStorage.getItem(DEV_PLAYER_CLIENT_ID_KEY)
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing

  const generated = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  localStorage.setItem(DEV_PLAYER_CLIENT_ID_KEY, generated)
  return generated
}

export async function authenticateDevIdentity(
  identity: 'host' | 'player'
): Promise<boolean> {
  const response = identity === 'player'
    ? await AuthApi.devLogin(identity, getOrCreateDevPlayerClientId())
    : await AuthApi.devLogin(identity)
  const token = response.data?.token
  const user = response.data?.user
  if (response.status < 200 || response.status >= 300 || !token || !user) {
    return false
  }

  AuthHelper.token = token
  localStorage.setItem(AUTH_LOGIN_KIND_KEY, 'development')
  useUserStore().setCurrentUser({
    ...user,
    avatarUrl: user.avatarUrl ?? undefined,
    lastSeenAt: 0,
  })
  return true
}

export async function authGuard(to: AuthGuardRoute): Promise<boolean | RouteLocationRaw> {
  const explicitDevLoginRequested = to.query?.devLogin === '1'
  const devLoginRequested = Boolean(
    to.meta.requiresAuth &&
    isDev() && isLocalLoginEnabled() &&
    (explicitDevLoginRequested || (isLocalLoginEnabled() && !AuthHelper.token))
  )
  if (devLoginRequested) {
    try {
      const identity = to.query?.devIdentity === 'player' ||
        (to.query?.devIdentity !== 'host' && to.fullPath.startsWith('/game/'))
        ? 'player' : 'host'
      if (await authenticateDevIdentity(identity)) return true
    } catch (error) {
      console.warn('Development login was requested but is unavailable:', error)
    }
    // Reloading the same devLogin URL on failure otherwise creates an endless
    // navigation/request loop. Land on the public page with a visible error.
    return {
      name: 'Index',
      query: { authError: '开发登录未启用或服务暂不可用，请检查大厅服务配置后重试。' },
      replace: true,
    }
  }

  if (to.meta.requiresAuth && !AuthHelper.token) {
    AuthHelper.doLogin(to.fullPath)
    return false
  }
  return true
}
