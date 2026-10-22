<script lang="ts" setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  useId,
  watch,
} from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  name?: string;
  type?: string;
  title?: string;
  description?: string;
  ariaLabel?: string;
  returnFocus?: string;
  showClose?: boolean;
  closeOnBackdrop?: boolean;
}>(), {
  name: "",
  type: "",
  title: "",
  description: "",
  ariaLabel: "",
  returnFocus: "",
  showClose: true,
  closeOnBackdrop: true,
});

const visible = defineModel<boolean>("visible", { default: true });
const rendered = ref(visible.value);
const attrs = useAttrs();
const dialog = ref<HTMLElement | null>(null);
const prefersReducedMotion = ref(false);
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const titleId = `ts-modal-title-${instanceId}`;
const descriptionId = `ts-modal-description-${instanceId}`;

const emit = defineEmits<{
  close: [];
}>();

const normalizedName = computed(() => {
  const name = props.name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "default";
});

const dialogLabel = computed(() => (
  props.ariaLabel.trim()
  || props.title.trim()
  || (props.name.trim() ? `${props.name.trim()} 对话框` : "游戏对话框")
));
const transitionDuration = computed(() => (
  prefersReducedMotion.value
    ? { enter: 1, leave: 1 }
    : { enter: 260, leave: 180 }
));

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

let previouslyFocused: HTMLElement | null = null;
let ownsScrollLock = false;
let focusWasRestored = true;
let closeRequested = false;
let reducedMotionQuery: MediaQueryList | null = null;
let closeFallbackTimer: number | undefined;

function updateMotionPreference(event: MediaQueryListEvent | MediaQueryList): void {
  prefersReducedMotion.value = event.matches;
}

function acquireBodyScrollLock(): void {
  if (typeof document === "undefined" || ownsScrollLock) return;

  const body = document.body;
  const bodyLockCount = Number.parseInt(body.dataset.tsModalLockCount || "0", 10);
  if (bodyLockCount === 0) {
    body.dataset.tsModalOriginalOverflow = body.style.overflow;
    body.dataset.tsModalOriginalPaddingRight = body.style.paddingRight;

    const documentWidth = document.documentElement.clientWidth;
    const scrollbarWidth = documentWidth > 0
      ? Math.max(0, window.innerWidth - documentWidth)
      : 0;

    if (scrollbarWidth > 0) {
      const currentPadding = Number.parseFloat(
        window.getComputedStyle(body).paddingRight,
      ) || 0;
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }

    body.style.overflow = "hidden";
  }

  body.dataset.tsModalLockCount = String(bodyLockCount + 1);
  ownsScrollLock = true;
}

function releaseBodyScrollLock(): void {
  if (typeof document === "undefined" || !ownsScrollLock) return;

  const body = document.body;
  const bodyLockCount = Math.max(
    0,
    Number.parseInt(body.dataset.tsModalLockCount || "1", 10) - 1,
  );

  ownsScrollLock = false;
  if (bodyLockCount === 0) {
    body.style.overflow = body.dataset.tsModalOriginalOverflow || "";
    body.style.paddingRight = body.dataset.tsModalOriginalPaddingRight || "";
    delete body.dataset.tsModalLockCount;
    delete body.dataset.tsModalOriginalOverflow;
    delete body.dataset.tsModalOriginalPaddingRight;
  } else {
    body.dataset.tsModalLockCount = String(bodyLockCount);
  }
}

function restoreFocus(): void {
  if (focusWasRestored) return;

  focusWasRestored = true;
  const target = previouslyFocused;
  const returnFocusSelector = props.returnFocus.trim();
  previouslyFocused = null;

  void nextTick(() => {
    const canRestorePrevious = Boolean(
      target?.isConnected
      && target !== document.body
      && target !== document.documentElement,
    );
    const fallbackTarget = !canRestorePrevious && returnFocusSelector
      ? document.querySelector<HTMLElement>(returnFocusSelector)
      : null;

    (canRestorePrevious ? target : fallbackTarget)?.focus({ preventScroll: true });
  });
}

async function activateDialog(): Promise<void> {
  if (typeof document === "undefined") return;

  previouslyFocused = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  focusWasRestored = false;
  acquireBodyScrollLock();

  await nextTick();
  if (!rendered.value || !dialog.value) return;

  if (!dialog.value.contains(document.activeElement)) {
    const autofocusTarget = dialog.value.querySelector<HTMLElement>("[autofocus]");
    (autofocusTarget ?? dialog.value).focus({ preventScroll: true });
  }
}

function deactivateDialog(): void {
  releaseBodyScrollLock();
  restoreFocus();
}

function close(): void {
  if (!rendered.value || closeRequested) return;
  closeRequested = true;
  rendered.value = false;
  if (typeof window !== "undefined") {
    window.clearTimeout(closeFallbackTimer);
    closeFallbackTimer = window.setTimeout(
      finishClose,
      transitionDuration.value.leave + 80,
    );
  }
}

function closeFromBackdrop(): void {
  if (props.closeOnBackdrop) {
    close();
  }
}

function finishClose(): void {
  if (typeof window !== "undefined") {
    window.clearTimeout(closeFallbackTimer);
    closeFallbackTimer = undefined;
  }
  deactivateDialog();
  if (!closeRequested) return;

  closeRequested = false;
  visible.value = false;
  emit("close");
}

function getFocusableElements(): HTMLElement[] {
  if (!dialog.value) return [];

  return Array.from(dialog.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => {
      const style = window.getComputedStyle(element);
      return (
        !element.hasAttribute("hidden")
        && element.getAttribute("aria-hidden") !== "true"
        && style.display !== "none"
        && style.visibility !== "hidden"
      );
    });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = getFocusableElements();
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.value?.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const isOutsideDialog = !dialog.value?.contains(active);

  if (event.shiftKey && (active === first || active === dialog.value || isOutsideDialog)) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || active === dialog.value || isOutsideDialog)) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

watch(
  visible,
  (isVisible) => {
    if (isVisible) {
      closeRequested = false;
      rendered.value = true;
      void activateDialog();
    } else {
      rendered.value = false;
    }
  },
  { immediate: true, flush: "post" },
);

onMounted(() => {
  if (typeof window.matchMedia !== "function") return;
  reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  updateMotionPreference(reducedMotionQuery);
  reducedMotionQuery.addEventListener?.("change", updateMotionPreference);
});

onBeforeUnmount(() => {
  if (typeof window !== "undefined") window.clearTimeout(closeFallbackTimer);
  reducedMotionQuery?.removeEventListener?.("change", updateMotionPreference);
  deactivateDialog();
});

defineExpose({ close });
</script>

<template>
  <Teleport to="body">
    <Transition
      name="modal-bleed"
      appear
      :duration="transitionDuration"
      @after-leave="finishClose"
    >
      <div
        v-if="rendered"
        v-bind="attrs"
        class="modal-backdrop"
        :class="`modal-backdrop--${normalizedName}`"
        :data-modal-name="props.name || undefined"
        @click.self="closeFromBackdrop"
        @keydown="handleKeydown"
      >
        <section
          ref="dialog"
          class="modal"
          :class="{ [props.name]: !!props.name }"
          role="dialog"
          aria-modal="true"
          :aria-label="props.title ? undefined : dialogLabel"
          :aria-labelledby="props.title ? titleId : undefined"
          :aria-describedby="props.description ? descriptionId : undefined"
          tabindex="-1"
        >
          <div class="modal-ornament" aria-hidden="true"></div>

          <header v-if="props.title || props.description" class="modal-heading">
            <h2 v-if="props.title" :id="titleId" class="modal-title">
              {{ props.title }}
            </h2>
            <p v-if="props.description" :id="descriptionId" class="modal-description">
              {{ props.description }}
            </p>
          </header>

          <div v-if="props.showClose" class="top-right-buttons">
            <button
              type="button"
              class="top-right-button"
              :aria-label="`关闭${dialogLabel}`"
              @click="close"
            >
              <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
            </button>
          </div>

          <div class="slot">
            <slot></slot>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss">
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden auto;
  padding:
    max(var(--ts-space-5, 24px), env(safe-area-inset-top))
    max(var(--ts-space-5, 24px), env(safe-area-inset-right))
    max(var(--ts-space-5, 24px), env(safe-area-inset-bottom))
    max(var(--ts-space-5, 24px), env(safe-area-inset-left));
  background:
    radial-gradient(circle at 50% 34%, var(--ts-glow-crimson, rgba(166, 60, 69, 0.42)), transparent 46%),
    radial-gradient(circle at 50% 118%, var(--ts-vignette, rgba(4, 3, 7, 0.72)), transparent 60%),
    linear-gradient(rgba(5, 4, 8, 0.58), rgba(5, 4, 8, 0.72)),
    var(--ts-noise-stone);
  background-color: rgba(5, 4, 8, 0.64);
  backdrop-filter: blur(4px);
  isolation: isolate;
  overscroll-behavior: contain;
}

.modal-backdrop--input,
.modal-backdrop[data-modal-name="input"] {
  z-index: 10020;
}

.modal {
  position: relative;
  display: flex;
  width: min(880px, 100%);
  max-width: 100%;
  max-height: min(88dvh, 960px);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  color: var(--ts-text-primary, #f4ebdd);
  /* A bound grimoire cover. Same recipe as .leather-surface in
     styles/materials.scss, restated rather than composed because this shell is
     rendered by the component itself and callers never get to add the class. The
     crimson edge wash on top is the modal's own — it keeps the dialog reading as
     something dangerous rather than merely old. */
  background-color: var(--ts-surface-leather, #2a1a14);
  background-image:
    linear-gradient(90deg, rgba(142, 47, 54, 0.24), transparent 8%, transparent 92%, rgba(142, 47, 54, 0.24)),
    radial-gradient(120% 90% at 50% -10%, rgba(214, 184, 106, 0.1), transparent 52%),
    linear-gradient(160deg, rgba(74, 45, 34, 0.9), rgba(26, 15, 13, 0.96) 62%),
    var(--ts-noise-leather);
  background-size: auto, auto, auto, 200px 200px;
  border: 1px solid rgba(120, 84, 48, 0.62);
  border-radius: var(--ts-radius-lg, 16px);
  box-shadow:
    var(--ts-shadow-lg, 0 30px 80px rgba(0, 0, 0, 0.58)),
    var(--ts-shadow-inset-edge, inset 0 0 0 1px rgba(240, 217, 144, 0.1)),
    inset 0 18px 42px rgba(0, 0, 0, 0.22),
    inset 0 -60px 80px rgba(0, 0, 0, 0.4),
    inset 0 40px 60px -40px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16));
  font-family: var(--ts-font-ui, sans-serif);
  outline: none;
  transform-origin: center;

  /* The binding: a crease of shadow down the left edge. Painted on a
     pseudo-element rather than real nodes so the focus trap's list of focusable
     children is untouched.

     This used to also paint two brass "hinge plates" here — in practice they
     rendered as two floating orange squares hanging off the modal's left edge
     on every leather dialog (settings, edition, …). A shading crease sells the
     book spine; hardware does not. Do not bring the plates back.

     Variants that are not bound leather — the parchment registration form, the
     night-order scroll — switch it off with --ts-modal-spine: none rather than
     re-declaring the pseudo-element. */
  &::before {
    display: var(--ts-modal-spine, block);
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 3;
    width: 13px;
    background-image:
      linear-gradient(90deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.14) 62%, transparent);
    pointer-events: none;
    content: "";
  }

  /* Blind-tooled border, stamped a few pixels in from the leather edge the way a
     bookbinder does it. Painted above the shell rather than below it — a negative
     z-index put it behind the modal's own opaque background, where it could never
     be seen. It sits inside the slot's padding and ignores pointer events, so
     nothing it crosses is content or clickable. */
  &::after {
    content: "";
    position: absolute;
    inset: 7px;
    z-index: 2;
    border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
    border-radius: calc(var(--ts-radius-lg, 16px) - 5px);
    box-shadow: var(--ts-shadow-gold-ring, 0 0 0 1px rgba(214, 184, 106, 0.2));
    pointer-events: none;
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 3px;
  }

  &.input {
    width: min(520px, 100%);
    margin-top: -12vh;
  }

  .characters & {
    width: min(800px, 100%);
    height: min(88dvh, 1600px);
  }

  ul {
    max-width: 100%;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    align-items: center;
    justify-content: center;
    list-style: none;
    line-height: 1;
  }
}

.modal-ornament {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 2;
  width: min(260px, 46%);
  height: 3px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--ts-surface-parchment-aged, #d7c29c),
    var(--ts-accent-gold, #d6b86a),
    var(--ts-surface-parchment-aged, #d7c29c),
    transparent
  );
  box-shadow:
    0 0 18px var(--ts-glow-candle-soft, rgba(214, 184, 106, 0.3)),
    0 0 6px var(--ts-glow-candle, rgba(247, 208, 120, 0.55));
  transform: translateX(-50%);
  pointer-events: none;
}

.modal-heading {
  flex: 0 0 auto;
  padding: var(--ts-space-5, 24px) 76px var(--ts-space-3, 12px) var(--ts-space-5, 24px);
  border-bottom: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  background: linear-gradient(180deg, rgba(214, 184, 106, 0.055), transparent);
}

.modal-title {
  margin: 0;
  color: var(--ts-accent-gold-hover, #e7cf86);
  font-family: var(--ts-font-heading, serif);
  font-size: clamp(1.25rem, 2vw, 1.65rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.04em;
}

.modal-description {
  max-width: 64ch;
  margin: var(--ts-space-2, 8px) 0 0;
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.9rem;
  line-height: 1.55;
}

.modal > .top-right-buttons {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.modal > .top-right-buttons > .top-right-button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ts-text-muted, #c9bca7);
  background:
    linear-gradient(180deg, rgba(142, 47, 54, 0.42), rgba(61, 24, 29, 0.72));
  border: 1px solid rgba(214, 184, 106, 0.35);
  border-radius: var(--ts-radius-md, 10px);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font: inherit;
  font-size: 30px;
  line-height: 1;
  transition:
    color var(--ts-motion-fast, 160ms) ease,
    background-color var(--ts-motion-fast, 160ms) ease,
    border-color var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);

  &:hover {
    color: #fff5eb;
    background: linear-gradient(180deg, var(--ts-accent-crimson-hover, #a63c45), #70232a);
    border-color: var(--ts-accent-gold, #d6b86a);
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.1),
      0 0 16px var(--ts-glow-crimson, rgba(166, 60, 69, 0.42));
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  svg {
    width: 18px;
    height: 18px;
  }
}

.modal > .slot {
  min-height: 0;
  max-height: 100%;
  overflow: auto;
  padding: var(--ts-space-6, 32px);
  overscroll-behavior: contain;
  scrollbar-color: var(--ts-border-strong, #8f7443) transparent;
  scrollbar-width: thin;

  &::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--ts-border-strong, #8f7443);
    border: 2px solid transparent;
    border-radius: var(--ts-radius-pill, 999px);
    background-clip: padding-box;
  }
}

/* The backdrop arrives first and the dialog follows it with a short lift. `appear`
   makes this run for legacy parent-v-if usage, while the after-leave hook keeps the
   component alive until the exit has visibly completed. */
.modal-bleed-enter-active,
.modal-bleed-leave-active {
  transition: opacity 260ms ease;
}

.modal-bleed-leave-active {
  transition-duration: 180ms;
}

.modal-bleed-enter-from,
.modal-bleed-leave-to {
  opacity: 0;
}

.modal-bleed-enter-active .modal,
.modal-bleed-leave-active .modal {
  transition:
    opacity 260ms ease,
    filter 260ms ease,
    transform 260ms var(--ts-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  will-change: opacity, filter, transform;
}

.modal-bleed-enter-from .modal {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(12px) scale(0.982);
}

.modal-bleed-leave-active .modal {
  transition-duration: 180ms;
}

.modal-bleed-leave-to .modal {
  opacity: 0;
  filter: blur(3px);
  transform: translateY(8px) scale(0.986);
}

@media (max-width: 640px) {
  .modal-backdrop {
    align-items: flex-end;
    padding:
      max(48px, env(safe-area-inset-top))
      0
      0;
  }

  .modal {
    width: 100%;
    max-height: calc(100vh - 48px);
    max-height: calc(100dvh - max(48px, env(safe-area-inset-top)));
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: var(--ts-radius-lg, 16px) var(--ts-radius-lg, 16px) 0 0;
    transform-origin: bottom center;

    &.input {
      width: 100%;
      margin-top: 0;
    }

    .characters & {
      width: 100%;
      height: auto;
      max-height: calc(100dvh - max(48px, env(safe-area-inset-top)));
    }
  }

  .modal-heading {
    padding:
      var(--ts-space-4, 16px)
      68px
      var(--ts-space-3, 12px)
      max(var(--ts-space-4, 16px), env(safe-area-inset-left));
  }

  .modal > .top-right-buttons {
    top: 8px;
    right: max(8px, env(safe-area-inset-right));
  }

  .modal > .slot {
    padding:
      var(--ts-space-5, 24px)
      max(var(--ts-space-4, 16px), env(safe-area-inset-right))
      max(var(--ts-space-5, 24px), env(safe-area-inset-bottom))
      max(var(--ts-space-4, 16px), env(safe-area-inset-left));
  }

  /* A sheet pinned to the bottom edge rises; it does not bloom from its centre. */
  .modal-bleed-enter-from .modal {
    filter: none;
    transform: translateY(28px);
  }

  .modal-bleed-leave-to .modal {
    filter: none;
    transform: translateY(20px);
  }
}

@media (prefers-reduced-motion: reduce) {
  /* The shell's entrance is keyframe-driven and already covered by the global
     gate; these transitions still need switching off by hand. */
  .modal-bleed-enter-active,
  .modal-bleed-leave-active,
  .modal > .top-right-buttons > .top-right-button {
    transition-duration: 0.01ms !important;
  }
}
</style>
