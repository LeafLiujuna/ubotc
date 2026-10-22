<template>
  <section ref="composer" class="night-message-composer" :class="{ 'is-reply': mode === 'reply' }" :aria-label="mode === 'reply' ? '夜间信息回复编辑器' : '夜间定型文编辑器'">
    <header v-if="mode !== 'reply'" class="composer-header">
      <strong>{{ sendLabel === '预览' ? '预览接收画面：' : '发送给' }} {{ playerName }}</strong>
      <div>
        <button type="button" aria-label="清空信息" :disabled="disabled || !hasContent" @click="clear"><font-awesome-icon icon="trash-can" /></button>
        <button type="button" aria-label="关闭夜间快捷信息编辑器" :disabled="disabled" @click="emit('cancel')"><font-awesome-icon icon="xmark" /></button>
      </div>
    </header>
    <div v-if="mode !== 'reply' || segments.length" class="composer-preview" aria-label="待发送信息" aria-live="polite">
      <strong>{{ mode === 'reply' ? '⊕ 回复：' : '信息：' }}</strong>
      <div class="composer-segments">
        <span v-if="!segments.length" class="composer-hint">点击下方图标或提示卡，组合要发送的信息</span>
        <template v-for="(segment, index) in segments" :key="index">
          <div v-if="segment.type === 'break'" class="composer-line-break">
            <button type="button" :disabled="disabled" :aria-label="`移除第 ${index + 1} 项换行`" @click="remove(index)">↵</button>
          </div>
          <button v-else type="button" class="composer-segment" :class="segment.type === 'text' ? `tone-${segment.tone || 'plain'}` : `is-${segment.type}`"
            :disabled="disabled" :aria-label="`移除第 ${index + 1} 项：${label(segment)}`" @click="remove(index)">
            <RoleIcon v-if="mode === 'reply' && segment.type === 'character'" :role="roles.find(role => role.id === segment.characterId) || { id: segment.characterId }" />
            <font-awesome-icon v-else-if="segment.type === 'player'" icon="user" />
            <font-awesome-icon v-else-if="segment.type === 'character'" icon="masks-theater" />
            <font-awesome-icon v-else-if="mode === 'reply' && segment.type === 'text' && replyIcons[segment.text]" :icon="replyIcons[segment.text]" />
            <span>{{ label(segment) }}</span><small aria-hidden="true">×</small>
          </button>
        </template>
      </div>
      <button v-if="mode === 'reply'" type="button" class="reply-clear" aria-label="清空回复" :disabled="disabled" @click="clear"><font-awesome-icon icon="trash-can" /></button>
    </div>
    <slot name="guidance" />
    <div class="composer-quick" aria-label="快捷信息">
      <button v-for="item in quickItems" :key="item.text" type="button" :disabled="disabled" @click="insertText(item.text)">
        <font-awesome-icon v-if="mode === 'reply'" class="reply-symbol" :icon="item.icon || 'check'" aria-hidden="true" /><span v-else class="quick-symbol" aria-hidden="true">{{ item.symbol }}</span><span>{{ item.text }}</span>
      </button>
    </div>
    <div class="composer-tools" aria-label="插入内容">
      <button v-for="tool in tools" :key="tool.id" type="button" :disabled="disabled" :data-picker="tool.id" :aria-expanded="picker === tool.id"
        :aria-haspopup="tool.id === 'player' ? undefined : 'dialog'" @click="openPicker(tool.id)"><font-awesome-icon :icon="tool.icon" /><span>{{ tool.label }}</span></button>
    </div>

    <Teleport to="body">
      <section v-if="picker === 'player'" class="night-player-prompt" :aria-labelledby="`night-player-${ownerId}`">
        <h3 :id="`night-player-${ownerId}`">选择一名玩家</h3>
        <p>在魔典中点击玩家的标记来对他进行选择。</p>
        <button type="button" @click="playerSelection.cancel()">取消</button>
      </section>
    </Teleport>
    <Modal v-if="picker === 'role'" name="night-message-role" title="选择一个角色" :show-close="false" @close="finishPicker">
      <div class="night-role-groups" aria-label="选择角色">
        <p v-if="!roles.length">当前剧本暂无角色。</p>
        <div v-for="group in roleGroups" :key="group.team" class="night-role-group" :class="`team-${group.team}`" :aria-label="group.label">
          <button v-for="role in group.roles" :key="role.id" type="button" :disabled="disabled" @click="insertRole(role)">
            <RoleIcon :role="role" /><span>{{ role.name }}</span>
          </button>
        </div>
      </div>
      <div class="night-picker-actions"><button type="button" @click="finishPicker">取消</button></div>
    </Modal>
    <Modal v-if="picker === 'custom'" name="night-message-custom" title="发送自定义信息" :show-close="false" @close="finishPicker">
      <form class="night-custom-form" @submit.prevent="confirmCustom">
        <label :for="customTextId">{{ mode === 'reply' ? '你有什么要问说书人吗？' : '你有什么想告诉玩家吗？' }}</label>
        <input :id="customTextId" v-model="draftText" autofocus type="text" maxlength="500" :disabled="disabled" placeholder="自定义信息" />
        <div class="night-picker-actions">
          <button type="submit" class="is-confirm" :disabled="disabled || !draftText.trim()"><font-awesome-icon icon="check" />确认</button>
          <button type="button" @click="finishPicker"><font-awesome-icon icon="xmark" />取消</button>
        </div>
      </form>
    </Modal>
    <div v-if="mode !== 'reply'" class="composer-cards" aria-label="定型文提示卡">
      <button v-for="card in nightMessageCards" :key="card.id" type="button" class="composer-card" :class="`tone-${card.tone}`" :disabled="disabled" @click="insertCard(card)">
        <font-awesome-icon :icon="card.icon" aria-hidden="true" /><span>{{ card.text }}</span>
      </button>
    </div>
    <div v-if="mode !== 'reply' && phrases.length" class="composer-extra-phrases">
      <button v-for="phrase in phrases" :key="phrase" type="button" :disabled="disabled" @click="insertText(phrase)">{{ phrase }}</button>
    </div>
    <footer v-if="mode !== 'reply' || hasContent || validationError || statusText" class="composer-footer">
      <button v-if="mode !== 'reply'" type="button" class="composer-newline" :disabled="disabled || !segments.length" @click="insertBreak" aria-label="换行">↵</button>
      <p v-if="validationError || statusText" :role="validationError ? 'alert' : 'status'">{{ validationError || statusText }}</p>
      <span v-else-if="mode !== 'reply'" class="composer-hint">点击信息可移除 · 提示卡自动另起一行</span>
      <button type="button" class="composer-send" :disabled="disabled || sendDisabled || !hasContent || Boolean(validationError)" @click="commitAndSend">
        <font-awesome-icon :icon="disabled ? 'spinner' : 'paper-plane'" /><span>{{ disabled ? '发送中…' : sendLabel }}</span>
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { MessageContent } from '@/types/message';
import RoleIcon from '@/components/RoleIcon.vue';
import Modal from '@/components/modals/Modal.vue';
import { useNightPlayerSelectionStore } from '@/stores/nightPlayerSelection';
import { nightMessageCards, type NightMessageCard, type NightMessageDraft } from '@/utils/nightMessages';
type Candidate = { id: string; name?: string; seat?: number };
type RoleOption = { id: string; name: string; team?: string };
type DraftSegment = NightMessageDraft;
const props = withDefaults(defineProps<{
  sendLabel?: string; playerName: string; candidates?: Candidate[]; roles?: RoleOption[]; phrases?: string[];
  playerLabel?: (id: string) => string; roleLabel?: (id: string) => string;
  disabled?: boolean; sendDisabled?: boolean; statusText?: string; mode?: 'message' | 'reply'; initialDraft?: NightMessageDraft[];
}>(), { sendLabel: '发送', candidates: () => [], roles: () => [], phrases: () => [], disabled: false, sendDisabled: false, statusText: '', mode: 'message', initialDraft: () => [] });
const emit = defineEmits<{ cancel: []; send: [content: MessageContent[]]; 'picker-open': [open: boolean]; 'draft-change': [hasDraft: boolean]; 'draft-update': [draft: NightMessageDraft[]] }>();
const ownerId = useId();
const customTextId = `night-custom-${ownerId}`;
const composer = ref<HTMLElement | null>(null);
const playerSelection = useNightPlayerSelectionStore();
const segments = ref<DraftSegment[]>(props.initialDraft.map(item => ({ ...item })));
watch(segments, value => emit('draft-update', value.map(item => ({ ...item }))), { deep: true });
const draftText = ref('');
const picker = ref('');
const allQuickItems = [
  { text: '了解', symbol: '☞' }, { text: '是', symbol: '✓' }, { text: '不', symbol: '×' },
  { text: '善良', symbol: '☀' }, { text: '邪恶', symbol: '☾' },
  ...['零', '一', '二', '三', '四', '五'].map((text, number) => ({ text, symbol: String(number) })),
];
const replyIcons: Record<string, string> = { '了解': 'thumbs-up', '是': 'circle-check', '不': 'circle-xmark' };
const quickItems = computed(() => props.mode === 'reply' ? [
  { text: '了解', icon: 'thumbs-up', symbol: '' },
  { text: '是', icon: 'circle-check', symbol: '' },
  { text: '不', icon: 'circle-xmark', symbol: '' },
] : allQuickItems.map(item => ({ ...item, icon: '' })));
const tools = [{ id: 'player', label: '玩家', icon: 'user' }, { id: 'role', label: '角色', icon: 'masks-theater' }, { id: 'custom', label: '自定义', icon: 'comment' }];
const teamLabels: Record<string, string> = { townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔', traveler: '旅行者', other: '其他角色' };
const roleGroups = computed(() => {
  const groups = new Map<string, RoleOption[]>();
  props.roles.forEach(role => {
    const team = role.team && teamLabels[role.team] ? role.team : 'other';
    if (!groups.has(team)) groups.set(team, []);
    groups.get(team)!.push(role);
  });
  return Object.entries(teamLabels).flatMap(([team, label]) => groups.has(team) ? [{ team, label, roles: groups.get(team)! }] : []);
});
watch(picker, value => emit('picker-open', Boolean(value)));
watch(() => playerSelection.active, active => {
  if (active || playerSelection.owner !== ownerId || picker.value !== 'player') return;
  if (playerSelection.selected) insertPlayer(playerSelection.selected);
  finishPicker();
});
async function openPicker(mode: string): Promise<void> {
  if (props.disabled || picker.value) return;
  picker.value = mode;
  draftText.value = '';
  if (mode === 'player') {
    playerSelection.begin(ownerId);
    await nextTick();
    document.querySelector<HTMLButtonElement>('.reference-token:not(:disabled)')?.focus({ preventScroll: true });
  }
}
function finishPicker(): void {
  const mode = picker.value;
  picker.value = '';
  draftText.value = '';
  playerSelection.release(ownerId);
  void nextTick(() => composer.value?.querySelector<HTMLButtonElement>(`[data-picker="${mode}"]`)?.focus({ preventScroll: true }));
}
function confirmCustom(): void {
  if (props.disabled || !draftText.value.trim()) return;
  commitDraft();
  finishPicker();
}
function onSelectionKey(event: KeyboardEvent): void {
  if (picker.value !== 'player' || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  playerSelection.cancel();
}
onMounted(() => document.addEventListener('keydown', onSelectionKey, true));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onSelectionKey, true);
  playerSelection.release(ownerId);
  emit('picker-open', false);
});
function candidateLabel(candidate: Candidate): string {
  return [candidate.seat ? `${candidate.seat} 号座位` : '', candidate.name].filter(Boolean).join(' · ') || candidate.id;
}
function label(segment: DraftSegment): string {
  if (segment.type === 'text') return segment.text;
  if (segment.type === 'player') return segment.seat ? `${segment.seat} 号座位` : props.playerLabel?.(segment.userId) || candidateLabel(props.candidates.find(item => item.id === segment.userId) || { id: segment.userId });
  if (segment.type === 'character') return props.roleLabel?.(segment.characterId) || props.roles.find(item => item.id === segment.characterId)?.name || segment.characterId;
  return '';
}
function serialize(items: DraftSegment[]): MessageContent[] {
  const result: MessageContent[] = [];
  let newLine = false;
  for (const item of items) {
    if (item.type === 'break') { newLine = result.length > 0; continue; }
    // A clicked seat is a snapshot, including empty seats. Send it through the
    // existing text protocol so it remains readable after seats are rearranged.
    const segment = item.type === 'player' && item.seat
      ? { type: 'text' as const, text: `${item.seat} 号座位` } : item;
    const last = result.at(-1);
    if (segment.type === 'text' && last?.type === 'text') last.text += `${newLine ? '\n' : ' '}${segment.text}`;
    else {
      const content: MessageContent = segment.type === 'text' ? { type: 'text', text: segment.text } : { ...segment };
      if (newLine) content.newLine = true;
      result.push(content);
    }
    newLine = false;
  }
  return result;
}
const pendingContent = computed(() => serialize(segments.value));
const hasContent = computed(() => pendingContent.value.length > 0);
watch(hasContent, value => emit('draft-change', value));
const validationError = computed(() => {
  if (pendingContent.value.length > 10) return '单条信息最多包含 10 项文字、玩家或角色，请分次发送。';
  if (pendingContent.value.some(item => item.type === 'text' && item.text.length > 500)) return '文字超过 500 字，请删减后发送。';
  return '';
});
function commitDraft(): void {
  if (props.disabled) return;
  if (draftText.value.trim()) segments.value.push({ type: 'text', text: draftText.value.trim() });
  draftText.value = '';
}
function insertText(text: string): void { if (!props.disabled) { commitDraft(); segments.value.push({ type: 'text', text }); } }
function insertBreak(): void {
  if (props.disabled) return;
  commitDraft();
  if (segments.value.length && segments.value.at(-1)?.type !== 'break') segments.value.push({ type: 'break' });
}
function insertCard(card: NightMessageCard): void { if (!props.disabled) { insertBreak(); segments.value.push({ type: 'text', text: card.text, tone: card.tone }); } }
function insertPlayer(candidate: Candidate): void { if (!props.disabled) segments.value.push({ type: 'player', userId: candidate.id, ...(candidate.seat ? { seat: candidate.seat } : {}) }); }
function insertRole(role: RoleOption): void { if (!props.disabled) { segments.value.push({ type: 'character', characterId: role.id }); finishPicker(); } }
function remove(index: number): void { if (!props.disabled) segments.value.splice(index, 1); }
function clear(): void { if (!props.disabled) { segments.value = []; draftText.value = ''; } }
function commitAndSend(): void {
  if (props.disabled || props.sendDisabled || picker.value || !hasContent.value || validationError.value) return;
  commitDraft();
  emit('send', serialize(segments.value));
}
defineExpose({ clear, focusQuickItems: () => composer.value?.querySelector<HTMLButtonElement>('.composer-quick button:not(:disabled)')?.focus({ preventScroll: true }) });
</script>

<style scoped lang="scss">
.night-message-composer { color: #f4f0e8; font-family: inherit; }
button, input, textarea { font: inherit; }
button { color: inherit; cursor: pointer; }
button:disabled { cursor: default; opacity: .4; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #eac45b; outline-offset: 3px; }
.composer-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid #ffffff25; }
.composer-header strong { font-size: 15px; }
.composer-header button { width: 36px; height: 36px; border: 0; background: transparent; }
.composer-preview { display: flex; gap: 14px; padding: 18px 0 22px; min-height: 90px; }
.composer-preview > strong { flex-shrink: 0; padding-top: 4px; }
.composer-segments { display: flex; flex: 1; min-width: 0; align-content: flex-start; align-items: flex-start; flex-wrap: wrap; gap: 5px; }
.composer-hint { color: #bdb8b1; font-size: 12px; }
.composer-segment { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 7px; color: #fff; background: var(--card-color, #ffffff0d); border: 1px solid #bfb9ae; border-radius: 4px; text-align: left; }
.composer-segment span { white-space: pre-wrap; overflow-wrap: anywhere; }
.composer-segment.is-character { color: #9ecffa; }
.composer-segment small { opacity: .5; }
.composer-segment:hover { border-color: #eac45b; }
.composer-line-break { flex-basis: 100%; height: 4px; position: relative; }
.composer-line-break button { position: absolute; right: 0; top: -9px; border: 0; background: transparent; color: #aaa; font-size: 12px; }
.composer-quick, .composer-tools { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; }
.composer-quick button, .composer-tools button { display: grid; justify-items: center; align-content: start; gap: 5px; min-width: 48px; padding: 5px; background: transparent; border: 1px solid transparent; border-radius: 5px; font-size: 13px; }
.composer-quick button:hover:not(:disabled), .composer-tools button:hover:not(:disabled), .composer-tools button[aria-expanded=true] { color: #eac45b; background: #ffffff0b; }
.quick-symbol { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid #ddd; border-radius: 8px; font-size: 30px; line-height: 1; }
.composer-tools { margin: 12px 0 18px; }
.composer-tools svg { width: 30px; height: 30px; }
.composer-extra-phrases button { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border: 1px solid #ffffff50; border-radius: 4px; background: #ffffff0b; }
.night-player-prompt { position: fixed; z-index: 10040; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box; width: min(360px, 78vw); padding: 18px 20px; color: #f4f0e8; background: #08090ce8; border: 1px solid #ffffff35; border-radius: 5px; box-shadow: 0 8px 30px #0008; text-align: center; }
.night-player-prompt h3 { margin: 0 0 14px; padding-bottom: 12px; border-bottom: 1px solid #ffffff30; font-size: 20px; }
.night-player-prompt p { margin: 0 0 16px; font-size: 14px; line-height: 1.6; }
.night-player-prompt button, .night-picker-actions button { padding: 6px 14px; border: 1px solid #ffffff50; border-radius: 5px; background: linear-gradient(#5556, #2228); color: #f4f0e8; }
.night-role-groups { display: flex; flex-direction: column; gap: 4px; }
.night-role-group { display: flex; flex-wrap: wrap; justify-content: center; color: #448bfb; }
.night-role-group.team-outsider { color: #65d9ef; }.night-role-group.team-minion { color: #e89436; }.night-role-group.team-demon { color: #e5364a; }.night-role-group.team-traveler { color: #cf9ae7; }.night-role-group.team-other { color: #eee; }
.night-role-group button { display: flex; align-items: center; justify-content: center; gap: 5px; width: 145px; min-height: 58px; padding: 4px 6px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit; font-size: 16px; }
.night-role-group button:hover, .night-role-group button:focus-visible { color: #f1da8c; border-color: #a78d41; background: #d8bb6020; }
.night-role-group :deep(.icon) { display: inline-block; flex-shrink: 0; width: 48px; height: 48px; background-size: contain; background-position: center; background-repeat: no-repeat; }
.night-picker-actions { display: flex; justify-content: center; gap: 12px; margin-top: 12px; }
.night-picker-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: bold; }
.night-custom-form { display: flex; flex-direction: column; gap: 12px; text-align: center; }
.night-custom-form input { box-sizing: border-box; width: 100%; padding: 9px 10px; background: #f8f7f1; color: #202020; border: 1px solid #a58e57; border-radius: 3px; }
.night-custom-form .night-picker-actions { margin-top: 4px; }
.night-custom-form .night-picker-actions button { background: #55456d; border-color: #a28bb4; }
.night-custom-form .night-picker-actions .is-confirm { color: #fff6ce; background: #8f731f; border-color: #d7bb65; }
.composer-cards { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 8px; }
.composer-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 18px; min-height: 155px; padding: 15px 6px 12px; border: 1px solid #eee2c5; border-radius: 4px; background: radial-gradient(ellipse at 30% 20%, #ffffff18, transparent 65%), var(--card-color, #663324); box-shadow: inset 0 0 0 4px #0004, inset 0 0 0 5px #ffffff35; text-align: center; }
.composer-card::after { content: '✦'; position: absolute; top: 5px; right: 7px; color: #dfc28080; font-size: 13px; }
.composer-card svg { width: 42px; height: 42px; margin-top: 15px; color: #f7e6cbcf; filter: drop-shadow(0 2px 2px #0008); }
.composer-card span { font-size: 12px; font-weight: 700; line-height: 1.5; text-shadow: 0 1px 3px #000; }
.tone-brown { --card-color: #613b29; }.tone-blue { --card-color: #116388; }.tone-red { --card-color: #8a1634; }.tone-purple { --card-color: #674574; }.tone-green { --card-color: #316635; }
.composer-card:hover:not(:disabled) { border-color: #f4d478; box-shadow: inset 0 0 0 3px #f4d47855, 0 0 14px #f4d47830; transform: translateY(-2px); }
.composer-extra-phrases { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 18px; }
.composer-footer p { margin: 0; color: #efd49b; font-size: 13px; }
.composer-footer > p, .composer-footer > .composer-hint { flex: 1; }
.composer-newline { flex-shrink: 0; width: 32px; height: 32px; padding: 0; border: 1px solid #ffffff40; border-radius: 4px; background: #ffffff0b; font-size: 20px; }
.composer-send { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 8px; min-width: 96px; min-height: 40px; padding: 8px 20px; background: #d9c68b; color: #211a10; border: 1px solid #eedfb0; border-radius: 5px; font-weight: bold; }
.is-reply { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 8px; }
.is-reply .composer-preview { grid-column: 1 / -1; padding: 10px 0 16px; min-height: 0; gap: 10px; }
.is-reply .composer-preview > strong { font-size: 14px; }
.is-reply .composer-segment { font-size: 13px; padding: 3px 6px; }
.is-reply .composer-segment :deep(.icon) { display: inline-block; width: 20px; height: 20px; flex-shrink: 0; background-size: contain; background-position: center; background-repeat: no-repeat; }
.is-reply .reply-clear { align-self: flex-start; padding: 4px; border: 0; background: transparent; }
.is-reply .composer-quick, .is-reply .composer-tools { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; margin: 0; }
.is-reply .composer-tools button, .is-reply .composer-quick button { min-width: 0; font-size: 12px; padding: 5px 2px; }
.is-reply .composer-tools svg, .is-reply .reply-symbol { width: 36px; height: 36px; margin-bottom: 3px; }
.is-reply .composer-footer { grid-column: 1 / -1; justify-content: center; flex-wrap: wrap; padding-top: 10px; gap: 8px; }
.is-reply .composer-footer p { flex-basis: 100%; text-align: center; }
.is-reply .composer-send { min-height: 30px; min-width: 58px; padding: 3px 12px; border-radius: 18px; color: #fff8d4; background: linear-gradient(#baa04d, #806015); }
.is-reply .composer-send svg { display: none; }
@media (max-width: 640px) {
  .composer-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .composer-card { min-height: 124px; gap: 10px; }.composer-card svg { width: 32px; height: 32px; margin-top: 9px; }
  .composer-quick { gap: 3px; }.composer-quick button { min-width: 40px; padding: 3px; }.quick-symbol { width: 32px; height: 32px; font-size: 24px; }
  .composer-preview { gap: 5px; }.composer-footer { align-items: flex-end; }
}
</style>

<style lang="scss">
.modal-backdrop--night-message-role, .modal-backdrop--night-message-custom {
  z-index: 10030;
  background: #0003;
  backdrop-filter: none;
  .modal { --ts-modal-spine: none; width: min(1080px, 100%); border: 1px solid #ffffff30; border-radius: 5px; background: #08090ce8; box-shadow: 0 10px 35px #0008; }
  .modal::after, .modal-ornament { display: none; }
  .modal-heading { padding: 16px 20px 10px; border: 0; background: transparent; text-align: center; }
  .modal-title { color: #f4f0e8; font-family: inherit; font-size: 22px; letter-spacing: 0; }
  .modal > .slot { padding: 8px 20px 22px; }
}
.modal-backdrop--night-message-custom .modal { width: min(360px, 100%); }
@media (max-width: 640px) {
  .modal-backdrop--night-message-role { padding: 12px; }
  .modal-backdrop--night-message-role .modal > .slot { padding: 8px 8px 16px; }
}
</style>
