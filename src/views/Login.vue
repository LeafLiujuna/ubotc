<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AuthApi } from '@/api/http/auth'
import { AUTH_LOGIN_KIND_KEY, AUTH_RETURN_TO_KEY, buildOAuthLoginUrl, sanitizeAuthReturnTo, setAuthToken } from '@/auth/session'
import { useUserStore } from '@/stores/user'

const route = useRoute(), router = useRouter()
const mode = computed(() => route.path === '/register' ? 'register' : route.path === '/forgot-password' ? 'reset' : 'login')
const needsCode = computed(() => mode.value !== 'login')
const title = computed(() => mode.value === 'register' ? '注册账号' : mode.value === 'reset' ? '找回密码' : '登录')
const account = ref(''), username = ref(''), displayName = ref(''), email = ref('')
const password = ref(''), confirmPassword = ref(''), code = ref(''), challengeId = ref(''), remember = ref(false)
const sending = ref(false), submitting = ref(false), error = ref(''), notice = ref('')
const emailInput = ref<HTMLInputElement>(), codeInput = ref<HTMLInputElement>()
const now = ref(Date.now()), resendAt = ref(0)
const timer = window.setInterval(() => { now.value = Date.now() }, 1000)
onBeforeUnmount(() => window.clearInterval(timer))
const remaining = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
const returnTo = computed(() => {
  const path = sanitizeAuthReturnTo(typeof route.query.redirectUrl === 'string' ? route.query.redirectUrl : '/rooms')
  return /^\/(login|register|forgot-password)([/?#]|$)/.test(path) ? '/rooms' : path
})
const pageUrl = (path: string) => ({ path, query: { redirectUrl: returnTo.value } })
const qqUrl = computed(() => buildOAuthLoginUrl('qq', returnTo.value))
const busy = computed(() => sending.value || submitting.value)

function messageOf(cause: unknown): string {
  return (cause as { response?: { data?: { message?: string } } })?.response?.data?.message
    || (cause instanceof Error ? cause.message : '暂时无法连接登录服务，请稍后重试。')
}
function clearChallenge() {
  challengeId.value = ''; code.value = ''; error.value = ''; notice.value = ''; resendAt.value = 0
}
watch(email, clearChallenge)
watch(mode, () => { password.value = ''; confirmPassword.value = ''; clearChallenge() })

async function sendCode() {
  if (busy.value || remaining.value || !needsCode.value || !emailInput.value?.reportValidity()) return
  sending.value = true; error.value = ''; notice.value = ''
  try {
    const response = await AuthApi.sendEmailCode(email.value.trim(), mode.value === 'register' ? 'register' : 'reset')
    if (response.status !== 200 || !response.data) throw new Error(response.message || '验证码发送失败，请稍后重试。')
    challengeId.value = response.data.challengeId
    now.value = Date.now(); resendAt.value = now.value + response.data.retryAfter * 1000
    notice.value = '验证码已发送，5 分钟内有效。未收到时请检查垃圾邮件。'
    codeInput.value?.focus()
  } catch (cause) { error.value = messageOf(cause) }
  finally { sending.value = false }
}

async function submit() {
  if (busy.value) return
  error.value = ''
  if (needsCode.value && password.value !== confirmPassword.value) { error.value = '两次输入的密码不一致。'; return }
  if (needsCode.value && !challengeId.value) { error.value = '请先获取邮箱验证码。'; return }
  submitting.value = true
  try {
    const proof = { email: email.value.trim(), challengeId: challengeId.value, code: code.value, password: password.value }
    if (mode.value === 'reset') {
      const response = await AuthApi.resetPassword(proof)
      if (response.status !== 200 || !response.data?.ok) throw new Error(response.message || '重置失败，请重新获取验证码。')
      account.value = email.value.trim()
      await router.replace(pageUrl('/login'))
      password.value = ''; confirmPassword.value = ''; clearChallenge()
      notice.value = '密码已重置，请使用新密码登录。'
      return
    }
    const response = mode.value === 'register'
      ? await AuthApi.register({ ...proof, username: username.value.trim(), displayName: displayName.value.trim() }, returnTo.value)
      : await AuthApi.passwordLogin(account.value.trim(), password.value, returnTo.value)
    if (response.status !== 200 || !response.data?.token) throw new Error(response.message || '登录失败，请稍后重试。')
    setAuthToken(response.data.token, mode.value === 'login' && remember.value)
    localStorage.setItem(AUTH_LOGIN_KIND_KEY, 'password')
    localStorage.removeItem(AUTH_RETURN_TO_KEY)
    password.value = ''; confirmPassword.value = ''
    const user = useUserStore()
    await user.refreshCurrentUserInfo({ ignoreRedirectToLogin: true, ignoreAlertOnError: true })
    if (!user.isLoggedIn) throw new Error('无法确认登录身份，请重新登录。')
    const destination = sanitizeAuthReturnTo(response.data.redirectUrl)
    await router.replace(destination)
    window.$toast.success('登录成功')
  } catch (cause) { error.value = messageOf(cause) }
  finally { submitting.value = false }
}
</script>

<template>
  <div class="login-page">
    <section class="login-card medieval-surface" aria-labelledby="login-title">
      <h1 id="login-title">{{ title }}</h1>

      <template v-if="mode !== 'reset'">
        <a class="btn btn-secondary login-qq" :href="qqUrl">使用 QQ 登录</a>
        <div class="login-divider"><span>{{ mode === 'register' ? '使用邮箱注册' : '使用账号密码登录' }}</span></div>
      </template>

      <form :aria-busy="busy" @submit.prevent="submit">
        <template v-if="mode === 'login'">
          <label for="login-account">用户名或邮箱</label>
          <input id="login-account" v-model="account" type="text" autocomplete="username" maxlength="254" placeholder="输入用户名或邮箱" required :disabled="busy" />
        </template>
        <template v-if="mode === 'register'">
          <label for="register-username">用户名</label>
          <input id="register-username" v-model="username" type="text" autocomplete="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]{3,32}" aria-describedby="username-hint" placeholder="用于登录的用户名" required :disabled="busy" />
          <p id="username-hint" class="login-hint">3–32 位字母、数字或下划线，不区分大小写。</p>
          <label for="register-nickname">昵称</label>
          <input id="register-nickname" v-model="displayName" type="text" autocomplete="nickname" maxlength="32" placeholder="游戏中显示的名字" required :disabled="busy" />
        </template>
        <template v-if="needsCode">
          <label for="login-email">邮箱地址</label>
          <input id="login-email" ref="emailInput" v-model="email" type="email" autocomplete="email" inputmode="email" maxlength="254" :placeholder="mode === 'reset' ? '输入注册时使用的邮箱' : '输入你的邮箱地址'" required :disabled="busy" />
        </template>
        <label for="login-password">{{ mode === 'reset' ? '新密码' : '密码' }}</label>
        <input id="login-password" v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :minlength="needsCode ? 8 : undefined" :maxlength="needsCode ? 128 : 256" :placeholder="needsCode ? '设置 8–128 个字符的密码' : '输入密码'" required :disabled="busy" />
        <template v-if="needsCode">
          <label for="login-confirm-password">确认密码</label>
          <input id="login-confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="再次输入密码" required :disabled="busy" />
          <label for="login-code">邮箱验证码</label>
          <div class="login-code-row">
            <input id="login-code" ref="codeInput" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6 位验证码" required :disabled="busy" />
            <button class="btn btn-secondary" type="button" :disabled="busy || remaining > 0 || !email.trim()" @click="sendCode">{{ sending ? '发送中…' : remaining ? `${remaining} 秒后重发` : '获取验证码' }}</button>
          </div>
        </template>
        <label v-else class="login-remember" for="login-remember">
          <input id="login-remember" v-model="remember" type="checkbox" :disabled="busy" />
          <span>记住我的登录状态</span>
        </label>
        <p v-if="notice" class="login-notice" role="status">{{ notice }}</p>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <button class="btn btn-primary login-submit" type="submit" :disabled="busy || (needsCode && (!challengeId || !/^[0-9]{6}$/.test(code)))">{{ submitting ? '提交中…' : mode === 'register' ? '注册' : mode === 'reset' ? '重置密码' : '登录' }}</button>
      </form>

      <div class="login-help">
        <template v-if="mode === 'login'">
          <RouterLink :to="pageUrl('/forgot-password')">忘记密码？</RouterLink>
          <p>还没有账号？ <RouterLink :to="pageUrl('/register')">立即注册</RouterLink></p>
        </template>
        <template v-else-if="mode === 'register'">已有账号？ <RouterLink :to="pageUrl('/login')">立即登录</RouterLink></template>
        <RouterLink v-else :to="pageUrl('/login')">返回登录</RouterLink>
      </div>
      <RouterLink class="login-back" to="/">返回首页</RouterLink>
    </section>
  </div>
</template>

<style scoped lang="scss">
.login-page { display: grid; place-items: center; min-height: calc(100dvh - 69px); padding: 40px 20px; }
.login-card { width: min(100%, 440px); padding: 34px clamp(20px, 5vw, 36px); border-radius: 12px; }
h1 { margin: 0 0 24px; text-align: center; font-size: clamp(1.35rem, 5vw, 1.7rem); color: var(--ts-text-primary); }
form { display: grid; gap: 10px; }
label { margin-top: 8px; font-size: 14px; font-weight: 700; color: var(--ts-text-primary); }
input { width: 100%; min-width: 0; min-height: 46px; padding: 11px 12px; border: 1px solid var(--ts-border-subtle); border-radius: 6px; background: #0a071059; color: var(--ts-text-primary); font-size: 16px; }
input:focus-visible { outline: 2px solid var(--ts-accent-gold); outline-offset: 2px; }
.login-code-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; }
.login-code-row .btn { padding-inline: 12px; min-height: 46px; white-space: nowrap; font-size: 13px; }
.login-submit { width: 100%; min-height: 46px; margin-top: 14px; }
.login-help, .login-notice, .login-error { font-size: 13px; line-height: 1.6; }
.login-help { text-align: center; color: var(--ts-text-muted); margin: 16px 0 24px; }
.login-help a { color: var(--ts-accent-gold); text-underline-offset: 4px; }
.login-help p { margin: 12px 0 0; }
.login-hint { margin: 0; color: var(--ts-text-muted); font-size: 12px; line-height: 1.5; }
.login-remember { display: flex; align-items: center; gap: 9px; margin-top: 10px; color: var(--ts-text-muted); font-size: 13px; font-weight: 400; cursor: pointer; }
.login-remember input { width: 16px; height: 16px; min-height: 0; padding: 0; accent-color: var(--ts-accent-gold); }
.login-notice { margin: 4px 0 0; color: var(--ts-accent-gold); }
.login-error { margin: 4px 0 0; padding: 8px 10px; color: #ffd5d5; background: #9e374333; border-radius: 4px; }
.login-divider { display: flex; align-items: center; gap: 12px; margin: 22px 0 10px; color: var(--ts-text-muted); font-size: 12px; }
.login-divider::before, .login-divider::after { content: ''; height: 1px; background: var(--ts-border-subtle); flex: 1; }
.login-qq { display: flex; justify-content: center; width: 100%; min-height: 44px; text-decoration: none; }
.login-back { display: block; width: fit-content; margin: 20px auto 0; color: var(--ts-text-muted); font-size: 13px; text-underline-offset: 4px; }
button:disabled { opacity: .55; cursor: not-allowed; }
</style>
