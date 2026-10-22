<template>
  <div id="vote">
    <!-- The brass hands laid over the table, behind everything else. Purely
         decorative: the card below states the same facts as text, which is why
         the whole mount is aria-hidden. -->
    <div
      class="vote-dial-mount"
      aria-hidden="true"
      :style="{ '--ts-motion-dial': dialStepDuration }"
    >
      <ClockDial
        mode="sweep"
        :seat-count="seatTotal"
        :minute-seat="dialNominatorSeat"
        :hour-seat="dialNomineeSeat"
        :sweep-seat="dialSweepSeat"
        :countdown-ms="dialCountdownMs"
        :countdown-started-at="dialTurnStartedAt"
        :turn-duration-ms="session.votingSpeed"
        :paused="dialPaused"
      />
    </div>

    <section class="vote-card" aria-labelledby="vote-title">
      <header class="vote-card__header">
        <div>
          <span class="vote-kicker">
            <font-awesome-icon :icon="['fas', 'gavel']" aria-hidden="true" />
            提名裁定
          </span>
          <h2 id="vote-title">投票进程</h2>
        </div>
        <span
          class="vote-status"
          :class="`vote-status--${voteStatusTone}`"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true"></span>
          {{ voteStatus }}
        </span>
      </header>

      <div class="vote-card__content">
        <div class="nomination-route">
          <div class="nomination-person nomination-person--nominator">
            <small>提名者 · {{ session.nomination[0] + 1 }} 号</small>
            <strong>{{ nominator.name }}</strong>
          </div>
          <font-awesome-icon
            class="nomination-route__arrow"
            :icon="['fas', 'arrow-right']"
            aria-hidden="true"
          />
          <div class="nomination-person nomination-person--nominee">
            <small>被提名者 · {{ session.nomination[1] + 1 }} 号</small>
            <strong>{{ nominee.name }}</strong>
          </div>
        </div>

        <div class="vote-summary">
          <div class="vote-tally" aria-live="polite">
            <span>当前票数</span>
            <strong>{{ voteCount }}</strong>
            <small>/ {{ voteThreshold }}</small>
          </div>
          <span class="vote-lock" :class="{ 'vote-lock--active': session.lockedVote }">
            <font-awesome-icon
              :icon="['fas', session.lockedVote ? 'lock' : 'unlock']"
              aria-hidden="true"
            />
            {{ lockLabel }}
          </span>
        </div>

        <div
          class="vote-progress"
          role="progressbar"
          aria-label="通过票数进度"
          :aria-valuemin="0"
          :aria-valuemax="Math.max(voteThreshold, 1)"
          :aria-valuenow="Math.min(voteCount, Math.max(voteThreshold, 1))"
        >
          <span :style="{ width: `${voteProgress}%` }"></span>
        </div>
        <div class="vote-summary__meta">
          <span>{{ voteThreshold }} 票通过</span>
          <span v-if="session.isSecretVote" class="secret-badge">
            <font-awesome-icon :icon="['fas', 'eye-slash']" aria-hidden="true" />
            闭眼投票
          </span>
        </div>

        <template v-if="!session.isSpectator">
          <section class="vote-controls" aria-labelledby="host-vote-controls">
            <h3 id="host-vote-controls">说书人控制</h3>

            <div
              v-if="!session.isVoteInProgress && session.lockedVote < 1"
              class="speed-control"
            >
              <span>每位玩家投票时间</span>
              <div>
                <button
                  type="button"
                  class="vote-icon-button"
                  aria-label="减少投票时间"
                  :disabled="session.votingSpeed <= 500"
                  @click="setVotingSpeed(-500)"
                >
                  <font-awesome-icon :icon="['fas', 'minus']" />
                </button>
                <output aria-live="polite">{{ session.votingSpeed / 1000 }} 秒</output>
                <button
                  type="button"
                  class="vote-icon-button"
                  aria-label="增加投票时间"
                  @click="setVotingSpeed(500)"
                >
                  <font-awesome-icon :icon="['fas', 'plus']" />
                </button>
              </div>
            </div>

            <div class="vote-actions">
              <button
                v-if="!session.isVoteInProgress"
                type="button"
                class="vote-button vote-button--secondary"
                @click="countdown"
              >
                <font-awesome-icon :icon="['fas', 'stopwatch']" aria-hidden="true" />
                倒计时
              </button>
              <button
                v-if="!session.isVoteInProgress && !session.lockedVote"
                type="button"
                class="vote-button vote-button--primary"
                @click="start"
              >
                <font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" />
                开始
              </button>
              <button
                v-if="!session.isVoteInProgress && !session.lockedVote"
                type="button"
                class="vote-button"
                @click="start0"
              >
                <font-awesome-icon :icon="['fas', 'calculator']" aria-hidden="true" />
                统计
              </button>
              <button
                v-if="session.isVoteInProgress"
                type="button"
                class="vote-button vote-button--secondary"
                :disabled="!session.lockedVote"
                @click="pause"
              >
                <font-awesome-icon
                  :icon="['fas', voteTimer ? 'pause' : 'play']"
                  aria-hidden="true"
                />
                {{ voteTimer ? "暂停" : "继续" }}
              </button>
              <button
                v-if="session.isVoteInProgress || session.lockedVote"
                type="button"
                class="vote-button"
                @click="stop"
              >
                <font-awesome-icon :icon="['fas', 'undo']" aria-hidden="true" />
                重置
              </button>
              <button type="button" class="vote-button vote-button--danger" @click="finish">
                <font-awesome-icon :icon="['fas', 'times']" aria-hidden="true" />
                关闭
              </button>
            </div>

            <div
              v-if="nominee.role.team !== 'traveler'"
              class="vote-actions vote-actions--mark"
            >
              <button
                type="button"
                class="vote-button"
                :disabled="session.nomination[1] === session.markedPlayer"
                @click="setMarked"
              >
                <font-awesome-icon :icon="['fas', 'skull']" aria-hidden="true" />
                标记处决
              </button>
              <button type="button" class="vote-button" @click="removeMarked">
                <font-awesome-icon :icon="['fas', 'eraser']" aria-hidden="true" />
                清除标记
              </button>
            </div>

            <button
              type="button"
              class="secret-vote-toggle"
              :class="{ 'secret-vote-toggle--active': session.isSecretVote }"
              :aria-pressed="session.isSecretVote"
              :disabled="session.isVoteInProgress"
              @click="setSecretVote"
            >
              <font-awesome-icon
                :icon="['fas', session.isSecretVote ? 'check-square' : 'square']"
                aria-hidden="true"
              />
              <span>闭眼投票</span>
              <small>{{ session.isSecretVote ? "已开启" : "未开启" }}</small>
            </button>
          </section>
        </template>

        <template v-else-if="canVote">
          <section class="vote-controls" aria-labelledby="player-vote-controls">
            <div class="player-vote-heading">
              <h3 id="player-vote-controls">我的投票</h3>
              <span>{{ playerVoteCount }} / {{ playerVoteLimit }} 票</span>
            </div>
            <p v-if="!session.isVoteInProgress" class="vote-help">
              每 {{ session.votingSpeed / 1000 }} 秒锁定一位玩家
            </p>
            <div class="vote-actions vote-actions--player">
              <button
                v-if="session.playerVotes > 1 && nominee.role.team !== 'traveler'"
                type="button"
                class="vote-button vote-button--secondary"
                :disabled="minVote"
                @click="vote(false)"
              >
                放下全部
              </button>
              <button
                type="button"
                class="vote-button vote-button--secondary"
                :disabled="minVote"
                @click="vote(-1)"
              >
                放下一票
              </button>
              <button
                type="button"
                class="vote-button vote-button--primary"
                :disabled="maxVote"
                @click="vote(1)"
              >
                投票
              </button>
              <button
                v-if="session.playerVotes > 1 && nominee.role.team !== 'traveler'"
                type="button"
                class="vote-button vote-button--primary"
                :disabled="maxVote"
                @click="vote(true)"
              >
                投票全部
              </button>
            </div>
          </section>
        </template>

        <p v-else-if="!player" class="vote-notice" role="status">
          <font-awesome-icon :icon="['fas', 'chair']" aria-hidden="true" />
          请落座后投票
        </p>
      </div>

      <transition name="vote-countdown">
        <div
          v-if="session.isVoteInProgress && !session.lockedVote"
          class="countdown"
          role="status"
          aria-live="assertive"
          aria-label="投票倒计时：3、2、1、开始"
        >
          <span class="countdown__label">投票倒计时</span>
          <div class="countdown__sequence" aria-hidden="true">
            <span>3</span>
            <span>2</span>
            <span>1</span>
            <span>开始</span>
          </div>
          <strong class="countdown__static">即将开始</strong>
          <audio
            :autoplay="!grimoire.isMuted"
            src="../assets/sounds/countdown.mp3"
            :muted="grimoire.isMuted"
          ></audio>
        </div>
      </transition>
    </section>
  </div>
</template>

<script setup lang="js">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import ClockDial from "@/components/ClockDial.vue";

const appStore = useAppStore();
const sessionStore = useSessionStore();
const playersStore = usePlayersStore();

const session = sessionStore.$state;
const { grimoire } = storeToRefs(appStore);
const { players } = storeToRefs(playersStore);

const voteTimer = ref(null);

const alive = computed(() => playersStore.alive);
const nominator = computed(() => players.value[session.nomination?.[0]] || {});
const nominee = computed(() => players.value[session.nomination?.[1]] || { role: {} });
const player = computed(() => players.value.find((p) => p.id === session.playerId));

const voteCount = computed(() =>
  (session.votes || [])
    .filter((item) => typeof item === "number" || typeof item === "boolean")
    .reduce((sum, item) => sum + Number(item), 0),
);

const voteThreshold = computed(() =>
  Math.ceil(
    nominee.value.role?.team === "traveler" ? players.value.length / 2 : alive.value / 2,
  ),
);

const voteProgress = computed(() =>
  Math.min(100, Math.max(0, (voteCount.value / Math.max(voteThreshold.value, 1)) * 100)),
);

const lockedCount = computed(() =>
  Math.min(
    players.value.length,
    Math.max(0, Number(session.lockedVote || 0) - 1),
  ),
);

const lockLabel = computed(() =>
  session.lockedVote
    ? `已锁定 ${lockedCount.value}/${players.value.length}`
    : "尚未锁定",
);

const voteStatus = computed(() => {
  if (session.isVoteInProgress && !session.lockedVote) return "倒计时";
  if (session.isVoteInProgress && voteTimer.value) return "计票中";
  if (session.isVoteInProgress) return "已暂停";
  if (session.lockedVote > players.value.length) return "计票完成";
  return "等待开始";
});

const voteStatusTone = computed(() => {
  if (session.isVoteInProgress && !session.lockedVote) return "countdown";
  if (session.isVoteInProgress && voteTimer.value) return "active";
  if (session.isVoteInProgress) return "paused";
  if (session.lockedVote > players.value.length) return "complete";
  return "idle";
});

const playerVoteLimit = computed(() =>
  nominee.value.role?.team === "traveler" ? 1 : session.playerVotes,
);

const playerVoteCount = computed(() => {
  const index = players.value.findIndex((item) => item.id === session.playerId);
  return index >= 0 ? Number(session.votes[index] || 0) : 0;
});

/* ------------------------------------------------------------- vote dial ----
   The hands over the table. Every value below is a derivation of the session
   state this panel already reads; ClockDial owns the geometry so the local
   voting path and the authoritative one turn the same instrument.

   The legacy angles are preserved exactly. `.arrows` parked its short hand on
   the nominator and swept its long hand from the nominee onwards
   (`nominee + min(lockedVote, total)`); the same seats are handed over here,
   with the sweep given ClockDial's dedicated sweep hand so the nominee keeps a
   marker of their own. lockedVote is 1 when the first seat locks, so the sweep
   correctly starts one seat past the nominee. */
const seatTotal = computed(() => players.value.length || 1);

const dialNominatorSeat = computed(() =>
  session.nomination ? (Number(session.nomination[0]) || 0) + 1 : null,
);

const dialNomineeSeat = computed(() =>
  session.nomination ? (Number(session.nomination[1]) || 0) + 1 : null,
);

const dialSweepSeat = computed(() => {
  if (!session.lockedVote) return null;
  const total = seatTotal.value;
  const nomineeIndex = Number(session.nomination?.[1]) || 0;
  return ((nomineeIndex + Math.min(session.lockedVote, total)) % total) + 1;
});

/* The wedge restarts whenever the lock advances or the timer is resumed —
   `pause()` rebuilds its interval from a full `votingSpeed` rather than
   resuming a partial one, so the wedge must do the same to stay honest. */
const dialTurnStartedAt = ref(Date.now());

watch(
  () => [session.lockedVote, voteTimer.value !== null],
  () => {
    dialTurnStartedAt.value = Date.now();
  },
);

const dialCountdownMs = computed(() =>
  session.isVoteInProgress && session.lockedVote ? session.votingSpeed : null,
);

const dialPaused = computed(() => session.isVoteInProgress && !voteTimer.value);

/* The old hands were timed to `votingSpeed - 100` so they landed just before the
   next seat locked. Keep that pacing rather than the dial's default, or a fast
   storyteller outruns their own indicator. */
const dialStepDuration = computed(
  () => `${Math.max(240, (Number(session.votingSpeed) || 3000) - 100)}ms`,
);

const maxVote = computed(() => {
  const index = players.value.findIndex((p) => p.id === session.playerId);
  if (index < 0) return false;
  const limit = nominee.value.role?.team === "traveler" ? 1 : session.playerVotes;
  return !!session.votes[index] && session.votes[index] >= limit;
});

const minVote = computed(() => {
  const index = players.value.findIndex((p) => p.id === session.playerId);
  if (index < 0) return true;
  return !session.votes[index] || session.votes[index] <= 0;
});

const canVote = computed(() => {
  if (!player.value) return false;
  if (player.value.isVoteless && nominee.value.role?.team !== "traveler") return false;
  const totalPlayers = players.value.length;
  const index = players.value.indexOf(player.value);
  const nominationIndex = session.nomination?.[1] || 0;
  const indexAdjusted = (index - 1 + totalPlayers - nominationIndex) % totalPlayers;
  return indexAdjusted >= session.lockedVote - 1;
});

watch(
  () => nominee.value.role?.team,
  (team) => {
    if (team !== "traveler") return;
    const index = players.value.findIndex((p) => p.id === session.playerId);
    if (index >= 0 && !!session.votes[index] && session.votes[index] > 1) {
      sessionStore.voteSync([index, 1]);
    }
  },
  { immediate: true },
);

function stopVoteTimer() {
  if (voteTimer.value) {
    clearInterval(voteTimer.value);
    voteTimer.value = null;
  }
}

function countdown() {
  sessionStore.lockVote(0);
  sessionStore.setVoteInProgress(true);
  stopVoteTimer();
  voteTimer.value = setInterval(() => {
    start();
  }, 4000);
}

function start() {
  sessionStore.lockVote(1);
  sessionStore.setVoteInProgress(true);
  stopVoteTimer();
  voteTimer.value = setInterval(() => {
    sessionStore.lockVote();
    if (session.lockedVote > players.value.length) {
      stopVoteTimer();
      sessionStore.setVoteInProgress(false);
    }
  }, session.votingSpeed);
}

function start0() {
  const speed = session.votingSpeed;
  sessionStore.setVotingSpeed(0);
  start();
  sessionStore.setVotingSpeed(speed);
}

function pause() {
  if (voteTimer.value) {
    stopVoteTimer();
    return;
  }
  voteTimer.value = setInterval(() => {
    sessionStore.lockVote();
    if (session.lockedVote > players.value.length) {
      stopVoteTimer();
      sessionStore.setVoteInProgress(false);
    }
  }, session.votingSpeed);
}

function stop() {
  stopVoteTimer();
  sessionStore.setVoteInProgress(false);
  sessionStore.lockVote(0);
}

function finish() {
  stopVoteTimer();
  sessionStore.addHistory(players.value);
  sessionStore.addVoteSelected({
    selected: false,
    players: players.value,
    save: true,
  });
  sessionStore.nominationUpdate({});
}

function vote(voteValue) {
  if (!canVote.value) return false;
  const index = players.value.findIndex((p) => p.id === session.playerId);
  const limit = nominee.value.role?.team === "traveler" ? 1 : session.playerVotes;
  if (index >= 0) {
    const votes =
      typeof voteValue === "number"
        ? Math.max(
            Math.min(voteValue + (session.votes[index] || !!session.votes[index]), limit),
            0,
          )
        : voteValue
          ? limit
          : 0;
    sessionStore.voteSync([index, votes]);
  }
}

function setVotingSpeed(diff) {
  const speed = Math.round(session.votingSpeed + diff);
  if (speed > 0) {
    sessionStore.setVotingSpeed(speed);
  }
}

function setMarked() {
  sessionStore.setMarkedPlayer({
    val: session.nomination?.[1] || -1,
    force: true,
  });
}

function removeMarked() {
  sessionStore.setMarkedPlayer({ val: -1, force: true });
}

function setSecretVote() {
  if (session.isSpectator) return;
  if (session.isVoteInProgress) return;
  sessionStore.setSecretVote(!session.isSecretVote);
}

onBeforeUnmount(() => {
  stopVoteTimer();
});
</script>

<style lang="scss" scoped>
#vote {
  position: absolute;
  top: max(70px, calc(env(safe-area-inset-top) + 60px));
  left: max(12px, env(safe-area-inset-left));
  z-index: 70;
  width: min(344px, calc(100vw - 24px));
  color: #f6e8c8;
  font-family: var(--ts-font-heading);
  text-align: left;
}

.vote-card {
  position: relative;
  max-height: calc(100dvh - 92px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid #805a2f;
  border-radius: 12px 5px 12px 12px;
  background:
    radial-gradient(circle at 14% 0, rgba(139, 77, 36, 0.24), transparent 38%),
    repeating-linear-gradient(
      96deg,
      rgba(49, 28, 18, 0.97) 0 12px,
      rgba(34, 19, 14, 0.98) 12px 26px,
      rgba(24, 13, 11, 0.99) 26px 40px
    );
  box-shadow:
    0 18px 44px rgba(0, 0, 0, 0.64),
    0 0 0 2px #170b08,
    0 0 0 3px rgba(190, 140, 61, 0.32),
    inset 4px 0 0 #69151f;
  scrollbar-width: thin;
  scrollbar-color: #8a602e rgba(12, 7, 5, 0.42);
  backdrop-filter: blur(5px);

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #8a602e;
  }
}

.vote-card__header {
  position: sticky;
  top: 0;
  z-index: 3;
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px 9px 16px;
  border-bottom: 1px solid rgba(218, 171, 86, 0.34);
  background:
    linear-gradient(90deg, rgba(105, 21, 31, 0.62), transparent 45%),
    rgba(16, 8, 7, 0.94);
  text-shadow: 0 2px 6px #030101;

  > div {
    min-width: 0;
  }

  h2 {
    margin: 2px 0 0;
    color: #ffe7af;
    font-size: 20px;
    line-height: 1.15;
    letter-spacing: 0.08em;
  }
}

.vote-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #c7aa73;
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.18em;
}

.vote-status {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  padding: 0 9px;
  border: 1px solid rgba(203, 165, 92, 0.42);
  border-radius: 999px;
  background: rgba(68, 45, 25, 0.56);
  color: #ead7aa;
  font-size: 12px;
  font-weight: 800;

  > span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #b99b62;
    box-shadow: 0 0 0 3px rgba(185, 155, 98, 0.15);
  }

  &--countdown > span,
  &--active > span {
    background: #d99e38;
    box-shadow: 0 0 0 3px rgba(217, 158, 56, 0.18);
  }

  &--paused > span {
    background: #c76368;
    box-shadow: 0 0 0 3px rgba(199, 99, 104, 0.18);
  }

  &--complete > span {
    background: #79b783;
    box-shadow: 0 0 0 3px rgba(121, 183, 131, 0.18);
  }
}

.vote-card__content {
  padding: 10px;
}

.nomination-route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid rgba(115, 74, 37, 0.72);
  border-radius: 8px;
  background:
    linear-gradient(rgba(255, 248, 220, 0.08), rgba(80, 43, 24, 0.06)),
    #d7c397;
  color: #25140f;
  box-shadow:
    inset 0 0 18px rgba(91, 48, 22, 0.16),
    0 4px 12px rgba(0, 0, 0, 0.25);
}

.nomination-person {
  min-width: 0;

  small,
  strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: #694737;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  strong {
    margin-top: 3px;
    font-size: 15px;
    line-height: 1.2;
  }

  &--nominee {
    text-align: right;

    strong {
      color: #711923;
    }
  }
}

.nomination-route__arrow {
  color: #81591f;
  font-size: 16px;
}

.vote-summary {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.vote-tally {
  display: flex;
  align-items: baseline;
  gap: 5px;

  span {
    color: #cdb98b;
    font-size: 12px;
  }

  strong {
    color: #ffe4a4;
    font-size: 31px;
    line-height: 1;
    text-shadow: 0 2px 8px #030101;
  }

  small {
    color: #d2bf91;
    font-size: 14px;
    font-weight: 700;
  }
}

.vote-lock {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid rgba(202, 166, 94, 0.28);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.22);
  color: #c8b58a;
  font-size: 11px;
  font-weight: 750;

  &--active {
    border-color: rgba(158, 45, 54, 0.7);
    background: rgba(104, 18, 28, 0.32);
    color: #f0b7ad;
  }
}

.vote-progress {
  height: 8px;
  overflow: hidden;
  border: 1px solid rgba(203, 165, 92, 0.28);
  border-radius: 999px;
  background: rgba(4, 2, 2, 0.55);
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.72);

  > span {
    height: 100%;
    display: block;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--ts-accent-crimson, #8d1b27),
      var(--ts-accent-gold, #d39d43)
    );
    box-shadow: 0 0 10px var(--ts-glow-candle-soft, rgba(201, 127, 45, 0.42));
    transition: width 220ms ease;
  }
}

.vote-summary__meta {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #bfae86;
  font-size: 11px;
}

.secret-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #d9c3ef;
}

.vote-controls {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(218, 171, 86, 0.22);

  h3 {
    margin: 0;
    color: #d5bd88;
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.14em;
  }
}

.speed-control {
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  > span {
    color: #d0bd91;
    font-size: 12px;
  }

  > div {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  output {
    min-width: 54px;
    color: #ffe0a0;
    font-size: 13px;
    font-weight: 800;
    text-align: center;
  }
}

.vote-icon-button {
  width: 44px;
  height: 44px;
  appearance: none;
  border: 1px solid rgba(204, 166, 92, 0.42);
  border-radius: 8px;
  background: rgba(17, 9, 7, 0.72);
  color: #ead39d;
  cursor: pointer;
  touch-action: manipulation;
}

.vote-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 7px;

  &--mark {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(218, 171, 86, 0.16);
  }
}

.vote-button {
  min-width: 0;
  min-height: 46px;
  appearance: none;
  border: 1px solid rgba(202, 166, 94, 0.38);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 244, 207, 0.08), transparent),
    rgba(27, 15, 11, 0.86);
  color: #ead8ad;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 7px 9px;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.15;
  touch-action: manipulation;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);

  &:hover:not(:disabled) {
    border-color: rgba(232, 196, 119, 0.72);
    background-color: rgba(73, 39, 22, 0.9);
    color: #ffe8b0;
    box-shadow: 0 0 14px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16));
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    background-color: rgba(16, 8, 7, 0.96);
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.52);
    transform: translateY(0);
  }

  &:disabled {
    border-color: rgba(202, 166, 94, 0.16);
    background: rgba(15, 9, 7, 0.42);
    color: rgba(234, 216, 173, 0.34);
    cursor: not-allowed;
  }

  &--primary {
    border-color: rgba(169, 55, 64, 0.82);
    background:
      linear-gradient(180deg, rgba(255, 212, 154, 0.14), transparent 40%),
      linear-gradient(180deg, var(--ts-accent-crimson, #8e2f36), #741923);
    color: #fff0c6;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }

  &--primary:hover:not(:disabled) {
    box-shadow: 0 0 16px var(--ts-glow-crimson, rgba(166, 60, 69, 0.42));
  }

  &--secondary {
    border-color: rgba(197, 153, 70, 0.72);
    background:
      linear-gradient(180deg, rgba(255, 234, 180, 0.09), transparent),
      #4a3018;
  }

  &--danger {
    border-color: rgba(196, 72, 78, 0.76);
    background: rgba(91, 17, 25, 0.72);
    color: #ffd1c5;
  }
}

.secret-vote-toggle {
  width: 100%;
  min-height: 48px;
  margin-top: 8px;
  appearance: none;
  border: 1px solid rgba(164, 133, 194, 0.38);
  border-radius: 8px;
  background: rgba(45, 30, 60, 0.36);
  color: #d8c4e8;
  cursor: pointer;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  font: inherit;
  text-align: left;
  touch-action: manipulation;

  span {
    font-size: 13px;
    font-weight: 800;
  }

  small {
    color: #aa96bb;
    font-size: 10px;
  }

  &--active {
    border-color: rgba(190, 155, 222, 0.72);
    background: rgba(67, 42, 89, 0.62);
    color: #eeddf9;
  }

  &:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }
}

.player-vote-heading {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  > span {
    color: #ffe0a0;
    font-size: 12px;
    font-weight: 800;
  }
}

.vote-help {
  margin: 3px 0 0;
  color: #bba981;
  font-size: 11px;
  line-height: 1.4;
}

.vote-notice {
  min-height: 48px;
  margin: 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgba(205, 169, 96, 0.42);
  border-radius: 8px;
  color: #ddc898;
  font-size: 13px;
}

.vote-icon-button:focus-visible,
.vote-button:focus-visible,
.secret-vote-toggle:focus-visible {
  position: relative;
  z-index: 2;
  outline: 2px solid #f7d98f;
  outline-offset: 2px;
  box-shadow:
    0 0 0 4px rgba(37, 14, 10, 0.92),
    0 0 0 6px rgba(247, 217, 143, 0.5);
}

.vote-icon-button:hover:not(:disabled) {
  border-color: rgba(232, 196, 119, 0.78);
  background: rgba(83, 43, 23, 0.88);
  color: #ffe8b0;
}

.vote-icon-button:disabled {
  opacity: 0.34;
  cursor: not-allowed;
}

/* Centred on the viewport and behind the whole table, exactly where the old
   `.arrows` block sat. The hands themselves come from styles/clock-dial.scss. */
.vote-dial-mount {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: -1;
  width: min(72vmin, 720px);
  aspect-ratio: 1 / 1;
  pointer-events: none;
  opacity: 0.72;
  transform: translate(-50%, -50%);
}

/* Here the hands read as instruments lying over the table rather than as a
   clock, so the engraved face the dial normally draws stays hidden. */
.vote-dial-mount :deep(.clock-dial__ticks),
.vote-dial-mount :deep(.clock-dial__hub) {
  display: none;
}

.vote-dial-mount :deep(.clock-dial__hand--minute) {
  --hand-scale: 0.92;
}

.vote-dial-mount :deep(.clock-dial__hand--hour) {
  --hand-scale: 0.6;
}

.vote-dial-mount :deep(.clock-dial__hand--sweep),
.vote-dial-mount :deep(.clock-dial__hand--trail) {
  --hand-scale: 0.88;
}

/* The wedge is the seat's remaining time — information, not atmosphere — so it
   keeps its contrast while the rest of the mount stays at 0.72. */
.vote-dial-mount :deep(.clock-dial__countdown) {
  opacity: 0.94;
}

@keyframes countdown {
  0% {
    transform: scale(0.72);
    opacity: 0;
  }

  16% {
    opacity: 1;
  }

  62% {
    transform: scale(1);
  }

  86% {
    opacity: 1;
  }

  100% {
    transform: scale(1.05);
    opacity: 0;
  }
}

@keyframes countdown-go {
  0% {
    transform: scale(0.82);
    opacity: 0;
  }

  16% {
    opacity: 1;
  }

  62% {
    transform: scale(1);
  }

  86% {
    opacity: 1;
  }

  100% {
    transform: scale(1.04);
    opacity: 0;
  }
}

.countdown {
  position: absolute;
  inset: 0;
  z-index: 5;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border-radius: inherit;
  background:
    radial-gradient(circle, rgba(110, 24, 34, 0.38), transparent 56%),
    rgba(12, 6, 6, 0.94);
  color: #ffe5aa;
  text-align: center;
  text-shadow: 0 3px 12px #000;

  audio {
    height: 0;
    width: 0;
    visibility: hidden;
  }
}

.countdown__label {
  color: #cbb17d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.countdown__sequence {
  position: relative;
  width: 100%;
  height: 92px;
  margin-top: 8px;

  span {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffe5aa;
    font-size: clamp(48px, 8vw, 76px);
    font-weight: 900;
    opacity: 0;
  }

  span:nth-child(1) {
    animation: countdown 1100ms normal forwards;
  }

  span:nth-child(2) {
    animation: countdown 1100ms normal forwards 1000ms;
  }

  span:nth-child(3) {
    animation: countdown 1100ms normal forwards 2000ms;
  }

  span:nth-child(4) {
    color: #d98672;
    font-size: clamp(38px, 6vw, 58px);
    animation: countdown-go 1100ms normal forwards 3000ms;
  }
}

.countdown__static {
  display: none;
  margin-top: 18px;
  color: #ffe5aa;
  font-size: 30px;
}

.vote-countdown-enter-active,
.vote-countdown-leave-active {
  transition: opacity 180ms ease;
}

.vote-countdown-enter-from,
.vote-countdown-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  #vote {
    top: auto;
    bottom: max(10px, env(safe-area-inset-bottom));
    left: max(8px, env(safe-area-inset-left));
    width: min(296px, calc(100vw - 72px));
  }

  .vote-card {
    max-height: min(62dvh, 520px);
    border-radius: 10px 4px 10px 10px;
  }

  .vote-card__header {
    min-height: 60px;
    padding: 8px 9px 8px 13px;

    h2 {
      font-size: 17px;
    }
  }

  .vote-status {
    min-height: 28px;
    padding: 0 7px;
    font-size: 11px;
  }

  .vote-card__content {
    padding: 8px;
  }

  .nomination-route {
    grid-template-columns: minmax(0, 1fr) 22px minmax(0, 1fr);
    padding: 8px;

    strong {
      font-size: 14px;
    }
  }

  .vote-actions {
    gap: 6px;
  }

  .vote-button {
    min-height: 44px;
    padding-inline: 7px;
    font-size: 12px;
  }

  .vote-dial-mount {
    width: min(68vmin, 560px);
    opacity: 0.62;
  }
}

@media (max-height: 560px) and (orientation: landscape) {
  #vote {
    top: max(8px, env(safe-area-inset-top));
    bottom: auto;
    width: min(320px, calc(100vw - 80px));
  }

  .vote-card {
    max-height: calc(100dvh - 16px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .vote-progress > span,
  .vote-icon-button,
  .vote-button,
  .vote-countdown-enter-active,
  .vote-countdown-leave-active {
    animation: none !important;
    transition: none !important;
  }

  .countdown__sequence {
    display: none;
  }

  .countdown__static {
    display: block;
  }
}
</style>
