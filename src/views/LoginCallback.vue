<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AuthApi } from '@/api/http/auth'
import { AuthHelper } from '@/helpers/auth'
import { AUTH_LOGIN_KIND_KEY, AUTH_RETURN_TO_KEY, sanitizeAuthReturnTo } from '@/auth/session'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const error = ref('')

onMounted(async () => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  const ticket = params.get('ticket')
  const mode = params.get('mode')
  window.history.replaceState(null, '', window.location.pathname)
  try {
    if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) throw new Error('登录凭据已失效，请重新登录。')
    const response = await AuthApi.completeLogin(ticket)
    if (response.status !== 200 || !response.data?.token) {
      throw new Error(response.message || '登录失败，请重新登录。')
    }
    AuthHelper.token = response.data.token
    localStorage.setItem(AUTH_LOGIN_KIND_KEY, response.data.provider || 'oidc')
    const userStore = useUserStore()
    await userStore.refreshCurrentUserInfo({ ignoreRedirectToLogin: true, ignoreAlertOnError: true })
    if (!userStore.isLoggedIn) throw new Error('无法确认登录身份，请重新登录。')
    const destination = sanitizeAuthReturnTo(response.data.redirectUrl || '/rooms')
    localStorage.removeItem(AUTH_RETURN_TO_KEY)
    if (mode === 'iframe' && window.parent !== window) {
      window.parent.postMessage({ event: 'LoginSuccess' }, window.location.origin)
      return
    }
    await router.replace(destination)
    window.$toast.success('登录成功')
  } catch (cause) {
    const serverMessage = (cause as { response?: { data?: { message?: string } } })?.response?.data?.message
    error.value = serverMessage || (cause instanceof Error ? cause.message : '登录失败，请重试。')
  }
})
</script>

<template>
  <main class="login-callback">
    <section class="medieval-surface" aria-live="polite">
      <template v-if="error">
        <h1>登录未完成</h1>
        <p role="alert">{{ error }}</p>
        <button class="btn btn-primary" type="button" @click="AuthHelper.doLogin('/rooms')">重新登录</button>
        <RouterLink class="btn btn-secondary" to="/">返回首页</RouterLink>
      </template>
      <p v-else role="status">正在确认登录身份，请稍候…</p>
    </section>
  </main>
</template>

<style scoped lang="scss">
.login-callback {
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: 24px;

  section { padding: 32px; max-width: 480px; text-align: center; }
  h1 { font-size: 1.5rem; }
  p { margin-bottom: 24px; }
  .btn { margin: 6px; }
}
</style>
