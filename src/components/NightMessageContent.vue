<script setup lang="ts">
import { computed } from 'vue';
import RoleIcon from './RoleIcon.vue';
import { useGameScriptStore } from '@/stores/gameScript';
import { usePlayersStore } from '@/stores/players';
import type { MessageContent } from '@/types/message';
import { nightMessageCards, renderMessageContent } from '@/utils/nightMessages';

const props = defineProps<{ content: MessageContent[] }>();
const script = useGameScriptStore();
const players = usePlayersStore();
const cardPattern = new RegExp(`(${nightMessageCards.map(card => card.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
const quickIcons: Record<string, string> = { '了解': 'thumbs-up', '是': 'circle-check', '不': 'circle-xmark' };
const parts = computed(() => props.content.flatMap((item, index) => {
  const newline = index > 0 && item.newLine ? [{ kind: 'break', text: '', team: '', icon: '', role: null }] : [];
  if (item.type === 'text') return [...newline, ...item.text.split(cardPattern).filter(Boolean).flatMap(text => {
    const card = nightMessageCards.find(entry => entry.text === text);
    if (card) return [{ kind: 'card', text, team: card.tone, icon: card.icon, role: null }];
    return text.split(/(\n|\d+ 号座位|[^\S\n]+)/).filter(Boolean).map(word => {
      const seatReference = /^\d+ 号座位$/.test(word);
      return { kind: word.includes('\n') ? 'break' : seatReference ? 'player' : 'text', text: word, team: '', icon: seatReference ? 'user' : quickIcons[word] || '', role: null };
    });
  })];
  if (item.type === 'character') {
    const role = script.characters.find(role => role.id === item.characterId);
    return [...newline, { kind: 'role', text: role?.name || '未知角色', team: role?.team || '', icon: '', role: role || null }];
  }
  if (item.type === 'player') {
    const index = players.players.findIndex(player => player.id === item.userId);
    const player = index >= 0 ? players.players[index] : null;
    return [...newline, { kind: 'player', text: player?.name || (index >= 0 ? `${index + 1} 号座位` : '玩家'), team: '', icon: 'user', role: null }];
  }
  return [...newline, { kind: 'text', text: renderMessageContent([item], () => '玩家', () => '角色'), team: '', icon: '', role: null }];
}));
</script>

<template>
  <span class="night-message-content">
    <template v-for="(part, index) in parts" :key="index">
      <br v-if="part.kind === 'break'" />
      <span v-else class="night-content-part" :class="[`is-${part.kind}`, part.kind === 'card' ? `tone-${part.team}` : `team-${part.team}`]">
        <RoleIcon v-if="part.role" :role="part.role" />
        <font-awesome-icon v-else-if="part.icon" :icon="part.icon" aria-hidden="true" />
        <span>{{ part.text }}</span>
      </span>
    </template>
  </span>
</template>

<style scoped lang="scss">
.night-message-content { color: #f7f3ec; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.night-content-part { vertical-align: middle; }
.night-content-part.is-role, .night-content-part.is-player, .night-content-part.is-card { display: inline-flex; align-items: center; gap: 5px; margin: 2px 4px 2px 0; }
.night-content-part svg { margin-right: 3px; }
.night-content-part :deep(.icon) { display: inline-block; flex-shrink: 0; width: 25px; height: 25px; background-size: contain; background-position: center; background-repeat: no-repeat; }
.is-role.team-townsfolk { color: #58a2ff; }.is-role.team-outsider { color: #72deed; }.is-role.team-minion { color: #ed9b4d; }.is-role.team-demon { color: #ed4a61; }.is-role.team-traveler { color: #d8a6ed; }
.is-card { padding: 1px 7px; border-radius: 3px; background: #654575; font-size: 14px; }
.tone-brown { background: #69432b; }.tone-blue { background: #116388; }.tone-red { background: #a00c38; }.tone-green { background: #316635; }
</style>
