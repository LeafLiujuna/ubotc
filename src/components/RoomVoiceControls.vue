<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useVoiceController } from '@/controllers/VoiceController';
import { useRoomNotificationsStore } from '@/stores/roomNotifications';
import { useGameStore } from '@/stores/game';

const voice = useVoiceController();
const game = useGameStore();
const pending = ref(false);
const connected = computed(() => voice.connectionStatus.active === 'connected');
const listening = computed(() => connected.value && !voice.speakerMuted);
const micOpen = computed(() => connected.value && voice.canUseMicrophone && !voice.microphoneMuted);
const microphoneLabel = computed(() => !voice.canUseMicrophone
  ? '旁观者只能收听，不能开麦' : micOpen.value ? '闭麦' : '开麦');

async function run(action: () => Promise<void>) {
  if (pending.value) return;
  pending.value = true;
  try { await action(); }
  catch (error) {
    useRoomNotificationsStore().add({
      key: 'voice-control-error', tone: 'error',
      message: error instanceof Error ? error.message : '语音操作失败，请重试。',
    });
  } finally { pending.value = false; }
}
async function toggleListening() {
  await run(async () => {
    if (!connected.value) {
      // Joining from the speaker button must never turn on the microphone.
      await voice.setMicrophoneMuted(true);
      voice.setSpeakerMuted(false);
      await voice.ensureConnected();
    } else voice.setSpeakerMuted(!voice.speakerMuted);
  });
}
async function toggleMicrophone() {
  if (!voice.canUseMicrophone) return;
  await run(async () => {
    if (micOpen.value) await voice.setMicrophoneMuted(true);
    else {
      await voice.ensureConnected();
      await voice.setMicrophoneMuted(false);
    }
  });
}
async function toggleBroadcast() {
  await run(() => voice.setSpeakingChannel(voice.speakingChannel === 'broadcast' ? 'main' : 'broadcast'));
}
function press(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  void voice.pttPress().catch(() => voice.pttRelease());
}
function release() { void voice.pttRelease().catch(() => {}); }
onMounted(() => window.addEventListener('blur', release));
onBeforeUnmount(() => { window.removeEventListener('blur', release); release(); });
</script>

<template>
  <button type="button" class="hud-icon" :class="{ muted: !listening }"
    :title="listening ? '停止收听语音' : '收听语音'" :aria-label="listening ? '停止收听语音' : '收听语音'"
    :aria-pressed="listening" :disabled="pending" @click="toggleListening">
    <font-awesome-icon :icon="['fas', listening ? 'volume-up' : 'volume-xmark']" />
  </button>
  <button v-if="micOpen && voice.speakingMode === 'push-to-talk'" type="button" class="hud-icon ptt-control"
    aria-label="按住发言" title="按住此按钮或 B 键发言" @pointerdown.prevent="press"
    @pointerup="release" @pointercancel="release" @lostpointercapture="release" @blur="release"
    @keydown.space.prevent="voice.pttPress()" @keyup.space.prevent="release"
    @keydown.enter.prevent="voice.pttPress()" @keyup.enter.prevent="release">按住说话</button>
  <button v-if="game.currentIsDm && connected" type="button" class="hud-icon"
    :class="{ muted: voice.speakingChannel !== 'broadcast' }" :disabled="pending"
    :aria-pressed="voice.speakingChannel === 'broadcast'"
    :aria-label="voice.speakingChannel === 'broadcast' ? '切回当前语音频道' : '切换到全员广播'"
    :title="voice.speakingChannel === 'broadcast' ? '正在向所有语音房间广播，点击切回当前频道' : '切换到全员广播（仍需开麦）'"
    @click="toggleBroadcast"><font-awesome-icon :icon="['fas', 'radio']" /></button>
  <button type="button" class="hud-icon" :class="{ muted: !micOpen }"
    :title="microphoneLabel" :aria-label="microphoneLabel" :aria-pressed="micOpen"
    :disabled="pending || !voice.canUseMicrophone" @click="toggleMicrophone">
    <font-awesome-icon :icon="['fas', micOpen ? 'microphone' : 'microphone-slash']" />
  </button>
</template>

<style scoped>
.hud-icon:disabled { cursor: default; opacity: .55; }
.ptt-control { width: auto; padding: 0 6px; font-size: 11px; touch-action: none; user-select: none; }
</style>
