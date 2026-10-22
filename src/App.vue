<script lang="ts" setup>
import { onMounted, ref } from "vue";
import { useUserStore } from "./stores/user";

const userStore = useUserStore();

const isInitialLoading = ref(true);
const initialLoadError = ref<string | null>(null);
const continueAsGuest = ref(false);

async function initialize() {
  isInitialLoading.value = true;
  initialLoadError.value = null;
  continueAsGuest.value = false;

  try {
    await userStore.refreshCurrentUserInfo({ ignoreRedirectToLogin: true, ignoreAlertOnError: true });
  } catch (error) {
    initialLoadError.value = error instanceof Error ? error.message : "无法确认当前登录状态";
  } finally {
    isInitialLoading.value = false;
  }
}

onMounted(() => { void initialize(); });
</script>

<template>
  <div
    v-if="isInitialLoading || (initialLoadError && !continueAsGuest)"
    class="app-gate"
    :aria-busy="isInitialLoading"
  >
    <div class="app-gate__panel medieval-surface">
      <div class="app-gate__seal" aria-hidden="true">夜</div>

      <template v-if="isInitialLoading">
        <div class="app-gate__spinner" aria-hidden="true"></div>
        <p class="app-gate__eyebrow">正在翻开魔典</p>
        <p class="app-gate__message" role="status" aria-live="polite">确认旅人身份与大厅通行状态…</p>
      </template>

      <template v-else>
        <p class="app-gate__eyebrow">入口暂时受阻</p>
        <h1>无法确认登录状态</h1>
        <p class="app-gate__message" role="alert">{{ initialLoadError }}</p>
        <div class="app-gate__actions">
          <button class="btn btn-primary" type="button" @click="initialize">重新尝试</button>
          <button class="btn btn-secondary" type="button" @click="continueAsGuest = true">先浏览公开首页</button>
        </div>
      </template>
    </div>
  </div>

  <router-view v-else />
</template>

<style scoped lang="scss">
.app-gate {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  background:
    radial-gradient(circle at 50% 38%, rgba(102, 68, 121, 0.2), transparent 34%),
    linear-gradient(180deg, rgba(11, 9, 16, 0.38), rgba(11, 9, 16, 0.82));
}

.app-gate__panel {
  display: grid;
  justify-items: center;
  width: min(440px, 100%);
  padding: 34px 28px;
  text-align: center;
}

.app-gate__seal {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 20px;
  color: #e8c7a7;
  background: radial-gradient(circle, #9f3840 0 58%, #6d2027 60% 74%, transparent 75%);
  border-radius: 47% 53% 44% 56% / 51% 45% 55% 49%;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.38);
  font-family: var(--ts-font-heading);
  font-size: 1.35rem;
  font-weight: 900;
}

.app-gate__spinner {
  width: 34px;
  height: 34px;
  margin-bottom: 16px;
  border: 2px solid rgba(214, 184, 106, 0.22);
  border-top-color: var(--ts-accent-gold);
  border-radius: 50%;
  animation: app-gate-spin 800ms linear infinite;
}

.app-gate__eyebrow {
  margin: 0;
  color: var(--ts-accent-gold);
  font-family: var(--ts-font-heading);
  font-size: 1.04rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.app-gate h1 {
  margin: 0;
  font-size: 1.55rem;
}

.app-gate__message {
  margin: 10px 0 0;
  color: var(--ts-text-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.app-gate__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
  margin-top: 24px;
  gap: 10px;
}

@keyframes app-gate-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 479px) {
  .app-gate__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-gate__spinner {
    animation: none;
    border-color: var(--ts-accent-gold);
  }
}
</style>
