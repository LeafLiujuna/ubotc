<template>
  <section v-if="editor.open" class="seat-editor" role="region" aria-label="集合玩家" :aria-busy="editor.pending">
    <div class="seat-editor__card">
      <header>
        <strong>集合玩家</strong>
        <button type="button" aria-label="关闭座位编辑" @click="editor.close">×</button>
      </header>
      <p v-if="editor.status" role="status">{{ editor.status }}</p>
      <p v-else>
        添加，打乱或移除玩家座位。<template v-if="players.players.length < 7">准备好至少 7 个座位，即可开始标准模式的游戏。</template>
        <template v-else>当已经准备好足够多的座位时，<button class="seat-editor__next" type="button" @click="chooseScript">② 选择剧本</button></template>
      </p>
      <footer>拖动座位上的 <span>✥</span> 调整顺序，点击 <span>×</span> 移除座位</footer>
    </div>
    <div class="seat-editor__actions">
      <button type="button" class="seat-editor__add" :disabled="!editor.canEdit || editor.pending || players.players.length >= 20" @click="editor.addPlayer()">
        <font-awesome-icon :icon="['fas', 'circle-plus']" /> 添加座位
      </button>
      <button type="button" class="seat-editor__shuffle" :disabled="!editor.canEdit || editor.pending || players.players.length < 2" @click="editor.randomizeSeatings(false)">
        <font-awesome-icon :icon="['fas', 'dice']" /> 打乱座位
      </button>
    </div>
    <div class="seat-editor__actions seat-editor__actions--secondary">
      <button type="button" :disabled="!editor.canEdit || editor.pending || !players.players.length" title="清空角色与提示标记，保留座位" @click="editor.clearRoles">
        <font-awesome-icon :icon="['fas', 'trash-can']" /> 清空
      </button>
      <button type="button" :disabled="!editor.canEdit || editor.pending || !players.players.length" @click="editor.clearPlayers">
        <font-awesome-icon :icon="['fas', 'trash-can']" /> 清除所有
      </button>
    </div>
    <span class="seat-editor__count" role="status">{{ editor.pending ? '正在调整座位…' : `${players.players.length} / 20 个座位` }}</span>
  </section>
</template>

<script setup lang="ts">
import { useDemoStore } from '@/stores/demo'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSeatEditorStore } from '@/stores/seatEditor'
const editor = useSeatEditorStore()
const players = usePlayersStore()
function chooseScript() {
  if (useDemoStore().active) useDemoStore().setupStep = 'script'
  editor.close()
  useAppStore().toggleModal('edition')
}
</script>

<style scoped lang="scss">
.seat-editor {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 30;
  width: min(380px, 43%);
  transform: translate(-50%, -50%);
  color: #f5f1eb;
  text-align: center;
  font: 18px / 1.7 var(--ts-font-body, serif);
  text-shadow: 0 1px 2px #000;
  button { cursor: pointer; color: inherit; font: inherit; }
  button:disabled { cursor: not-allowed; filter: grayscale(1); opacity: .5; }
  button:focus-visible { outline: 2px solid #f0d990; outline-offset: 3px; }
}
.seat-editor__card {
  border: 2px solid #171211;
  border-radius: 10px;
  background: linear-gradient(#302624f5, #1e1818f5);
  box-shadow: 0 2px 5px #0007, inset 0 0 4px #aa94834d;
  header { position: relative; padding: 0 30px; font-size: 16px; }
  header strong { font-weight: normal; }
  header button { position: absolute; right: 7px; top: 3px; width: 24px; height: 24px; padding: 0; border: 0; background: transparent; line-height: 1; font-size: 23px; }
  p { margin: 0; padding: 0 15px 12px; }
  footer { border-top: 1px solid #100c0c; padding: 4px 8px; font-size: 13px; box-shadow: inset 0 1px #66534b7d; }
  footer span { color: #d8b65b; font-size: 17px; }
}
.seat-editor__next { padding: 0 6px; border: 1px solid #665b56; border-radius: 4px; background: #171419; font-weight: bold !important; }
.seat-editor__actions {
  display: flex;
  justify-content: center;
  margin-top: 7px;
  button { padding: 1px 12px; border: 2px solid #34273a; border-radius: 0 15px 15px 0; background: linear-gradient(#49414c, #16141c 65%, #29212d); box-shadow: 0 2px 5px #0008, inset 0 1px 2px #e6d5ef8c; font-weight: bold; white-space: nowrap; }
  button:first-child { border-radius: 15px 0 0 15px; }
  button:not(:disabled):hover { filter: brightness(1.2); }
  .seat-editor__add { border-color: #65501a; color: #ffd457; background: linear-gradient(#dfbd65, #69501a 60%, #b99536); }
  .seat-editor__shuffle { border-color: #58338a; background: linear-gradient(#a276d1, #4b2778 65%, #714b9d); }
}
.seat-editor__count { display: block; margin-top: 5px; color: #dfd4bf; font-size: 12px; }
@media (max-width: 900px) {
  .seat-editor { width: min(300px, 58%); font-size: 12px; line-height: 1.5; }
  .seat-editor__card { header { font-size: 13px; } p { padding: 0 7px 6px; } footer { font-size: 10px; } }
  .seat-editor__actions { button { padding: 2px 6px; } }
}
</style>
