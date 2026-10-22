<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useVoiceController } from "@/controllers/VoiceController";
import SettingsToggle from "./SettingsToggle.vue";
const voice = useVoiceController();
const devices = ref<MediaDeviceInfo[]>([]);
const pending = ref("");
const message = ref("");
const supported = computed(() => !!navigator.mediaDevices?.getUserMedia && "RTCPeerConnection" in window);
const microphones = computed(() => devices.value.filter(d => d.kind === "audioinput"));
const processing = [
  { key: "autoGainControl", label: "自动增益控制" },
  { key: "noiseSuppression", label: "降噪" },
  { key: "echoCancellation", label: "回声消除" },
] as const;
async function run(name: string, action: () => Promise<unknown>) {
  if (pending.value) return;
  pending.value = name; message.value = "";
  try { await action(); }
  catch (error) { message.value = error instanceof Error ? error.message : "设备操作失败，请检查浏览器权限。"; }
  finally { pending.value = ""; }
}
async function refreshDevices() {
  if (navigator.mediaDevices?.enumerateDevices) devices.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput");
}
async function setup() {
  if (!supported.value) { message.value = "实时语音需要 HTTPS 或 localhost 以及支持 WebRTC 的浏览器。"; return; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach(track => track.stop());
  await voice.checkMicrophonePermission();
  await refreshDevices();
  message.value = "麦克风权限已检查，可选择设备后连接语音。";
}
async function connect() {
  await voice.connect();
  message.value = voice.connectionStatus.active === "connected" ? "聊天语音已连接。" : "连接请求已发送，请查看连接状态。";
}
function deviceValue(event: Event) { return (event.target as HTMLSelectElement).value; }
onMounted(() => {
  void run("devices", refreshDevices);
  navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
});
onBeforeUnmount(() => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices));
</script>

<template>
  <div class="settings-sheet" aria-label="聊天设置">
    <p v-if="!supported" class="settings-help" role="alert">当前环境不支持实时语音，请使用 HTTPS 或 localhost 打开。</p>
    <div class="settings-row"><label for="microphone-device"><strong>麦克风</strong></label><select id="microphone-device" :value="voice.microphoneDeviceId" :disabled="!supported || !!pending" @change="run('microphone-device', () => voice.setAudioOptions({ deviceId: deviceValue($event) }))"><option value="">默认麦克风</option><option v-for="(device, index) in microphones" :key="device.deviceId || index" :value="device.deviceId">{{ device.label || `麦克风 ${index + 1}` }}</option></select><button type="button" class="settings-control" :class="{ purple: voice.microphoneMuted, enabled: !voice.microphoneMuted }" :aria-label="voice.microphoneMuted ? '取消麦克风静音' : '麦克风静音'" :aria-pressed="!voice.microphoneMuted" :disabled="!supported || !!pending" @click="run('microphone', () => voice.setMicrophoneMuted(!voice.microphoneMuted))"><font-awesome-icon :icon="voice.microphoneMuted ? 'microphone-slash' : 'microphone'" /></button></div>
    <label class="settings-row settings-row--range"><span>音频增益</span><input :value="voice.microphoneVolume" type="range" min="0" max="200" step="5" :disabled="!supported" @input="voice.setMicrophoneVolume(Number(($event.target as HTMLInputElement).value))" /><output>{{ voice.microphoneVolume }}%</output></label>
    <SettingsToggle v-for="option in processing" :key="option.key" :label="option.label" :model-value="voice[option.key]" :disabled="!supported || !!pending" @update:model-value="run(option.key, () => voice.setAudioOptions({ [option.key]: $event }))" />
    <SettingsToggle :model-value="voice.speakingMode === 'push-to-talk'" label="按住说话" :disabled="!supported" @update:model-value="voice.setSpeakingMode($event ? 'push-to-talk' : 'open-mic')" />
    <SettingsToggle :model-value="!voice.speakerMuted" label="收听语音聊天" :disabled="!supported" @update:model-value="voice.setSpeakerMuted(!$event)" />
    <label class="settings-row settings-row--range"><span>聊天音量</span><input :value="voice.speakerVolume" type="range" min="0" max="200" step="5" :disabled="!supported" @input="voice.setSpeakerVolume(Number(($event.target as HTMLInputElement).value))" /><output>{{ voice.speakerVolume }}%</output></label>
    <div class="settings-row"><strong class="settings-help">麦克风出现了问题？</strong><button type="button" class="settings-control purple" :disabled="!!pending" @click="run('setup', setup)">{{ pending === 'setup' ? '检查中…' : '开始设置' }}</button></div>
    <div class="settings-row"><span class="settings-help">{{ ({ idle: '尚未连接', connecting: '正在连接', connected: '已连接', reconnecting: '正在重连', failed: '连接失败' })[voice.connectionStatus.active] || '尚未连接' }}</span><button type="button" class="settings-control enabled" :disabled="!supported || !!pending" @click="run('connect', connect)">{{ pending === 'connect' ? '连接中…' : '连接语音' }}</button></div>
    <p v-if="message" class="settings-help" role="status">{{ message }}</p>
  </div>
</template>
