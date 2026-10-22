<script lang="ts" setup>
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { AuthHelper } from '@/helpers'
import { AUTH_LOGIN_KIND_KEY } from '@/auth/session'
import { getLoginLabel, isLocalLoginEnabled } from '@/config/env'
import { useUserStore } from '@/stores/user'
import demonCrestUrl from '@/assets/demon-head2.png'

defineOptions({
  name: 'PageLayout',
})

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const accountMessage = ref('')
const loginError = ref('')
const loginErrorMessages: Record<string, string> = {
  'ERR::QQ_NOT_CONFIGURED': 'QQ 登录尚未配置，请联系管理员。',
  'ERR::QQ_LOGIN_FAILED': 'QQ 登录暂不可用，请稍后重试。',
  'ERR::QQ_INVALID_STATE': 'QQ 登录已失效，请重新登录。',
  'ERR::QQ_ACCESS_DENIED': '你取消了 QQ 授权，可以重新登录。',
  'ERR::QQ_ALREADY_LINKED': 'QQ 或当前账号已有绑定，无法重复绑定其他账号。',
  'ERR::QQ_LINK_SESSION_EXPIRED': '原账号登录已失效，请重新登录后绑定 QQ。',
  'ERR::USER_BANNED': '账号已被封禁，请联系管理员。',
  'ERR::OIDC_NOT_CONFIGURED': '统一登录尚未配置，请联系管理员配置身份服务。',
  'ERR::OIDC_LOGIN_FAILED': '统一登录服务暂不可用，请稍后重试。',
  'ERR::OIDC_INVALID_STATE': '登录已失效，请重新登录。',
  'ERR::OIDC_ACCESS_DENIED': '你取消了授权，可以重新登录。',
}

watch(() => route.query.authError, (error) => {
  if (typeof error !== 'string') return
  loginError.value = loginErrorMessages[error] || (error.startsWith('ERR::') ? '登录失败，请重新登录。' : error)
  const query = { ...route.query }
  delete query.authError
  void router.replace({ path: route.path, query, hash: route.hash })
}, { immediate: true })
const displayName = computed(() => userStore.current?.displayName || '旅人')
const isDevelopmentLogin = computed(() =>
  userStore.isLoggedIn && (
    localStorage.getItem(AUTH_LOGIN_KIND_KEY) === 'development' ||
    userStore.current?.id.startsWith('dev-user')
  )
)
const avatarUrl = computed(() => userStore.current?.avatarUrl || '')
const avatarInitial = computed(
  () => displayName.value.trim().slice(0, 1).toUpperCase() || '旅'
)

async function login(returnTo = '/rooms') {
  loginError.value = ''
  accountMessage.value = isLocalLoginEnabled() ? '正在使用本地账号登录' : '正在前往登录页面'
  await AuthHelper.doLogin(returnTo)
}

function onRoomsClick(event: MouseEvent) {
  if (userStore.isLoggedIn) return

  event.preventDefault()
  void login('/rooms')
}

async function logout() {
  accountMessage.value = ''
  const wasDevelopmentLogin = isDevelopmentLogin.value
  let redirecting = false

  try {
    const logoutUrl = await AuthHelper.logout()
    accountMessage.value = '已退出登录'
    if (logoutUrl && !wasDevelopmentLogin) {
      redirecting = true
      window.location.assign(logoutUrl)
    }
  } catch (error) {
    console.error('Logout failed:', error)
    accountMessage.value = '已清除本机登录，服务端退出未确认，请稍后重试'
    window.$toast.error(accountMessage.value)
  } finally {
    if (!redirecting && route.meta.requiresAuth && !userStore.isLoggedIn) {
      await router.replace({ name: 'Index' })
    }
  }
}

function focusMainContent() {
  void nextTick(() => {
    document
      .querySelector<HTMLElement>('#main-content')
      ?.focus({ preventScroll: true })
  })
}
</script>

<template>
  <div class="page-layout">
    <a class="skip-link" href="#main-content">跳到主要内容</a>

    <header class="site-header">
      <div class="site-header__inner">
        <RouterLink
          class="brand"
          :to="{ name: 'Index' }"
          aria-label="帽帽钟楼魔典首页"
        >
          <span class="brand__crest" aria-hidden="true">
            <img :src="demonCrestUrl" width="466" height="500" alt="" />
          </span>
          <span class="brand__copy">
            <span class="brand__name gold-foil-text">帽帽钟楼魔典</span>
          </span>
        </RouterLink>

        <nav class="site-nav" aria-label="主导航">
          <RouterLink class="site-nav__link" :to="{ name: 'Index' }"
            >首页</RouterLink
          >
          <RouterLink
            class="site-nav__link"
            :to="{ name: 'RoomList' }"
            @click="onRoomsClick"
          >
            房间大厅
          </RouterLink>
          <RouterLink v-if="userStore.isLoggedIn" class="site-nav__link" :to="{ name: 'UserCenter' }">
            用户中心
          </RouterLink>
        </nav>

        <div class="account-actions">
          <template v-if="userStore.isLoggedIn">
            <RouterLink class="user-chip" :to="{ name: 'UserCenter' }" :title="`${displayName} · 用户中心`" aria-label="打开用户中心">
              <img
                v-if="avatarUrl"
                class="user-chip__avatar"
                :src="avatarUrl"
                alt=""
              />
              <span
                v-else
                class="user-chip__avatar user-chip__avatar--fallback"
                aria-hidden="true"
              >
                {{ avatarInitial }}
              </span>
              <span class="user-chip__name">{{ displayName }}</span>
            </RouterLink>
            <button
              v-if="isDevelopmentLogin && !isLocalLoginEnabled()"
              class="header-button header-button--quiet"
              type="button"
              @click="login('/rooms')"
            >{{ getLoginLabel() }}</button>
            <button
              class="header-button header-button--quiet"
              type="button"
              @click="logout"
            >
              退出
            </button>
          </template>
          <button
            v-else
            class="header-button"
            type="button"
            @click="login('/rooms')"
          >
            {{ getLoginLabel() }}
          </button>
        </div>
      </div>
      <p class="sr-only" role="status" aria-live="polite">
        {{ accountMessage }}
      </p>
    </header>

    <p v-if="loginError" class="login-error" role="alert">{{ loginError }}</p>

    <main id="main-content" class="site-main" tabindex="-1">
      <RouterView v-slot="{ Component, route: activeRoute }">
        <Transition
          name="page-turn"
          mode="out-in"
          @after-enter="focusMainContent"
        >
          <component :is="Component" :key="activeRoute.fullPath" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.login-error {
  margin: 16px auto 0;
  width: min(960px, calc(100% - 32px));
  padding: 12px 16px;
  color: var(--ts-text-primary);
  background: rgba(123, 42, 48, 0.3);
  border: 1px solid var(--ts-border-subtle);
  border-radius: var(--ts-radius-sm);
}

.page-layout {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: clip;
  background:
    radial-gradient(
      circle at 70% 18%,
      rgba(105, 72, 127, 0.2),
      transparent 34%
    ),
    linear-gradient(180deg, rgba(11, 9, 16, 0.16), rgba(11, 9, 16, 0.72));
}

.page-layout::before,
.page-layout::after {
  position: fixed;
  inset: 0;
  z-index: -1;
  content: '';
  pointer-events: none;
}

.page-layout::before {
  opacity: 0.12;
  background-image: var(--ts-noise-stone);
  background-size: 256px 256px;
  mix-blend-mode: soft-light;
}

.page-layout::after {
  background:
    linear-gradient(
      90deg,
      rgba(5, 3, 8, 0.6),
      transparent 18%,
      transparent 82%,
      rgba(5, 3, 8, 0.6)
    ),
    linear-gradient(180deg, transparent 58%, rgba(5, 3, 8, 0.72));
}

.skip-link {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 100;
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 10px 14px;
  color: var(--ts-text-on-parchment);
  background: var(--ts-accent-gold);
  border-radius: var(--ts-radius-sm);
  font-weight: 800;
  text-decoration: none;
  transform: translateY(calc(-100% - 20px));
  transition: transform var(--ts-motion-fast) var(--ts-ease-out);
}

.skip-link:focus {
  transform: translateY(0);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background:
    radial-gradient(
      ellipse at 50% 0%,
      rgba(247, 208, 120, 0.05),
      transparent 42%
    ),
    linear-gradient(180deg, rgba(27, 19, 34, 0.97), rgba(12, 9, 17, 0.94)),
    var(--ts-noise-stone);
  border-bottom: 1px solid var(--ts-border-subtle);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(12px);
  padding-top: env(safe-area-inset-top);
}

.site-header::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 1px;
  content: '';
  background: linear-gradient(
    90deg,
    transparent,
    var(--ts-accent-gold),
    transparent
  );
  opacity: 0.5;
}

.site-header__inner {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) auto minmax(190px, 1fr);
  align-items: center;
  width: min(1200px, calc(100% - 40px));
  min-height: 68px;
  margin: 0 auto;
  gap: 20px;
}

.brand {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  min-height: 48px;
  gap: 10px;
  color: var(--ts-text-primary);
  text-decoration: none;
}

.brand__crest {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  overflow: hidden;
  background: radial-gradient(
    circle,
    rgba(247, 208, 120, 0.22),
    transparent 68%
  );
  border: 1px solid rgba(214, 184, 106, 0.4);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(247, 208, 120, 0.12);
}

.brand__crest img {
  width: 31px;
  height: 31px;
  object-fit: contain;
  filter: sepia(1) saturate(0.75) brightness(1.15);
}

.brand__copy {
  display: grid;
  gap: 1px;
}

.brand__name {
  font-family: var(--ts-font-display);
  font-size: 1.08rem;
  letter-spacing: 0.06em;
  line-height: 1.15;
}

.site-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  gap: 4px;
}

.site-nav__link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 14px;
  color: var(--ts-text-muted);
  border-radius: var(--ts-radius-sm);
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    color var(--ts-motion-fast) ease,
    background-color var(--ts-motion-fast) ease,
    transform var(--ts-motion-fast) var(--ts-ease-out);
}

.site-nav__link:hover,
.site-nav__link.router-link-exact-active {
  color: var(--ts-text-primary);
  background: rgba(214, 184, 106, 0.1);
}

@media (hover: hover) {
  .site-nav__link:hover {
    transform: translateY(-1px);
  }
}

.site-nav__link.router-link-exact-active {
  box-shadow: inset 0 -2px var(--ts-accent-gold);
}

.account-actions {
  display: flex;
  align-items: center;
  justify-self: end;
  min-width: 0;
  gap: 8px;
}

.header-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: 44px;
  padding: 8px 14px;
  color: var(--ts-text-on-parchment);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 34%),
    linear-gradient(180deg, var(--ts-accent-gold-hover), #b99442);
  border: 1px solid var(--ts-focus-ring);
  border-radius: var(--ts-radius-sm);
  box-shadow: 0 4px 12px rgba(20, 12, 6, 0.24);
  font-size: 0.875rem;
  font-weight: 800;
  text-shadow: 0 1px 0 rgba(255, 246, 214, 0.3);
  cursor: pointer;
  transition:
    filter var(--ts-motion-fast) ease,
    box-shadow var(--ts-motion-fast) ease,
    transform var(--ts-motion-fast) var(--ts-ease-out);
}

.header-button--quiet {
  min-width: 54px;
  color: var(--ts-text-muted);
  background: rgba(255, 255, 255, 0.035);
  border-color: var(--ts-border-subtle);
  box-shadow: none;
  text-shadow: none;
}

@media (hover: hover) {
  .header-button:hover {
    filter: brightness(1.08);
    box-shadow:
      0 6px 16px rgba(20, 12, 6, 0.32),
      0 0 18px rgba(247, 208, 120, 0.18);
    transform: translateY(-1px);
  }

  .header-button--quiet:hover {
    box-shadow: 0 0 14px rgba(214, 184, 106, 0.12);
  }
}

.user-chip {
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  color: var(--ts-text-muted);
  font-size: 0.8125rem;
}

.user-chip__avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  object-fit: cover;
  color: var(--ts-text-on-parchment);
  background: var(--ts-accent-gold);
  border: 1px solid rgba(240, 217, 144, 0.72);
  border-radius: 50%;
  font-weight: 850;
}

.user-chip__name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-main {
  position: relative;
  z-index: 1;
  width: 100%;
  min-height: calc(100vh - 69px);
  min-height: calc(100dvh - 69px);
  outline: none;
}

/* A leaf of the grimoire turning: hinged at the left spine, the right edge lifts
   toward the reader as the outgoing page leaves and settles flat as the next one
   arrives. `mode="out-in"` means the two never overlap, so both halves can claim
   the same hinge without fighting.

   Driven by keyframes (styles/motion.scss) rather than a transition, so the
   global prefers-reduced-motion gate in theme.scss collapses them to their end
   states — flat, opaque, unshadowed — with no extra media query needed here. */
.page-turn-enter-active,
.page-turn-leave-active {
  transform-origin: left center;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.page-turn-leave-active {
  animation: ts-page-turn-out 200ms var(--ts-ease-out) both;
}

.page-turn-enter-active {
  animation: ts-page-turn-in 220ms var(--ts-ease-out) both;
}

@media (max-width: 767px) {
  .site-header__inner {
    grid-template-columns: 1fr auto;
    width: min(100% - 24px, 1200px);
    min-height: 62px;
    gap: 8px;
  }

  .user-chip__name {
    display: none;
  }

  .brand__name {
    font-size: 0.94rem;
  }

  .site-nav {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: stretch;
    min-height: 44px;
    margin: 0 -12px;
    border-top: 1px solid rgba(214, 184, 106, 0.12);
  }

  .site-nav__link {
    flex: 1 1 50%;
    justify-content: center;
    border-radius: 0;
  }

  .account-actions {
    grid-column: 2;
    grid-row: 1;
  }

  .header-button {
    min-width: 58px;
    padding-inline: 11px;
  }

  .header-button--quiet {
    min-width: 48px;
  }

  .site-main {
    min-height: calc(100vh - 107px);
    min-height: calc(100dvh - 107px);
  }
}

@media (max-width: 389px) {
  .brand__crest {
    width: 34px;
    height: 34px;
  }

  .brand__copy {
    max-width: 116px;
  }

  .brand__name {
    overflow: hidden;
    font-size: 0.84rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* The page turn is keyframe-driven and already handled by the global gate; only
     these hover transitions still need switching off by hand. */
  .site-nav__link,
  .header-button {
    transition: none;
  }
}
</style>
