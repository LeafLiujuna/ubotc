<template>
  <section class="settings-section" aria-labelledby="game-settings-title">
    <header class="settings-section__header">
      <div>
        <h3 id="game-settings-title">游戏设置</h3>
        <p>配置剧本、角色规则和说书人工具。</p>
      </div>
    </header>

    <div class="settings-list">
      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('useOldOrderAsk')"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'clock-rotate-left']" />
        </span>
        <span class="setting-row__copy">
          <strong>兼容旧夜晚顺序</strong>
          <small>为指定角色启用旧版本的夜晚行动顺序。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('useOldRoleAsk')"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'book-skull']" />
        </span>
        <span class="setting-row__copy">
          <strong>兼容旧角色能力</strong>
          <small>为部分角色切换到旧版本规则文本。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button type="button" class="setting-row" @click="$emit('selectEditionsAsk')">
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'layer-group']" />
        </span>
        <span class="setting-row__copy">
          <strong>角色合集范围</strong>
          <small>选择“全部角色”列表中包含的剧本合集。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('customiseBootlegger')"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'pen-nib']" />
        </span>
        <span class="setting-row__copy">
          <strong>私货商人规则</strong>
          <small>编辑本局使用的自定义规则说明。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('trigger', ['openEditionModal'])"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'book-open']" />
        </span>
        <span class="setting-row__copy">
          <strong>选择剧本</strong>
          <small>切换当前房间使用的剧本。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('trigger', ['openRolesModal'])"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'masks-theater']" />
        </span>
        <span class="setting-row__copy">
          <strong>配置角色</strong>
          <small>编辑本局角色构成与数量。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>

      <button
        v-if="!session.isSpectator"
        type="button"
        class="setting-row"
        @click="$emit('trigger', ['openFabledModal'])"
      >
        <span class="setting-row__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'star']" />
        </span>
        <span class="setting-row__copy">
          <strong>传奇角色</strong>
          <small>添加影响本局规则的传奇角色。</small>
        </span>
        <font-awesome-icon class="setting-row__chevron" :icon="['fas', 'chevron-right']" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  session: {
    isSpectator: boolean;
  };
}>();

defineEmits<{
  useOldOrderAsk: [];
  useOldRoleAsk: [];
  selectEditionsAsk: [];
  customiseBootlegger: [];
  trigger: [payload: [string]];
}>();
</script>

<style scoped lang="scss">
.settings-section {
  min-width: 0;
}

.settings-section__header {
  padding-bottom: var(--ts-space-4);
  border-bottom: 1px solid var(--ts-border-subtle);

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--ts-accent-gold);
    font-family: var(--ts-font-heading);
    font-size: clamp(1.25rem, 2vw, 1.55rem);
    font-weight: 700;
  }

  p {
    margin-top: var(--ts-space-1);
    color: var(--ts-text-muted);
    font-size: 0.9rem;
    line-height: 1.55;
  }
}

.settings-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ts-space-2);
  margin-top: var(--ts-space-4);
}

.setting-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  min-height: 82px;
  align-items: center;
  gap: var(--ts-space-3);
  padding: 11px var(--ts-space-3);
  color: var(--ts-text-primary);
  text-align: left;
  background:
    linear-gradient(135deg, rgba(214, 184, 106, 0.07), transparent 42%),
    rgba(12, 9, 17, 0.58);
  border: 1px solid rgba(214, 184, 106, 0.16);
  border-radius: var(--ts-radius-md);
  cursor: pointer;
  transition:
    border-color var(--ts-motion-fast) ease,
    background-color var(--ts-motion-fast) ease,
    transform var(--ts-motion-fast) var(--ts-ease-out);

  &:hover {
    background-color: rgba(35, 25, 44, 0.82);
    border-color: rgba(214, 184, 106, 0.46);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring);
    outline-offset: 2px;
  }
}

.setting-row__icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: var(--ts-accent-gold);
  background: rgba(214, 184, 106, 0.09);
  border: 1px solid rgba(214, 184, 106, 0.2);
  border-radius: var(--ts-radius-sm);
  font-size: 1rem;
}

.setting-row__copy {
  display: grid;
  min-width: 0;
  gap: 4px;

  strong {
    font-size: 0.92rem;
    line-height: 1.3;
  }

  small {
    color: var(--ts-text-muted);
    font-size: 0.76rem;
    line-height: 1.45;
  }
}

.setting-row__chevron {
  justify-self: center;
  color: var(--ts-text-subtle);
  font-size: 0.75rem;
}

@media (max-width: 760px) {
  .settings-list {
    grid-template-columns: 1fr;
  }

  .setting-row {
    min-height: 72px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .setting-row {
    transition-duration: 1ms;
  }
}

/* Match the general panel's glass cards while keeping game actions compact. */
.settings-section__header {
  padding-bottom: 18px;
  border-bottom-color: rgba(214, 184, 106, 0.18);

  h3 {
    color: #f0d990;
    font-size: clamp(1.2rem, 2vw, 1.5rem);
    letter-spacing: 0.015em;
  }

  p {
    color: rgba(244, 235, 221, 0.62);
    font-size: 0.8rem;
  }
}

.settings-list {
  gap: 10px;
  margin-top: 18px;
}

.setting-row {
  min-height: 70px;
  padding: 10px 12px;
  background:
    linear-gradient(90deg, rgba(214, 184, 106, 0.045), transparent 34%),
    rgba(6, 8, 15, 0.34);
  border-color: rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);

  &:hover {
    background:
      linear-gradient(90deg, rgba(166, 60, 69, 0.18), transparent 42%),
      rgba(21, 20, 31, 0.66);
    border-color: rgba(214, 184, 106, 0.35);
  }
}

.setting-row__icon {
  width: 38px;
  height: 38px;
  color: #d8bc70;
  background: rgba(214, 184, 106, 0.08);
  border-color: rgba(214, 184, 106, 0.16);
  border-radius: 7px;
  font-size: 0.85rem;
}

.setting-row__copy {
  gap: 2px;

  strong {
    color: rgba(255, 250, 240, 0.92);
    font-size: 0.84rem;
  }

  small {
    color: rgba(244, 235, 221, 0.52);
    font-size: 0.72rem;
  }
}

.setting-row__chevron {
  color: rgba(244, 235, 221, 0.38);
}

@media (max-width: 920px) {
  .settings-list {
    grid-template-columns: 1fr;
  }
}
</style>
