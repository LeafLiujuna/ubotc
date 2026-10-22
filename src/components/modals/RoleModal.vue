<template>
  <Modal
    v-if="modals.role && availableRoles.length"
    name="role-select"
    :aria-label="modalTitle"
    :show-close="false"
    @close="close"
  >
    <div class="role-picker" :class="`role-picker--${noteAlignment}`" :aria-busy="isSaving">
      <header class="role-picker-header">
        <strong>选择一个 <button v-if="canEditRole" type="button" class="role-alignment-toggle" :aria-label="`${noteAlignmentLabel}，点击切换`" :disabled="isSaving" @click="cycleNoteAlignment">{{ noteAlignmentLabel }}</button> 角色给 <b>{{ playerLabel }}</b></strong>
        <input v-model="search" class="role-search" type="search" placeholder="搜索" aria-label="搜索角色" />
        <button class="role-picker-close" type="button" aria-label="关闭角色选择" @click="close">×</button>
      </header>

      <button
        v-if="session.isSpectator && playerIndex < 0"
        type="button"
        class="traveler-toggle"
        :class="{ active: isShowTraveler }"
        :aria-pressed="isShowTraveler"
        @click="toggleShowTraveler"
      >
        <font-awesome-icon
          :icon="['fas', isShowTraveler ? 'check-square' : 'square']"
          aria-hidden="true"
        />
        显示旅行者
      </button>

      <div v-if="!canEditRole" class="role-permission-notice" role="status">
        <font-awesome-icon icon="lock" aria-hidden="true" />
        <div>
          <strong>当前为只读身份信息</strong>
          <span>只有说书人可以更改玩家身份。</span>
        </div>
      </div>

      <div class="role-groups">
        <section
          v-for="group in groupedRoles"
          :key="group.team"
          class="role-team"
          :class="`role-team--${group.team}`"
        >
          <header class="role-team__header">
            <div>
              <span class="role-team__mark" aria-hidden="true"></span>
              <h3>{{ group.label }}</h3>
            </div>
            <span>{{ group.roles.length }} 个可选</span>
          </header>

          <ul class="role-grid">
            <li
              v-for="(role, index) in group.roles"
              :key="role.id || `${group.team}-${index}`"
              class="role-card"
            >
              <button
                type="button"
                class="role-option"
                :class="{
                  selected: isSelectedRole(role),
                  pending: pendingRoleId === (role.id || '__empty__'),
                  locked: !canEditRole,
                }"
                :disabled="isSaving || !canEditRole"
                :aria-pressed="isSelectedRole(role)"
                :aria-label="roleOptionLabel(role)"
                :title="`${role.name || '清除角色'}${role.ability ? '：' + role.ability : ''}`"
                @click="setRole(role)"
              >
                <span class="role-token" aria-hidden="true">
                  <Token :role="roleWithNoteAlignment(role)" />
                </span>
                <span class="role-option__name">
                  {{ role.name || "清除角色" }}
                </span>
                <span v-if="isSelectedRole(role)" class="role-option__state">
                  当前选择
                </span>
                <span
                  v-else-if="pendingRoleId === (role.id || '__empty__')"
                  class="role-option__state"
                >
                  同步中
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <p v-if="!groupedRoles.length" class="role-empty">没有匹配的角色</p>
      <nav class="role-tabs" aria-label="角色来源">
        <button
          type="button"
          :class="{ active: tab === 'editionRoles' }"
          :aria-pressed="tab === 'editionRoles'"
          @click="tab = 'editionRoles'"
        >{{ playerIndex >= 0 ? "可用角色" : "未在场角色" }}</button>
        <button
          v-if="playerIndex < 0 && !session.isSpectator"
          type="button"
          :class="{ active: tab === 'editionRolesFull' }"
          :aria-pressed="tab === 'editionRolesFull'"
          @click="tab = 'editionRolesFull'"
        >全部角色</button>
        <button
          v-if="playerIndex >= 0 && otherTravelers.size && canEditRole"
          type="button"
          :class="{ active: tab === 'otherTravelers' }"
          :aria-pressed="tab === 'otherTravelers'"
          @click="tab = 'otherTravelers'"
        >其他旅行者</button>
      </nav>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import { useGameStore } from "@/stores/game";
import { useGameController } from "@/controllers/GameController";
import { usePlayerViewStore } from "@/stores/playerView";
import Modal from "./Modal";
import Token from "../Token";

const props = defineProps({
  playerIndex: {
    type: Number,
    default: 0,
  },
  profileRole: {
    type: Boolean,
    default: false,
  },
  profileRoleValue: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(["profile-role-selected", "role-selected", "close"]);

const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon", "traveler", "unassigned"];
const TEAM_LABELS = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
  traveler: "旅行者",
  unassigned: "空白身份",
};

const appStore = useAppStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();
const gameStore = useGameStore();
const gameController = useGameController();
const playerView = usePlayerViewStore();

const { modals, otherTravelers } = storeToRefs(appStore);
const { players } = storeToRefs(playersStore);
const session = sessionStore.$state;

const search = ref("");
const tab = ref("editionRoles");
const isShowTraveler = ref(false);
const isSaving = ref(false);
const pendingRoleId = ref("");
const noteAlignment = ref('normal');
const noteAlignmentLabel = computed(() => ({ normal: '常规阵营', good: '善良阵营', evil: '邪恶阵营' })[noteAlignment.value]);

const availableRoles = computed(() => {
  const nextRoles = [];
  const includeAssignedRoles = tab.value === "editionRolesFull" || props.playerIndex >= 0;
  // 伪装身份列表一次建立在场角色索引，避免为每个候选角色重复遍历座位。
  const assignedRoleIds = includeAssignedRoles ? null : new Set(playersStore.players.map(player => player.role.id));
  appStore.roles.forEach((role) => {
    // Bluff slots normally omit roles already assigned to a player. The
    // "all roles" tab deliberately keeps the legacy override.
    if (
      includeAssignedRoles
      || (props.playerIndex < 0 && !assignedRoleIds.has(role.id))
    ) {
      nextRoles.push(role);
    }
  });
  nextRoles.push({});
  return nextRoles;
});

const playerLabel = computed(() => {
  if (props.profileRole) return "说书人";
  if (props.playerIndex < 0) return "伪装身份";
  const player = players.value[props.playerIndex] || {};
  return player.name || `${props.playerIndex + 1} 号座位`;
});

const isPersonalGrimoire = computed(() => Boolean(session.sessionId && session.gameServerId && !gameStore.currentIsDm && !props.profileRole && props.playerIndex >= 0));
const canEditRole = computed(() => isPersonalGrimoire.value || !session.gameServerId || gameStore.currentIsDm);
const modalTitle = computed(() => `为${playerLabel.value}选择角色`);
const visibleRoles = computed(() => {
  if (tab.value === "otherTravelers" && otherTravelers.value.size) {
    return Array.from(otherTravelers.value.values());
  }

  return availableRoles.value.filter((role) => (
    (!role.id && !role.name)
    || ["townsfolk", "outsider", "minion", "demon"].includes(role.team)
    || (
      role.team === "traveler"
      && ((canEditRole.value && props.playerIndex >= 0) || !session.isSpectator || (isShowTraveler.value && props.playerIndex < 0))
    )
  ));
});

const groupedRoles = computed(() => {
  const groups = new Map();
  for (const role of visibleRoles.value) {
    const query = search.value.trim().toLowerCase();
    if (query && !`${role.name || "清除角色"} ${role.id || ""} ${role.ability || ""}`.toLowerCase().includes(query)) continue;
    const team = role.team || "unassigned";
    if (!groups.has(team)) groups.set(team, []);
    groups.get(team).push(role);
  }

  return TEAM_ORDER
    .filter((team) => groups.has(team))
    .map((team) => ({
      team,
      label: TEAM_LABELS[team] || team,
      roles: groups.get(team),
    }));
});

const selectedRoleId = computed(() => {
  if (props.profileRole) return props.profileRoleValue?.id || "";
  if (props.playerIndex < 0) {
    return playersStore.bluffs[props.playerIndex * -1 - 1]?.id || "";
  }
  const seats = isPersonalGrimoire.value ? playerView.project(players.value) : players.value;
  return seats[props.playerIndex]?.role?.id || "";
});
watch([() => modals.value.role, () => props.playerIndex, () => props.profileRole], ([open]) => {
  if (!open) return;
  search.value = '';
  tab.value = 'editionRoles';
  isShowTraveler.value = false;
  noteAlignment.value = 'normal';
}, { immediate: true });

function cycleNoteAlignment() {
  const alignments = ['normal', 'good', 'evil'];
  noteAlignment.value = alignments[(alignments.indexOf(noteAlignment.value) + 1) % alignments.length];
}

function roleWithNoteAlignment(role) {
  if (!canEditRole.value || !role?.id) return role;
  // 阵营预览使用副本，避免污染所有角色选择器共用的剧本角色定义。
  const nextRole = { ...role };
  delete nextRole.alignment;
  if (noteAlignment.value !== 'normal') nextRole.alignment = noteAlignment.value;
  return nextRole;
}

function isSelectedRole(role) {
  return (role.id || "") === selectedRoleId.value;
}

function roleOptionLabel(role) {
  const label = role.name || "清除当前角色";
  return canEditRole.value ? label : `${label}，只读`;
}

async function setRole(role) {
  if (isSaving.value) return;
  if (!canEditRole.value) {
    window.$toast.warning("只有说书人可以更改玩家身份。");
    return;
  }
  isSaving.value = true;
  pendingRoleId.value = role.id || "__empty__";
  const selectedRole = role?.id ? roleWithNoteAlignment(role) : { id: '' };

  try {
    if (isPersonalGrimoire.value) {
      // 玩家选角仅记录到自己的魔典；正式分配由下方说书人分支同步。
      const player = players.value[props.playerIndex];
      if (!player) return;
      playerView.setRole(player, props.playerIndex, selectedRole);
      emit('role-selected', { playerIndex: props.playerIndex, role: selectedRole });
    } else if (props.profileRole) {
      emit("profile-role-selected", selectedRole.id ? selectedRole : null);
    } else if (props.playerIndex < 0) {
      playersStore.setBluff({
        index: props.playerIndex * -1 - 1,
        role: selectedRole,
      });
    } else {
      const player = playersStore.players[props.playerIndex];
      if (gameController.isConnected && player?.id) {
        try {
          const privateExtras = { ...(gameStore.players[player.id]?.privateExtras || {}) };
          if (selectedRole.alignment) privateExtras.alignment = selectedRole.alignment;
          else delete privateExtras.alignment;
          await gameController.updatePlayer({
            userId: player.id,
            characterId: selectedRole.id,
            privateExtras,
          });
          await gameController.refreshGameState();
        } catch (error) {
          window.$toast.error(
            error instanceof Error ? error.message : "同步角色失败，请重试",
          );
          return;
        }
      } else if (session.sessionId && session.gameServerId) {
        try {
          await gameController.request('dmSetSeatRoles', {
            assignments: [{ seat: props.playerIndex + 1, characterId: selectedRole.id, ...(selectedRole.alignment ? { alignment: selectedRole.alignment } : {}) }],
            expectedSeatUsers: playersStore.players.map(player => player.id || ''),
          });
          await gameController.refreshGameState();
        } catch (error) {
          window.$toast.error(error instanceof Error ? error.message : '同步座位角色失败，请重试');
          return;
        }
      } else {
        playersStore.update({
          player,
          property: "role",
          value: selectedRole,
        });
      }
      emit("role-selected", { playerIndex: props.playerIndex, role: selectedRole });
    }

    tab.value = "editionRoles";
    appStore.toggleModal("role");
  } finally {
    isSaving.value = false;
    pendingRoleId.value = "";
  }
}

function close() {
  tab.value = "editionRoles";
  appStore.toggleModal("role");
  emit("close");
}

function toggleShowTraveler() {
  isShowTraveler.value = !isShowTraveler.value;
}
</script>

<style scoped lang="scss">
:global(.modal-backdrop--role-select) {
  align-items: center;
  padding: 12px;
  background: rgba(0, 0, 0, .35) !important;
  backdrop-filter: none !important;
}
:global(.modal-backdrop--role-select .modal) {
  --role-token-size: clamp(44px, 7.5vmin, 120px);
  --role-column-gap: 1.5vmin;
  --role-row-gap: 1vmin;
  width: min(66vmin, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  border: 2px solid #110e10;
  border-radius: 5px;
  background: rgba(8, 7, 10, .8) !important;
  box-shadow: 0 4px 12px #000a !important;
  font-family: var(--ts-font-body, serif);
}
:global(.modal-backdrop--role-select .modal::before),
:global(.modal-backdrop--role-select .modal::after),
:global(.modal-backdrop--role-select .modal-ornament) { display: none; }
:global(.modal-backdrop--role-select .modal > .slot) {
  display: flex;
  padding: 0;
  overflow: hidden;
}
.role-picker { display: flex; flex-direction: column; width: 100%; min-height: 0; }
.role-alignment-toggle { border: 0; border-radius: 14px; padding: 2px 8px; color: #fff; background: #67428b; font: inherit; cursor: pointer; }
.role-picker--good .role-alignment-toggle { background: #2372e2; }
.role-picker--evil .role-alignment-toggle { background: #d21b20; }
.role-picker-header {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: .7vmin;
  min-height: 4.8vmin;
  padding: .5vmin .6vmin;
  border-bottom: 2px solid #0c0b0c;
  color: #f5f1ed;
  font-size: clamp(12px, 1.8vmin, 26px);
  line-height: 1.3;
  strong { flex: 1; min-width: 0; font-weight: normal; }
  b { font-weight: bold; }
}
.role-search {
  flex: 0 0 auto;
  width: 8.5vmin;
  min-width: 64px;
  height: 2.5vmin;
  min-height: 24px;
  padding: 0 4px;
  border: 1px solid #eac455;
  border-radius: 5px;
  background: #fffdf4;
  box-shadow: 0 0 5px #d5b94c88;
  color: #231a25;
  font: inherit;
  text-align: center;
}
.role-picker-close {
  flex: 0 0 auto;
  width: 22px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #ddd5cb;
  font-size: 23px;
  line-height: 1;
  cursor: pointer;
}
.role-tabs { display: flex; flex: 0 0 auto; border-top: 2px solid #080709; }
.role-tabs button {
  flex: 1;
  padding: .15vmin 5px;
  min-height: 28px;
  border: 0;
  border-right: 2px solid #080709;
  border-radius: 0;
  background: transparent;
  color: #f5f1ed;
  font: bold clamp(12px, 1.8vmin, 26px) / 1.4 var(--ts-font-body, serif);
  text-shadow: 0 1px 2px #000;
  cursor: pointer;
  &:last-child { border-right: 0; }
  &.active { background: linear-gradient(#923ace, #3d1164); }
  &:focus-visible { outline: 2px solid #f0d990; outline-offset: -3px; }
}
.traveler-toggle {
  align-self: center;
  margin: 8px;
  padding: 4px 12px;
  min-height: 28px;
  border: 1px solid #7f718c;
  border-radius: 18px;
  background: #19121c99;
  color: #f4eee4;
  cursor: pointer;
  &.active { background: #583873; border-color: #c09cd9; }
}
.role-groups {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  gap: var(--role-row-gap);
  padding: 1.2vmin 1.5vmin;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.role-team { --role-team-color: #2372e2; flex: 0 0 auto; }
.role-team--outsider { --role-team-color: #36a4c6; }
.role-team--minion { --role-team-color: #d77624; }
.role-team--demon { --role-team-color: #d21b20; }
.role-team--traveler { --role-team-color: #ba74ef; }
.role-team--unassigned { --role-team-color: transparent; }
.role-team__header { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.role-team > .role-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--role-row-gap) var(--role-column-gap);
  padding: 0;
  margin: 0;
  list-style: none;
}
.role-card { width: var(--role-token-size); flex: 0 0 var(--role-token-size); }
.role-option {
  position: relative;
  display: block;
  width: var(--role-token-size);
  height: var(--role-token-size);
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  box-shadow: 0 0 1vmin .25vmin var(--role-team-color);
  transition: box-shadow 150ms ease;
  &:hover:not(:disabled), &:focus-visible {
    outline: 2px solid #f8e7b0;
    outline-offset: 2px;
    box-shadow: 0 0 1.4vmin .4vmin var(--role-team-color);
  }
  &.selected { outline: 2px solid white; outline-offset: 3px; }
  &.pending { opacity: .5; }
  &:disabled { cursor: default; }
}
.role-token { display: block; width: 100%; height: 100%; pointer-events: none; }
.role-token :deep(.token) { width: 100%; height: 100%; border: 2px solid #080709; box-shadow: none; }
.role-option__name { display: none; }
.role-option__state {
  position: absolute;
  bottom: -3px;
  left: 0;
  right: 0;
  background: #1b102bdd;
  color: white;
  font-size: clamp(9px, .9vmin, 13px);
  border-radius: 5px;
}
.role-permission-notice { display: flex; gap: 8px; margin: 8px; color: #f1e7dc; font-size: 12px; }
.role-permission-notice span { display: block; }
.role-empty { text-align: center; color: white; }
@media (max-width: 640px) {
  :global(.modal-backdrop--role-select .modal) {
    --role-token-size: clamp(44px, 9.5vw, 60px);
    --role-column-gap: 8px;
    --role-row-gap: 10px;
    width: calc(100vw - 24px);
  }
  .role-picker-header { min-height: 42px; padding: 5px 7px; }
  .role-groups { padding: 12px 10px; }
  .role-tabs button { min-height: 34px; }
}
@media (prefers-reduced-motion: reduce) { .role-option { transition: none; } }
</style>
