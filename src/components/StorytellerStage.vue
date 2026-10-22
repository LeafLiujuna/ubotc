<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Modal from './modals/Modal.vue';
import { useStoryteller } from '@/composables/useStoryteller';
import { useAppStore } from '@/stores/app';
import { usePlayersStore } from '@/stores/players';
import { useGameScriptStore } from '@/stores/gameScript';
import { useSeatEditorStore } from '@/stores/seatEditor';
import { useNightPlayerSelectionStore } from '@/stores/nightPlayerSelection';
import { useGameController } from '@/controllers/GameController';
import { timerRemaining, RESULT_REVEAL_DURATION_MS } from '@/types/storyteller';
import { playChime } from '@/utils/chime';

const props = defineProps<{ hidden?: boolean }>();
const st = useStoryteller();
const { demo, ui, level, levelDays, timer, reveal, result, isHost, available } = st;
const app = useAppStore(), players = usePlayersStore(), script = useGameScriptStore(), editor = useSeatEditorStore();
const clock = ref(Date.now());
const tick = setInterval(() => { clock.value = Date.now(); if (demo.active) demo.tick(); }, 200);
onBeforeUnmount(() => { clearInterval(tick); if (bannerTimeout) clearTimeout(bannerTimeout); });
const remaining = computed(() => Math.ceil(timerRemaining(timer.value, clock.value) / 1000));
const timeLabel = computed(() => `${Math.floor(remaining.value / 60)}:${String(remaining.value % 60).padStart(2, '0')}`);
const displayTimer = computed(() => timer.value && timer.value.status !== 'stopped');
const obstructed = computed(() => props.hidden || editor.open || useNightPlayerSelectionStore().active);
const minutes = ref(10), title = ref('');
const choosingWinner = ref(false), winningPlayerId = ref('');
const winnerOptions = computed(() => players.players.map((p, index) => ({ id: st.playerId(index), label: `${index + 1} 号 · ${p.name || '玩家'}` })).filter(p => p.id));
const selectedWinner = computed(() => winnerOptions.value.find(player => player.id === winningPlayerId.value));
const hasUnrevealedPlayers = computed(() => players.players.some((player, index) => {
  const id = player.id || player.role.id ? st.revealId(index) : '';
  return id && !reveal.value?.revealedUserIds.includes(id);
}));
const ready = computed(() => players.players.length >= (demo.active ? 5 : 1) && players.players.every(p => p.role.id));
const scriptChosen = computed(() => demo.active ? demo.scriptChosen : Boolean(script.currentGameScriptId));
const showWelcome = computed(() => !demo.active && level.value === 'prepare' && players.players.length === 0);
const phaseLabel = computed(() => level.value === 'prepare' ? '准备首个夜晚' : level.value === 'night' ? `第 ${levelDays.value} 夜` : level.value === 'day' ? `第 ${levelDays.value} 天` : '揭晓魔典');
const guidance = computed(() => {
  if (level.value === 'prepare') {
    if (!players.players.length || (demo.active && demo.setupStep === 'seats')) return { title: '集合玩家', text: '添加、打乱或拖动座位，准备好后选择剧本。', action: '调整座位', key: 'seats' };
    if (!scriptChosen.value) return { title: '选择剧本', text: '选择官方剧本，或导入自定义剧本。', action: '选择剧本', key: 'script' };
    if (!ready.value) return { title: '为玩家选择角色', text: '按阵营核对角色数量，再随机分配给每个座位。', action: '选择角色', key: 'roles' };
    return { title: '准备首个夜晚', text: '添加需要的提示标记，并在左侧「伪装」中选择三个不在场的善良角色。', action: '开始首夜阶段', key: 'phase' };
  }
  if (level.value === 'night') return { title: phaseLabel.value, text: demo.active ? '点击角色圆片，选择「唤醒」预览提示。右侧可查看夜间顺序。' : '按右侧夜间顺序唤醒玩家，发送提示并确认夜间影响。', action: '返回白天阶段', key: 'phase' };
  return { title: phaseLabel.value, text: '为讨论设置计时器；对局结束后，由你决定身份和结果的揭晓节奏。', action: '设定计时器', key: 'timer' };
});
async function advance() {
  await st.perform(async () => {
    if (demo.active) demo.advance();
    else await useGameController().changeLevel({ nextLevel: level.value === 'night' ? 'day' : 'night' });
  });
}
function guideAction() {
  if (guidance.value.key === 'seats') editor.show();
  else if (guidance.value.key === 'script') app.toggleModal('edition');
  else if (guidance.value.key === 'roles') app.toggleModal('roles');
  else if (guidance.value.key === 'timer') ui.timerOpen = true;
  else void advance();
}
async function confirmTimer() {
  await st.setTimer({ action: 'start', durationSeconds: Math.round(Number(minutes.value) * 60), title: title.value, blockNominations: false });
}
async function confirmTeamWin(winningTeam: 'good' | 'evil') {
  await st.end({ isComplete: true, result: 'team-win', winningTeam });
}
async function confirmPlayerWin() {
  if (!selectedWinner.value) return;
  await st.end({ isComplete: true, result: 'character-win', winningPlayerIds: [selectedWinner.value.id] });
}
watch(() => ui.endOpen, open => { if (open) { choosingWinner.value = false; winningPlayerId.value = ''; ui.error = ''; } });
watch(() => ui.timerOpen, open => { if (open) title.value = timer.value?.title || ''; });
const banner = ref(false);
const bannerElapsed = ref(0);
let bannerTimeout: ReturnType<typeof setTimeout> | undefined;
const victory = computed(() => result.value?.winningTeam === 'evil' || ['minion', 'demon'].includes(result.value?.winningTeam || '') ? '邪恶' : result.value?.winningTeam === 'good' || ['townsfolk', 'outsider'].includes(result.value?.winningTeam || '') ? '善良' : '特殊胜利');
const individualWinner = computed(() => result.value?.result !== 'team-win' && result.value?.winningPlayerIds?.length === 1
  ? winnerOptions.value.find(player => player.id === result.value?.winningPlayerIds?.[0]) : undefined);
const victoryTitle = computed(() => individualWinner.value ? '单独获胜' : victory.value);
watch(() => [reveal.value?.id, reveal.value?.resultPublished] as const, (next, previous) => {
  if (next[0] === previous?.[0] && next[1] && previous?.[1]) return;
  if (bannerTimeout) clearTimeout(bannerTimeout);
  if (!next[0] || !next[1]) { banner.value = false; return; }
  const remainingMs = Math.max(0, (reveal.value?.nextGameAt ?? Date.now() + RESULT_REVEAL_DURATION_MS) - Date.now());
  bannerElapsed.value = Math.max(0, RESULT_REVEAL_DURATION_MS - remainingMs);
  banner.value = remainingMs > 500;
  if (!banner.value) return;
  playChime('toll', { muted: app.grimoire.isMuted, volume: app.grimoire.soundVolume });
  // Leave 500 ms for the victory transition before the room prepares its next game.
  bannerTimeout = setTimeout(() => { banner.value = false; }, remainingMs - 500);
}, { immediate: true });
watch(level, (next, previous) => {
  if (next === 'prepare' && previous === 'end') ui.$reset();
});
const expiredNotices = new Set<string>();
watch(() => [timer.value?.id, timer.value?.status, remaining.value] as const, ([id, status, left], previous) => {
  if (!id || left > 0 || status === 'stopped' || !previous?.[0] || expiredNotices.has(id)) return;
  expiredNotices.add(id);
  window.$toast?.info(`${timer.value?.title || '计时器'}：时间到。`);
  playChime('turn', { muted: app.grimoire.isMuted, volume: app.grimoire.soundVolume });
});
</script>

<template>
  <section v-if="!obstructed" class="storyteller-stage" :class="{ 'has-reveal': reveal }" aria-label="说书人主持步骤">
    <div v-if="displayTimer && !reveal" class="storyteller-clock" :class="{ urgent: remaining < 60, paused: timer?.status === 'paused' }" role="timer" aria-live="off" :aria-label="`${timer?.title} ${timeLabel}`">
      <small>{{ timer?.title }}</small><strong>⌛ {{ timeLabel }}</strong>
      <span v-if="timer?.status === 'paused'">已暂停</span><span v-else-if="remaining === 0">时间到</span>
      <div v-if="isHost" class="stage-actions">
        <button v-if="remaining > 0" type="button" :disabled="ui.pending || !available" @click="st.setTimer({ action: timer?.status === 'paused' ? 'resume' : 'pause' })">{{ timer?.status === 'paused' ? '继续' : '暂停' }}</button>
        <button type="button" :disabled="ui.pending || !available" @click="st.setTimer({ action: 'stop' })">停止</button>
      </div>
    </div>
    <div v-if="reveal && isHost && ui.revealOpen" class="stage-card stage-reveal">
      <strong>揭晓魔典</strong><p>{{ reveal.resultPublished ? '结果动画结束后，将在本房间自动准备下一局。' : '您可以通过点击玩家标记来揭晓玩家的角色。在玩家标记上悬停鼠标或长按，可预览他们的角色。' }}</p>
      <div class="stage-actions">
        <button type="button" class="gold" :disabled="ui.pending || !available || reveal.resultPublished" @click="st.publish()">揭示游戏结果</button>
        <button type="button" class="purple" :disabled="ui.pending || !available || !hasUnrevealedPlayers" @click="st.revealPlayers()">揭晓剩余玩家</button>
        <button type="button" @click="ui.revealOpen = false">收起</button>
      </div>
    </div>
    <div v-else-if="reveal && isHost" class="stage-actions">
      <button type="button" @click="ui.revealOpen = true">继续揭晓</button>
    </div>
    <div v-else-if="!displayTimer && isHost && showWelcome" class="stage-card stage-welcome">
      <p>欢迎来到<span>染·钟楼谜团在线魔典</span>。<br />开始游戏前您需要做的第一件事情是：</p>
      <button type="button" :disabled="ui.pending || !available" @click="editor.show()"><b aria-hidden="true">1</b> 召集玩家</button>
    </div>
    <div v-else-if="!displayTimer && isHost && app.grimoire.showTutorial && level !== 'end'" class="stage-card stage-guide">
      <button type="button" class="stage-dismiss" aria-label="隐藏教学步骤" @click="app.grimoire.showTutorial = false">×</button>
      <strong>{{ guidance.title }}</strong><p>{{ guidance.text }}</p>
      <button type="button" class="gold" :disabled="ui.pending || !available" @click="guideAction">{{ guidance.action }}</button>
    </div>
    <p v-if="ui.error" class="stage-error" role="alert">{{ ui.error }}</p>
  </section>
  <Transition name="victory">
    <div v-if="banner && result" class="storyteller-victory" :class="[victory === '邪恶' ? 'evil' : victory === '善良' ? 'good' : 'special', { 'is-hosting': isHost && ui.revealOpen }]"
      :style="{ '--victory-elapsed': `${-bannerElapsed}ms`, '--victory-duration': `${RESULT_REVEAL_DURATION_MS}ms` }" role="status" aria-live="polite">
      <div class="victory-announcement">
        <div class="victory-glow" aria-hidden="true"></div>
        <div class="victory-words"><strong>{{ victoryTitle }}</strong><span>{{ individualWinner ? `${individualWinner.label} 获胜！` : '获胜！' }}</span></div>
      </div>
    </div>
  </Transition>
  <Modal v-if="ui.timerOpen && isHost" name="storyteller-timer" title="设定计时器" :close-on-backdrop="!ui.pending" @close="ui.timerOpen = false">
    <form class="storyteller-form" @submit.prevent="confirmTimer">
      <label>时长（分钟）<input v-model.number="minutes" type="number" min="0.0167" max="1440" step="any" required /></label>
      <label>计时器标题（可选）<input v-model="title" maxlength="80" placeholder="自由讨论" /></label>
      <p v-if="ui.error" role="alert">{{ ui.error }}</p>
      <button type="submit" :disabled="ui.pending || !available">{{ ui.pending ? '正在设置…' : '开始' }}</button>
    </form>
  </Modal>
  <Modal v-if="ui.endOpen && isHost" name="storyteller-end" title="揭晓魔典" :show-close="false" :close-on-backdrop="!ui.pending" @close="ui.endOpen = false">
    <form class="reveal-verdict" :aria-busy="ui.pending" @submit.prevent="confirmPlayerWin">
      <p class="reveal-warning">警告：这么做将会结束这场游戏并且把魔典揭示给所有玩家看！</p>
      <template v-if="!choosingWinner">
        <p class="reveal-question">谁赢得了本场游戏？</p>
        <div class="reveal-verdict-actions">
          <button type="button" class="verdict-button verdict-good" :disabled="ui.pending || !available" @click="confirmTeamWin('good')"><font-awesome-icon icon="thumbs-up" aria-hidden="true" />善良阵营获胜</button>
          <button type="button" class="verdict-button verdict-evil" :disabled="ui.pending || !available" @click="confirmTeamWin('evil')"><font-awesome-icon icon="thumbs-down" aria-hidden="true" />邪恶阵营获胜</button>
          <button type="button" class="verdict-button verdict-player" :disabled="ui.pending || !available || !winnerOptions.length" @click="choosingWinner = true"><font-awesome-icon icon="user" aria-hidden="true" />玩家单独获胜</button>
          <button type="button" class="verdict-button verdict-cancel" :disabled="ui.pending" @click="ui.endOpen = false"><font-awesome-icon icon="circle-xmark" aria-hidden="true" />取消</button>
        </div>
      </template>
      <template v-else>
        <fieldset class="reveal-player-picker" :disabled="ui.pending">
          <legend>选择单独获胜的玩家</legend>
          <div class="reveal-player-list">
            <label v-for="player in winnerOptions" :key="player.id" class="reveal-player-option" :class="{ selected: winningPlayerId === player.id }">
              <input v-model="winningPlayerId" type="radio" name="reveal-winning-player" :value="player.id" required />
              <span>{{ player.label }}</span>
            </label>
          </div>
        </fieldset>
        <div class="reveal-verdict-actions reveal-player-actions">
          <button type="submit" class="verdict-button verdict-good" :disabled="ui.pending || !available || !selectedWinner"><font-awesome-icon icon="check" aria-hidden="true" />{{ ui.pending ? '正在确认…' : '确认单独获胜' }}</button>
          <button type="button" class="verdict-button verdict-cancel" :disabled="ui.pending" @click="choosingWinner = false"><font-awesome-icon icon="circle-arrow-left" aria-hidden="true" />返回</button>
          <button type="button" class="verdict-button verdict-cancel" :disabled="ui.pending" @click="ui.endOpen = false">取消</button>
        </div>
      </template>
      <p v-if="ui.pending" class="reveal-feedback" role="status">正在确认游戏结果…</p>
      <p v-if="ui.error" class="reveal-feedback reveal-error" role="alert">{{ ui.error }}</p>
    </form>
  </Modal>
</template>

<style scoped lang="scss">
:global(.modal-backdrop.modal-backdrop--storyteller-end) { padding: 12px; background: #0003; backdrop-filter: none; align-items: center; }
:global(.modal-backdrop--storyteller-end .modal.storyteller-end) { width: min(820px, 100%); max-height: calc(100dvh - 24px); margin: 0; border: 3px solid #050407; border-radius: 10px; background: #09080ed9; box-shadow: 0 4px 20px #0006; color: #fff; font-family: var(--ts-font-ui, sans-serif); }
:global(.modal.storyteller-end::before), :global(.modal.storyteller-end::after), :global(.modal.storyteller-end > .modal-ornament) { display: none; }
:global(.modal.storyteller-end > .modal-heading) { padding: 4px 12px 6px; border-bottom: 2px solid #050407; background: #0003; text-align: center; }
:global(.modal.storyteller-end .modal-title) { color: #fff; font: 700 22px/1.3 var(--ts-font-ui, sans-serif); letter-spacing: 0; }
:global(.modal.storyteller-end > .slot) { padding: 8px 10px 16px; }
.reveal-verdict { text-align: center; color: #fff; font-size: 22px; font-weight: 700; line-height: 1.45; text-shadow: 0 1px 3px #000; }
.reveal-warning, .reveal-question { margin: 0; }
.reveal-verdict-actions { display: flex; justify-content: center; margin-top: 12px; }
.verdict-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 3px 11px; border: 2px solid #25222c; border-radius: 0; background: linear-gradient(#737373, #3c3c3c 48%, #181818 52%, #080808); color: #fff; box-shadow: inset 0 2px 3px #ffffff65, inset 0 -2px 3px #0008, 0 2px 4px #0009; font: inherit; line-height: 1.3; text-shadow: 0 1px 3px #0008; white-space: nowrap; cursor: pointer; }
.verdict-button:first-child { border-radius: 16px 0 0 16px; }
.verdict-button:last-child { border-radius: 0 16px 16px 0; }
.verdict-good { background: linear-gradient(#eac560, #bb8c23 48%, #a16e08 52%, #6b4306); border-color: #856018; }
.verdict-evil { background: linear-gradient(#b68bdb, #8953b3 48%, #69318f 52%, #42175f); border-color: #5d3779; }
.verdict-player { background: linear-gradient(#7e9ba9, #4c7082 48%, #345468 52%, #1c3240); border-color: #36515f; }
.verdict-button:hover:enabled { filter: brightness(1.18); }
.verdict-button:active:enabled { box-shadow: inset 0 2px 5px #0008; }
.reveal-player-picker { min-width: 0; margin: 10px 0 0; padding: 0; border: 0; }
.reveal-player-picker legend { width: 100%; margin-bottom: 10px; padding: 0; }
.reveal-player-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: min(36dvh, 280px); overflow-y: auto; padding: 3px; text-align: left; }
.reveal-player-option { display: flex; align-items: center; gap: 10px; min-width: 0; min-height: 44px; padding: 7px 12px; border: 1px solid #65606b; border-radius: 5px; background: #ffffff0a; font-size: 18px; cursor: pointer; }
.reveal-player-option.selected { border-color: #e7be58; background: #a374242e; }
.reveal-player-option:focus-within { outline: 2px solid #ffe193; outline-offset: 1px; }
.reveal-player-option input { flex: 0 0 auto; width: 18px; height: 18px; margin: 0; accent-color: #d8ac43; }
.reveal-player-option span { overflow-wrap: anywhere; }
.reveal-feedback { margin: 10px 0 0; font-size: 16px; }
.reveal-error { color: #ffb2a4; }
@media (max-width: 700px) {
  .reveal-verdict { font-size: 18px; }
  .reveal-warning { font-size: 16px; }
  .reveal-verdict-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .reveal-verdict-actions .verdict-button { min-width: 0; padding: 6px; border-radius: 8px; }
  .reveal-player-actions .verdict-good { grid-column: 1 / -1; }
  .reveal-player-option { padding: 7px; font-size: 16px; gap: 7px; }
}
.storyteller-stage { position: absolute; z-index: 34; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, 40%); display: grid; justify-items: center; gap: 10px; color: #f6eddf; text-align: center; font: 14px/1.5 var(--ts-font-ui, sans-serif); }
.stage-card { position: relative; width: 100%; padding: 12px; border: 2px solid #100d12; border-radius: 6px; background: #100d13ed; box-shadow: 0 5px 22px #0006; }
.stage-card strong { font-size: 16px; } .stage-card p { margin: 4px 0 10px; }
.stage-reveal { width: min(380px, 130%); padding: 0 0 8px; border: 3px solid #050407; border-radius: 8px; background: #09080ee8; color: #fff; text-shadow: 0 1px 2px #000; }
.stage-reveal > strong { display: block; padding: 3px 6px; border-bottom: 2px solid #050407; font-size: 13px; }
.stage-reveal > p { margin: 6px 9px 9px; font-size: 13px; line-height: 1.4; }
.stage-reveal .stage-actions { gap: 0; padding: 0 5px; }
.storyteller-stage .stage-reveal button { min-height: 30px; padding: 3px 6px; border: 1px solid #37313c; border-radius: 0; background: linear-gradient(#707070, #3a3a3a 48%, #1b1b1b 52%, #080808); box-shadow: inset 0 1px 2px #fff6; color: #fff; font-size: 12px; font-weight: bold; }
.storyteller-stage .stage-reveal button:first-child { border-radius: 10px 0 0 10px; }
.storyteller-stage .stage-reveal button:last-child { border-radius: 0 10px 10px 0; }
.storyteller-stage .stage-reveal button.gold { background: linear-gradient(#e8c166, #bb8c23 48%, #9d6b0a 52%, #6b4306); border-color: #856018; }
.storyteller-stage .stage-reveal button.purple { background: linear-gradient(#b68bdb, #8953b3 48%, #69318f 52%, #42175f); border-color: #5d3779; }
.stage-welcome { box-sizing: border-box; width: min(260px, 100%); padding: 8px 12px 12px; background: #050407ed; font-size: 18px; font-weight: bold; }
.stage-welcome p { margin: 0 0 10px; } .stage-welcome p span { color: #b17cde; }
.storyteller-stage .stage-welcome button { width: 100%; padding: 2px 8px; border: 2px solid #484848; border-radius: 14px; background: linear-gradient(#606060, #272727 55%, #080808); box-shadow: inset 0 1px 2px #ffffff70, 0 2px 4px #000; color: #fff; font-weight: bold; }
.stage-welcome b { display: inline-block; padding: 0 4px; border-radius: 2px; background: #fff; color: #111; line-height: 1.1; font-weight: normal; }
.storyteller-stage button { color: #f7eedd; background: linear-gradient(#4a3c50, #1b1422); border: 1px solid #705779; border-radius: 4px; padding: 5px 8px; font: inherit; cursor: pointer; }
.storyteller-stage button.gold { color: #ffe193; border-color: #97752c; background: linear-gradient(#9e7c36, #463312); }
button:disabled { opacity: .45; cursor: default; } button:focus-visible { outline: 2px solid #ffe193; outline-offset: 3px; }
.stage-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; }
.stage-dismiss { position: absolute; top: 1px; right: 2px; padding: 0 5px !important; background: transparent !important; border: 0 !important; }
.storyteller-clock { display: grid; gap: 2px; padding: 8px 16px; background: #08070ced; border: 1px solid #867044; border-radius: 5px; } .storyteller-clock small { color: #eac35b; } .storyteller-clock strong { font-size: clamp(22px, 3vmin, 42px); line-height: 1.2; } .storyteller-clock.urgent strong { color: #fa786c; } .storyteller-clock.paused strong { color: #b8a5cd; }
.stage-wait { padding: 6px 10px; background: #100d13e8; border-radius: 5px; } .stage-error { background: #230e12; color: #ffb2a4; }
.storyteller-form { display: grid; gap: 16px; color: #f7eddf; } .storyteller-form label { display: grid; gap: 6px; } .storyteller-form input, .storyteller-form select { min-height: 42px; padding: 6px 10px; color: #fff5df; background: #19131f; border: 1px solid #80683b; border-radius: 4px; font: inherit; } .storyteller-form .stage-check { display: flex; align-items: center; gap: 8px; } .stage-check input { width: 18px; min-height: 18px; } .storyteller-form button { min-height: 44px; color: #fff0c2; background: #725323; border: 1px solid #c99f51; border-radius: 4px; font: inherit; cursor: pointer; }
.storyteller-victory { --victory-color: #31a9ee; --victory-halo: #087dc9; pointer-events: none; position: absolute; z-index: 36; inset: 0; color: var(--victory-color); text-align: center; }
.storyteller-victory.evil { --victory-color: #f14b38; --victory-halo: #c52c16; }
.storyteller-victory.special { --victory-color: #edc45d; --victory-halo: #c78c19; }
.victory-announcement { position: absolute; left: 50%; top: 50%; width: 90%; transform: translate(-50%, -50%); }
.is-hosting .victory-announcement { top: 31%; }
.victory-glow { position: absolute; left: 50%; top: 50%; width: 42%; aspect-ratio: 1.5; border-radius: 50%; background: radial-gradient(ellipse, var(--victory-halo) 0%, transparent 68%); filter: blur(12px); transform: translate(-50%, -50%); animation: ts-verdict-glow var(--victory-duration) ease-out var(--victory-elapsed) both; }
.victory-words { position: relative; display: grid; justify-items: center; gap: 0; animation: ts-verdict-words var(--victory-duration) cubic-bezier(.2, .7, .2, 1) var(--victory-elapsed) both; }
.victory-words strong { font: 900 clamp(48px, 10vmin, 110px)/1.1 var(--ts-font-ui, sans-serif); letter-spacing: .05em; text-shadow: 0 3px 2px #0009, 0 0 16px var(--victory-halo); }
.victory-words span { max-width: 100%; margin-top: 5px; color: #fff; font: 700 clamp(14px, 2.2vmin, 24px)/1.4 var(--ts-font-ui, sans-serif); text-shadow: 0 2px 3px #000; overflow-wrap: anywhere; }
.victory-leave-active { transition: opacity .5s; } .victory-leave-to { opacity: 0; }
@media(max-width: 600px), (max-width: 900px) and (max-height: 560px) and (orientation: landscape) { .storyteller-stage { width: 46%; font-size: 10px; gap: 5px; } .stage-card { padding: 6px; } .stage-card strong { font-size: 12px; } .stage-card p { margin: 3px 0 5px; } .storyteller-stage button { padding: 5px 4px; min-height: 28px; } .storyteller-clock { padding: 4px 8px; } }
@media(max-width: 600px), (max-width: 900px) and (max-height: 560px) and (orientation: landscape) { .stage-welcome { font-size: 12px; } }
@media(max-width: 600px), (max-width: 900px) and (max-height: 560px) and (orientation: landscape) { .stage-reveal > p { font-size: 10px; margin: 5px; } .storyteller-stage .stage-reveal button { min-height: 26px; font-size: 10px; } }
@media(max-width: 900px) and (max-height: 560px) and (orientation: landscape) { .is-hosting .victory-announcement { top: 50%; } }
:global(.ts-reduce-motion) .victory-glow { animation: none; opacity: .35; }
:global(.ts-reduce-motion) .victory-words { animation: none; }
:global(.ts-reduce-motion) .victory-leave-active { transition: none; }
@media(prefers-reduced-motion: reduce) { .victory-glow { animation: none; opacity: .35; } .victory-words { animation: none; } .victory-leave-active { transition: none; } }
</style>
