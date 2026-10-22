<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { UserApi } from '@/api/http/user';
import { useAppStore } from '@/stores/app';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import { useGameController } from '@/controllers/GameController';
import { useVoiceController } from '@/controllers/VoiceController';
import { requestInputModal } from '@/services/inputModalService';
import { resolveProfileAvatar } from '@/utils/profileAvatars';
import { SocketClientEvent } from '@/types/socket';
import type { PublicUserProfile } from '@/types/user';
import defaultAvatar from '@/assets/storyteller-Ch-i0CP4.png';

const props = defineProps<{ member: {
  userId: string; name: string; isDM: boolean; isOwner: boolean; connected: boolean; seat: number;
} }>();
const emit = defineEmits<{ back: []; close: [] }>();
const users = useUserStore(), game = useGameStore(), app = useAppStore();
const controller = useGameController(), voice = useVoiceController();
const profile = ref<PublicUserProfile | null>(null), loading = ref(false), pending = ref(false), message = ref('');
const isSelf = computed(() => props.member.userId === users.userId);
const user = computed(() => profile.value || (isSelf.value ? users.current : users.getUserById(props.member.userId)));
const avatar = computed(() => resolveProfileAvatar(user.value?.avatarUrl) || defaultAvatar);
const stats = computed(() => profile.value?.stats ?? (isSelf.value ? users.current?.stats : null));
const registered = computed(() => {
  const value = profile.value?.createdAt || (isSelf.value ? users.current?.createdAt : 0);
  if (!value) return '—';
  return new Date(value < 1e12 ? value * 1000 : value).toLocaleDateString('zh-CN');
});
const canManage = computed(() => game.currentIsDm || Boolean(game.roomUsers[users.userId || '']?.isRoomOwner));
const canChangeDM = computed(() => canManage.value && props.member.connected && (!props.member.isOwner || isSelf.value));
const canKick = computed(() => game.currentIsDm && !isSelf.value && !props.member.isOwner && props.member.connected);
const volume = computed(() => voice.userVolumeSettings[props.member.userId] ?? 100);
const muted = computed(() => Boolean(voice.localMutedUsers[props.member.userId]));
const favoriteCharacter = computed(() => {
  const id = stats.value?.favoriteStartingCharacter;
  return id ? app.roles.get(id)?.name || id : stats.value ? '无' : '未公开';
});
watch(() => props.member.userId, async (id, _old, cleanup) => {
  let cancelled = false;
  cleanup(() => { cancelled = true; });
  profile.value = null; loading.value = true; message.value = '';
  try {
    const response = await UserApi.getUserProfile(id);
    if (cancelled) return;
    if (!response.data) throw new Error(response.message || '用户资料暂不可用');
    profile.value = response.data;
  } catch (error) {
    if (!cancelled) message.value = error instanceof Error ? error.message : '用户资料加载失败';
  } finally { if (!cancelled) loading.value = false; }
}, { immediate: true });

function setVolume(event: Event) {
  voice.setUserVolume(props.member.userId, Number((event.target as HTMLInputElement).value));
}
async function manage(action: 'storyteller' | 'kick') {
  if (pending.value || !controller.isConnected || (action === 'storyteller' ? !canChangeDM.value : !canKick.value)) return;
  const member = { ...props.member };
  const title = action === 'kick' ? `将 ${member.name} 踢出房间？`
    : member.isDM ? `移除 ${member.name} 的说书人身份？` : `将 ${member.name} 添加为说书人？${member.seat ? '该成员会离开当前座位。' : ''}`;
  pending.value = true;
  try {
    const confirmed = await requestInputModal({ inputType: 'confirm', inputModal: 'confirm', inputData: { name: [title] } }).catch(() => false);
    if (confirmed !== true) return;
    if (action === 'kick') await controller.kickUser({ userId: member.userId });
    else if (member.isDM) await controller.request(SocketClientEvent.RemoveDM, { userId: member.userId });
    else await controller.request(SocketClientEvent.SetDM, { userId: member.userId, mode: 'set' });
    message.value = action === 'kick' ? '该成员已被移出房间' : member.isDM ? '已移除说书人身份' : '已添加说书人';
    if (action === 'kick') emit('back');
  } catch (error) { message.value = error instanceof Error ? error.message : '操作失败，请重试'; }
  finally { pending.value = false; }
}
</script>

<template>
  <section class="room-member-profile" :aria-busy="loading || pending">
    <h2>用户资料</h2>
    <div class="profile-layout">
      <figure class="profile-portrait">
        <img :src="avatar" alt="" @error="($event.target as HTMLImageElement).src = defaultAvatar" />
        <figcaption>{{ member.name }}<small v-if="member.isOwner">房主</small></figcaption>
      </figure>
      <div class="profile-information">
        <dl>
          <div><dt>用户ID：</dt><dd>{{ user?.publicId || member.userId }}</dd></div>
          <div><dt>注册：</dt><dd>{{ loading ? '加载中…' : registered }}</dd></div>
          <div><dt>账号等级：</dt><dd>{{ user?.isVip ? 'VIP 账号' : '普通账号' }}<font-awesome-icon v-if="user?.isCertifiedStoryteller" icon="hat-wizard" title="认证说书人" /></dd></div>
          <div v-if="!isSelf" class="profile-volume"><dt><label for="room-member-volume">音量增益：</label></dt><dd>
            <input id="room-member-volume" type="range" min="0" max="200" step="5" :value="volume" @input="setVolume" />
            <output for="room-member-volume">{{ volume }}%</output>
            <button type="button" class="mute-button" :aria-label="muted ? '取消静音该用户' : '静音该用户'" :aria-pressed="muted" @click="voice.toggleLocalMuteUser(member.userId)">
              <font-awesome-icon :icon="muted ? 'volume-xmark' : 'volume-high'" />
            </button>
          </dd></div>
          <div><dt>当前身份：</dt><dd>{{ member.isDM ? '说书人' : member.seat ? `${member.seat} 号玩家` : '旁观者' }}<small>{{ member.connected ? '在线' : '离线' }}</small></dd></div>
        </dl>
        <div class="profile-stat-heading">统计：<small v-if="!stats && !loading">未公开</small></div>
        <div class="profile-stats">
          <div><strong>{{ stats?.dmCount ?? '—' }}</strong><span>说书<br />次数</span></div>
          <div><strong>{{ stats?.totalGames ?? '—' }}</strong><span>游戏<br />场次</span></div>
          <div><strong class="stat-name">{{ stats ? stats.favoriteScript || '无' : '未公开' }}</strong><span>玩过最多的<br />剧本</span></div>
          <div><strong class="stat-name">{{ favoriteCharacter }}</strong><span>最多的<br />起始角色</span></div>
        </div>
      </div>
    </div>
    <p v-if="message" class="profile-message" role="status">{{ message }}</p>
    <footer class="profile-actions">
      <button type="button" class="back-button" @click="emit('back')">‹ 房间成员</button>
      <button v-if="canChangeDM" type="button" :class="{ gold: !member.isDM }" :disabled="pending || !controller.isConnected" @click="manage('storyteller')">
        <font-awesome-icon icon="hat-wizard" />{{ member.isDM ? '移除说书人' : '添加说书人' }}
      </button>
      <button v-if="canKick" type="button" :disabled="pending || !controller.isConnected" @click="manage('kick')"><font-awesome-icon icon="user-slash" />踢出用户</button>
      <button type="button" class="close-button" @click="emit('close')">✖ 关闭</button>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.room-member-profile { padding: 8px 10px 12px; color: #fff; font-size: 16px; text-shadow: 0 1px 2px #000; h2 { margin: 0 0 10px; text-align: center; font-size: 17px; font-weight: 400; } }
.profile-layout { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 15px; }
.profile-portrait { margin: 0; align-self: start; img { display: block; width: 100%; aspect-ratio: 1; border: 1px solid #050306; border-radius: 5px; object-fit: cover; } figcaption { width: fit-content; max-width: 100%; margin: 2px auto 0; padding: 2px 10px; background: #30242c; border: 1px solid #a88736; text-align: center; overflow-wrap: anywhere; } small { margin-left: 5px; color: #dac166; font-size: 11px; } }
.profile-information { min-width: 0; dl { margin: 0; > div { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 5px; align-items: center; min-height: 27px; } dt { font-weight: 700; } dd { display: flex; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; margin: 0; text-align: right; overflow-wrap: anywhere; font-size: 15px; } dd small { color: #bba5ca; font-size: 12px; } } }
.profile-volume { input { width: 100%; min-width: 40px; accent-color: #b58bda; cursor: pointer; } output { min-width: 40px; font-size: 13px; } }
.mute-button { flex-shrink: 0; width: 28px; height: 24px; border: 1px solid #b99435; border-radius: 12px; background: linear-gradient(#e2c557, #92701c); color: #fff; cursor: pointer; }
.profile-stat-heading { display: flex; justify-content: space-between; margin-top: 5px; font-weight: 700; small { color: #b9a8c3; font-weight: 400; } }
.profile-stats { display: grid; grid-template-columns: .7fr .7fr 1.3fr 1.3fr; gap: 8px; margin-top: 4px; text-align: center; > div { display: flex; flex-direction: column; align-items: center; min-width: 0; } strong { display: flex; align-items: center; justify-content: center; min-height: 54px; font-size: 44px; font-weight: 700; } .stat-name { font-size: 22px; overflow-wrap: anywhere; } span { line-height: 1.1; font-size: 15px; } }
.profile-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; margin-top: 13px; button { display: inline-flex; gap: 5px; align-items: center; justify-content: center; min-height: 30px; padding: 3px 9px; border: 1px solid #3d2458; border-radius: 3px; background: linear-gradient(#9564c8, #45206c); color: #fff; font: inherit; font-size: 15px; cursor: pointer; } button.gold { border-color: #a57c1f; background: linear-gradient(#dfbb53, #87601c); } button.back-button, button.close-button { background: linear-gradient(#343038, #0c090f); border-color: #29242d; color: #e2c14f; } button:disabled { opacity: .5; cursor: wait; } }
.profile-message { margin: 8px 0 0; text-align: center; font-size: 14px; color: #ecd088; }
button:focus-visible, input:focus-visible { outline: 2px solid #eed17a; outline-offset: 2px; }
@media (max-width: 600px) { .profile-layout { grid-template-columns: 100px minmax(0, 1fr); gap: 10px; } .profile-information dl { > div { grid-template-columns: 78px minmax(0, 1fr); } dt, dd { font-size: 13px; } } .profile-stats { grid-template-columns: 1fr 1fr; strong { min-height: 40px; font-size: 32px; } .stat-name { font-size: 18px; } span { font-size: 13px; } } .profile-volume { grid-template-columns: 1fr !important; } .profile-portrait figcaption { font-size: 13px; padding: 2px; } }
</style>
