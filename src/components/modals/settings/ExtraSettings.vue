<script setup lang="ts">
import SettingsToggle from "./SettingsToggle.vue";
import VoiceDiagnostics from "./VoiceDiagnostics.vue";
import { ref } from "vue";
import { useAppStore } from "@/stores/app";
import { resetAllPanelLayouts } from "@/composables/useDraggablePanel";
const app = useAppStore();
const voiceTools = ref(false);
defineEmits<{ imageOptIn: [] }>();
function resetLayout() { resetAllPanelLayouts(); window.$toast?.success("浮层布局已恢复默认位置。"); }
</script>

<template>
  <div class="settings-sheet" aria-label="扩展设置">
    <p class="settings-help">浮层布局、远程图标与语音诊断工具。</p>
    <div class="settings-row"><span>重置浮层布局</span><button type="button" class="settings-control" @click="resetLayout">重置</button></div>
    <SettingsToggle :model-value="app.grimoire.isImageOptIn" label="允许加载远程角色图标" @update:model-value="$emit('imageOptIn')" />
    <div class="settings-row"><span>语音活动检测与连接诊断</span><button type="button" class="settings-control" @click="voiceTools = !voiceTools">{{ voiceTools ? '收起' : '展开' }}</button></div>
    <VoiceDiagnostics v-if="voiceTools" />
  </div>
</template>
