<script setup lang="ts">
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useAppStore } from "@/stores/app";
import { playChime } from "@/utils/chime";
import SettingsToggle from "./SettingsToggle.vue";
const app = useAppStore();
const { grimoire } = storeToRefs(app);
const backgroundEditor = ref(false);
const backgroundDraft = ref("");
const backgroundError = ref("");
const soundEditor = ref(false);
const ranges = [
  { key: "avatarScale", label: "玩家头像尺寸", min: 50, max: 250 },
  { key: "tokenScale", label: "玩家标记尺寸", min: 50, max: 200 },
  { key: "reminderScale", label: "提示标记尺寸", min: 50, max: 250 },
  { key: "grimoireOffset", label: "魔典偏移距离", min: -100, max: 100 },
] as const;
function cycleColor(direction: number) {
  grimoire.value.colorblindMode = (grimoire.value.colorblindMode + direction + 3) % 3;
}
function openBackground() {
  backgroundDraft.value = grimoire.value.background || "";
  backgroundError.value = "";
  backgroundEditor.value = true;
}
function saveBackground() {
  const value = backgroundDraft.value.trim();
  if (value) {
    try {
      if (!["http:", "https:"].includes(new URL(value).protocol)) throw new Error();
    } catch { backgroundError.value = "请输入完整的 http 或 https 图片地址。"; return; }
  }
  app.setBackground(value || null);
  backgroundEditor.value = false;
}
</script>

<template>
  <div class="settings-sheet" aria-label="常规设置">
    <label v-for="control in ranges" :key="control.key" class="settings-row settings-row--range">
      <span>{{ control.label }}</span>
      <input v-model.number="grimoire[control.key]" type="range" :min="control.min" :max="control.max" step="5" />
      <output>{{ grimoire[control.key] }}%</output>
    </label>
    <div class="settings-row"><span>色盲模式：{{ ['关闭', '红绿色弱', '高对比度'][grimoire.colorblindMode] }}</span>
      <div class="settings-inline"><button type="button" class="settings-control" aria-label="上一种色盲模式" @click="cycleColor(-1)">◀</button><button type="button" class="settings-control" aria-label="下一种色盲模式" @click="cycleColor(1)">▶</button></div>
    </div>
    <div class="settings-row"><span>背景图片</span><button type="button" class="settings-control" aria-label="设置背景图片" @click="openBackground"><font-awesome-icon icon="image" /></button></div>
    <form v-if="backgroundEditor" class="settings-inline-editor" @submit.prevent="saveBackground">
      <label for="settings-background">自定义背景图片地址</label>
      <input id="settings-background" v-model="backgroundDraft" type="url" placeholder="https://…（留空恢复默认）" />
      <p v-if="backgroundError" role="alert">{{ backgroundError }}</p>
      <div class="settings-inline"><button type="button" class="settings-control" @click="backgroundEditor = false">取消</button><button type="submit" class="settings-control enabled">确认</button><button type="button" class="settings-control" @click="app.setBackground(null); backgroundEditor = false">恢复默认</button></div>
    </form>
    <SettingsToggle v-model="grimoire.showDecorations" label="显示玩家的外观装饰" />
    <SettingsToggle :model-value="grimoire.showAnimations && !grimoire.isStatic" label="显示动画" @update:model-value="grimoire.showAnimations = $event; grimoire.isStatic = !$event" />
    <SettingsToggle v-model="grimoire.showCustomImages" label="显示自定义图片 / 自制图标" />
    <SettingsToggle v-model="grimoire.allowTabMove" label="允许移动侧边标签页" />
    <div class="settings-row settings-row--sound"><label for="sound-volume">音效音量</label><input id="sound-volume" v-model.number="grimoire.soundVolume" type="range" min="0" max="100" /><output>{{ grimoire.isMuted ? 0 : grimoire.soundVolume }}%</output><button type="button" class="settings-control" aria-label="音效设置" @click="soundEditor = !soundEditor"><font-awesome-icon icon="cog" /></button></div>
    <div v-if="soundEditor" class="settings-inline-editor"><SettingsToggle v-model="grimoire.isMuted" label="界面静音" /><button type="button" class="settings-control" @click="playChime('turn', { muted: grimoire.isMuted, volume: grimoire.soundVolume })">试听提示音</button></div>
  </div>
</template>
