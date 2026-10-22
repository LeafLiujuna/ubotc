import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { AuthApi } from '@/api/http/auth'
import { AuthHelper } from '@/helpers/auth'
import { AUTH_TOKEN_KEY } from '@/auth/session'
import { useUserStore } from '@/stores/user'
import Login from '@/views/Login.vue'

const mocks = vi.hoisted(() => ({ replace: vi.fn(), route: null as unknown as { path: string; query: { redirectUrl: string } } }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }))

const wrappers: VueWrapper[] = []
function render(path = '/login') {
  mocks.route.path = path
  const wrapper = mount(Login, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="typeof to === \'string\' ? to : to.path"><slot /></a>' } } } })
  wrappers.push(wrapper)
  return wrapper
}
function acceptProfile() {
  const user = useUserStore()
  vi.spyOn(user, 'refreshCurrentUserInfo').mockImplementation(async () => { user.setCurrentUser({ id: 'account-user', displayName: '旅人', level: 1, storytellerLevel: 0, lastSeenAt: 0 }) })
}
async function fillRegistration(wrapper: VueWrapper) {
  await wrapper.get('#register-username').setValue('player_01')
  await wrapper.get('#register-nickname').setValue('旅人小白')
  await wrapper.get('#login-email').setValue('player@example.com')
  await wrapper.get('#login-password').setValue('password-123')
  await wrapper.get('#login-confirm-password').setValue('password-123')
  await wrapper.get('button[type="button"]').trigger('click'); await flushPromises()
  await wrapper.get('#login-code').setValue('123456')
}

beforeEach(() => {
  setActivePinia(createPinia()); localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useFakeTimers()
  mocks.route = reactive({ path: '/login', query: { redirectUrl: '/game/ABC?invite=1' } })
  window.$toast = { success: vi.fn(), error: vi.fn() } as never
  mocks.replace.mockReset()
  vi.spyOn(AuthApi, 'sendEmailCode').mockResolvedValue({ status: 200, data: { challengeId: 'a'.repeat(64), expiresIn: 300, retryAfter: 60 } })
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.useRealTimers() })

test('default login offers username or email and password with no code prompt or automatic registration', () => {
  const wrapper = render()
  expect(wrapper.get('h1').text()).toBe('登录')
  expect(wrapper.find('#login-account').exists()).toBe(true)
  expect(wrapper.get('#login-password').attributes('autocomplete')).toBe('current-password')
  expect(wrapper.find('#login-code').exists()).toBe(false)
  expect(wrapper.find('#login-email').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('自动创建')
  expect(wrapper.find('a[href="/register"]').exists()).toBe(true)
  expect(wrapper.find('a[href="/forgot-password"]').exists()).toBe(true)
  const qq = new URL(wrapper.get('.login-qq').attributes('href'), window.location.origin)
  expect(qq.searchParams.get('provider')).toBe('qq')
  expect(qq.searchParams.get('redirectUrl')).toBe('/game/ABC?invite=1')
})

test.each([false, true])('password login preserves the invitation and remembers login only when selected: %s', async remember => {
  const wrapper = render(); acceptProfile()
  vi.spyOn(AuthApi, 'passwordLogin').mockResolvedValue({ status: 200, data: { token: 'password-session', provider: 'password', redirectUrl: '/game/ABC?invite=1' } })
  await wrapper.get('#login-account').setValue('player_01')
  await wrapper.get('#login-password').setValue('password-123')
  await wrapper.get('#login-remember').setValue(remember)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(AuthApi.passwordLogin).toHaveBeenCalledWith('player_01', 'password-123', '/game/ABC?invite=1')
  expect(AuthApi.sendEmailCode).not.toHaveBeenCalled()
  expect(AuthHelper.token).toBe('password-session')
  expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe(remember ? 'password-session' : null)
  expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe(remember ? null : 'password-session')
  expect(mocks.replace).toHaveBeenCalledWith('/game/ABC?invite=1')
})

test('registration requires username, nickname, email verification and matching passwords', async () => {
  const wrapper = render('/register'); acceptProfile()
  const register = vi.spyOn(AuthApi, 'register').mockResolvedValue({ status: 200, data: { token: 'registered-session', provider: 'password', redirectUrl: '/game/ABC?invite=1' } })
  expect(wrapper.get('h1').text()).toBe('注册账号')
  await fillRegistration(wrapper)
  expect(AuthApi.sendEmailCode).toHaveBeenCalledWith('player@example.com', 'register')
  await wrapper.get('#login-confirm-password').setValue('mismatched')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('不一致'); expect(register).not.toHaveBeenCalled()
  await wrapper.get('#login-confirm-password').setValue('password-123')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(register).toHaveBeenCalledWith({ username: 'player_01', displayName: '旅人小白', email: 'player@example.com', password: 'password-123', challengeId: 'a'.repeat(64), code: '123456' }, '/game/ABC?invite=1')
  expect(AuthHelper.token).toBe('registered-session')
})

test('reset uses a reset-purpose code then returns to login without creating a session', async () => {
  const wrapper = render('/forgot-password')
  const reset = vi.spyOn(AuthApi, 'resetPassword').mockResolvedValue({ status: 200, data: { ok: true } })
  mocks.replace.mockImplementation(async location => { mocks.route.path = location.path })
  await wrapper.get('#login-email').setValue('player@example.com')
  await wrapper.get('#login-password').setValue('new-password-123')
  await wrapper.get('#login-confirm-password').setValue('new-password-123')
  await wrapper.get('button[type="button"]').trigger('click'); await flushPromises()
  await wrapper.get('#login-code').setValue('123456')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(AuthApi.sendEmailCode).toHaveBeenCalledWith('player@example.com', 'reset')
  expect(reset).toHaveBeenCalledWith({ email: 'player@example.com', password: 'new-password-123', challengeId: 'a'.repeat(64), code: '123456' })
  expect(mocks.replace).toHaveBeenCalledWith({ path: '/login', query: { redirectUrl: '/game/ABC?invite=1' } })
  expect(wrapper.get('[role="status"]').text()).toContain('密码已重置')
  expect(wrapper.get('#login-account').element).toHaveProperty('value', 'player@example.com')
  expect(AuthHelper.token).toBeNull()
})

test('code sending has a countdown and SMTP failures permit retry', async () => {
  const wrapper = render('/register')
  await wrapper.get('#login-email').setValue('player@example.com')
  vi.mocked(AuthApi.sendEmailCode).mockRejectedValueOnce({ response: { data: { message: '验证码发送失败，请稍后重试' } } })
  await wrapper.get('button[type="button"]').trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('验证码发送失败')
  expect(wrapper.get('button[type="button"]').attributes('disabled')).toBeUndefined()
  await wrapper.get('button[type="button"]').trigger('click'); await flushPromises()
  expect(wrapper.get('button[type="button"]').attributes('disabled')).toBeDefined()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(wrapper.get('button[type="button"]').attributes('disabled')).toBeUndefined()
})

test('switching flows or changing the mailbox invalidates the challenge and clears passwords', async () => {
  const wrapper = render('/register')
  await fillRegistration(wrapper)
  await wrapper.get('#login-email').setValue('other@example.com')
  expect((wrapper.get('#login-code').element as HTMLInputElement).value).toBe('')
  expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  mocks.route.path = '/login'; await flushPromises()
  expect(wrapper.find('#login-code').exists()).toBe(false)
  expect((wrapper.get('#login-password').element as HTMLInputElement).value).toBe('')
})

test('wrong passwords display a useful error and do not create a client session', async () => {
  const wrapper = render()
  vi.spyOn(AuthApi, 'passwordLogin').mockRejectedValue({ response: { data: { message: '用户名、邮箱或密码错误' } } })
  await wrapper.get('#login-account').setValue('player_01')
  await wrapper.get('#login-password').setValue('wrong-password')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('密码错误')
  expect(AuthHelper.token).toBeNull()
})
