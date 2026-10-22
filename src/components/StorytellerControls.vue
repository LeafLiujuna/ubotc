<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useGameController } from "@/controllers/GameController";
import { useGameScriptStore } from "@/stores/gameScript";
import { useGameStore } from "@/stores/game";
import type { GameConfig } from "@/types";
import { resolveTeamPlayerCount } from "@/utils/teamPlayerCount";
import Modal from "@/components/modals/Modal.vue";

type DialogName = "random" | "config" | "invite" | "end" | null;

const gameController = useGameController();
const gameStore = useGameStore();
const gameScriptStore = useGameScriptStore();

const activeDialog = ref<DialogName>(null);
const pendingAction = ref<Exclude<DialogName, null> | "share" | null>(null);
const feedback = ref("");
const actionError = ref("");
const inviteUserId = ref("");
const endResult = ref("team-win");
const winningTeam = ref("townsfolk");
const winningPlayerIds = ref<string[]>([]);
const selectedSetupCharacterIds = ref<string[]>([]);

const supportedSetupRules: Record<string, {
  description: string;
  teamAdjustments?: Record<string, number>;
}> = {
  baron: {
    description: "-2 镇民，+2 外来者",
    teamAdjustments: { townsfolk: -2, outsider: 2 },
  },
  drunk: {
    description: "占用 1 名外来者；本人会看到一个不在场镇民身份",
  },
};

const configDraft = reactive<Required<Pick<
  GameConfig,
  | "backToPublicRoomDelay"
  | "showWhisperMessageHistory"
  | "dmElectionMode"
  | "messageAutoDismiss"
  | "messageAutoDismissTimeout"
>>>({
  backToPublicRoomDelay: 5,
  showWhisperMessageHistory: false,
  dmElectionMode: false,
  messageAutoDismiss: false,
  messageAutoDismissTimeout: 30,
});

const seatedPlayerCount = computed(() => Object.values(gameStore.players)
  .filter((player) => !player.isDM && player.seat > 0)
  .length);
const randomTeamCounts = computed(() => resolveTeamPlayerCount(
  gameScriptStore.teamPlayerNumTable,
  seatedPlayerCount.value,
));
const teamNames = computed<Record<string, string>>(() => gameScriptStore.teamsNames);
const supportedSetupCharacters = computed(() => gameScriptStore.characters
  .filter((character) => (
    character.setup && supportedSetupRules[character.id.trim().toLocaleLowerCase()]
  )));
const unsupportedSetupCharacters = computed(() => gameScriptStore.characters
  .filter((character) => (
    character.setup && !supportedSetupRules[character.id.trim().toLocaleLowerCase()]
  )));
const effectiveRandomTeamCounts = computed(() => {
  const counts = { ...randomTeamCounts.value };
  for (const characterId of selectedSetupCharacterIds.value) {
    const rule = supportedSetupRules[characterId.trim().toLocaleLowerCase()];
    for (const [team, adjustment] of Object.entries(rule?.teamAdjustments ?? {})) {
      counts[team] = (counts[team] ?? 0) + adjustment;
    }
  }
  return counts;
});
const setupSelectionIssue = computed(() => {
  const invalidTeam = Object.entries(effectiveRandomTeamCounts.value)
    .find(([, count]) => count < 0);
  if (invalidTeam) {
    return `应用 Setup 规则后，“${teamNames.value[invalidTeam[0]] || invalidTeam[0]}”人数小于 0。`;
  }

  const selectedCharacters = supportedSetupCharacters.value
    .filter((character) => selectedSetupCharacterIds.value.includes(character.id));
  for (const character of selectedCharacters) {
    const selectedInTeam = selectedCharacters
      .filter((candidate) => candidate.team === character.team)
      .length;
    if ((effectiveRandomTeamCounts.value[character.team] ?? 0) < selectedInTeam) {
      return `当前人数配置没有足够的“${teamNames.value[character.team] || character.team}”名额容纳所选 Setup 角色。`;
    }
  }
  return "";
});
const randomAssignedCount = computed(() => Object.values(effectiveRandomTeamCounts.value)
  .reduce((sum, count) => sum + count, 0));
const teamOptions = computed(() => {
  const ids = new Set([
    ...Object.keys(teamNames.value),
    ...Object.keys(gameScriptStore.teamPlayerNumTable),
    ...Object.values(gameScriptStore.characters).map((character) => character.team),
  ]);
  return [...ids]
    .filter(Boolean)
    .map((id) => ({ id, name: teamNames.value[id] || id }));
});
const canInvite = computed(() => ["day", "night"].includes(gameStore.level));
const seatedPlayerOptions = computed(() => Object.values(gameStore.players)
  .filter((player) => !player.isDM && player.seat > 0)
  .sort((left, right) => left.seat - right.seat)
  .map((player) => ({
    userId: player.userId,
    seat: player.seat,
    displayName: gameStore.roomUsers[player.userId]?.displayName || `座位 ${player.seat} 玩家`,
  })));
const spectatorOptions = computed(() => {
  const seatedUserIds = new Set([
    ...Object.keys(gameStore.players),
    ...Object.keys(gameStore.dms),
  ]);
  return Object.values(gameStore.roomUsers)
    .filter((user) => (
      !seatedUserIds.has(user.userId) &&
      !user.disconnectedAt
    ))
    .map((user) => ({
      userId: user.userId,
      displayName: user.displayName || `观战者 ${user.userId.slice(0, 6)}`,
    }));
});

function actionMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeDialog(): void {
  if (pendingAction.value) return;
  activeDialog.value = null;
  actionError.value = "";
}

function openDialog(dialog: Exclude<DialogName, null>): void {
  actionError.value = "";
  feedback.value = "";

  if (dialog === "random") {
    const availableIds = new Set(supportedSetupCharacters.value.map((character) => character.id));
    selectedSetupCharacterIds.value = selectedSetupCharacterIds.value
      .filter((characterId) => availableIds.has(characterId));
  }

  if (dialog === "config") {
    const current = gameStore.gameConfig;
    configDraft.backToPublicRoomDelay = current.backToPublicRoomDelay ?? 5;
    configDraft.showWhisperMessageHistory = current.showWhisperMessageHistory ?? false;
    configDraft.dmElectionMode = current.dmElectionMode ?? false;
    configDraft.messageAutoDismiss = current.messageAutoDismiss ?? false;
    configDraft.messageAutoDismissTimeout = current.messageAutoDismissTimeout ?? 30;
  }

  if (dialog === "end") {
    endResult.value = "team-win";
    winningTeam.value = teamOptions.value[0]?.id || "townsfolk";
    winningPlayerIds.value = [];
  }

  if (dialog === "invite") {
    if (!spectatorOptions.value.some((user) => user.userId === inviteUserId.value)) {
      inviteUserId.value = spectatorOptions.value[0]?.userId || "";
    }
  }

  activeDialog.value = dialog;
}

async function perform(
  action: Exclude<typeof pendingAction.value, null>,
  successMessage: string,
  request: () => Promise<unknown>,
): Promise<void> {
  if (pendingAction.value) return;
  pendingAction.value = action;
  actionError.value = "";
  feedback.value = `正在${successMessage}…`;

  try {
    await request();
    feedback.value = `${successMessage}成功，等待服务器最终确认。`;
    window.$toast.success(feedback.value);
    activeDialog.value = null;
  } catch (error) {
    actionError.value = actionMessage(error);
    feedback.value = `${successMessage}失败：${actionError.value}`;
    window.$toast.error(feedback.value);
  } finally {
    pendingAction.value = null;
  }
}

async function confirmRandomAssignment(): Promise<void> {
  if (seatedPlayerCount.value === 0) {
    actionError.value = "当前没有已入座玩家。";
    return;
  }
  if (randomAssignedCount.value !== seatedPlayerCount.value) {
    actionError.value = "当前剧本的人数表无法覆盖全部已入座玩家，请先检查剧本配置。";
    return;
  }
  if (setupSelectionIssue.value) {
    actionError.value = setupSelectionIssue.value;
    return;
  }

  await perform("random", "随机角色分配", async () => {
    await gameController.assignRandomCharacters({
      teamPlayerCount: randomTeamCounts.value,
      setupCharacterIds: [...selectedSetupCharacterIds.value],
    });
    await gameController.refreshGameState();
  });
}

async function saveConfig(): Promise<void> {
  if (configDraft.backToPublicRoomDelay < 0) {
    actionError.value = "返回公聊延迟不能小于 0 秒。";
    return;
  }
  if (configDraft.messageAutoDismiss && configDraft.messageAutoDismissTimeout < 1) {
    actionError.value = "消息自动消失时间至少为 1 秒。";
    return;
  }

  await perform("config", "更新游戏配置", () => gameController.updateConfig({
    ...gameStore.gameConfig,
    backToPublicRoomDelay: Number(configDraft.backToPublicRoomDelay),
    showWhisperMessageHistory: configDraft.showWhisperMessageHistory,
    dmElectionMode: configDraft.dmElectionMode,
    messageAutoDismiss: configDraft.messageAutoDismiss,
    messageAutoDismissTimeout: Number(configDraft.messageAutoDismissTimeout),
  }));
}

async function invitePlayer(): Promise<void> {
  const toUserId = inviteUserId.value.trim();
  if (!toUserId) {
    actionError.value = "请选择当前房间内的一名观战者。";
    return;
  }

  if (pendingAction.value) return;
  pendingAction.value = "invite";
  actionError.value = "";
  feedback.value = "正在等待玩家确认入座邀请…";
  try {
    const response = await gameController.invitePlayer({ toUserId });
    if (response.data?.accepted !== true) {
      feedback.value = response.message || "玩家未接受本次入座邀请。";
      window.$toast.info(feedback.value);
    } else {
      feedback.value = "玩家已接受邀请并加入游戏。";
      window.$toast.success(feedback.value);
      await gameController.refreshGameState();
    }
    activeDialog.value = null;
  } catch (error) {
    actionError.value = actionMessage(error);
    feedback.value = `发送入座邀请失败：${actionError.value}`;
    window.$toast.error(feedback.value);
  } finally {
    pendingAction.value = null;
  }
}

async function shareRoom(): Promise<void> {
  if (pendingAction.value) return;
  pendingAction.value = "share";
  actionError.value = "";
  const shareData = {
    title: "加入 Blood on the Clocktower 房间",
    text: "通过此链接加入当前房间。游戏房间为临时房间，服务器重启后会结束。",
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      feedback.value = "已打开系统分享面板。";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareData.url);
      feedback.value = "房间链接已复制。";
    } else {
      throw new Error("当前浏览器不支持自动复制，请从地址栏复制房间链接");
    }
    window.$toast.success(feedback.value);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    actionError.value = actionMessage(error);
    window.$toast.error(actionError.value);
  } finally {
    pendingAction.value = null;
  }
}

async function confirmEndGame(): Promise<void> {
  if (endResult.value === "team-win" && !winningTeam.value) {
    actionError.value = "请选择胜利阵营。";
    return;
  }
  if (
    ["character-win", "special-win"].includes(endResult.value)
    && winningPlayerIds.value.length === 0
  ) {
    actionError.value = "请至少选择一名胜利玩家。";
    return;
  }

  const isComplete = endResult.value !== "incomplete";
  await perform("end", isComplete ? "结束游戏并公布结果" : "中止本局游戏", () => (
    gameController.endGame({
      isComplete,
      result: endResult.value,
      ...(endResult.value === "team-win" ? { winningTeam: winningTeam.value } : {}),
      ...(["character-win", "special-win"].includes(endResult.value)
        ? { winningPlayerIds: [...winningPlayerIds.value] }
        : {}),
    })
  ));
}
</script>

<template>
  <div class="storyteller-controls">
    <button
      type="button"
      class="storyteller-action"
      :disabled="Boolean(pendingAction) || gameStore.level !== 'prepare'"
      :title="gameStore.level !== 'prepare' ? '只能在准备阶段分配角色' : undefined"
      @click="openDialog('random')"
    >
      <span class="storyteller-action__icon" aria-hidden="true">
        <font-awesome-icon :icon="['fas', 'dice']" />
      </span>
      <span>随机分配角色</span>
    </button>

    <button
      type="button"
      class="storyteller-action"
      :disabled="Boolean(pendingAction)"
      @click="openDialog('config')"
    >
      <span class="storyteller-action__icon" aria-hidden="true">
        <font-awesome-icon :icon="['fas', 'sliders-h']" />
      </span>
      <span>游戏配置</span>
    </button>

    <button
      type="button"
      class="storyteller-action"
      :disabled="Boolean(pendingAction)"
      @click="openDialog('invite')"
    >
      <span class="storyteller-action__icon" aria-hidden="true">
        <font-awesome-icon :icon="['fas', 'user-plus']" />
      </span>
      <span>邀请与分享</span>
    </button>

    <button
      type="button"
      class="storyteller-action storyteller-action--danger"
      :disabled="Boolean(pendingAction) || gameStore.level === 'end'"
      @click="openDialog('end')"
    >
      <span class="storyteller-action__icon" aria-hidden="true">
        <font-awesome-icon :icon="['fas', 'power-off']" />
      </span>
      <span>结束游戏</span>
    </button>

    <p class="storyteller-feedback" role="status" aria-live="polite">
      {{ feedback }}
    </p>

    <Modal
      v-if="activeDialog === 'random'"
      name="random-characters"
      title="确认随机分配角色"
      description="将覆盖所有已入座玩家的角色配置；点击说书人菜单中的“发送角色”后玩家才会看到新身份。"
      @close="closeDialog"
    >
      <form class="storyteller-dialog" @submit.prevent="confirmRandomAssignment">
        <fieldset v-if="supportedSetupCharacters.length" class="setup-options">
          <legend>本局包含的 Setup 角色</legend>
          <label v-for="character in supportedSetupCharacters" :key="character.id">
            <input
              v-model="selectedSetupCharacterIds"
              type="checkbox"
              :value="character.id"
              :data-testid="`setup-character-${character.id}`"
              @change="actionError = ''"
            />
            <span>
              <strong>{{ character.name }}</strong>
              <small>{{ supportedSetupRules[character.id.trim().toLocaleLowerCase()].description }}</small>
            </span>
          </label>
        </fieldset>
        <p v-if="unsupportedSetupCharacters.length" class="field-help setup-manual-note">
          {{ unsupportedSetupCharacters.map((character) => character.name).join('、') }}
          等 Setup 角色尚不支持自动规则；随机池会排除它们，身份伪装、相邻和阵营组成需由说书人手动配置。
        </p>
        <p class="field-help">以下为应用所选 Setup 规则后的阵营组成：</p>
        <dl class="team-counts">
          <div v-for="(count, team) in effectiveRandomTeamCounts" :key="team">
            <dt>{{ teamNames[team] || team }}</dt>
            <dd>{{ count }} 人</dd>
          </div>
        </dl>
        <p>共 {{ randomAssignedCount }} 个角色，当前 {{ seatedPlayerCount }} 名玩家已入座。</p>
        <p v-if="setupSelectionIssue" class="field-error" role="alert">
          {{ setupSelectionIssue }}
        </p>
        <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
        <footer class="dialog-actions">
          <button type="button" class="ts-button ts-button--ghost" :disabled="Boolean(pendingAction)" @click="closeDialog">
            取消
          </button>
          <button
            type="submit"
            class="ts-button ts-button--danger"
            :class="{ 'is-pending': pendingAction === 'random' }"
            :disabled="Boolean(pendingAction) || Boolean(setupSelectionIssue)"
          >
            {{ pendingAction === 'random' ? '等待服务器…' : '确认覆盖并分配' }}
          </button>
        </footer>
      </form>
    </Modal>

    <Modal
      v-if="activeDialog === 'config'"
      name="game-config"
      title="游戏配置"
      description="保存后以服务器广播为准，不会先在本地修改权威配置。"
      @close="closeDialog"
    >
      <form class="storyteller-dialog" @submit.prevent="saveConfig">
        <label class="field-row">
          <span>返回公聊延迟（秒）</span>
          <input v-model.number="configDraft.backToPublicRoomDelay" type="number" min="0" max="300" inputmode="numeric" />
        </label>
        <label class="check-row">
          <input v-model="configDraft.showWhisperMessageHistory" type="checkbox" />
          <span>保留悄悄话历史</span>
        </label>
        <label class="check-row">
          <input v-model="configDraft.dmElectionMode" type="checkbox" />
          <span>启用说书人竞选</span>
        </label>
        <label class="check-row">
          <input v-model="configDraft.messageAutoDismiss" type="checkbox" />
          <span>聊天消息自动消失</span>
        </label>
        <label v-if="configDraft.messageAutoDismiss" class="field-row">
          <span>消息保留时间（秒）</span>
          <input v-model.number="configDraft.messageAutoDismissTimeout" type="number" min="1" max="3600" inputmode="numeric" />
        </label>
        <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
        <footer class="dialog-actions">
          <button type="button" class="ts-button ts-button--ghost" :disabled="Boolean(pendingAction)" @click="closeDialog">取消</button>
          <button type="submit" class="ts-button ts-button--primary" :class="{ 'is-pending': pendingAction === 'config' }" :disabled="Boolean(pendingAction)">
            {{ pendingAction === 'config' ? '等待服务器…' : '保存配置' }}
          </button>
        </footer>
      </form>
    </Modal>

    <Modal
      v-if="activeDialog === 'invite'"
      name="invite-player"
      title="邀请与分享"
      description="分享链接用于邀请新用户；局内邀请只发送给当前房间内尚未入座的观战者。"
      @close="closeDialog"
    >
      <div class="storyteller-dialog">
        <button type="button" class="share-link" :class="{ 'is-pending': pendingAction === 'share' }" :disabled="Boolean(pendingAction)" @click="shareRoom">
          <font-awesome-icon :icon="['fas', 'link']" aria-hidden="true" />
          <span>{{ pendingAction === 'share' ? '正在打开分享…' : '分享当前房间链接' }}</span>
        </button>
        <form class="invite-form" @submit.prevent="invitePlayer">
          <fieldset v-if="spectatorOptions.length" class="spectator-options">
            <legend>选择观战者</legend>
            <label v-for="spectator in spectatorOptions" :key="spectator.userId">
              <input v-model="inviteUserId" type="radio" :value="spectator.userId" />
              <span>
                <strong>{{ spectator.displayName }}</strong>
                <small>{{ spectator.userId }}</small>
              </span>
            </label>
          </fieldset>
          <p v-else class="field-help" role="status">
            当前没有可邀请的观战者。请先分享房间链接，待对方进入房间后再邀请。
          </p>
          <p v-if="!canInvite" class="field-help">只有白天或夜晚阶段可以邀请观战者入座。</p>
          <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
          <footer class="dialog-actions">
            <button type="button" class="ts-button ts-button--ghost" :disabled="Boolean(pendingAction)" @click="closeDialog">关闭</button>
            <button type="submit" class="ts-button ts-button--primary" :class="{ 'is-pending': pendingAction === 'invite' }" :disabled="Boolean(pendingAction) || !canInvite || !inviteUserId">
              {{ pendingAction === 'invite' ? '等待玩家确认…' : '发送入座邀请' }}
            </button>
          </footer>
        </form>
      </div>
    </Modal>

    <Modal
      v-if="activeDialog === 'end'"
      name="end-game"
      title="确认结束本局游戏"
      description="此操作会公开所有角色、结束投票与游戏阶段，并向 Lobby 上报最终结果；无法撤销。"
      @close="closeDialog"
    >
      <form class="storyteller-dialog" @submit.prevent="confirmEndGame">
        <fieldset class="result-options">
          <legend>结束类型</legend>
          <label><input v-model="endResult" type="radio" value="team-win" />阵营胜利</label>
          <label><input v-model="endResult" type="radio" value="character-win" />角色或玩家特殊胜利</label>
          <label><input v-model="endResult" type="radio" value="special-win" />其他特殊结果</label>
          <label><input v-model="endResult" type="radio" value="incomplete" />中止本局，不计为完整对局</label>
        </fieldset>
        <label v-if="endResult === 'team-win'" class="field-row">
          <span>胜利阵营</span>
          <select v-model="winningTeam" required>
            <option v-for="team in teamOptions" :key="team.id" :value="team.id">{{ team.name }}</option>
          </select>
        </label>
        <fieldset
          v-if="['character-win', 'special-win'].includes(endResult)"
          class="winner-options"
        >
          <legend>胜利玩家</legend>
          <label v-for="player in seatedPlayerOptions" :key="player.userId">
            <input v-model="winningPlayerIds" type="checkbox" :value="player.userId" />
            <span>
              <strong>{{ player.seat }} 号 · {{ player.displayName }}</strong>
              <small>{{ player.userId }}</small>
            </span>
          </label>
          <p v-if="!seatedPlayerOptions.length" class="field-help">当前没有可选择的已入座玩家。</p>
        </fieldset>
        <p v-if="actionError" class="field-error" role="alert">{{ actionError }}</p>
        <footer class="dialog-actions">
          <button type="button" class="ts-button ts-button--ghost" :disabled="Boolean(pendingAction)" @click="closeDialog">取消</button>
          <button type="submit" class="ts-button ts-button--danger" :class="{ 'is-pending': pendingAction === 'end' }" :disabled="Boolean(pendingAction)">
            {{ pendingAction === 'end' ? '等待服务器…' : '确认结束并公开角色' }}
          </button>
        </footer>
      </form>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
.storyteller-controls {
  display: grid;
  gap: 8px;
}

.storyteller-action,
.share-link {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  color: var(--ts-text-primary, #f4ebdd);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 40%),
    rgba(255, 255, 255, 0.035);
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  box-shadow:
    var(--ts-shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.28)),
    inset 0 1px rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    border-color var(--ts-motion-fast, 160ms) ease,
    background-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);

  &:hover:not(:disabled) {
    border-color: var(--ts-accent-gold, #d6b86a);
    background: rgba(214, 184, 106, 0.1);
    box-shadow:
      var(--ts-shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.28)),
      0 0 16px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16)),
      inset 0 1px rgba(255, 255, 255, 0.08);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
}

.storyteller-action--danger {
  color: #ffd9d7;
  border-color: rgba(198, 72, 79, 0.55);

  &:hover:not(:disabled) {
    border-color: var(--ts-accent-crimson-hover, #a63c45);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 40%),
      rgba(142, 47, 54, 0.22);
    box-shadow:
      var(--ts-shadow-sm, 0 6px 18px rgba(0, 0, 0, 0.28)),
      0 0 16px var(--ts-glow-crimson, rgba(166, 60, 69, 0.42)),
      inset 0 1px rgba(255, 255, 255, 0.06);
  }
}

.storyteller-action__icon {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  color: var(--ts-accent-gold-hover, #e7cf86);
  filter: drop-shadow(0 0 6px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16)));
}

.storyteller-feedback {
  min-height: 0;
  margin: 0;
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.82rem;
  line-height: 1.45;

  &:empty {
    display: none;
  }
}

.storyteller-dialog {
  display: grid;
  gap: 16px;
  width: min(520px, calc(100vw - 48px));
  max-width: 100%;
  color: var(--ts-text-primary, #f4ebdd);
  font-family: var(--ts-font-ui, sans-serif);
}

.team-counts {
  display: grid;
  gap: 8px;
  margin: 0;

  > div {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.04);
  }

  dt,
  dd {
    margin: 0;
  }
}

.field-row {
  display: grid;
  gap: 8px;
  color: var(--ts-text-primary, #f4ebdd);

  > span {
    font-weight: 700;
  }
}

.field-row :is(input, select) {
  min-height: 44px;
  width: 100%;
  padding: 8px 12px;
  color: var(--ts-text-primary, #f4ebdd);
  background: var(--ts-bg-canvas, #0b0910);
  border: 1px solid var(--ts-border-strong, #8f7443);
  border-radius: 8px;
  font: inherit;

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }
}

.check-row,
.result-options label {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.check-row input,
.result-options input {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  accent-color: var(--ts-accent-crimson, #8e2f36);
}

.result-options {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 12px 16px;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: 10px;

  legend {
    padding: 0 6px;
    color: var(--ts-accent-gold-hover, #e7cf86);
    font-weight: 700;
  }
}

.winner-options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);

  legend {
    padding: 0 6px;
    color: var(--ts-accent-gold-hover, #e7cf86);
    font-weight: 700;
  }

  label {
    display: flex;
    min-height: 52px;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--ts-radius-md, 10px);
    cursor: pointer;
    touch-action: manipulation;

    &:has(input:checked) {
      background: rgba(214, 184, 106, 0.09);
      border-color: rgba(214, 184, 106, 0.38);
    }
  }

  input {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    accent-color: var(--ts-accent-crimson, #8e2f36);
  }

  span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  small {
    color: var(--ts-text-muted, #c9bca7);
    overflow-wrap: anywhere;
  }
}

.setup-options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);

  legend {
    padding: 0 6px;
    color: var(--ts-accent-gold-hover, #e7cf86);
    font-weight: 700;
  }

  label {
    display: flex;
    min-height: 52px;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--ts-radius-md, 10px);
    cursor: pointer;
    touch-action: manipulation;

    &:has(input:checked) {
      border-color: rgba(214, 184, 106, 0.38);
      background: rgba(214, 184, 106, 0.09);
    }
  }

  input {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    accent-color: var(--ts-accent-crimson, #8e2f36);
  }

  span {
    display: grid;
    gap: 3px;
  }

  small {
    color: var(--ts-text-muted, #c9bca7);
    line-height: 1.4;
  }
}

.setup-manual-note {
  padding: 10px 12px;
  border-left: 3px solid var(--ts-accent-gold, #d6b86a);
  background: rgba(214, 184, 106, 0.07);
}

.field-help,
.field-error {
  margin: 0;
  line-height: 1.5;
}

.field-help {
  color: var(--ts-text-muted, #c9bca7);
}

.field-error {
  color: #ffaaa7;
}

.invite-form {
  display: grid;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
}

.spectator-options {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);

  legend {
    padding: 0 6px;
    color: var(--ts-accent-gold-hover, #e7cf86);
    font-weight: 700;
  }

  label {
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: var(--ts-radius-md, 10px);
    cursor: pointer;

    &:has(input:checked) {
      background: rgba(214, 184, 106, 0.09);
      border-color: rgba(214, 184, 106, 0.38);
    }
  }

  input {
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    accent-color: var(--ts-accent-crimson, #8e2f36);
  }

  span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  small {
    overflow: hidden;
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.ts-button {
  min-height: 44px;
  padding: 9px 16px;
}

@media (max-width: 480px) {
  .storyteller-dialog {
    width: 100%;
  }

  .dialog-actions > button {
    flex: 1 1 160px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .storyteller-action,
  .share-link {
    transition-duration: 0.01ms !important;
  }

  .storyteller-action:hover:not(:disabled),
  .share-link:hover:not(:disabled),
  .storyteller-action:active:not(:disabled),
  .share-link:active:not(:disabled) {
    transform: none;
  }
}
</style>
