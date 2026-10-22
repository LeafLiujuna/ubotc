<script setup lang="ts">
import { ref } from "vue";
import { useAppStore } from "@/stores/app";
import SettingsToggle from "./SettingsToggle.vue";
const app = useAppStore();
const editing = ref(false);
const draft = ref("");
function editCss() { draft.value = app.grimoire.customCss; editing.value = !editing.value; }
function saveCss() { app.grimoire.customCss = draft.value; editing.value = false; }
</script>

<template>
  <div class="settings-sheet" aria-label="高级选项">
    <SettingsToggle v-model="app.grimoire.showNightClouds" label="显示夜晚阶段的云彩效果" />
    <SettingsToggle v-model="app.grimoire.showTeams" label="在城镇广场上显示阵营" />
    <SettingsToggle v-model="app.grimoire.showTableAvatars" label="在城镇广场上显示头像" />
    <div class="settings-row"><span>自定义 CSS 规则</span><div class="settings-inline"><button type="button" class="settings-control" aria-label="编辑自定义 CSS 规则" @click="editCss">⌘</button><button type="button" class="settings-control settings-toggle" role="switch" aria-label="自定义 CSS 规则" :aria-checked="app.grimoire.customCssEnabled" :class="{ enabled: app.grimoire.customCssEnabled }" @click="app.grimoire.customCssEnabled = !app.grimoire.customCssEnabled">{{ app.grimoire.customCssEnabled ? '✓' : '●' }}</button></div></div>
    <form v-if="editing" class="settings-inline-editor" @submit.prevent="saveCss"><label for="custom-css">本机样式（作用于 #townsquare 内）</label><textarea id="custom-css" v-model="draft" rows="7" spellcheck="false" placeholder=".reference-nameplate { color: gold; }" /><div class="settings-inline"><button type="button" class="settings-control" @click="editing = false">取消</button><button type="submit" class="settings-control enabled">保存规则</button></div></form>
  </div>
</template>
