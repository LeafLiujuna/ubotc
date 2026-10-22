<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useUserStore } from "@/stores/user";
import { useSessionStore } from "@/stores/session";
import { useVoiceController } from "@/controllers/VoiceController";
import { AuthHelper } from "@/helpers/auth";
import { AuthApi } from "@/api/http/auth";
import { getLoginLabel, isLocalLoginEnabled } from "@/config/env";
import { UserApi } from "@/api/http/user";
import { useAppStore } from "@/stores/app";
import { resolveProfileAvatar } from "@/utils/profileAvatars";
import { readSettings, writeSettings } from "@/utils/settingsStorage";

const emit = defineEmits<{ changeName: []; avatarPicker: [open: boolean] }>();
const user = useUserStore(), session = useSessionStore(), voice = useVoiceController(), app = useAppStore();
const preferenceKey = `ts-user-appearance:v1:${user.userId || "guest"}`;
const saved = readSettings(preferenceKey, { avatar: "", frame: 0 });
const frame = ref(((Math.trunc(saved.frame) % 3) + 3) % 3);
const loading = ref(false), message = ref(""), publicPending = ref(false), microphonePending = ref(false);
const uploading = ref(false), choosingAvatar = ref(false);
const avatarButton = ref<HTMLButtonElement>(), fileInput = ref<HTMLInputElement>();
const avatarBack = ref<HTMLButtonElement>();
const name = computed(() => session.playerName || user.current?.displayName || "旅人");
const accountName = computed(() => user.current?.displayName || name.value);
const avatarValue = computed(() => resolveProfileAvatar(session.playerAvatar)
  ? session.playerAvatar : user.current?.avatarUrl || "");
const avatar = computed(() => resolveProfileAvatar(avatarValue.value));
const stats = computed(() => user.current?.stats);
const privateStats = computed(() => Boolean(user.current?.hideGameResults));
const registrationDate = computed(() => {
  if (!user.current?.createdAt) return "—";
  const date = new Date(Number(user.current.createdAt) * 1000);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
});
const accountLevel = computed(() => !user.current ? "访客" : user.current.isAdmin ? "管理员"
  : user.current.isCertifiedStoryteller ? "认证说书人" : `玩家 ${user.current.level} / 说书人 ${user.current.storytellerLevel}`);
const statistics = computed(() => {
  const empty = user.isLoggedIn ? "—" : "0", character = stats.value?.favoriteStartingCharacter;
  return [
    { value: stats.value?.dmCount ?? empty, lines: ["说书", "次数"] },
    { value: stats.value ? Math.max(0, stats.value.totalGames - stats.value.dmCount) : empty, lines: ["游戏", "场次"] },
    { value: stats.value?.favoriteScript || "无", lines: ["玩过最多的", "剧本"] },
    { value: character ? app.roles.get(character)?.name || character : "无", lines: ["最多的", "起始角色"] },
  ];
});
function saveAppearance() { writeSettings(preferenceKey, { avatar: avatarValue.value, frame: frame.value }); }
function cycleFrame(direction: number) { frame.value = (frame.value + direction + 3) % 3; saveAppearance(); }
function showAvatars(open: boolean) {
  choosingAvatar.value = open; message.value = ""; emit("avatarPicker", open);
  void nextTick(() => (open ? avatarBack.value : avatarButton.value)?.focus());
}
function selectAvatar(value: string) { session.updatePlayerAvatar(value); saveAppearance(); showAvatars(false); }
async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    message.value = "请选择 5 MB 以内的 JPG、PNG、WebP 或 GIF 图片。"; return;
  }
  uploading.value = true; message.value = "";
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("图片无法打开"));
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理图片");
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 256, 256);
    selectAvatar(canvas.toDataURL("image/webp", 0.9));
  } catch { message.value = "图片加载失败，请选择其他图片重试。"; }
  finally { uploading.value = false; }
}
async function copyId() {
  if (!user.userId) return;
  try { await navigator.clipboard.writeText(user.userId); message.value = "用户 ID 已复制。"; }
  catch { message.value = "复制失败，请手动选择用户 ID 复制。"; }
}
function login() { AuthHelper.doLogin(window.location.pathname); }
async function linkQq() {
  loading.value = true; message.value = "";
  try { window.location.assign(await AuthApi.linkQq(`${window.location.pathname}${window.location.search}`)); }
  catch (error) { message.value = error instanceof Error ? error.message : "QQ 绑定暂不可用，请稍后重试。"; }
  finally { loading.value = false; }
}
async function refresh() {
  if (!user.isLoggedIn) return;
  loading.value = true; message.value = "";
  try { await user.refreshCurrentUserInfo({ ignoreRedirectToLogin: true }); }
  catch { message.value = "资料暂时无法加载，请稍后重试。"; }
  finally { loading.value = false; }
}
async function togglePublic() {
  if (!user.current || publicPending.value) return;
  publicPending.value = true; message.value = "";
  try {
    const response = await UserApi.setGameResultsHidden(!user.current.hideGameResults);
    if (response.status !== 200 || !response.data) throw new Error();
    user.current.hideGameResults = response.data.hideGameResults;
  } catch { message.value = "统计可见性保存失败，请重试。"; }
  finally { publicPending.value = false; }
}
async function toggleMicrophone() {
  microphonePending.value = true; message.value = "";
  try { await voice.setMicrophoneMuted(!voice.microphoneMuted); }
  catch (error) { message.value = error instanceof Error ? error.message : "麦克风设置失败，请重试。"; }
  finally { microphonePending.value = false; }
}
async function logout() {
  loading.value = true;
  try { const url = await AuthHelper.logout(); window.location.assign(url || "/"); }
  catch { message.value = "本机已退出，远程账号退出失败，请刷新后重试。"; }
  finally { loading.value = false; }
}
onMounted(() => { if (resolveProfileAvatar(saved.avatar)) session.updatePlayerAvatar(saved.avatar); void refresh(); });
onBeforeUnmount(() => emit("avatarPicker", false));
</script>

<template>
  <div class="settings-sheet user-settings" aria-label="用户设置">
    <section v-if="choosingAvatar" class="user-avatar-picker" aria-label="上传头像" @keydown.esc.stop.prevent="showAvatars(false)">
      <button ref="avatarBack" type="button" class="avatar-picker-back" @click="showAvatars(false)">‹ 返回用户资料</button>
      <div class="user-avatar-upload">
        <button type="button" class="avatar-option avatar-option--upload" :disabled="uploading" @click="fileInput?.click()"><font-awesome-icon icon="file-arrow-up" aria-hidden="true" /><span>{{ uploading ? '处理中…' : '上传头像' }}</span></button>
        <p class="settings-help">上传你自己的头像，支持 5 MB 以内的 JPG、PNG、WebP 或 GIF 图片。</p>
      </div>
      <input ref="fileInput" class="sr-only" tabindex="-1" type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="上传头像图片" @change="uploadAvatar" />
    </section>
    <div v-else class="user-settings-grid">
      <div class="user-profile-card" :class="`user-profile-card--${frame}`">
        <button ref="avatarButton" type="button" class="avatar-button" aria-label="更换头像" @click="showAvatars(true)"><img v-if="avatar" :src="avatar" alt="当前玩家头像" /><span v-else class="avatar-placeholder"><font-awesome-icon icon="user" aria-hidden="true" /><span>上传头像</span></span></button>
        <div class="user-name-controls">
          <button type="button" class="settings-control user-frame-arrow" aria-label="上一种昵称外观" @click="cycleFrame(-1)"><font-awesome-icon icon="circle-arrow-left" /></button>
          <button type="button" class="user-nameplate" aria-label="修改昵称" @click="emit('changeName')"><span>{{ accountName }}</span><small v-if="name !== accountName">{{ name }}</small></button>
          <button type="button" class="settings-control user-frame-arrow" aria-label="下一种昵称外观" @click="cycleFrame(1)"><font-awesome-icon icon="circle-arrow-right" /></button>
        </div>
      </div>
      <div class="user-settings-details">
        <div class="user-detail-row"><strong>用户ID:</strong><span class="user-detail-value user-id">{{ user.userId || '尚未登录' }}<button type="button" class="user-copy-id" aria-label="复制用户ID" :disabled="!user.userId" @click="copyId"><font-awesome-icon icon="copy" /></button></span></div>
        <div class="user-detail-row"><strong>注册:</strong><span class="user-detail-value">{{ registrationDate }}<span class="user-account-mark" aria-hidden="true">🌱</span></span></div>
        <div class="user-detail-row"><strong>账号等级:</strong><span class="user-detail-value" :title="accountLevel">{{ accountLevel }}<font-awesome-icon class="user-level-icon" icon="users" aria-hidden="true" /></span></div>
        <div class="user-detail-row user-detail-row--gain"><label for="user-mic-gain"><strong>音量增益:</strong></label><div class="user-gain-controls"><input id="user-mic-gain" :value="voice.microphoneVolume" type="range" min="0" max="200" step="5" @input="voice.setMicrophoneVolume(Number(($event.target as HTMLInputElement).value))" /><output>{{ voice.microphoneVolume }}%</output><button type="button" class="settings-control user-microphone" :class="{ enabled: !voice.microphoneMuted, purple: voice.microphoneMuted }" :aria-label="voice.microphoneMuted ? '取消麦克风静音' : '麦克风静音'" :aria-pressed="!voice.microphoneMuted" :disabled="microphonePending" @click="toggleMicrophone"><font-awesome-icon :icon="voice.microphoneMuted ? 'microphone-slash' : 'microphone'" /></button></div></div>
        <div class="user-detail-row"><strong>统计:</strong><button type="button" class="settings-control user-stat-visibility" :class="privateStats ? 'purple' : 'enabled'" :disabled="!user.isLoggedIn || publicPending" :aria-pressed="!privateStats" @click="togglePublic"><font-awesome-icon :icon="privateStats ? 'lock' : 'eye'" aria-hidden="true" />{{ privateStats ? '保密' : '公开' }}</button></div>
      </div>
      <div class="user-stats" :class="{ 'is-private': privateStats }" :aria-busy="loading">
        <div v-for="(stat, index) in statistics" :key="index" class="user-stat">
          <strong class="user-stat-value" :class="{ 'is-word': String(stat.value).length > 2, 'is-empty': stat.value === '无' }" :aria-label="privateStats ? '已保密' : String(stat.value)" :title="privateStats ? '已保密' : String(stat.value)"><span :aria-hidden="privateStats || undefined">{{ stat.value }}</span></strong>
          <span class="user-stat-label"><span v-for="line in stat.lines" :key="line">{{ line }}</span></span>
        </div>
      </div>
    </div>
    <footer class="user-settings-actions"><button v-if="!user.isLoggedIn" type="button" class="settings-control enabled" @click="login">{{ getLoginLabel() }}</button><button v-else-if="!isLocalLoginEnabled()" type="button" class="settings-control enabled" :disabled="loading || user.current?.qqLinked" @click="linkQq">{{ user.current?.qqLinked ? 'QQ 已绑定' : '绑定 QQ' }}</button><button type="button" class="settings-control enabled" :disabled="loading || !user.isLoggedIn" @click="refresh">{{ loading ? '验证中…' : '验证账号' }}</button><button type="button" class="settings-control purple" :disabled="loading || !user.isLoggedIn" @click="logout">退出登录</button></footer>
    <p v-if="message" class="settings-help user-settings-message" role="status">{{ message }}</p>
  </div>
</template>

<style scoped lang="scss">
.user-settings { gap: 0; color: #fff; text-shadow: 0 1px 2px #000; }
.user-settings-grid { display: grid; grid-template-columns: minmax(150px,200px) minmax(0,1fr); column-gap: 18px; row-gap: 5px; align-items: start; }
.user-profile-card { grid-row: 1 / span 2; position: relative; align-self: center; padding-bottom: 22px; }
.avatar-button { display: block; width: 100%; aspect-ratio: 1; padding: 0; border: 2px solid #080808; border-radius: 7px; background: #27183a; overflow: hidden; cursor: pointer; }
.avatar-button img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { display: grid; height: 100%; align-content: center; justify-items: center; gap: 12px; color: #ddd; font: inherit; }
.avatar-placeholder svg { height: 48px; }
.user-name-controls { position: absolute; bottom: 5px; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 6px; }
.user-nameplate { min-width: 0; max-width: calc(100% - 70px); padding: 4px 7px; color: #fff; background: #080609ed; border: 2px solid #080808; border-radius: 3px; cursor: pointer; font: bold 20px/1.15 Georgia,'Noto Serif SC',serif; }
.user-nameplate span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-nameplate small { display: block; font-size: 14px; }
.user-settings .settings-control.user-frame-arrow { flex-shrink: 0; min-width: 32px; width: 32px; min-height: 38px; padding: 4px; border-radius: 7px; font-size: 17px; }
.user-profile-card--1 .user-nameplate { color: #211306; background: linear-gradient(105deg,#d6bc79,#fff8db 35%,#e6d2a1); border: 2px solid #7d1d1e; border-radius: 8% 8% 18% 18%; box-shadow: -6px 3px #7d1d1e,6px 3px #7d1d1e; }
.user-profile-card--2 .user-nameplate { color: #ffecc0; background: linear-gradient(#4c351b,#17100c); border-color: #d7ac4f; box-shadow: 0 0 7px #d6ab4255; }
.user-settings-details { min-width: 0; }
.user-detail-row { display: flex; align-items: center; justify-content: space-between; min-height: 34px; gap: 8px; font-size: 19px; line-height: 1.25; }
.user-detail-row > strong,.user-detail-row > label { flex-shrink: 0; }
.user-detail-value { display: inline-flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; text-align: right; font-family: Georgia,'Noto Serif SC',serif; font-size: 17px; overflow-wrap: anywhere; }
.user-id { font-size: 16px; }
.user-copy-id { flex-shrink: 0; padding: 2px; background: none; border: 0; color: #fff; font-size: 17px; cursor: pointer; }
.user-copy-id:disabled { visibility: hidden; }
.user-account-mark { font-size: 19px; }
.user-level-icon { flex-shrink: 0; color: #f37e1c; }
.user-gain-controls { display: grid; grid-template-columns: minmax(50px,1fr) 48px 44px; gap: 7px; align-items: center; width: 64%; min-width: 0; }
.user-gain-controls output { font-family: Georgia,serif; }
.user-settings .settings-control.user-microphone { min-width: 44px; min-height: 31px; padding: 3px 10px; }
.user-detail-row--gain:focus-within > label,.user-detail-row--gain:hover > label { color: #e8b834; }
.user-settings .settings-control.user-stat-visibility { min-height: 29px; min-width: 83px; gap: 5px; padding: 3px 9px; font-size: 16px; }
.user-stats { display: grid; grid-template-columns: 1fr 1fr 1.45fr 1.45fr; gap: 12px; padding-top: 2px; text-align: center; }
.user-stat { display: grid; grid-template-rows: 65px auto; min-width: 0; align-items: center; }
.user-stat-value { display: grid; place-items: center; min-width: 0; min-height: 65px; font: 52px/1 Georgia,'Noto Serif SC',serif; }
.user-stat-value.is-empty { font-size: 64px; font-weight: 700; }
.user-stat-value.is-word { font-size: 21px; line-height: 1.15; overflow-wrap: anywhere; }
.user-stat-label { font-size: 19px; line-height: 1.05; }
.user-stat-label > span { display: block; }
.user-stat:hover { color: #e5b125; }
.is-private .user-stat-value > span { filter: blur(7px); user-select: none; }
.user-settings-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 0; margin: 16px 0 5px; }
.user-settings .user-settings-actions button { min-height: 42px; padding: 5px 12px; border-radius: 0; font-size: 20px; font-weight: bold; }
.user-settings .user-settings-actions button:first-child { border-radius: 12px 0 0 12px; }
.user-settings .user-settings-actions button:last-child { border-radius: 0 12px 12px 0; }
.user-settings-message { text-align: center; }
.avatar-picker-back { margin-bottom: 7px; padding: 0; color: #ddd; background: none; font: inherit; font-size: 13px; cursor: pointer; }
.user-avatar-upload { display: grid; justify-items: center; gap: 12px; padding: 18px 12px; text-align: center; }
.avatar-option { display: grid; place-items: center; aspect-ratio: 1; min-width: 0; padding: 0; overflow: hidden; border: 2px solid #080808; border-radius: 7px; background: #090909; color: #fff; cursor: pointer; }
.avatar-option:hover,.avatar-option:focus-visible { border-color: #e3ae23; box-shadow: 0 0 0 1px #936b19; color: #edb827; }
.avatar-option--upload { width: 140px; align-content: center; gap: 3px; font-size: 18px; font-weight: bold; }
.avatar-option--upload svg { height: 36px; }
.avatar-option:disabled { cursor: wait; opacity: .6; }
@media(max-width:600px) {
  .user-settings-grid { grid-template-columns: 110px minmax(0,1fr); gap: 12px; }
  .user-profile-card { grid-row: 1; }
  .user-detail-row { min-height: 30px; gap: 4px; font-size: 13px; }
  .user-detail-value,.user-id { gap: 4px; font-size: 12px; }
  .user-copy-id { font-size: 13px; }
  .user-account-mark { font-size: 14px; }
  .user-gain-controls { width: 66%; grid-template-columns: minmax(25px,1fr) 34px 30px; gap: 3px; }
  .user-settings .settings-control.user-microphone { min-width: 30px; width: 30px; padding: 3px; }
  .user-settings .settings-control.user-stat-visibility { min-width: 63px; font-size: 13px; }
  .user-stats { grid-column: 1 / -1; gap: 6px; }
  .user-stat { grid-template-rows: 55px auto; }
  .user-stat-value { min-height: 55px; font-size: 43px; }
  .user-stat-value.is-empty { font-size: 52px; }
  .user-stat-value.is-word { font-size: 17px; }
  .user-stat-label { font-size: 15px; }
  .user-name-controls { gap: 3px; }
  .user-settings .settings-control.user-frame-arrow { min-width: 23px; width: 23px; min-height: 28px; font-size: 13px; padding: 2px; }
  .user-nameplate { max-width: calc(100% - 49px); font-size: 15px; padding: 3px; }
  .user-nameplate small { font-size: 11px; }
  .user-settings .user-settings-actions button { min-height: 36px; padding: 5px 9px; font-size: 15px; }
  .avatar-option--upload { font-size: 13px; }
  .avatar-option--upload svg { height: 27px; }
}
@media(max-width:380px) { .user-settings-grid { grid-template-columns: 88px minmax(0,1fr); gap: 8px; } .user-detail-row { font-size: 12px; } }
</style>
