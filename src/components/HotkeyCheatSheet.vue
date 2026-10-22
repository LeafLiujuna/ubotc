<script setup lang="ts">
/**
 * The `?` hotkey reference card.
 *
 * Deliberately not built on `Modal.vue`: taking the body scroll lock would
 * flip `tsModalLockCount`, and several systems (drawer outside-click, phase
 * banner input lock) read that counter as "a dialog owns this interaction".
 * A reference card should never own anything — it floats, and every game
 * hotkey keeps working underneath it, which is exactly how a cheat sheet is
 * meant to be used: press the key while reading its description.
 */
import { computed } from "vue";
import type { CheatSheetEntry } from "@/composables/useGameHotkeys";

const props = defineProps<{ entries: CheatSheetEntry[] }>();
const emit = defineEmits<{ close: [] }>();

const groups = computed(() => {
  const order: CheatSheetEntry["group"][] = ["通用", "说书人", "本地房间"];
  return order
    .map((name) => ({
      name,
      entries: props.entries.filter((entry) => entry.group === name),
    }))
    .filter((group) => group.entries.length > 0);
});
</script>

<template>
  <Teleport to="body">
    <div
      class="hotkey-sheet"
      role="dialog"
      aria-label="键盘快捷键速查"
      @pointerdown.self="emit('close')"
    >
      <section class="hotkey-sheet__card medieval-surface">
        <header class="hotkey-sheet__header">
          <p class="eyebrow">SHORTCUTS</p>
          <h2>键盘快捷键</h2>
          <span class="filigree-divider"><span class="filigree-divider__mark"></span></span>
        </header>

        <div class="hotkey-sheet__groups">
          <section v-for="group in groups" :key="group.name">
            <h3>{{ group.name }}</h3>
            <ul>
              <li v-for="entry in group.entries" :key="entry.key + entry.label">
                <kbd>{{ entry.key }}</kbd>
                <span>{{ entry.label }}</span>
              </li>
            </ul>
          </section>
        </div>

        <footer class="hotkey-sheet__footer">
          <span>再按 <kbd>?</kbd> 或 <kbd>Esc</kbd> 关闭</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
