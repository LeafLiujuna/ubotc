<template>
  <Modal
    v-if="modals.settings && !modals.input"
    name="settings"
    title="App设置"
    :class="{ 'settings-user-page': activeTab === 'user', 'settings-hotkeys-page': activeTab === 'hotkeys' }"
    @close="close"
  >
    <div class="settings-modal">
      <div
        v-if="notification.show"
        class="settings-notification"
        :class="`settings-notification--${notification.type}`"
        role="status"
        aria-live="polite"
      >
        <font-awesome-icon :icon="['fas', notification.icon]" aria-hidden="true" />
        <span>{{ notification.message }}</span>
        <button type="button" aria-label="关闭提示" @click="hideNotification">
          <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
        </button>
      </div>

      <div class="settings-layout">
        <div class="settings-content">
          <section
            ref="settingsPanel"
            :id="`settings-panel-${activeTab}`"
            class="settings-panel"
            role="tabpanel"
            :aria-labelledby="`settings-tab-${activeTab}`"
            tabindex="0"
          >
            <GeneralSettings
              v-if="activeTab === 'general'"
            />

            <UserSettings v-else-if="activeTab === 'user'" @change-name="changeName" @avatar-picker="avatarPickerOpen = $event" />
            <VoiceSettings v-else-if="activeTab === 'chat'" />
            <GameSettings v-else-if="activeTab === 'game'" />
            <HotkeySettings v-else-if="activeTab === 'hotkeys'" />
            <AdvancedSettings v-else-if="activeTab === 'advanced'" />
            <ExtraSettings
              v-else
              @image-opt-in="imageOptIn"
            />

          </section>

        </div>

        <nav v-if="!avatarPickerOpen" class="settings-tabs" aria-label="设置分类" role="tablist">
          <button
            v-for="(tab, index) in tabs"
            :id="`settings-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            :tabindex="activeTab === tab.id ? 0 : -1"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`settings-panel-${tab.id}`"
            :class="{ active: activeTab === tab.id }"
            @click="switchTab(tab.id)"
            @keydown="handleTabKeydown($event, index)"
          >
            <span>{{ tab.label }}</span>
          </button>
        </nav>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";
import Modal from "./Modal.vue";
import GeneralSettings from "./settings/GeneralSettings.vue";
import GameSettings from "./settings/GameSettings.vue";
import VoiceSettings from "./settings/VoiceSettings.vue";
import UserSettings from "./settings/UserSettings.vue";
import HotkeySettings from "./settings/HotkeySettings.vue";
import AdvancedSettings from "./settings/AdvancedSettings.vue";
import ExtraSettings from "./settings/ExtraSettings.vue";

type SettingsTab = "general" | "user" | "chat" | "game" | "hotkeys" | "advanced" | "extra";
type NotificationType = "success" | "error" | "info";

const emit = defineEmits<{
  close: [];
  trigger: [payload: [string]];
}>();

const appStore = useAppStore();
const sessionStore = useSessionStore();
const { grimoire, modals } = storeToRefs(appStore);
const session = sessionStore.$state;

const tabs: Array<{ id: SettingsTab; label: string; icon: string }> = [
  { id: "general", label: "常规", icon: "sliders" },
  { id: "user", label: "用户", icon: "user" },
  { id: "chat", label: "聊天", icon: "microphone" },
  { id: "game", label: "游戏", icon: "chess-rook" },
  { id: "hotkeys", label: "快捷键", icon: "keyboard" },
  { id: "advanced", label: "高级选项", icon: "cog" },
  { id: "extra", label: "扩展", icon: "plus" },
];

const activeTab = ref<SettingsTab>("general");
const avatarPickerOpen = ref(false);
const settingsPanel = ref<HTMLElement | null>(null);
const notification = ref({
  show: false,
  type: "success" as NotificationType,
  message: "",
  icon: "circle-check",
});

let notificationTimer: ReturnType<typeof setTimeout> | null = null;

function close(): void {
  emit("close");
  if (modals.value.settings) appStore.toggleModal("settings");
}

function switchTab(tab: SettingsTab): void {
  activeTab.value = tab;
  if (settingsPanel.value) settingsPanel.value.scrollTop = 0;
}

function handleTabKeydown(event: KeyboardEvent, index: number): void {
  let nextIndex = index;
  if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") nextIndex = (index + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  switchTab(tabs[nextIndex].id);
  void nextTick(() => document.getElementById(`settings-tab-${tabs[nextIndex].id}`)?.focus());
}

function toggleImageOptIn(): void {
  appStore.toggleImageOptIn();
}

async function showInputModal({ inputType, inputModal, inputData }: {
  inputType: string;
  inputModal: string;
  inputData: Record<string, unknown>;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    sessionStore.setInputResolver(resolve);
    sessionStore.setInputRejecter(reject);
    sessionStore.setInputType(inputType);
    sessionStore.setInputModal(inputModal);
    sessionStore.setInputData(inputData);
    appStore.toggleModal("input");
  });
}

async function imageOptIn(): Promise<void> {
  const confirmation = grimoire.value.isImageOptIn
    ? true
    : await showInputModal({
        inputType: "confirm",
        inputModal: "confirm",
        inputData: {
          name: ["允许远程自定义图标可能向图片服务器暴露你的 IP 地址，仍要启用吗？"],
        },
      }).catch(() => null);

  if (confirmation !== true) return;
  toggleImageOptIn();
  showNotification("success", grimoire.value.isImageOptIn ? "自定义图标已启用。" : "自定义图标已关闭。");
}

async function changeName(): Promise<void> {
  const result = await showInputModal({
    inputType: "changeName",
    inputModal: "input",
    inputData: {
      name: ["玩家昵称"],
      length: 1,
      placeholder: [session.playerName || ""],
    },
  }).catch(() => null);
  if (!Array.isArray(result)) return;

  const newName = String(result[0] || "").trim();
  if (!newName) return;
  sessionStore.setPlayerName(newName);
  showNotification("success", "昵称已更新。");
}

function showNotification(type: NotificationType, message: string): void {
  if (notificationTimer) clearTimeout(notificationTimer);
  notification.value = {
    show: true,
    type,
    message,
    icon: type === "success" ? "circle-check" : type === "error" ? "circle-exclamation" : "circle-info",
  };
  notificationTimer = setTimeout(hideNotification, 3000);
}

function hideNotification(): void {
  notification.value.show = false;
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }
}

onBeforeUnmount(() => {
  if (notificationTimer) clearTimeout(notificationTimer);
});
</script>

<style scoped lang="scss">
:global(.modal-backdrop--settings) { background: rgba(0, 0, 0, .12); backdrop-filter: none; }
:global(.modal.settings) {
  width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 32px);
  color: #faf9f5; background: rgba(17, 17, 16, .87); border: 2px solid #080808;
  border-radius: 10px; box-shadow: 0 8px 24px #0008, inset 0 1px #ffffff1c; backdrop-filter: none;
}
:global(.modal.settings::after),
:global(.modal.settings > .modal-ornament) { display: none; }
:global(.settings-user-page .modal.settings) { width: min(744px, calc(100vw - 24px)); background: rgba(5, 5, 7, .87); }
:global(.settings-hotkeys-page .modal.settings) { width: min(700px, calc(100vw - 24px)); background: rgba(5, 5, 7, .87); }
:global(.modal.settings > .modal-heading) { padding: 8px 44px; text-align: center; background: #ffffff06; border-bottom: 2px solid #080808; }
:global(.modal.settings .modal-title) { color: #faf9f5; font-size: 20px; line-height: 1.3; letter-spacing: 0; text-shadow: 0 1px 2px #000; }
:global(.modal.settings .top-right-buttons) { top: 4px; right: 5px; }
:global(.modal.settings .top-right-button) { width: 30px; height: 30px; padding: 4px; background: transparent; border: 0; }
:global(.modal.settings > .slot) { padding: 0; overflow: hidden; min-height: 0; }
.settings-modal { width: 100%; min-width: 0; }
.settings-layout { display: flex; flex-direction: column; min-height: 0; }
.settings-content { position: relative; min-width: 0; max-height: calc(100dvh - 125px); overflow: auto; padding: 9px 11px 11px; scrollbar-width: thin; }
.settings-panel:focus-visible { outline: none; }
.settings-tabs { display: flex; flex-shrink: 0; width: 100%; border-top: 2px solid #080808; background: #141414; }
.settings-tabs button {
  flex: 1 1 auto; min-width: 0; min-height: 36px; padding: 6px 7px; border: 0; border-right: 2px solid #080808;
  color: #fff; background: linear-gradient(#ffffff10, transparent); cursor: pointer; font: inherit; font-size: 15px; white-space: nowrap;
  &:last-child { border-right: 0; }
  &:hover { background: linear-gradient(#ad831d, #5f450d); }
  &.active { background: linear-gradient(#7736b7, #32164d); box-shadow: inset 0 1px #d2a0ff7a; }
}
.settings-modal :deep(.settings-sheet) { display: grid; gap: 3px; text-align: left; }
.settings-modal :deep(.settings-row) { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; font-size: 17px; line-height: 1.35; }
.settings-modal :deep(.settings-row--range) { display: grid; grid-template-columns: minmax(155px, 1fr) minmax(90px, 190px) 54px; min-height: 30px; gap: 8px; }
.settings-modal :deep(.settings-row--sound) { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(70px, 150px) 44px 38px; gap: 8px; }
.settings-modal :deep(input[type="range"]) { width: 100%; min-width: 0; margin: 0; accent-color: #0784fa; cursor: pointer; }
.settings-modal :deep(output) { text-align: right; font-size: 15px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.settings-modal :deep(.settings-inline) { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.settings-modal :deep(.settings-control) { display: inline-flex; justify-content: center; align-items: center; min-width: 38px; min-height: 31px; padding: 4px 9px; color: white; font: inherit; font-size: 15px; line-height: 1.2; background: linear-gradient(#525451, #222522 50%, #101110); border: 1px solid #0a0a0a; border-radius: 10px; box-shadow: inset 0 1px #ffffff40, 0 2px 3px #0009; cursor: pointer; }
.settings-modal :deep(.settings-control.enabled) { background: linear-gradient(#e4bd52, #a77b14 50%, #63480b); border-color: #806119; }
.settings-modal :deep(.settings-control.purple) { background: linear-gradient(#8643bd, #3c1a60); }
.settings-modal :deep(.settings-control:disabled), .settings-modal :deep(select:disabled) { opacity: .45; cursor: not-allowed; }
.settings-modal :deep(.settings-toggle) { min-width: 42px; font-size: 21px; padding: 1px 7px; }
.settings-modal :deep(.settings-toggle span) { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-size: 22px; }
.settings-modal :deep(.settings-toggle.enabled span) { color: #b3861f; background: #fff; font-size: 17px; font-weight: 900; }
.settings-modal :deep(select) { max-width: 330px; min-width: 0; color: #e6bb4d; background: #171715; border: 1px solid #ffffff20; padding: 5px; border-radius: 4px; font: inherit; font-size: 14px; }
.settings-modal :deep(.settings-help) { margin: 3px 0 7px; color: #c9c7c1; font-size: 12px; line-height: 1.5; }
.settings-modal :deep(.settings-inline-editor) { display: grid; gap: 8px; margin: 5px 0; padding: 10px; background: #080808b3; border: 1px solid #8885; border-radius: 6px; font-size: 13px; }
.settings-modal :deep(.settings-inline-editor input:not([type="range"])), .settings-modal :deep(textarea) { box-sizing: border-box; width: 100%; min-width: 0; padding: 8px; color: #f9f5ea; background: #171715; border: 1px solid #b59a4e; border-radius: 4px; font: inherit; }
.settings-modal :deep(.settings-row--hotkey) { min-height: 36px; font-size: 14px; border-bottom: 1px solid #ffffff10; }
.settings-modal :deep(.settings-row--hotkey small) { margin-left: 8px; color: #aaa; font-size: 11px; }
.settings-modal :deep(kbd) { padding: 2px 8px; background: #ffffff12; border: 1px solid #ffffff30; border-radius: 4px; font-size: 12px; }
.settings-modal :deep(button:focus-visible), .settings-modal :deep(input:focus-visible), .settings-modal :deep(select:focus-visible), .settings-modal :deep(textarea:focus-visible) { outline: 2px solid #e0b952; outline-offset: 2px; }
.settings-modal :deep(.settings-section__header) { display: none; }
.settings-modal :deep(.settings-list) { display: grid; grid-template-columns: 1fr; margin: 0 0 9px; gap: 5px; }
.settings-modal :deep(.setting-row) { min-height: 52px; padding: 6px 9px; border-radius: 5px; }
.settings-modal :deep(.setting-row__copy small) { font-size: 11px; }
.settings-notification { display: flex; align-items: center; gap: 8px; margin: 8px; padding: 7px; color: #e9cf85; background: #322c1b; border: 1px solid #97762e; font-size: 13px; }
.settings-notification button { margin-left: auto; color: inherit; background: transparent; border: 0; cursor: pointer; }
@media (max-width: 540px) {
  .settings-tabs { overflow-x: auto; }
  .settings-tabs button { padding: 8px 6px; font-size: 12px; min-height: 40px; }
  .settings-modal :deep(.settings-row) { font-size: 14px; }
  .settings-modal :deep(.settings-row--range) { grid-template-columns: minmax(125px, 1fr) minmax(60px, 1fr) 42px; gap: 5px; }
  .settings-modal :deep(.settings-row--sound) { grid-template-columns: minmax(80px, 1fr) minmax(55px, 1fr) 40px 34px; gap: 5px; }
  .settings-modal :deep(output) { font-size: 12px; }
  .settings-modal :deep(select) { max-width: 62%; }
}
</style>
