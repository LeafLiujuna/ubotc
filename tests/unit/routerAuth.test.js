import { AUTH_TOKEN_KEY } from '@/auth/session'
import { AuthApi } from '@/api/http/auth'
import { AuthHelper } from '@/helpers/auth'
import {
  authenticateDevIdentity,
  authGuard,
  DEV_PLAYER_CLIENT_ID_KEY,
} from '@/router/authGuard'
import { routes } from '@/router'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'

describe('auth route guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
    vi.stubEnv('VITE_AUTH_MODE', 'oidc')
    vi.stubEnv('DEV', true)
  })

  afterEach(() => vi.unstubAllEnvs())

  test.each([
    ['/rooms?room=ABC', 'host'],
    ['/game/ABC', 'player'],
  ])('local mode authenticates a fresh %s link as %s', async (fullPath, identity) => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    const login = vi.spyOn(AuthHelper, 'doLogin')
    const devLogin = vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({
      status: 200,
      data: { token: 'local-token', user: { id: `dev-user-${identity}`, displayName: 'Local user' } },
    })
    await expect(authGuard({ fullPath, meta: { requiresAuth: true }, query: {} })).resolves.toBe(true)
    expect(devLogin.mock.calls[0][0]).toBe(identity)
    expect(AuthHelper.token).toBe('local-token')
    expect(useUserStore().isLoggedIn).toBe(true)
    expect(login).not.toHaveBeenCalled()
  })

  test('local mode preserves an existing session and keeps the home page public', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    const devLogin = vi.spyOn(AuthApi, 'devLogin')
    await expect(authGuard({ fullPath: '/', meta: {} })).resolves.toBe(true)
    localStorage.setItem(AUTH_TOKEN_KEY, 'existing-player-token')
    await expect(authGuard({ fullPath: '/rooms', meta: { requiresAuth: true } })).resolves.toBe(true)
    expect(devLogin).not.toHaveBeenCalled()
    expect(AuthHelper.token).toBe('existing-player-token')
  })

  test('local mode reports unavailable login without falling back to OIDC', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({ status: 404 })
    const login = vi.spyOn(AuthHelper, 'doLogin')
    await expect(authGuard({ fullPath: '/rooms', meta: { requiresAuth: true } }))
      .resolves.toMatchObject({ name: 'Index', replace: true })
    expect(login).not.toHaveBeenCalled()
  })

  test('production ignores local mode and explicit development login', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    vi.stubEnv('DEV', false)
    const devLogin = vi.spyOn(AuthApi, 'devLogin')
    const login = vi.spyOn(AuthHelper, 'doLogin').mockImplementation(() => undefined)
    await expect(authGuard({
      fullPath: '/rooms?devLogin=1', meta: { requiresAuth: true }, query: { devLogin: '1' },
    })).resolves.toBe(false)
    expect(devLogin).not.toHaveBeenCalled()
    expect(login).toHaveBeenCalled()
  })

  test('redirects a guest from a protected route with the full return path', async () => {
    const loginSpy = vi
      .spyOn(AuthHelper, 'doLogin')
      .mockImplementation(() => undefined)

    await expect(
      authGuard({
        fullPath: '/rooms?query=night',
        meta: { requiresAuth: true },
      })
    ).resolves.toBe(false)
    expect(loginSpy).toHaveBeenCalledWith('/rooms?query=night')
  })

  test('allows a canonical token into protected routes', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'canonical-token')
    const loginSpy = vi
      .spyOn(AuthHelper, 'doLogin')
      .mockImplementation(() => undefined)

    await expect(
      authGuard({ fullPath: '/rooms', meta: { requiresAuth: true } })
    ).resolves.toBe(true)
    expect(loginSpy).not.toHaveBeenCalled()
  })

  test('keeps public routes public', async () => {
    await expect(authGuard({ fullPath: '/', meta: {} })).resolves.toBe(true)
  })

  test('protects the Game route with the authentication guard', () => {
    const gameRoute = routes.find((route) => route.name === 'Game')

    expect(gameRoute).toBeDefined()
    expect(gameRoute.meta).toMatchObject({
      requiresAuth: true,
    })
  })

  test('protects the user center route', () => {
    const layout = routes.find(route => route.name === 'PageLayout')
    expect(layout.children.find(route => route.name === 'UserCenter')).toMatchObject({
      path: 'account', meta: { requiresAuth: true },
    })
  })

  test('uses unified login for a fresh Game link even in development', async () => {
    const devLogin = vi.spyOn(AuthApi, 'devLogin')
    const login = vi.spyOn(AuthHelper, 'doLogin').mockImplementation(() => undefined)

    await expect(authGuard({
      fullPath: '/game/AO92FC',
      meta: { requiresAuth: true },
      query: {},
    })).resolves.toBe(false)

    expect(devLogin).not.toHaveBeenCalled()
    expect(login).toHaveBeenCalledWith('/game/AO92FC')
    expect(AuthHelper.token).toBeNull()
  })

  test('allows an explicit development login without putting the token in the URL', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    const loginSpy = vi
      .spyOn(AuthHelper, 'doLogin')
      .mockImplementation(() => undefined)
    vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({
      status: 200,
      data: {
        token: 'development-token',
        user: {
          id: 'dev-user',
          displayName: 'Development user',
          avatarUrl: null,
          level: 1,
          storytellerLevel: 1,
          isCertifiedStoryteller: true,
        },
      },
    })

    await expect(
      authGuard({
        fullPath: '/rooms?devLogin=1',
        meta: { requiresAuth: true },
        query: { devLogin: '1' },
      })
    ).resolves.toBe(true)

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('development-token')
    expect(useUserStore().current).toMatchObject({
      id: 'dev-user',
      displayName: 'Development user',
    })
    expect(AuthApi.devLogin).toHaveBeenCalledWith('host')
    expect(loginSpy).not.toHaveBeenCalled()
  })

  test('selects the isolated player identity for two-user local testing', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    localStorage.setItem(DEV_PLAYER_CLIENT_ID_KEY, 'browser-player-01')
    vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({
      status: 200,
      data: {
        token: 'player-development-token',
        user: {
          id: 'dev-user-player',
          displayName: 'Local player',
          avatarUrl: null,
          level: 1,
          storytellerLevel: 1,
          isCertifiedStoryteller: true,
        },
      },
    })

    await expect(
      authGuard({
        fullPath: '/rooms?devLogin=1&devIdentity=player',
        meta: { requiresAuth: true },
        query: { devLogin: '1', devIdentity: 'player' },
      })
    ).resolves.toBe(true)

    expect(AuthApi.devLogin).toHaveBeenCalledWith('player', 'browser-player-01')
    expect(useUserStore().current).toMatchObject({ id: 'dev-user-player' })
  })

  test('creates and reuses a stable browser identity for LAN players', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    const devLogin = vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({
      status: 200,
      data: {
        token: 'player-development-token',
        user: {
          id: 'dev-user-player-generated',
          displayName: 'LAN player',
          avatarUrl: null,
          level: 1,
          storytellerLevel: 1,
          isCertifiedStoryteller: true,
        },
      },
    })
    const route = {
      fullPath: '/rooms?devLogin=1&devIdentity=player',
      meta: { requiresAuth: true },
      query: { devLogin: '1', devIdentity: 'player' },
    }

    await expect(authGuard(route)).resolves.toBe(true)
    const generated = localStorage.getItem(DEV_PLAYER_CLIENT_ID_KEY)
    expect(generated).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(devLogin).toHaveBeenLastCalledWith('player', generated)

    await expect(authGuard(route)).resolves.toBe(true)
    expect(devLogin).toHaveBeenLastCalledWith('player', generated)
  })

  test('can explicitly refresh a player identity without a route navigation', async () => {
    localStorage.setItem(DEV_PLAYER_CLIENT_ID_KEY, 'browser-refresh-01')
    vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({
      status: 200,
      data: {
        token: 'refreshed-player-token',
        user: {
          id: 'dev-user-player-refreshed',
          displayName: 'Refreshed LAN player',
          avatarUrl: null,
          level: 1,
          storytellerLevel: 1,
          isCertifiedStoryteller: true,
        },
      },
    })

    await expect(authenticateDevIdentity('player')).resolves.toBe(true)
    expect(AuthApi.devLogin).toHaveBeenCalledWith('player', 'browser-refresh-01')
    expect(AuthHelper.token).toBe('refreshed-player-token')
    expect(useUserStore().current).toMatchObject({
      id: 'dev-user-player-refreshed',
    })
  })

  test('returns to the public page instead of endlessly retrying unavailable development login', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'local')
    const login = vi.spyOn(AuthHelper, 'doLogin').mockImplementation(() => undefined)
    vi.spyOn(AuthApi, 'devLogin').mockResolvedValue({ status: 404, errorCode: 'ERR::NOT_FOUND' })
    const result = await authGuard({
      fullPath: '/rooms?devLogin=1',
      meta: { requiresAuth: true },
      query: { devLogin: '1' },
    })
    expect(result).toMatchObject({ name: 'Index', replace: true })
    expect(result.query.authError).toContain('开发登录')
    expect(login).not.toHaveBeenCalled()
    expect(AuthHelper.token).toBeNull()
    expect(useUserStore().isLoggedIn).toBe(false)
  })

  test('email mode ignores devLogin URL switches and requires real sign-in', async () => {
    vi.stubEnv('VITE_AUTH_MODE', 'email')
    const devLogin = vi.spyOn(AuthApi, 'devLogin')
    const login = vi.spyOn(AuthHelper, 'doLogin').mockImplementation(() => undefined)
    await expect(authGuard({ fullPath: '/rooms?devLogin=1', meta: { requiresAuth: true }, query: { devLogin: '1' } })).resolves.toBe(false)
    expect(devLogin).not.toHaveBeenCalled()
    expect(login).toHaveBeenCalled()
  })
})
