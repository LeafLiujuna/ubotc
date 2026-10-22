<script setup lang="ts">
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";
import { useGameStore } from "@/stores/game";
import SettingsToggle from "./SettingsToggle.vue";
import { computed, ref } from "vue";
import { useGameController } from "@/controllers/GameController";
const app = useAppStore();
const session = useSessionStore();
const game = useGameStore();
const controller = useGameController();
const pending = ref(false);
const message = ref("");
const allowWhispers = computed(() => session.gameServerId ? game.gameConfig.allowTextWhispers !== false : app.grimoire.allowTextWhispers);
async function setWhispers(value: boolean) {
  if (session.gameServerId) {
    pending.value = true; message.value = "";
    try {
      const response = await controller.updateConfig({ ...game.gameConfig, allowTextWhispers: value });
      if (response.status !== 200) throw new Error(response.message || "设置未保存");
      game.gameConfig.allowTextWhispers = value;
    } catch (error) { message.value = error instanceof Error ? error.message : "设置保存失败，请重试。"; return; }
    finally { pending.value = false; }
  }
  app.grimoire.allowTextWhispers = value;
}
const stacks = ["auto", "stack", "spread"];
const modes = ["normal", "nominee"];
</script>

<template>
  <div class="settings-sheet" aria-label="游戏设置">
    <SettingsToggle v-model="app.grimoire.showTutorial" label="显示 App 教学步骤" />
    <SettingsToggle v-model="app.grimoire.showEnglishNames" label="额外显示角色英文名" />
    <div class="settings-row"><span>堆叠提示标记</span><button type="button" class="settings-control" @click="app.grimoire.reminderStacking = stacks[(stacks.indexOf(app.grimoire.reminderStacking) + 1) % stacks.length]">{{ ({ auto: '自动', stack: '堆叠', spread: '展开' })[app.grimoire.reminderStacking] }}</button></div>
    <template v-if="!session.isSpectator || game.currentIsDm">
      <SettingsToggle v-model="app.grimoire.showWakeOrder" label="说书人：显示唤醒顺序" />
      <label class="settings-row settings-row--range"><span>说书人：投票时长</span><input v-model.number="app.grimoire.voteDuration" type="range" min="500" max="10000" step="100" @input="session.setVotingSpeed(app.grimoire.voteDuration)" /><output>{{ (app.grimoire.voteDuration / 1000).toFixed(2) }}s</output></label>
      <div class="settings-row" title="聚焦模式突出显示被提名者的座位。"><span>说书人：提名类型</span><button type="button" class="settings-control" :class="{ enabled: app.grimoire.nominationMode === 'nominee' }" @click="app.grimoire.nominationMode = modes[(modes.indexOf(app.grimoire.nominationMode) + 1) % modes.length]">{{ app.grimoire.nominationMode === 'nominee' ? '聚焦于被提名者' : '常规' }}</button></div>
      <SettingsToggle :model-value="allowWhispers" :disabled="pending" label="说书人：允许通过文本窃窃私语" title="应用于你主持的当前房间。" @update:model-value="setWhispers" />
    </template>
    <p v-if="message" class="settings-help" role="status">{{ message }}</p>
  </div>
</template>
