<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDraggablePanel } from "@/composables/useDraggablePanel";
import { useGameController } from "@/controllers/GameController";
import { useGameStore } from "@/stores/game";
import { usePlayersStore } from "@/stores/players";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { SocketClientEvent, type ClientDMTestPlayersMessage, type ServerBaseMessage, type ServerDMElectionUpdateMessage, type TestPlayerChatChannel } from "@/types/socket";

const game = useGameStore();
const players = usePlayersStore();
const controller = useGameController();
const vote = useRealtimeVoteStore();
const panel = ref<HTMLElement | null>(null);
const grip = ref<HTMLElement | null>(null);
useDraggablePanel("test-players", panel, grip, grip);
const expanded = ref(false);
const pending = ref(false);
const seat = ref(1);
const name = ref("");
const error = ref("");
const message = ref("");
const actorId = ref("");
const channel = ref<TestPlayerChatChannel>("public");
const targetId = ref("");
const text = ref("");
const history = ref<ServerBaseMessage[]>([]);
const election = ref<ServerDMElectionUpdateMessage | null>(null);
const inspectionError = ref("");
const inspecting = ref(false);
let inspectionGeneration = 0;
let poll: ReturnType<typeof setInterval> | undefined;
const seats = computed(() => players.players.map((player, index) => ({
  number: index + 1, occupied: Boolean(player.id), name: player.name,
})));
const testPlayers = computed(() => Object.values(game.players)
  .filter(player => player.extras?.isTestPlayer === true)
  .sort((a, b) => a.seat - b.seat));
const blockedReason = computed(() => {
  if (!game.currentIsDm) return "只有说书人可以使用测试面板。";
  if (!controller.isConnected) return "连接恢复后即可操作虚拟玩家。";
  return "";
});
const canOperate = computed(() => !pending.value && !blockedReason.value);
const canEdit = computed(() => canOperate.value && game.level === "prepare");
const canAdd = computed(() => canEdit.value && seats.value.some(item => item.number === seat.value && !item.occupied));
const actor = computed(() => testPlayers.value.find(player => player.userId === actorId.value));
const canAct = computed(() => canOperate.value && Boolean(actor.value));
const handRaised = computed(() => Boolean(game.handSignals[actorId.value]));
const neighbors = computed(() => {
  const seats = players.players;
  const index = seats.findIndex(player => player.id === actorId.value);
  if (index < 0 || seats.length < 2) return [];
  return [...new Set([seats[(index - 1 + seats.length) % seats.length], seats[(index + 1) % seats.length]])]
    .filter(player => player.id && player.id !== actorId.value);
});
const canSend = computed(() => canAct.value && Boolean(text.value.trim()) && (channel.value !== "whisper" || Boolean(targetId.value)));
const canVote = computed(() => canAct.value && vote.isActive && !vote.paused
  && vote.currentVoterUserId === actorId.value && Boolean(vote.nominationId)
  && (actor.value?.isAlive || (actor.value?.voteChancesAfterDeath ?? 0) > 0));
const voteStatus = computed(() => {
  if (!vote.isActive) return "当前没有进行中的投票";
  if (vote.paused) return "投票已暂停";
  return vote.currentVoterUserId === actorId.value ? "轮到该虚拟玩家投票" : `等待 ${displayName(vote.currentVoterUserId || "")} 投票`;
});
function displayName(userId: string): string {
  return players.players.find(player => player.id === userId)?.name || game.roomUsers[userId]?.displayName || (userId ? "房间玩家" : "下一位玩家");
}
function messageText(item: ServerBaseMessage): string {
  return item.content.map(part => part.type === "text" ? part.text : part.type === "character" ? `[角色：${part.characterId}]` : "[消息附件]").join(" ");
}
watch(seats, (items) => {
  if (!items.some(item => item.number === seat.value && !item.occupied)) {
    seat.value = items.find(item => !item.occupied)?.number ?? 0;
  }
}, { immediate: true });
watch(testPlayers, items => {
  if (!items.some(player => player.userId === actorId.value)) actorId.value = items[0]?.userId || "";
}, { immediate: true });
watch(neighbors, items => {
  if (!items.some(player => player.id === targetId.value)) targetId.value = items[0]?.id || "";
}, { immediate: true });

async function inspect() {
  if (!expanded.value || !actor.value || blockedReason.value || inspecting.value) return;
  const generation = inspectionGeneration;
  inspecting.value = true;
  try {
    const response = await controller.request(SocketClientEvent.DMTestPlayers, {
      action: "inspect", userId: actorId.value,
      channel: channel.value === "whisper" && !targetId.value ? "public" : channel.value,
      ...(channel.value === "whisper" && targetId.value ? { toUserId: targetId.value } : {}),
    });
    if (generation !== inspectionGeneration) return;
    history.value = channel.value === "whisper" && !targetId.value ? [] : response.data?.messages || [];
    election.value = response.data?.election || null;
    inspectionError.value = "";
  } catch (cause) {
    if (generation === inspectionGeneration) inspectionError.value = cause instanceof Error ? cause.message : "读取玩家状态失败";
  } finally {
    inspecting.value = false;
    if (generation !== inspectionGeneration) void inspect();
  }
}
watch([actorId, channel, targetId, expanded, () => controller.isConnected], () => {
  inspectionGeneration++;
  history.value = [];
  election.value = null;
  inspectionError.value = "";
  void inspect();
});
onMounted(() => { poll = setInterval(() => { if (!pending.value) void inspect(); }, 3000); });
onBeforeUnmount(() => { expanded.value = false; inspectionGeneration++; clearInterval(poll); });

async function run(payload: ClientDMTestPlayersMessage) {
  const changesSeats = payload.action === "add" || payload.action === "remove" || payload.action === "clear";
  if (!canOperate.value || (changesSeats && !canEdit.value) || (payload.action === "add" && !canAdd.value)) return;
  pending.value = true;
  error.value = "";
  message.value = "";
  try {
    await controller.request(SocketClientEvent.DMTestPlayers, payload);
    const feedback: Record<string, string> = { hand: "举手状态已更新", vote: "投票已提交", election: "说书人竞选投票已提交", message: "消息已发送" };
    message.value = payload.action === "add" ? `已在 ${payload.seat} 号位添加虚拟玩家` : feedback[payload.action] || "已移除虚拟玩家";
    if (payload.action === "add") name.value = "";
    if (payload.action === "message") text.value = "";
    await controller.refreshGameState();
    inspectionGeneration++;
    await inspect();
  } catch (cause) {
    error.value = cause instanceof Error
      ? cause.message.includes("Socket request timeout: dmTestPlayers")
        ? "测试功能未响应，请重启游戏服务后重试。"
        : cause.message
      : "操作失败，请重试";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section ref="panel" class="test-players" :class="{ 'test-players--open': expanded }" aria-label="虚拟玩家测试面板"
    :aria-busy="pending" @keydown.stop @keyup.stop>
    <header>
      <span ref="grip" class="test-players__grip" tabindex="0" aria-label="移动测试面板" title="拖动移动；方向键微调；Home 恢复位置">⠿</span>
      <button class="test-players__toggle" type="button" :aria-expanded="expanded" aria-controls="test-player-controls" @click="expanded = !expanded">
        <span class="test-players__badge">TEST</span> 测试玩家 <small v-if="testPlayers.length">{{ testPlayers.length }}</small>
      </button>
      <button v-if="expanded" type="button" class="test-players__close" aria-label="收起测试面板" @click="expanded = false">−</button>
    </header>
    <div v-if="expanded" id="test-player-controls" class="test-players__body">
      <p class="test-players__hint">选择虚拟玩家，测试聊天、举手与投票。</p>
      <p v-if="blockedReason" class="test-players__hint" role="status">{{ blockedReason }}</p>
      <details class="test-players__seats" :open="!testPlayers.length">
      <summary>添加与管理座位 · {{ testPlayers.length }} 名虚拟玩家</summary>
      <p v-if="game.level !== 'prepare'" class="test-players__hint">添加与移除仅限准备阶段，下方玩家操作仍可使用。</p>
      <form @submit.prevent="run({ action: 'add', seat, name: name.trim() })">
        <label for="test-player-seat">座位号</label>
        <select id="test-player-seat" v-model.number="seat" :disabled="!canEdit">
          <option v-if="seat === 0" :value="0" disabled>暂无空座位</option>
          <option v-for="item in seats" :key="item.number" :value="item.number" :disabled="item.occupied">
            {{ item.number }} 号位{{ item.occupied ? ` · ${item.name || '已占用'}` : ' · 空位' }}
          </option>
        </select>
        <label for="test-player-name">玩家昵称 <small>选填</small></label>
        <input id="test-player-name" v-model="name" maxlength="24" :placeholder="`虚拟玩家 ${seat || ''}`" :disabled="!canEdit" autocomplete="off" />
        <button class="test-players__add" type="submit" :disabled="!canAdd">{{ pending ? '处理中…' : '添加虚拟玩家' }}</button>
      </form>
      <p v-if="seat === 0" class="test-players__hint">空位已满，可在「集合玩家」中添加座位。</p>
      <div v-if="testPlayers.length" class="test-players__list">
        <div v-for="player in testPlayers" :key="player.userId" class="test-players__item">
          <span>{{ player.seat }} 号 · {{ player.extras?.testPlayerName }}</span>
          <button type="button" :disabled="!canEdit" :aria-label="`移除 ${player.seat} 号位虚拟玩家`" @click="run({ action: 'remove', userId: player.userId })">移除</button>
        </div>
      </div>
      <button v-if="testPlayers.length" type="button" class="test-players__clear" :disabled="!canEdit" @click="run({ action: 'clear' })">清除全部虚拟玩家</button>
      </details>
      <div v-if="testPlayers.length" class="test-players__actions">
        <label for="test-player-actor">当前操作的虚拟玩家</label>
        <select id="test-player-actor" v-model="actorId" :disabled="pending">
          <option v-for="player in testPlayers" :key="player.userId" :value="player.userId">{{ player.seat }} 号 · {{ player.extras?.testPlayerName }}</option>
        </select>
        <div class="test-players__section">
          <strong>举手</strong>
          <button type="button" :disabled="!canAct" :aria-pressed="handRaised" @click="run({ action: 'hand', userId: actorId, icon: handRaised ? null : '✋' })">{{ handRaised ? '放下手' : '✋ 举手' }}</button>
        </div>
        <div class="test-players__section test-players__section--stack">
          <strong>游戏投票</strong>
          <p role="status">{{ voteStatus }}</p>
          <div class="test-players__buttons">
            <button v-for="choice in ([['yes', '赞成'], ['no', '反对'], ['abstain', '弃权']] as const)" :key="choice[0]" type="button" :disabled="!canVote"
              @click="run({ action: 'vote', userId: actorId, vote: choice[0], nominationId: vote.nominationId! })">{{ choice[1] }}</button>
          </div>
        </div>
        <div class="test-players__section test-players__section--stack">
          <strong>给说书人投票</strong>
          <p v-if="election">{{ displayName(election.applicantUserId) }} · {{ election.voteCount }} / {{ election.requiredVoteCount }} 票{{ election.hasVoted ? ' · 已支持' : '' }}</p>
          <p v-else>当前没有说书人竞选</p>
          <button type="button" :disabled="!canAct || !election || election.hasVoted" @click="run({ action: 'election', userId: actorId, accept: true, applicantUserId: election!.applicantUserId })">支持该说书人</button>
        </div>
        <form class="test-players__chat" @submit.prevent="canSend && run({ action: 'message', userId: actorId, channel, text: text.trim(), ...(channel === 'whisper' ? { toUserId: targetId } : {}) })">
          <label for="test-player-channel">发消息 / 查看记录</label>
          <select id="test-player-channel" v-model="channel" :disabled="pending">
            <option value="public">公共频道</option>
            <option value="whisper">邻座悄悄话（含虚拟玩家）</option>
            <option value="dm_chat">说书人私聊</option>
            <option value="dm_skill">说书人技能消息</option>
          </select>
          <template v-if="channel === 'whisper'">
            <label for="test-player-target">收信玩家</label>
            <select id="test-player-target" v-model="targetId" :disabled="pending || !neighbors.length">
              <option v-if="!neighbors.length" value="">暂无邻座玩家</option>
              <option v-for="player in neighbors" :key="player.id" :value="player.id">{{ players.players.findIndex(item => item.id === player.id) + 1 }} 号 · {{ player.name }}</option>
            </select>
          </template>
          <div class="test-players__history" aria-label="虚拟玩家聊天记录" :aria-busy="inspecting">
            <p v-if="!history.length">暂无消息</p>
            <article v-for="item in history" :key="item.messageId">
              <small>{{ item.senderUserId === actorId ? '我' : displayName(item.senderUserId) }}{{ item.isDM ? '（说书人）' : '' }}</small>
              <p>{{ messageText(item) }}</p>
            </article>
          </div>
          <p v-if="inspectionError" class="test-players__error" role="alert">{{ inspectionError }}</p>
          <button type="button" :disabled="!canAct || inspecting" @click="inspect">刷新消息与竞选状态</button>
          <label for="test-player-message">消息内容</label>
          <textarea id="test-player-message" v-model="text" rows="2" maxlength="500" :disabled="!canAct" placeholder="以当前虚拟玩家身份发送…"></textarea>
          <button class="test-players__send" type="submit" :disabled="!canSend">发送消息</button>
        </form>
      </div>
      <p v-if="error" class="test-players__error" role="alert">{{ error }}</p>
      <p v-else-if="message" class="test-players__feedback" role="status">{{ message }}</p>
      <footer>开发测试专用 · 虚拟玩家不会自动操作</footer>
    </div>
  </section>
</template>

<style scoped lang="scss">
.test-players {
  position: fixed; right: 20px; bottom: 90px; z-index: 120;
  max-width: calc(100vw - 24px); color: #f3eee5;
  border: 1px solid #897346; border-radius: 12px;
  background: #211d29f5; box-shadow: 0 8px 30px #0006;
  font: 13px/1.5 var(--ts-font-body, sans-serif); text-align: left;
  header { display: flex; align-items: center; min-height: 42px; padding: 0 8px; }
  button, input, select, textarea { font: inherit; }
  button { cursor: pointer; color: inherit; }
  button:disabled, input:disabled, select:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid #efca7b; outline-offset: 3px; }
  &--open { width: 320px; }
  &__grip { padding: 8px 4px; color: #bbaa8b; cursor: grab; touch-action: none; }
  &__toggle { flex: 1; display: flex; align-items: center; gap: 8px; padding: 6px; border: 0; background: transparent; text-align: left; }
  &__badge { color: #e7c984; font: 10px/1.5 monospace; letter-spacing: 1px; }
  &__toggle small { color: #e7c984; }
  &__close { border: 0; background: transparent; padding: 4px 10px; font-size: 20px !important; }
  &__body { padding: 0 14px 12px; max-height: calc(100dvh - 180px); overflow-y: auto; }
  &__hint { color: #c2b8ca; margin: 0 0 12px; font-size: 12px; }
  form { display: grid; gap: 6px; }
  label small { color: #a79eaf; }
  input, select, textarea { width: 100%; min-height: 36px; padding: 6px 9px; box-sizing: border-box; color: #f3eee5; border: 1px solid #605368; border-radius: 6px; background: #16121e; }
  textarea { resize: vertical; }
  summary { cursor: pointer; padding: 6px 0 12px; color: #e7c984; }
  &__actions { display: grid; gap: 8px; margin-top: 12px; }
  &__section { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 10px; border-top: 1px solid #493e50; }
  &__section--stack { display: grid; gap: 6px; }
  &__section p { margin: 0; color: #c2b8ca; font-size: 12px; }
  &__buttons { display: flex; gap: 6px; }
  &__buttons button { flex: 1; }
  &__actions button { min-height: 32px; padding: 4px 10px; border: 1px solid #605368; border-radius: 6px; background: #302637; }
  &__chat { padding-top: 10px; border-top: 1px solid #493e50; }
  &__history { min-height: 48px; max-height: 160px; overflow-y: auto; padding: 8px; background: #16121e; border-radius: 6px; }
  &__history p { margin: 2px 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
  &__history small { color: #e7c984; }
  &__actions .test-players__send { border-color: #ad8b44; background: #685124; }
  input { margin-bottom: 5px; }
  &__add { min-height: 38px; margin: 4px 0 12px; border: 1px solid #ad8b44; border-radius: 6px; background: #685124; }
  &__list { display: grid; gap: 7px; padding-top: 8px; border-top: 1px solid #493e50; }
  &__item { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  &__item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__item button { flex-shrink: 0; padding: 3px 7px; border: 1px solid #605368; border-radius: 4px; background: transparent; }
  &__clear { width: 100%; margin-top: 12px; padding: 6px; border: 1px solid #605368; border-radius: 6px; background: transparent; }
  &__error { color: #ffa8a8; margin: 8px 0; }
  &__feedback { color: #b9dfad; margin: 8px 0; }
  footer { margin-top: 8px; font-size: 10px; color: #a79eaf; }
}
@media (max-width: 900px) {
  // Desktop drag positions must not push the controls outside a phone viewport.
  .test-players { left: auto !important; top: auto !important; right: 12px !important; bottom: 70px !important; }
  .test-players__body { max-height: calc(100dvh - 140px); }
}
</style>
