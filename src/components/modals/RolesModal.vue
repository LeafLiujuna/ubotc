<template>
  <Modal
    v-if="modals.roles && (isApiRoom || nonTravelers >= 5)"
    class="roles"
    name="roles"
    aria-label="选择角色"
    :close-on-backdrop="!pending"
    :show-close="!pending"
    @close="toggleModal('roles')"
  >
    <div class="roles-picker" :aria-busy="pending">
      <details class="role-picker-options">
        <summary aria-label="角色选择选项" title="角色选择选项"><font-awesome-icon icon="sliders" /></summary>
        <label class="multiple-toggle"><input v-model="allowMultiple" type="checkbox" :disabled="pending" />允许重复角色</label>
      </details>
      <div class="role-selection-groups">
        <section v-for="group in roleGroups" :key="group.team" class="selection-team" :class="`selection-team--${group.team}`" :aria-label="group.label">
          <header class="selection-team__header">
            <img class="selection-team__emblem" :src="TEAM_EMBLEMS[group.team]" :alt="group.label" />
            <output class="team-count" :class="`team-count--${teamCountStatus(group)}`" :aria-label="`${group.label}已选 ${selectedForTeam(group.roles)}，推荐 ${requiredForTeam(group.team)}`">
              {{ selectedForTeam(group.roles) }} / {{ requiredForTeam(group.team) }}
            </output>
          </header>
          <ul class="role-card-grid">
            <li v-for="role in group.roles" :key="role.id" class="selection-card" :class="{ selected: role.selected > 0 }" :data-role-id="role.id">
              <button type="button" class="role-toggle" :disabled="pending" :aria-pressed="role.selected > 0" :aria-label="`${role.name}${role.selected ? `，已选择 ${role.selected} 个` : '，未选择'}`" :title="[role.name, role.ability].filter(Boolean).join('\n')" @click="toggleRole(role)">
                <span class="selection-token" aria-hidden="true"><Token :role="role" /></span>
                <span v-if="role.selected" class="selection-card__state" aria-hidden="true">{{ role.selected > 1 ? role.selected : '✓' }}</span>
              </button>
              <div v-if="allowMultiple && role.selected" class="quantity-controls">
                <button type="button" :disabled="pending" :aria-label="`减少一个${role.name}`" @click="decrementRole(role)">−</button>
                <output :aria-label="`${role.name}数量 ${role.selected}`">{{ role.selected }}</output>
                <button type="button" :disabled="pending" :aria-label="`增加一个${role.name}`" @click="incrementRole(role)">+</button>
              </div>
            </li>
          </ul>
        </section>
      </div>
      <p class="selection-summary" role="status" aria-live="polite">
        <template v-if="isApiRoom && !nonTravelers">请先添加座位，再选择角色。</template>
        <template v-else-if="selectedRoles > nonTravelers">超出玩家人数 {{ selectedRoles - nonTravelers }} 个</template>
        <template v-else-if="isApiRoom && selectedRoles !== nonTravelers">已选 {{ selectedRoles }} / {{ nonTravelers }} 个角色，请为每个非旅行者座位选择一个角色。</template>
        <template v-else-if="isApiRoom">角色将配置到 {{ nonTravelers }} 个座位；点击说书人菜单中的“发送角色”后玩家才会看到身份。</template>
        <span v-else class="sr-only">已选 {{ selectedRoles }} / {{ nonTravelers }} 个角色</span>
      </p>
      <p v-if="hasSelectedSetupRoles" class="role-alert" role="status">已选角色会改变初始配置，请核对最终阵容。</p>
      <p v-if="session.isReview && !isApiRoom" class="role-alert" role="status">当前处于复盘视角；正式开局前请先关闭复盘。</p>
      <div class="role-actions">
        <button type="button" class="role-action role-action--primary" :disabled="!canAssign" @click="assignRoles(true)">
          <font-awesome-icon icon="masks-theater" aria-hidden="true" />
          {{ pending ? '正在配置…' : `${isApiRoom ? '配置' : '发送'} ${selectedRoles} 个角色` }}
        </button>
        <button type="button" class="role-action" :disabled="pending" @click="shuffleRoles"><font-awesome-icon icon="random" aria-hidden="true" />打乱</button>
        <button type="button" class="role-action" :disabled="pending || !shuffled" @click="sortRoles"><font-awesome-icon icon="arrow-rotate-left" aria-hidden="true" />排序</button>
      </div>
      <button v-if="session.isReview && !isApiRoom" type="button" class="role-review-action" :disabled="!canAssign" @click="assignRoles(false)">关闭复盘并发送角色</button>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useGameStore } from "@/stores/game";
import { useGameController } from "@/controllers/GameController";
import { requestInputModal } from "@/services/inputModalService";
import { useSessionStore } from "@/stores/session";
import { SocketClientEvent } from "@/types/socket";
import Modal from "./Modal";
import gameJSON from "../../data/game.json";
import Token from "./../Token";
import townsfolkEmblem from "@/assets/icons/townsfolks.png";
import outsiderEmblem from "@/assets/icons/outsiders.png";
import minionEmblem from "@/assets/icons/minions.png";
import demonEmblem from "@/assets/icons/demons.png";

const TEAM_ORDER = ["townsfolk", "outsider", "minion", "demon"];
const TEAM_EMBLEMS = { townsfolk: townsfolkEmblem, outsider: outsiderEmblem, minion: minionEmblem, demon: demonEmblem };
const TEAM_LABELS = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
};

const appStore = useAppStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();

const { roles, modals } = storeToRefs(appStore);
const { players, nonTravelers: localNonTravelers } = storeToRefs(playersStore);
const gameStore = useGameStore();
const controller = useGameController();
const pending = ref(false);
const isApiRoom = computed(() => Boolean(sessionStore.sessionId && sessionStore.gameServerId));
const seatTargets = computed(() => Array.from({ length: gameStore.seatCount }, (_, index) => {
  const seat = index + 1;
  const player = Object.values(gameStore.players).find(player => !player.isDM && player.seat === seat);
  const characterId = player?.characterId || gameStore.seatRoles[seat]?.characterId;
  return { seat, userId: player?.userId || '', team: appStore.roles.get(characterId)?.team || appStore.rolesJSONbyId.get(characterId)?.team };
}));
const nonTravelerSeats = computed(() => seatTargets.value.filter(seat => seat.team !== 'traveler'));
const nonTravelers = computed(() => isApiRoom.value ? nonTravelerSeats.value.length : localNonTravelers.value);
const session = sessionStore.$state;

const roleSelection = ref({});
const game = gameJSON;
const allowMultiple = ref(false);
const shuffled = ref(false);
// The order used by both local assignment and the API seat assignment. Keep
// it separate from the visual role list so a later send cannot randomize away
// the order chosen by the storyteller.
const assignmentOrder = ref([]);

const selectedRoles = computed(() => {
  return Object.values(roleSelection.value)
    .map((teamRoles) => teamRoles.reduce((total, { selected }) => total + selected, 0))
    .reduce((total, count) => total + count, 0);
});

const canAssign = computed(() => (
  !pending.value && selectedRoles.value > 0 && selectedRoles.value <= nonTravelers.value && (!isApiRoom.value || (gameStore.currentIsDm && selectedRoles.value === nonTravelers.value))
));

const hasSelectedSetupRoles = computed(() => {
  return Object.values(roleSelection.value).some((teamRoles) =>
    teamRoles.some((role) => role.selected && role.setup),
  );
});

const roleGroups = computed(() => TEAM_ORDER
  .filter((team) => roleSelection.value[team]?.length)
  .map((team) => ({
    team,
    label: TEAM_LABELS[team],
    roles: roleSelection.value[team],
  })));

function selectedForTeam(teamRoles) {
  return teamRoles.reduce((total, role) => total + role.selected, 0);
}

function requiredForTeam(team) {
  const playerCount = Math.max(5, nonTravelers.value);
  return game[playerCount - 5]?.[team] ?? 0;
}

function teamCountStatus(group) {
  const selected = selectedForTeam(group.roles);
  const required = requiredForTeam(group.team);
  if (selected > required) return "over";
  if (selected < required) return "under";
  return "exact";
}

function toggleRole(role) {
  if (pending.value) return;
  assignmentOrder.value = [];
  shuffled.value = false;
  role.selected = role.selected ? 0 : 1;
}

function decrementRole(role) {
  if (pending.value) return;
  assignmentOrder.value = [];
  shuffled.value = false;
  role.selected = Math.max(0, role.selected - 1);
}

function incrementRole(role) {
  if (pending.value) return;
  assignmentOrder.value = [];
  shuffled.value = false;
  role.selected += 1;
}

function resetSelection() {
  const nextSelection = {};
  roles.value.forEach((role) => {
    if (!nextSelection[role.team]) {
      nextSelection[role.team] = [];
    }
    nextSelection[role.team].push({ ...role, selected: 0, scriptOrder: nextSelection[role.team].length });
  });

  for (const team of Object.keys(nextSelection)) {
    if (!TEAM_ORDER.includes(team)) delete nextSelection[team];
  }

  roleSelection.value = nextSelection;
  assignmentOrder.value = [];
  shuffled.value = false;
}

function selectRecommendedRoles() {
  const playerCount = Math.max(5, nonTravelers.value);
  const composition = game[playerCount - 5] || {};
  Object.values(roleSelection.value).flat().forEach((role) => { role.selected = 0; });

  Object.entries(composition).forEach(([team, count]) => {
    const available = [...(roleSelection.value[team] || [])];
    for (let index = 0; index < count && available.length; index += 1) {
      const target = Math.floor(Math.random() * available.length);
      const [role] = available.splice(target, 1);
      role.selected = 1;
    }
  });
}

function shuffleRoles() {
  if (pending.value) return;
  // In local games the button doubles as the quick setup action.  Opening the
  // picker starts with no roles selected, so make one click useful by filling
  // the recommended composition before shuffling its assignment order.
  if (!isApiRoom.value && selectedRoles.value === 0) selectRecommendedRoles();
  for (const teamRoles of Object.values(roleSelection.value)) {
    for (let index = teamRoles.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [teamRoles[index], teamRoles[target]] = [teamRoles[target], teamRoles[index]];
    }
  }
  const selected = Object.values(roleSelection.value).flatMap((teamRoles) =>
    teamRoles.flatMap((role) => Array(role.selected).fill(role.id)),
  );
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [selected[index], selected[target]] = [selected[target], selected[index]];
  }
  assignmentOrder.value = selected;
  shuffled.value = true;
}

function sortRoles() {
  if (pending.value) return;
  for (const teamRoles of Object.values(roleSelection.value)) {
    teamRoles.sort((left, right) => left.scriptOrder - right.scriptOrder);
  }
  assignmentOrder.value = Object.values(roleSelection.value).flatMap((teamRoles) =>
    teamRoles.flatMap((role) => Array(role.selected).fill(role.id)),
  );
  shuffled.value = false;
}

function selectedAssignmentOrder() {
  const selected = Object.values(roleSelection.value).flatMap((teamRoles) =>
    teamRoles.flatMap((role) => Array(role.selected).fill(role.id)),
  );
  return assignmentOrder.value.length === selected.length
    ? [...assignmentOrder.value]
    : selected;
}

async function assignRoles(allowReview = true) {
  if (isApiRoom.value) {
    if (!canAssign.value) return;
    const targets = nonTravelerSeats.value.map(seat => seat.seat);
    const expectedSeatUsers = seatTargets.value.map(seat => seat.userId);
    const confirmed = await requestInputModal({ inputType: 'confirm', inputModal: 'confirm', inputData: { name: [`将选中的角色随机分配给 ${targets.length} 个非旅行者座位？这会覆盖当前配置。玩家暂时看不到新身份，请配置完成后点击说书人菜单中的“发送角色”。Setup 能力需由说书人手动处理。`] } }).catch(() => false);
    if (confirmed !== true || !canAssign.value) return;
    const assignments = selectedAssignmentOrder();
    pending.value = true;
    try {
      await controller.request(SocketClientEvent.DMSetSeatRoles, {
        assignments: targets.map((seat, index) => ({ seat, characterId: assignments[index] })),
        expectedSeatUsers,
      });
      await controller.refreshGameState();
      if (appStore.modals.roles) appStore.toggleModal('roles');
    } catch (error) {
      window.$toast.error(error instanceof Error ? error.message : '角色分配失败，请重试');
      await controller.refreshGameState().catch(() => undefined);
    } finally { pending.value = false; }
    return;
  }
  if (selectedRoles.value <= nonTravelers.value && selectedRoles.value) {
    if (!allowReview && session.isReview) {
      sessionStore.setIsReview(false);
    }
    const selectedIds = selectedAssignmentOrder();
    const selectedPool = selectedIds.map((id) =>
      Object.values(roleSelection.value)
        .flatMap((teamRoles) => teamRoles)
        .find((role) => role.id === id),
    ).filter(Boolean);

    players.value.forEach((player) => {
      if (player.role.team !== "traveler" && selectedPool.length) {
        const value = selectedPool.shift();
        playersStore.update({
          player,
          property: "role",
          value,
        });
      }
    });
    // Keep the local deal separate from the mutable player roles.  The
    // storyteller can edit a token in the grimoire after dealing, then press
    // "发送角色" to deliver this original deal again.
    sessionStore.setRoleAssignmentSnapshot(
      players.value.map((player) => player.role?.id || ""),
    );
    appStore.toggleModal("roles");
  }
}

function toggleModal(name) {
  appStore.toggleModal(name);
}

if (!Object.keys(roleSelection.value).length) {
  resetSelection();
}

watch(() => modals.value.roles, open => { if (open) resetSelection(); });

watch(roles, () => {
  resetSelection();
});

watch(allowMultiple, enabled => {
  if (!enabled) Object.values(roleSelection.value).flat().forEach(role => { role.selected = Math.min(1, role.selected); });
});
</script>

<style lang="scss" scoped>
:global(.modal-backdrop.modal-backdrop--roles) {
  padding: 12px;
  background: transparent;
  backdrop-filter: none;
}
:global(.modal-backdrop.modal-backdrop--roles .modal) {
  --ts-modal-spine: none;
  box-sizing: border-box;
  width: min(840px, 100%);
  max-height: calc(100dvh - 24px);
  border: 3px solid #070609;
  border-radius: 7px;
  background: rgba(5, 4, 9, .8);
  box-shadow: 0 4px 18px #0006;
}
:global(.modal-backdrop.modal-backdrop--roles .modal::after),
:global(.modal-backdrop.modal-backdrop--roles .modal-ornament) { display: none; }
:global(.modal-backdrop.modal-backdrop--roles .modal > .slot) {
  display: flex;
  overflow: hidden;
  padding: 22px 16px 16px;
}
:global(.modal-backdrop.modal-backdrop--roles .modal > .top-right-buttons) { top: 2px; right: 2px; }
:global(.modal-backdrop.modal-backdrop--roles .top-right-button) {
  width: 24px;
  height: 24px;
  min-height: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  color: #ddd;
}
.roles-picker {
  --role-size: clamp(52px, 10.5vw, 90px);
  --role-gap: 12px;
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  color: #fff;
  font-family: var(--ts-font-body, serif);
  text-shadow: 0 1px 3px #000;
}
.role-selection-groups { display: grid; gap: 12px; min-height: 0; overflow: auto; padding: 4px; scrollbar-width: thin; }
.selection-team { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 12px; align-items: center; min-width: 0; }
.selection-team__header { display: flex; flex-direction: column; align-items: center; justify-content: center; }
.selection-team__emblem { width: 64px; height: 64px; object-fit: contain; filter: drop-shadow(0 1px 2px #000); }
.team-count { margin-top: -9px; white-space: nowrap; font: bold 26px/1.1 var(--ts-font-ui, sans-serif); color: #d5d5d5; text-shadow: 0 2px 3px #000; }
.team-count--exact { color: #fff; }
.team-count--over { color: #ed8888; }
.selection-team > .role-card-grid { display: flex; flex-wrap: wrap; justify-content: center; align-content: center; gap: var(--role-gap); min-width: 0; margin: 0; padding: 0; list-style: none; }
.selection-card { position: relative; flex: 0 0 var(--role-size); width: var(--role-size); min-width: 0; }
.role-toggle { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; transition: filter .15s, box-shadow .15s; }
.role-toggle:hover { filter: brightness(1.12); }
.role-toggle:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
.role-toggle:disabled { cursor: wait; }
.selected .role-toggle { box-shadow: 0 0 0 3px #fff, 0 0 13px #c7adf0; }
.selection-token { display: block; width: 100%; aspect-ratio: 1; pointer-events: none; }
.selection-token :deep(.token) { box-sizing: border-box; width: 100%; height: 100%; border: 2px solid #332c1c; box-shadow: 0 2px 5px #000b; }
.selection-token :deep(.leaf-left), .selection-token :deep(.leaf-right), .selection-token :deep([class*="leaf-top"]), .selection-token :deep(.leaf-orange) { display: none; }
.selection-card__state { position: absolute; top: 0; right: 0; display: grid; place-items: center; min-width: 23px; height: 23px; border: 1px solid #eee; border-radius: 50%; background: #472969; color: #fff; font: bold 16px/1 sans-serif; text-shadow: none; }
.quantity-controls { display: flex; align-items: center; justify-content: center; gap: 4px; margin: 4px 0 0; font-size: 13px; }
.quantity-controls button { width: 24px; height: 24px; padding: 0; border: 1px solid #777; border-radius: 50%; background: #17131e; color: #fff; cursor: pointer; }
.selection-summary, .role-alert { flex: 0 0 auto; margin: 7px 0 0; text-align: center; color: #e7cf86; font-size: 12px; line-height: 1.3; }
.selection-summary:has(> .sr-only) { margin: 0; height: 0; }
.role-actions { flex: 0 0 auto; display: flex; align-items: stretch; justify-content: center; margin-top: 14px; }
.role-action { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 40px; padding: 3px 11px; border: 2px solid #27252a; border-radius: 0; box-shadow: inset 0 1px 2px #ffffff70, 0 2px 4px #0009; background: linear-gradient(#68666a, #2c2b2e 50%, #08080a); color: #fff; font: bold 23px/1.2 var(--ts-font-body, serif); white-space: nowrap; text-shadow: 0 2px 3px #000; cursor: pointer; }
.role-action + .role-action { border-left-width: 1px; }
.role-action:first-child { border-radius: 14px 0 0 14px; }
.role-action:last-child { border-radius: 0 14px 14px 0; }
.role-action:disabled { opacity: .4; cursor: not-allowed; }
.role-action:not(:disabled):hover { filter: brightness(1.2); }
.role-action:focus-visible, .quantity-controls button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.role-review-action { align-self: center; margin-top: 7px; border: 0; background: transparent; color: #e7cf86; text-decoration: underline; cursor: pointer; }
.role-picker-options { position: absolute; top: -20px; left: -10px; z-index: 5; font-size: 12px; }
.role-picker-options summary { width: 24px; height: 22px; display: grid; place-items: center; list-style: none; cursor: pointer; color: #c0bac8; }
.role-picker-options summary::-webkit-details-marker { display: none; }
.multiple-toggle { display: flex; align-items: center; gap: 5px; padding: 10px; border: 1px solid #5f536b; border-radius: 4px; background: #100c17; white-space: nowrap; cursor: pointer; }
@media (max-width: 640px) {
  :global(.modal-backdrop.modal-backdrop--roles) { align-items: center; padding: 8px; }
  :global(.modal-backdrop.modal-backdrop--roles .modal) { max-height: calc(100dvh - 16px); border-radius: 7px; }
  :global(.modal-backdrop.modal-backdrop--roles .modal > .slot) { padding: 22px 8px 12px; }
  .roles-picker { --role-gap: 8px; }
  .selection-team { grid-template-columns: 38px minmax(0, 1fr); gap: 6px; }
  .selection-team__emblem { width: 40px; height: 44px; }
  .team-count { margin-top: -5px; font-size: 16px; }
  .role-action { min-height: 36px; gap: 4px; padding: 3px 7px; font-size: clamp(14px, 3.8vw, 20px); }
  .selection-card__state { min-width: 18px; height: 18px; font-size: 13px; }
}
@media (max-height: 500px) and (min-width: 641px) {
  .roles-picker { --role-size: 64px; --role-gap: 8px; }
  .selection-team { grid-template-columns: 48px minmax(0, 1fr); }
  .selection-team__emblem { width: 46px; height: 46px; }
  .team-count { font-size: 20px; }
}
@media (prefers-reduced-motion: reduce) { .role-toggle { transition: none; } }
</style>
