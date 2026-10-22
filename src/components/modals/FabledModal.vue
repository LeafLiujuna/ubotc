<template>
  <Modal
    v-if="modals.fabled"
    name="fabled"
    title="添加一个非玩家角色"
    :description="isApiRoom
      ? (canManage ? '传奇角色是房间级规则配置，保存后会同步给所有玩家。' : readOnlyHint)
      : '传奇角色会影响本局规则和说书人流程。'"
    @close="toggleModal('fabled')"
  >
    <nav class="npc-tabs" aria-label="非玩家角色分类">
      <button v-for="item in [{ id: 'fabled', name: '传奇角色' }, { id: 'loric', name: '奇遇角色' }]" :key="item.id" type="button" :aria-pressed="npcTab === item.id" @click="npcTab = item.id">{{ item.name }}</button>
    </nav>
    <div class="fabled-manager">
      <section class="fabled-manager__section" aria-labelledby="fabled-current-title">
        <div class="fabled-manager__section-heading">
          <h3 id="fabled-current-title">已配置（{{ configuredRoles.length }}）</h3>
          <span v-if="isApiRoom && !canManage" class="fabled-manager__readonly">只读</span>
        </div>

        <p v-if="!configuredRoles.length" class="fabled-manager__empty">
          尚未配置传奇角色。{{ canManage ? "从下方选择一个角色开始。" : "等待说书人配置。" }}
        </p>

        <ul v-else class="fabled-manager__current" aria-label="已配置传奇角色">
          <li v-for="role in configuredRoles" :key="role.id" class="fabled-manager__current-item">
            <Token :role="role" />
            <div class="fabled-manager__role-copy">
              <strong>{{ role.name || role.id }}</strong>
              <small>{{ role.ability || "传奇角色规则" }}</small>
            </div>
            <div v-if="canManage" class="fabled-manager__actions">
              <button
                type="button"
                class="fabled-manager__action"
                :aria-label="`替换${role.name || role.id}`"
                @click="startReplace(role.id)"
              >
                <font-awesome-icon :icon="['fas', 'right-left']" aria-hidden="true" />
                <span>替换</span>
              </button>
              <button
                type="button"
                class="fabled-manager__action fabled-manager__action--danger"
                :aria-label="`移除${role.name || role.id}`"
                @click="removeRole(role.id)"
              >
                <font-awesome-icon :icon="['fas', 'trash-can']" aria-hidden="true" />
                <span>移除</span>
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="fabled-manager__section" aria-labelledby="fabled-available-title">
        <div class="fabled-manager__section-heading">
          <h3 id="fabled-available-title">
            {{ replacingRoleId ? "选择替换角色" : `可选角色（${availableRoles.length}）` }}
          </h3>
          <button
            v-if="replacingRoleId"
            type="button"
            class="fabled-manager__cancel"
            @click="replacingRoleId = null"
          >
            取消替换
          </button>
        </div>

        <p v-if="!canManage" class="fabled-manager__empty">
          {{ readOnlyHint }}
        </p>
        <p v-else-if="!availableRoles.length" class="fabled-manager__empty">
          当前没有可添加的传奇角色。
        </p>

        <ul v-else class="fabled-manager__available" aria-label="可用传奇角色">
          <li v-for="role in availableRoles" :key="role.id">
            <button
              type="button"
              class="fabled-manager__role-button"
              :title="role.name || role.id"
              :disabled="pending"
              @click="selectRole(role)"
            >
              <Token :role="role" />
              <span>{{ role.name || role.id }}</span>
              <font-awesome-icon
                :icon="['fas', replacingRoleId ? 'right-left' : 'plus']"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import Modal from "./Modal";
import Token from "../Token";
import { useAppStore } from "@/stores/app";
import { useGameController } from "@/controllers/GameController";
import { useGameStore } from "@/stores/game";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";

const appStore = useAppStore();
const gameController = useGameController();
const gameStore = useGameStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();
const { modals } = storeToRefs(appStore);

const replacingRoleId = ref(null);
const pending = ref(false);
const npcTab = ref("fabled");

const isApiRoom = computed(() => Boolean(sessionStore.sessionId && sessionStore.gameServerId));
const canManage = computed(() => (
  isApiRoom.value
    ? gameStore.currentIsDm && gameController.isConnected
    : !sessionStore.isSpectator
));
const readOnlyHint = computed(() => (
  isApiRoom.value && gameStore.currentIsDm && !gameController.isConnected
    ? "房间正在重连，暂时无法修改传奇角色。"
    : "当前配置由说书人管理，其他玩家只能查看。"
));

const configuredRoles = computed(() => (
  playersStore.fabled.filter((role) => role && role.id && role.id !== "storyteller")
));

const availableRoles = computed(() => {
  const configuredIds = new Set(configuredRoles.value.map((role) => role.id));
  if (replacingRoleId.value) configuredIds.delete(replacingRoleId.value);

  return Array.from(appStore.fabled.values()).filter((role) => (
    role.id !== "storyteller"
    && (npcTab.value === "loric" ? role.team === "loric" : role.team !== "loric")
    && !configuredIds.has(role.id)
  ));
});

function toggleModal(name) {
  replacingRoleId.value = null;
  appStore.toggleModal(name);
}

function startReplace(roleId) {
  replacingRoleId.value = roleId;
}

function notifyError(error, fallback) {
  const message = error instanceof Error ? error.message : fallback;
  window.$toast?.error(message);
}

async function persistApiRoles(roleIds) {
  pending.value = true;
  try {
    await gameController.setFabled({ fabledRoleIds: roleIds });
    replacingRoleId.value = null;
    window.$toast?.success("传奇角色配置已同步");
  } catch (error) {
    notifyError(error, "传奇角色配置失败，请重试");
  } finally {
    pending.value = false;
  }
}

async function selectRole(role) {
  if (!canManage.value || pending.value) return;

  if (isApiRoom.value) {
    const nextIds = gameStore.fabledRoleIds.length
      ? [...gameStore.fabledRoleIds]
      : configuredRoles.value.map((item) => item.id);
    const replaceIndex = replacingRoleId.value
      ? nextIds.indexOf(replacingRoleId.value)
      : -1;

    if (replaceIndex >= 0) nextIds.splice(replaceIndex, 1, role.id);
    else if (!nextIds.includes(role.id)) nextIds.push(role.id);
    await persistApiRoles(nextIds);
    return;
  }

  if (replacingRoleId.value) {
    const currentIndex = playersStore.fabled.findIndex((item) => item.id === replacingRoleId.value);
    if (currentIndex >= 0) {
      const next = [...playersStore.fabled];
      next.splice(currentIndex, 1, role);
      playersStore.setFabled({ fabled: next });
    }
    replacingRoleId.value = null;
    return;
  }

  playersStore.setFabled({ fabled: role });
  appStore.toggleModal("fabled");
}

async function removeRole(roleId) {
  if (!canManage.value || pending.value) return;

  if (isApiRoom.value) {
    const nextIds = gameStore.fabledRoleIds.filter((id) => id !== roleId);
    await persistApiRoles(nextIds);
    return;
  }

  const index = playersStore.fabled.findIndex((role) => role.id === roleId);
  if (index >= 0) playersStore.setFabled({ index });
}
</script>

<style scoped lang="scss">
.npc-tabs { display: flex; gap: 2px; margin-bottom: 16px; }
.npc-tabs button { flex: 1; padding: 10px; background: #161219; color: #fff; border: 1px solid #000; cursor: pointer; }
.npc-tabs button[aria-pressed="true"] { background: linear-gradient(#8806c8, #34044c); }
.fabled-manager {
  display: grid;
  grid-template-columns: minmax(238px, 0.82fr) minmax(0, 1.18fr);
  align-items: start;
  gap: 16px;
}

.fabled-manager__section {
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(214, 184, 106, 0.18);
  border-radius: 12px;
  background:
    linear-gradient(160deg, rgba(214, 184, 106, 0.055), transparent 46%),
    rgba(8, 6, 8, 0.18);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);
}

.fabled-manager__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.fabled-manager h3 {
  max-width: none;
  margin: 0;
  color: var(--ts-accent-gold-hover, #e7cf86);
  font-family: var(--ts-font-heading, serif);
  font-size: 1rem;
  line-height: 1.25;
}

.fabled-manager__readonly {
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.8rem;
}

.fabled-manager__empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed rgba(214, 184, 106, 0.35);
  border-radius: 8px;
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.88rem;
  line-height: 1.5;
}

.fabled-manager__current,
.fabled-manager__available {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fabled-manager__available {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.fabled-manager__current {
  grid-template-columns: minmax(0, 1fr);
}

.fabled-manager__current-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 64px;
  padding: 7px 8px;
  border: 1px solid rgba(214, 184, 106, 0.22);
  border-radius: 8px;
  background: rgba(8, 6, 8, 0.2);
}

.fabled-manager__role-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.fabled-manager__role-copy strong,
.fabled-manager__role-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
}

.fabled-manager__role-copy strong {
  color: var(--ts-text-primary, #f4ebdd);
}

.fabled-manager__role-copy small {
  display: -webkit-box;
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.78rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.fabled-manager__actions {
  display: flex;
  gap: 4px;
}

.fabled-manager__action,
.fabled-manager__cancel {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid rgba(214, 184, 106, 0.32);
  border-radius: 6px;
  color: var(--ts-text-primary, #f4ebdd);
  background: rgba(214, 184, 106, 0.08);
  cursor: pointer;
  font: inherit;
}

.fabled-manager__action:hover,
.fabled-manager__cancel:hover {
  border-color: var(--ts-accent-gold, #d6b86a);
  background: rgba(214, 184, 106, 0.18);
}

.fabled-manager__action--danger:hover {
  border-color: var(--ts-accent-crimson-hover, #a63c45);
  background: rgba(166, 60, 69, 0.2);
}

.fabled-manager__cancel {
  min-height: 36px;
  padding-inline: 12px;
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.82rem;
}

.fabled-manager__role-button {
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  padding: 7px 8px;
  border: 1px solid rgba(214, 184, 106, 0.22);
  border-radius: 8px;
  color: var(--ts-text-primary, #f4ebdd);
  background: rgba(8, 6, 8, 0.16);
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  line-height: 1.2;
  text-align: left;
}

.fabled-manager__role-button > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fabled-manager__role-button:hover,
.fabled-manager__role-button:focus-visible {
  border-color: var(--ts-accent-gold, #d6b86a);
  background: rgba(214, 184, 106, 0.16);
}

.fabled-manager__role-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.fabled-manager__role-button :deep(.token),
.fabled-manager__current-item :deep(.token) {
  width: 44px;
  height: 44px;
  pointer-events: none;
  cursor: default;
}

.fabled-manager__role-button :deep(.token) {
  width: 36px;
  height: 36px;
}

:global(.modal-backdrop--fabled) {
  padding:
    max(18px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(18px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
}

:global(.modal-backdrop--fabled .modal.fabled) {
  width: min(680px, calc(100vw - 40px));
  max-height: min(76dvh, 680px);
}

:global(.modal-backdrop--fabled .modal-heading) {
  padding: 18px 70px 13px 22px;
}

:global(.modal-backdrop--fabled .modal-title) {
  font-size: clamp(1.2rem, 2vw, 1.45rem);
}

:global(.modal-backdrop--fabled .modal-description) {
  margin-top: 5px;
  font-size: 0.84rem;
  line-height: 1.45;
}

:global(.modal-backdrop--fabled .modal > .slot) {
  padding: 18px;
}

@media (max-width: 680px) {
  .fabled-manager {
    grid-template-columns: minmax(0, 1fr);
  }

  :global(.modal-backdrop--fabled .modal.fabled) {
    width: 100%;
    max-height: calc(100dvh - max(48px, env(safe-area-inset-top)));
  }
}

@media (max-width: 520px) {
  .fabled-manager__section {
    padding: 12px;
  }

  .fabled-manager__available {
    grid-template-columns: minmax(0, 1fr);
  }

  .fabled-manager__current-item {
    grid-template-columns: 48px minmax(0, 1fr);
  }

  .fabled-manager__actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
