<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { AuthHelper } from '@/helpers'
import { isLocalLoginEnabled } from '@/config/env'
import { useUserStore } from '@/stores/user'
import ClockDial from '@/components/ClockDial.vue'
import { revealOnEnter } from '@/composables/useMotion'
import demonHeadUrl from '@/assets/demon-head2.png'

defineOptions({
  name: 'Index',
})

const router = useRouter()
const userStore = useUserStore()

const roomCode = ref('')
const roomCodeError = ref('')
const roomCodeInput = ref<HTMLInputElement | null>(null)
const primaryActionLabel = computed(() =>
  userStore.isLoggedIn ? '进入房间大厅' : '登录并进入大厅'
)

function getRoomsTarget(code?: string) {
  return {
    name: 'RoomList' as const,
    query: code ? { room: code } : undefined,
  }
}

async function enterRooms(code?: string) {
  const target = getRoomsTarget(code)

  if (userStore.isLoggedIn) {
    await router.push(target)
    return
  }

  const returnTo = router.resolve(target).fullPath
  await AuthHelper.doLogin(returnTo)
}

async function submitRoomCode() {
  const normalizedCode = roomCode.value.trim()
  roomCodeError.value = ''

  if (!normalizedCode) {
    roomCodeError.value = '请输入房间号或邀请码。'
    await nextTick()
    roomCodeInput.value?.focus()
    return
  }

  if (!/^[A-Za-z0-9_-]{2,64}$/.test(normalizedCode)) {
    roomCodeError.value = '房间号仅可包含字母、数字、短横线或下划线。'
    await nextTick()
    roomCodeInput.value?.focus()
    return
  }

  await enterRooms(normalizedCode)
}

/* The three journey cards rise in as they scroll into view. revealOnEnter never
   hides anything when the user asked for reduced motion, so nothing here needs a
   second code path for that case. */
const journeySteps = useTemplateRef<HTMLElement>('journeySteps')
let stopReveal: (() => void) | null = null

onMounted(() => {
  const list = journeySteps.value
  if (!list) return
  stopReveal = revealOnEnter(list, Array.from(list.querySelectorAll('.journey-card')))
})

onBeforeUnmount(() => {
  stopReveal?.()
  stopReveal = null
})
</script>

<template>
  <div class="home-page">
    <section class="hero" aria-labelledby="hero-title">
      <!-- A bill nailed up outside the inn: torn parchment, foxed with age. -->
      <div
        class="hero__notice parchment-surface parchment-surface--deckled parchment-surface--foxed"
      >
        <span class="hero__corners filigree-corner" aria-hidden="true"></span>
        <span
          class="hero__corners hero__corners--flip filigree-corner"
          aria-hidden="true"
        ></span>

        <div class="hero__content">
          <p class="eyebrow hero__eyebrow">暗夜之下 · 每个人都可能在说谎</p>
          <h1 id="hero-title" class="hero__title">
            <span class="hero__title-kicker">帽帽钟楼</span>
            <span class="hero__title-plate">
              <span class="hero__title-brand gold-foil-text font-gothic"
                >线上魔典</span
              >
            </span>
          </h1>
          <hr class="woodcut-rule hero__rule" aria-hidden="true" />

          <div class="hero__actions" aria-label="开始游戏">
            <button
              class="btn btn-primary btn-lg"
              type="button"
              @click="enterRooms()"
            >
              {{ primaryActionLabel }}
            </button>
            <a class="btn btn-outline btn-lg" href="#how-it-works"
              >了解玩法流程</a
            >
          </div>

          <form class="room-code-panel" novalidate @submit.prevent="submitRoomCode">
            <div class="room-code-panel__copy">
              <label class="room-code-panel__label" for="room-code"
                >已有房间号？</label
              >
              <p id="room-code-help" class="room-code-panel__help">
                输入邀请中的房间号，登录后直接在大厅定位。
              </p>
            </div>
            <div class="room-code-panel__controls">
              <input
                id="room-code"
                ref="roomCodeInput"
                v-model="roomCode"
                class="room-code-input ink-field"
                name="roomCode"
                type="text"
                maxlength="64"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="例如：NIGHT-2048"
                :aria-invalid="roomCodeError ? 'true' : 'false'"
                :aria-describedby="
                  roomCodeError
                    ? 'room-code-help room-code-error'
                    : 'room-code-help'
                "
                @input="roomCodeError = ''"
              />
              <button class="room-code-submit" type="submit">寻找房间</button>
            </div>
            <p
              v-if="roomCodeError"
              id="room-code-error"
              class="room-code-panel__error"
              role="alert"
            >
              {{ roomCodeError }}
            </p>
          </form>

        </div>
      </div>

      <div class="hero__visual" aria-hidden="true">
        <div class="artifact-stage">
          <span class="artifact-stage__ring artifact-stage__ring--outer"></span>
          <span class="artifact-stage__ring artifact-stage__ring--inner"></span>
          <!-- The tower's own clock: hands on real time, stopped while off-screen. -->
          <ClockDial
            class="artifact-stage__dial"
            mode="clock"
            :seat-count="12"
          >
            <template #center>
              <span class="artifact-stage__emblem">
                <img
                  class="artifact-stage__demon"
                  :src="demonHeadUrl"
                  width="466"
                  height="500"
                  alt=""
                />
              </span>
            </template>
          </ClockDial>
          <span class="artifact-stage__motto">TRUST NO WHISPER</span>
          <span class="wax-seal artifact-stage__seal">
            <span class="wax-seal__imprint">夜</span>
          </span>
        </div>
      </div>
    </section>

    <section id="how-it-works" class="how-it-works" aria-labelledby="how-title">
      <div class="section-heading">
        <p class="eyebrow">从邀请到开局</p>
        <h2 id="how-title">三步进入你的魔典</h2>
      </div>

      <ol ref="journeySteps" class="journey-steps">
        <li class="journey-card parchment-surface parchment-surface--deckled">
          <span class="wax-seal journey-card__seal" aria-hidden="true">
            <span class="wax-seal__imprint">壹</span>
          </span>
          <div>
            <h3>登录身份</h3>
            <p>{{ isLocalLoginEnabled() ? '使用本地账号登录，进入大厅创建或加入房间。' : '使用用户名、邮箱或 QQ 登录，保存你的昵称、等级与说书人资格。' }}</p>
          </div>
        </li>
        <li class="journey-card parchment-surface parchment-surface--deckled">
          <span class="wax-seal journey-card__seal" aria-hidden="true">
            <span class="wax-seal__imprint">贰</span>
          </span>
          <div>
            <h3>选择房间</h3>
            <p>搜索房间、查看剧本和人数；私密房会明确提示密码。</p>
          </div>
        </li>
        <li class="journey-card parchment-surface parchment-surface--deckled">
          <span class="wax-seal journey-card__seal" aria-hidden="true">
            <span class="wax-seal__imprint">叁</span>
          </span>
          <div>
            <h3>进入魔典</h3>
            <p>落座后进入熟悉的城镇广场，等待说书人拉下夜幕。</p>
          </div>
        </li>
      </ol>
    </section>

    <aside
      class="community-strip medieval-surface"
      aria-labelledby="community-title"
    >
      <div>
        <h2 id="community-title">寻找同桌玩家与中文资料</h2>
      </div>
      <div class="community-strip__actions">
        <a
          class="community-link"
          href="https://bbs.ubotc.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          访问玩家社区<span aria-hidden="true">↗</span>
        </a>
        <a
          class="community-link"
          href="https://qm.qq.com/q/ilipqmaTn4"
          target="_blank"
          rel="noopener noreferrer"
        >
          加入 QQ 群<span aria-hidden="true">↗</span>
        </a>
      </div>
    </aside>

    <footer class="site-footer">
      <div class="site-footer__records">
        <a
          href="https://beian.miit.gov.cn"
          target="_blank"
          rel="noopener noreferrer"
          >吉ICP备2026001488号-1</a
        >
        <span aria-hidden="true">·</span>
        <span>吉公网安备22010302000579号</span>
      </div>
      <p>
        本站为非官方玩家社区，与游戏出版方及相关权利方无从属关系；游戏名称与素材版权归其各自权利人所有。
      </p>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.home-page {
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(36px, 6vw, 76px) 0 28px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
  align-items: center;
  min-height: min(720px, calc(100dvh - 105px));
  gap: clamp(36px, 6vw, 84px);
}

/* ── The nailed-up notice ──────────────────────────────────────────────────── */

.hero__notice {
  /* One ink well for the whole sheet. Every value below is checked against the
     parchment (var(--ts-surface-parchment, #f1e3c7)) at 4.5:1 or better — nothing on this panel may keep the
     gold-on-dusk palette the rest of the site uses. */
  --notice-ink: var(--ts-text-on-parchment, #2a1b18);
  --notice-ink-rule: rgba(90, 62, 38, 0.42);
  --notice-crimson: var(--ts-wax-crimson, #7c2229);

  position: relative;
  padding: clamp(24px, 3.4vw, 44px) clamp(20px, 3vw, 42px) clamp(22px, 3vw, 38px);
  /* The deckle mask clips box-shadow along with the paper, so the sheet's lift
     off the desk has to come from a filter, which is applied after masking. */
  filter: drop-shadow(0 24px 38px rgba(0, 0, 0, 0.52));
}

/* Two overlapping pairs of engraved corners: the flipped copy fills the other
   two. Inset far enough that the torn edge does not eat them. */
.hero__corners {
  --ts-corner-size: 30px;
  --ts-corner-inset: 18px;

  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hero__corners--flip {
  transform: rotate(180deg);
}

.hero__corners::before,
.hero__corners::after {
  /* Gold filigree disappears on paper; these are inked instead. */
  border-color: var(--notice-ink-rule);
  opacity: 0.9;
}

.hero__content {
  position: relative;
  /* Above the foxing blooms and the corner flourishes, both of which are
     positioned and would otherwise paint over the text. */
  z-index: 1;
  max-width: 680px;
}

.hero__eyebrow {
  color: var(--notice-crimson);
}

.hero__title {
  display: grid;
  justify-items: start;
  margin: 14px 0 0;
  gap: 10px;
  text-align: left;
}

.hero__title-kicker {
  color: var(--notice-ink);
  font-family: var(--ts-font-heading);
  font-size: clamp(2.4rem, 6vw, 5.2rem);
  font-weight: 850;
  letter-spacing: 0.05em;
  /* Letterpress: the paper lifts a hair on the underside of every stroke. */
  text-shadow: 0 1px 0 rgba(255, 252, 240, 0.72);
}

/* Gold foil needs something dark to be stamped onto — a printer's ink bar. */
.hero__title-plate {
  display: inline-flex;
  padding: 5px 18px 9px;
  background-image:
    linear-gradient(180deg, rgba(255, 236, 190, 0.1), transparent 40%),
    linear-gradient(180deg, #291d14, #130f0b);
  border: 1px solid rgba(214, 184, 106, 0.4);
  border-radius: 3px;
  box-shadow:
    0 6px 14px rgba(52, 32, 16, 0.4),
    inset 0 1px rgba(255, 236, 190, 0.18);
}

.hero__title-brand {
  font-size: clamp(2.1rem, 5.2vw, 4.5rem);
  letter-spacing: 0.09em;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
}

.hero__rule {
  width: min(300px, 62%);
  margin: 20px 0 18px;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  margin-top: 26px;
  gap: 12px;
}

/* The outline button's translucent fill was tuned for the dusk canvas; over
   parchment it would wash out to tan and drop its label below 4.5:1. Inked
   solid instead, so the pair reads as brass plate beside iron stamp. */
.hero__actions .btn-outline {
  --ts-btn-grad-top: #3a2b21;
  --ts-btn-grad-bottom: #241a13;
  --ts-btn-grad-top-active: #241a13;
  --ts-btn-grad-bottom-active: #17100c;
  --ts-btn-border-color: rgba(90, 62, 38, 0.7);
  --ts-btn-shadow-color: rgba(52, 32, 16, 0.32);
}

/* ── Room-code receipt ─────────────────────────────────────────────────────── */

/* A tear-off slip pasted to the notice, not a second sheet of parchment: the
   dashed rule and the darker wash are what separate it from the bill. */
.room-code-panel {
  position: relative;
  width: min(620px, 100%);
  margin-top: 26px;
  padding: 15px 17px 17px;
  background-color: rgba(206, 183, 143, 0.34);
  background-image: var(--ts-noise-parchment);
  background-size: 256px 256px;
  border: 1px dashed var(--notice-ink-rule);
  border-radius: 3px;
  box-shadow:
    inset 0 1px rgba(255, 250, 233, 0.6),
    inset 0 -14px 22px rgba(91, 54, 27, 0.07);
}

.room-code-panel__copy {
  margin-bottom: 12px;
}

.room-code-panel__label {
  display: block;
  color: var(--notice-ink);
  font-family: var(--ts-font-heading);
  font-size: 1.05rem;
  font-weight: 850;
}

.room-code-panel__help,
.room-code-panel__error {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
}

.room-code-panel__help {
  color: rgba(58, 42, 32, 0.86);
}

.room-code-panel__error {
  color: var(--notice-crimson);
  font-weight: 750;
  /* Arrives the way the ink does in the field beside it. */
  animation: ts-ink-bleed 260ms var(--ts-ease-out, ease-out) both;
}

.room-code-panel__controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.room-code-input,
.room-code-submit {
  min-height: 46px;
  border-radius: var(--ts-radius-sm);
  font-size: 1rem;
}

/* Composed with the global .ink-field, which paints the soak that runs along the
   bottom edge on focus. The gold line it ships with is invisible on paper, so
   --ts-ink-line is re-pointed at iron-gall ink here. background-color rather
   than the background shorthand, or that layer would be wiped out. */
.room-code-input {
  --ts-ink-line: linear-gradient(
    90deg,
    rgba(58, 42, 32, 0) 0%,
    rgba(58, 42, 32, 0.5) 18%,
    var(--ts-ink, #3a2a20) 50%,
    rgba(58, 42, 32, 0.5) 82%,
    rgba(58, 42, 32, 0) 100%
  );

  width: 100%;
  padding: 10px 12px;
  color: var(--notice-ink);
  background-color: rgba(255, 252, 242, 0.62);
  border: 1px solid rgba(82, 52, 35, 0.46);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    border-color var(--ts-motion-fast) ease,
    box-shadow var(--ts-motion-fast) ease,
    background-size var(--ts-motion-base) var(--ts-ease-out);
}

.room-code-input::placeholder {
  color: rgba(67, 47, 38, 0.62);
  text-transform: none;
}

.room-code-input:hover {
  border-color: #8f693e;
}

.room-code-input:focus,
.room-code-input:focus-visible {
  outline: 3px solid var(--ts-focus-ring-on-parchment, #65242c);
  outline-offset: 1px;
  border-color: #6f422d;
}

/* Red ink blooming out of a rejected field. No fill mode: once the 300ms bloom
   is spent the declared ring below holds the error, so the affordance survives
   under reduced motion, where the bloom collapses to nothing. */
.room-code-input[aria-invalid='true'] {
  --ts-ink-line: linear-gradient(
    90deg,
    rgba(124, 34, 41, 0) 0%,
    rgba(124, 34, 41, 0.58) 18%,
    var(--ts-wax-crimson, #7c2229) 50%,
    rgba(124, 34, 41, 0.58) 82%,
    rgba(124, 34, 41, 0) 100%
  );

  border-color: var(--notice-crimson);
  box-shadow: 0 0 0 2px rgba(124, 34, 41, 0.24);
  animation: ts-ink-bloom 300ms var(--ts-ease-out);
}

.room-code-submit:focus-visible {
  outline-color: var(--ts-focus-ring-on-parchment, #65242c);
}

/* A crimson stamp. Its own fill and text travel together, so it needs no
   parchment-specific contrast work. */
.room-code-submit {
  padding: 9px 18px;
  color: var(--ts-text-primary);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 38%),
    linear-gradient(180deg, var(--ts-accent-crimson-hover), #70232a);
  border: 1px solid #6f2b30;
  box-shadow: 0 6px 16px rgba(79, 16, 23, 0.28);
  font-weight: 800;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition:
    filter var(--ts-motion-fast) ease,
    box-shadow var(--ts-motion-fast) ease,
    transform var(--ts-motion-fast) var(--ts-ease-out);
}

@media (hover: hover) {
  .room-code-submit:hover {
    filter: brightness(1.08);
    box-shadow:
      0 8px 20px rgba(79, 16, 23, 0.36),
      0 0 18px rgba(166, 60, 69, 0.2);
    transform: translateY(-1px);
  }
}

/* ── The tower clock ──────────────────────────────────────────────────────── */

.hero__visual {
  display: grid;
  place-items: center;
  min-height: 520px;
}

.artifact-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: min(470px, 100%);
  aspect-ratio: 1;
  background:
    radial-gradient(
      circle at 50% 38%,
      rgba(247, 208, 120, 0.12),
      transparent 22%
    ),
    radial-gradient(
      circle at 50% 42%,
      rgba(142, 47, 54, 0.28),
      transparent 30%
    ),
    radial-gradient(
      circle,
      rgba(41, 29, 50, 0.92) 0 48%,
      rgba(11, 9, 16, 0.98) 70%
    );
  border: 1px solid rgba(214, 184, 106, 0.3);
  border-radius: 50%;
  box-shadow:
    0 42px 90px rgba(0, 0, 0, 0.56),
    inset 0 0 70px rgba(0, 0, 0, 0.72),
    0 0 0 10px rgba(17, 12, 24, 0.48);
}

.artifact-stage::before {
  position: absolute;
  inset: 5%;
  content: '';
  background: var(--ts-noise-stone);
  border-radius: 50%;
  opacity: 0.1;
  mix-blend-mode: screen;
}

.artifact-stage__ring {
  position: absolute;
  border: 1px solid rgba(214, 184, 106, 0.42);
  border-radius: 50%;
}

.artifact-stage__ring--outer {
  /* Just inside the dial's tick band, so it reads as the chapter ring. */
  inset: 7%;
  box-shadow: inset 0 0 0 5px rgba(214, 184, 106, 0.035);
}

.artifact-stage__ring--inner {
  inset: 21%;
  border-color: rgba(214, 184, 106, 0.24);
}

.artifact-stage__dial {
  position: absolute;
  inset: 0;
  z-index: 3;
}

/* The emblem slot is sized for a table centre; the homepage wants the demon
   head to fill the face, with the hands sweeping across it. */
.artifact-stage :deep(.clock-dial__center) {
  inset: 18%;
}

.artifact-stage__emblem {
  display: block;
  animation: ts-candle-flicker 6.5s ease-in-out infinite;
}

.artifact-stage__demon {
  width: 100%;
  /* The width/height attributes reserve the box against CLS, but the height one
     is a presentational hint that survives `width: 100%` and would stretch the
     engraving to 500px tall at every viewport — tall enough to hang past the
     rim and, on a phone, over the section heading below. */
  height: auto;
  opacity: 0.78;
  filter: sepia(1) saturate(0.8) brightness(0.88)
    drop-shadow(0 10px 16px rgba(0, 0, 0, 0.72));
}

.artifact-stage__motto {
  position: absolute;
  z-index: 4;
  bottom: 11%;
  color: var(--ts-text-subtle);
  font-family: var(--ts-font-heading);
  font-size: clamp(0.6rem, 1.2vw, 0.76rem);
  letter-spacing: 0.28em;
}

/* The global .wax-seal recipe lives in styles/materials.scss; only its placement
   and size belong to this page. */
.artifact-stage__seal {
  --ts-wax-size: clamp(72px, 8vw, 88px);

  position: absolute;
  right: 3%;
  bottom: 1%;
  z-index: 5;
  transform: rotate(-7deg);
}

/* ── Three steps ──────────────────────────────────────────────────────────── */

.how-it-works {
  padding: clamp(62px, 9vw, 108px) 0 clamp(46px, 7vw, 80px);
  scroll-margin-top: 120px;
}

.section-heading {
  width: min(680px, 100%);
  margin: 0 auto 34px;
  text-align: center;
}

.section-heading h2,
.community-strip h2 {
  margin: 10px 0 12px;
  font-size: clamp(1.7rem, 3.5vw, 2.6rem);
}

.journey-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  list-style: none;
  gap: 18px;
}

.journey-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 190px;
  padding: 26px 24px;
  gap: 18px;
  /* Masked paper cannot cast a box-shadow — same reason as the hero notice. */
  filter: drop-shadow(0 14px 22px rgba(0, 0, 0, 0.42));
  transition:
    filter var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);
}

@media (hover: hover) {
  .journey-card:hover {
    filter: drop-shadow(0 18px 26px rgba(0, 0, 0, 0.5));
    transform: translateY(-2px);
  }
}

.journey-card::after {
  position: absolute;
  right: 18px;
  bottom: 14px;
  width: 54px;
  height: 1px;
  content: '';
  background: linear-gradient(90deg, transparent, var(--ts-ink, #3a2a20));
  opacity: 0.42;
}

.journey-card__seal {
  --ts-wax-size: 48px;

  transform: rotate(-5deg);
}

.journey-card h3 {
  margin: 3px 0 12px;
  color: var(--ts-text-on-parchment);
  font-size: 1.16rem;
  text-shadow: 0 1px 0 rgba(255, 252, 240, 0.6);
}

.journey-card p {
  margin: 0;
  color: rgba(58, 42, 32, 0.86);
  font-size: 0.92rem;
  line-height: 1.7;
}

.community-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  padding: clamp(24px, 4vw, 40px);
  gap: 30px;
}

.community-strip h2 {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2rem);
}

.community-strip__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.community-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  gap: 8px;
  padding: 9px 14px;
  color: var(--ts-text-primary);
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid var(--ts-border-subtle);
  border-radius: var(--ts-radius-sm);
  font-size: 0.875rem;
  font-weight: 700;
  text-decoration: none;
}

.community-link:hover {
  color: var(--ts-accent-gold-hover);
  border-color: rgba(214, 184, 106, 0.55);
}

.site-footer {
  padding: 28px 12px 8px;
  color: var(--ts-text-subtle);
  font-size: 0.75rem;
  text-align: center;
}

.site-footer__records {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
  gap: 8px;
}

.site-footer a {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--ts-text-muted);
}

.site-footer p {
  max-width: 80ch;
  margin: 0 auto;
  line-height: 1.7;
}

@media (max-width: 1023px) {
  .home-page {
    width: min(100% - 32px, 920px);
    padding-top: 44px;
  }

  .hero {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 0.72fr);
    gap: 30px;
  }

  .hero__visual {
    min-height: 430px;
  }

  .journey-steps {
    gap: 12px;
  }

  .journey-card {
    grid-template-columns: 1fr;
    padding: 22px 18px;
  }
}

@media (max-width: 767px) {
  .home-page {
    width: min(100% - 24px, 620px);
    padding-top: 34px;
  }

  .hero {
    grid-template-columns: 1fr;
    min-height: auto;
    gap: 26px;
  }

  .hero__corners {
    --ts-corner-inset: 14px;
    --ts-corner-size: 22px;
  }

  .hero__title {
    margin-top: 12px;
  }

  .hero__title-kicker {
    font-size: clamp(2.35rem, 13vw, 3.6rem);
  }

  .hero__title-plate {
    padding: 4px 13px 7px;
  }

  .hero__title-brand {
    font-size: clamp(2rem, 11vw, 3.1rem);
  }

  .hero__actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .hero__actions .btn {
    width: 100%;
  }

  .room-code-panel {
    padding: 14px;
  }

  .room-code-panel__controls {
    grid-template-columns: 1fr;
  }

  .room-code-submit {
    width: 100%;
  }

  .hero__visual {
    min-height: auto;
    padding: 10px 20px 0;
  }

  .artifact-stage {
    width: min(390px, 100%);
  }

  .how-it-works {
    padding-top: 72px;
  }

  .journey-steps,
  .community-strip {
    grid-template-columns: 1fr;
  }

  .journey-card {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 0;
  }

  .community-strip__actions {
    justify-content: stretch;
  }

  .community-link {
    flex: 1 1 180px;
  }
}

@media (max-width: 389px) {
  .journey-card {
    grid-template-columns: 1fr;
  }

  .artifact-stage__seal {
    right: 1%;
    bottom: -1%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .journey-card,
  .room-code-submit {
    transition: none;
  }
}
</style>
