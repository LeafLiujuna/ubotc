<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { UserApi } from '@/api/http/user'
import { AuthApi } from '@/api/http/auth'
import { useUserStore } from '@/stores/user'
import type { UserGameRecord } from '@/types/user'
import { prepareAvatar } from '@/utils/avatar'

const user = useUserStore()
const profile = computed(() => user.current)
const stats = computed(() => profile.value?.stats)
const name = ref(''), loading = ref(false), saving = ref(false), privacyBusy = ref(false), linking = ref(false)
const error = ref(''), message = ref(''), gamesError = ref(''), gamesLoading = ref(false)
const games = ref<UserGameRecord[]>([]), page = ref(1), totalPages = ref(0), totalGames = ref(0)
const avatarInput = ref<HTMLInputElement>(), avatarPreview = ref(''), avatarPreparing = ref(false), avatarSaving = ref(false)
async function selectAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; input.value = ''
  if (!file || avatarPreparing.value || avatarSaving.value) return
  avatarPreparing.value = true; error.value = ''; message.value = ''
  try { avatarPreview.value = await prepareAvatar(file) }
  catch (cause) { error.value = errorText(cause, '图片无法读取，请换一张图片') }
  finally { avatarPreparing.value = false }
}
async function saveAvatar() {
  if (!avatarPreview.value || avatarSaving.value || !profile.value) return
  avatarSaving.value = true; error.value = ''; message.value = ''
  try {
    const response = await UserApi.updateAvatar(avatarPreview.value)
    if (response.status !== 200 || !response.data) throw new Error(response.message || '头像保存失败')
    user.setCurrentUser({ ...profile.value, avatarUrl: response.data.avatarUrl })
    avatarPreview.value = ''; message.value = '头像已更新'
  } catch (cause) { error.value = errorText(cause, '头像保存失败，请重试') }
  finally { avatarSaving.value = false }
}
const dateTime = (value?: number | null) => value ? new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short', hour12: false,
}).format(Number(value) * 1000) : '暂无记录'
const results: Record<string, string> = {
  'team-win': '阵营胜利', 'alignment-win': '阵营胜利', 'character-win': '角色胜利',
  'special-win': '特殊胜利', lose: '失败', incomplete: '未完成',
}
function errorText(cause: unknown, fallback: string): string {
  const response = (cause as { response?: { data?: { message?: string } } })?.response?.data
  return response?.message || (cause instanceof Error ? cause.message : fallback)
}
async function loadProfile() {
  loading.value = true; error.value = ''
  try {
    const response = await UserApi.getMe()
    if (response.status !== 200 || !response.data) throw new Error(response.message || '资料加载失败')
    user.setCurrentUser(response.data); name.value = response.data.displayName
  } catch (cause) { error.value = errorText(cause, '资料加载失败，请重试') }
  finally { loading.value = false }
}
async function loadGames(target = 1) {
  if (gamesLoading.value) return
  gamesLoading.value = true; gamesError.value = ''
  try {
    const response = await UserApi.getMyGames(target, 10)
    if (response.status !== 200 || !response.data) throw new Error(response.message || '对局记录加载失败')
    games.value = response.data.items; page.value = response.data.page
    totalPages.value = response.data.totalPages; totalGames.value = response.data.total
  } catch (cause) { gamesError.value = errorText(cause, '对局记录加载失败，请重试') }
  finally { gamesLoading.value = false }
}
async function saveProfile() {
  if (saving.value || !profile.value) return
  const displayName = name.value.trim()
  if (!displayName || displayName.length > 64) { error.value = '昵称需要 1 至 64 个字符'; return }
  saving.value = true; error.value = ''; message.value = ''
  try {
    const response = await UserApi.updateProfile(displayName)
    if (response.status !== 200 || !response.data) throw new Error(response.message || '资料保存失败')
    user.setCurrentUser({ ...profile.value, displayName: response.data.displayName })
    name.value = response.data.displayName; message.value = '个人资料已保存'
  } catch (cause) { error.value = errorText(cause, '资料保存失败，请重试') }
  finally { saving.value = false }
}
async function togglePrivacy(event: Event) {
  if (!profile.value || privacyBusy.value) return
  const checkbox = event.target as HTMLInputElement
  privacyBusy.value = true; error.value = ''; message.value = ''
  try {
    const response = await UserApi.setGameResultsHidden(checkbox.checked)
    if (response.status !== 200 || !response.data) throw new Error('隐私设置保存失败')
    user.setCurrentUser({ ...profile.value, hideGameResults: response.data.hideGameResults })
    message.value = '隐私设置已保存'
  } catch (cause) {
    checkbox.checked = Boolean(profile.value?.hideGameResults)
    error.value = errorText(cause, '隐私设置保存失败，请重试')
  } finally { privacyBusy.value = false }
}
async function linkQq() {
  linking.value = true; error.value = ''
  try { window.location.assign(await AuthApi.linkQq('/account')) }
  catch (cause) { error.value = errorText(cause, 'QQ 绑定暂不可用') }
  finally { linking.value = false }
}
onMounted(() => { void loadProfile(); void loadGames() })
</script>

<template>
  <div class="user-center">
    <header class="center-heading">
      <div><p class="eyebrow">我的钟楼档案</p><h1>用户中心</h1><p class="muted">管理个人资料，回顾每一次钟楼冒险。</p></div>
      <RouterLink class="button secondary" :to="{ name: 'RoomList' }">进入房间大厅 →</RouterLink>
    </header>
    <p v-if="error" class="notice error" role="alert">{{ error }} <button type="button" :disabled="loading" @click="loadProfile">重新加载资料</button></p>
    <p v-if="message" class="notice" role="status">{{ message }}</p>
    <p v-if="loading" role="status" class="muted">正在加载个人资料…</p>
    <template v-if="profile">
      <section class="profile-banner" aria-label="个人资料概览">
        <div class="avatar-control">
          <img v-if="profile.avatarUrl" :src="profile.avatarUrl" class="avatar" alt="我的头像" />
          <span v-else class="avatar fallback" aria-hidden="true">{{ profile.displayName.slice(0, 1) || '旅' }}</span>
          <button type="button" class="text-link" :disabled="avatarPreparing || avatarSaving || loading" @click="avatarInput?.click()">{{ avatarPreparing ? '处理图片中…' : '更换头像' }}</button>
          <input ref="avatarInput" class="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" :disabled="avatarPreparing || avatarSaving || loading" @change="selectAvatar" />
        </div>
        <div class="profile-identity"><h2>{{ profile.displayName }}</h2><p class="muted user-id">用户 ID：{{ profile.publicId || '待分配' }}</p><div class="badges"><span>玩家 Lv.{{ profile.level }}</span><span>说书人 Lv.{{ profile.storytellerLevel }}</span><span v-if="profile.isVip">VIP</span><span v-if="profile.isCertifiedStoryteller">认证说书人</span><span v-if="profile.isAdmin">管理员</span></div></div>
      </section>
      <section v-if="avatarPreview" class="panel avatar-editor" aria-label="头像预览">
        <img :src="avatarPreview" class="avatar" alt="新头像预览" />
        <div><h2>头像预览</h2><p class="muted help">图片会居中裁成方形，保存后用于个人资料和房间头像。</p><div class="avatar-actions"><button type="button" class="button" :disabled="avatarSaving" @click="saveAvatar">{{ avatarSaving ? '保存中…' : '保存头像' }}</button><button type="button" class="button secondary" :disabled="avatarSaving" @click="avatarPreview = ''">取消</button></div></div>
      </section>
      <p class="muted help avatar-help">头像支持 JPG、PNG、WebP，图片大小不超过 5 MB。</p>
      <section class="statistics" aria-label="对局统计">
        <div><strong>{{ stats?.totalGames ?? '—' }}</strong><span>累计对局</span></div>
        <div><strong>{{ stats?.dmCount ?? '—' }}</strong><span>说书场次</span></div>
        <div><strong>{{ stats?.wins ?? '—' }}</strong><span>获胜场次</span></div>
        <div><strong>{{ stats?.mvpCount ?? '—' }}</strong><span>MVP 次数</span></div>
      </section>
      <div class="settings-grid">
        <section class="panel"><h2>个人资料</h2>
          <form @submit.prevent="saveProfile"><label for="profile-name">昵称</label><input id="profile-name" v-model="name" autocomplete="nickname" maxlength="64" required :disabled="loading || saving" /><p class="muted help">昵称会显示在房间与个人档案中。</p><button class="button" type="submit" :disabled="loading || saving || name.trim() === profile.displayName">{{ saving ? '保存中…' : '保存资料' }}</button></form>
          <dl><dt>用户名</dt><dd>{{ profile.username || '未设置' }}</dd><dt>邮箱</dt><dd>{{ profile.email || '未绑定' }}</dd><dt>注册时间</dt><dd>{{ dateTime(profile.createdAt) }}</dd><dt>VIP 到期</dt><dd>{{ dateTime(profile.vipExpireAt) }}</dd></dl>
        </section>
        <section class="panel"><h2>账号与隐私</h2>
          <div class="setting-row"><div><h3>QQ 账号</h3><p class="muted">{{ profile.qqLinked ? '已绑定，可使用 QQ 登录' : '绑定后可使用 QQ 快捷登录' }}</p></div><button v-if="!profile.qqLinked" type="button" class="button secondary" :disabled="linking" @click="linkQq">{{ linking ? '跳转中…' : '绑定 QQ' }}</button><span v-else class="linked">已绑定</span></div>
          <div class="setting-row"><div><h3>账号密码</h3><p class="muted">通过绑定邮箱验证后重置密码。</p></div><RouterLink v-if="profile.emailLinked" class="text-link" :to="{ name: 'ForgotPassword' }">重置密码</RouterLink><span v-else class="muted">未绑定邮箱</span></div>
          <label class="privacy-control"><input type="checkbox" :checked="profile.hideGameResults" :disabled="privacyBusy || loading" @change="togglePrivacy" /><span><strong>隐藏我的对局统计与记录</strong><small class="muted">开启后，其他玩家无法查看；你仍可在这里查看。</small></span></label>
          <dl><dt>最近登录</dt><dd>{{ dateTime(profile.lastLoginAt) }}</dd><dt>最近登录 IP</dt><dd class="mono">{{ profile.lastLoginIp || '暂无记录' }}</dd></dl><p class="muted help">登录 IP 仅你本人和管理员可见。时间均为北京时间。</p>
        </section>
      </div>
    </template>
    <section class="panel history" aria-labelledby="history-heading">
      <div class="history-heading"><h2 id="history-heading">对局记录 <small class="muted">{{ totalGames }} 场</small></h2><button class="text-link" type="button" :disabled="gamesLoading" @click="loadGames(page)">刷新记录</button></div>
      <p v-if="gamesError" class="notice error" role="alert">{{ gamesError }} <button type="button" @click="loadGames(page)">重试</button></p>
      <p v-if="gamesLoading" class="muted" role="status">正在加载对局记录…</p>
      <p v-else-if="!games.length && !gamesError" class="empty">还没有对局记录，去房间大厅开启第一场冒险吧。</p>
      <div v-if="games.length" class="table-scroll"><table><thead><tr><th>对局时间</th><th>身份</th><th>角色</th><th>阵营</th><th>结果</th></tr></thead><tbody><tr v-for="game in games" :key="game.id"><td>{{ dateTime(game.playedAt) }}</td><td>{{ game.isDM ? '说书人' : '玩家' }}</td><td>{{ game.characterId || '—' }}</td><td>{{ game.team === 'good' ? '善良' : game.team === 'evil' ? '邪恶' : game.isDM ? '说书人' : '—' }}</td><td><span :class="{ victory: !game.isDM && game.result.endsWith('-win') }">{{ game.isDM ? (game.result === 'incomplete' ? '未完成' : '已主持') : results[game.result] || '—' }}</span><span v-if="game.isMvp" class="mvp"> MVP</span></td></tr></tbody></table></div>
      <nav v-if="totalPages > 1" class="pagination" aria-label="对局记录分页"><button class="button secondary" :disabled="page <= 1 || gamesLoading" @click="loadGames(page - 1)">上一页</button><span>{{ page }} / {{ totalPages }}</span><button class="button secondary" :disabled="page >= totalPages || gamesLoading" @click="loadGames(page + 1)">下一页</button></nav>
    </section>
  </div>
</template>

<style scoped lang="scss">
.user-center { max-width: 1120px; margin: 0 auto; padding: 42px 24px 64px; color: var(--ts-text-primary); }
.center-heading, .history-heading, .setting-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.eyebrow { color: var(--ts-accent-gold); font-size: 12px; letter-spacing: .2em; margin: 0 0 8px; }
h1 { font: 700 32px var(--ts-font-display); margin: 0 0 10px; }
h2 { font-size: 19px; margin: 0 0 22px; } h3 { font-size: 14px; margin: 0 0 7px; }
p { line-height: 1.7; margin: 0; } .muted { color: var(--ts-text-muted); } .help, .setting-row p { font-size: 12px; }
.button { display: inline-flex; justify-content: center; align-items: center; min-height: 42px; padding: 9px 18px; border: 1px solid var(--ts-accent-gold); border-radius: 6px; background: var(--ts-accent-gold); color: var(--ts-text-on-parchment); font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
.secondary { background: rgba(214, 184, 106, .06); color: var(--ts-accent-gold); border-color: var(--ts-border-subtle); }
button:disabled { cursor: default; opacity: .5; } .text-link { color: var(--ts-accent-gold); background: none; border: 0; font: inherit; cursor: pointer; text-underline-offset: 4px; }
.profile-banner { display: flex; gap: 24px; align-items: center; padding: 30px; margin-top: 30px; border: 1px solid var(--ts-border-subtle); border-radius: 12px; background: radial-gradient(ellipse at top right, rgba(214, 184, 106, .12), transparent 70%), rgba(32, 23, 40, .6); }
.avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--ts-accent-gold); flex-shrink: 0; }
.avatar-control { display: grid; justify-items: center; gap: 10px; flex-shrink: 0; } .avatar-control .text-link { font-size: 12px; } .avatar-file { display: none; }
.avatar-editor { display: flex; align-items: center; gap: 20px; margin-top: 16px; } .avatar-editor h2 { margin-bottom: 8px; } .avatar-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; } .avatar-help { margin-top: 10px; }
.fallback { display: grid; place-items: center; font-size: 30px; color: var(--ts-accent-gold); background: rgba(214, 184, 106, .1); }
.profile-identity { min-width: 0; } .profile-identity h2 { font-size: 24px; margin: 0 0 6px; overflow-wrap: anywhere; } .user-id { overflow-wrap: anywhere; font-size: 12px; }
.badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; } .badges span { padding: 4px 10px; border: 1px solid var(--ts-border-subtle); border-radius: 4px; color: var(--ts-accent-gold); font-size: 12px; }
.statistics { display: grid; grid-template-columns: repeat(4, 1fr); margin: 24px 0; padding: 22px 0; border-block: 1px solid var(--ts-border-subtle); }
.statistics div { display: grid; gap: 8px; text-align: center; border-right: 1px solid var(--ts-border-subtle); } .statistics div:last-child { border: 0; } .statistics strong { font-size: 28px; color: var(--ts-accent-gold); } .statistics span { color: var(--ts-text-muted); font-size: 12px; }
.settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; } .panel { padding: 28px; border: 1px solid var(--ts-border-subtle); border-radius: 10px; background: rgba(21, 16, 29, .8); }
form { display: grid; gap: 10px; } form label { font-size: 13px; } form input { min-width: 0; padding: 12px; font: inherit; color: var(--ts-text-primary); background: rgba(0, 0, 0, .2); border: 1px solid var(--ts-border-subtle); border-radius: 6px; } form .button { justify-self: start; margin-top: 6px; }
dl { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px 12px; margin: 26px 0 0; font-size: 13px; } dt { color: var(--ts-text-muted); } dd { margin: 0; overflow-wrap: anywhere; } .mono { font-family: monospace; }
.setting-row { padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--ts-border-subtle); } .setting-row .button, .setting-row .text-link { flex-shrink: 0; font-size: 13px; }
.linked, .victory { color: #9bd0af; } .privacy-control { display: flex; align-items: start; gap: 12px; cursor: pointer; font-size: 13px; } .privacy-control input { width: 18px; height: 18px; flex-shrink: 0; accent-color: var(--ts-accent-gold); } .privacy-control small { display: block; line-height: 1.7; margin-top: 6px; } .panel > .help { margin: 14px 0; }
.notice { margin-top: 16px; padding: 12px 16px; border: 1px solid rgba(155, 208, 175, .4); border-radius: 6px; background: rgba(100, 160, 120, .08); } .error { border-color: rgba(224, 120, 120, .5); color: #f1adad; background: rgba(160, 50, 50, .12); } .notice button { color: inherit; background: none; border: 0; text-decoration: underline; cursor: pointer; }
.history { margin-top: 24px; } .history-heading h2 { margin-bottom: 0; } .history-heading { margin-bottom: 24px; } .history-heading small { font-size: 12px; font-weight: 400; margin-left: 8px; } .empty { padding: 32px 0; text-align: center; color: var(--ts-text-muted); }
.table-scroll { overflow-x: auto; } table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; } th, td { padding: 15px 12px; border-bottom: 1px solid var(--ts-border-subtle); white-space: nowrap; } th { color: var(--ts-text-muted); font-weight: 500; } .mvp { color: var(--ts-accent-gold); } .pagination { display: flex; justify-content: end; gap: 16px; align-items: center; margin-top: 24px; font-size: 13px; }
:is(a, button, input):focus-visible { outline: 2px solid var(--ts-accent-gold); outline-offset: 3px; }
@media (max-width: 700px) { .user-center { padding: 28px 16px 40px; } .center-heading { align-items: start; flex-direction: column; gap: 16px; } h1 { font-size: 28px; } .settings-grid { grid-template-columns: 1fr; gap: 16px; } .panel { padding: 22px 18px; } .profile-banner { padding: 22px 18px; gap: 16px; } .avatar { width: 60px; height: 60px; } .profile-identity h2 { font-size: 20px; } .statistics strong { font-size: 24px; } dl { grid-template-columns: 80px minmax(0, 1fr); } }
</style>
