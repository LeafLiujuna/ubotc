<script setup lang="ts">
import { computed } from "vue";
import { cheatSheetEntries, type HotkeyActions } from "@/composables/useGameHotkeys";
import { useGameStore } from "@/stores/game";
import { useSessionStore } from "@/stores/session";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useAppStore } from "@/stores/app";
import SettingsToggle from "./SettingsToggle.vue";
const app = useAppStore();
const game = useGameStore();
const session = useSessionStore();
const vote = useRealtimeVoteStore();
const entries = computed(() => cheatSheetEntries({
  isApiRoom: Boolean(session.sessionId && session.gameServerId),
  isSpectator: session.isSpectator,
  isDm: game.currentIsDm,
  voteActive: vote.isActive,
  votePaused: vote.paused,
  hasVoteHistory: session.voteHistory.length > 0,
  inputDialogVisible: false,
  cheatSheetOpen: false,
  actions: {} as HotkeyActions,
}));
const columns = computed(() => {
  const halfway = Math.ceil(entries.value.length / 2);
  return [entries.value.slice(0, halfway), entries.value.slice(halfway)];
});
</script>

<template>
  <div class="settings-sheet hotkey-settings" aria-label="快捷键设置">
    <div class="hotkey-columns">
      <dl v-for="(column, index) in columns" :key="index" class="hotkey-column">
        <div v-for="entry in column" :key="entry.key + entry.label" class="hotkey-row">
          <dt>{{ entry.label }}</dt>
          <dd><kbd>{{ entry.key.toUpperCase() }}</kbd></dd>
        </div>
      </dl>
    </div>
    <div class="hotkey-options"><SettingsToggle v-model="app.grimoire.hotkeysEnabled" label="启用键盘快捷键" /></div>
    <p class="settings-help">输入文字时不触发游戏快捷键。联机房间按空格举手、按住 B 说话；本地房间按住空格说话。Esc 关闭当前窗口。</p>
  </div>
</template>

<style scoped lang="scss">
.hotkey-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
.hotkey-column { display: grid; align-content: start; gap: 2px; min-width: 0; margin: 0; }
.hotkey-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 30px; color: #fff; font-size: 20px; line-height: 1.25; }
.hotkey-row dt { min-width: 0; overflow-wrap: anywhere; }
.hotkey-row dd { margin: 0; }
.hotkey-settings .hotkey-row kbd { display: inline-block; padding: 1px 4px; color: #080808; background: #fff; border: 0; border-radius: 0; font: bold 20px/1.25 Georgia, 'Times New Roman', serif; white-space: nowrap; text-shadow: none; }
.hotkey-options { margin-top: 16px; }
@media (max-width: 600px) {
  .hotkey-columns { gap: 14px; }
  .hotkey-row { min-height: 29px; gap: 5px; font-size: 14px; }
  .hotkey-settings .hotkey-row kbd { padding: 1px 3px; font-size: 14px; }
}
@media (max-width: 380px) {
  .hotkey-columns { gap: 10px; }
  .hotkey-row, .hotkey-settings .hotkey-row kbd { font-size: 12px; }
}
</style>
