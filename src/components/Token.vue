<template>
  <div
    class="token"
    @click="setRole"
    @animationend="endReveal"
    :class="[role.id, { 'is-revealing': isRevealing }]"
    :style="tokenBackground"
  >
    <span
      class="icon"
      v-if="role.id"
      :style="iconStyle"
    ><RoleAlignmentFilter :filter-id="alignmentFilterId" :alignment="role.alignment" /></span>
    <span class="leaf-left" v-if="role.firstNight"></span>
    <span class="leaf-right" v-if="role.otherNight"></span>
    <span v-if="reminderLeaves" :class="['leaf-top' + reminderLeaves]"></span>
    <span class="leaf-orange" v-if="role.setup"></span>
    <svg viewBox="0 0 150 150" class="name">
      <path
        d="M 13 75 C 13 160, 138 160, 138 75"
        id="curve"
        fill="transparent"
      />
      <text
        width="150"
        x="66.6%"
        text-anchor="middle"
        class="label mozilla"
        :font-size="nameToFontSize(role.name)"
      >
        <textPath xlink:href="#curve">
          {{ role.name }}
        </textPath>
      </text>
    </svg>
    <div class="edition" :class="[`edition-${role.edition}`, role.team]"></div>
  </div>
</template>

<script setup lang="js">
import { computed, nextTick, ref, useId, watch } from "vue";
import { storeToRefs } from "pinia";
import tokenBackgroundImage from "../assets/token.png";
import { getRoleIconFilter, loadRoleIconUrl } from "@/utils/roleIcons";
import RoleAlignmentFilter from './RoleAlignmentFilter.vue';
import { useAppStore } from "@/stores/app";

const props = defineProps({
  role: {
    type: Object,
    default: () => ({}),
  },
  id: {
    type: String,
    default: "",
  },
  image: {
    type: String,
    default: "",
  },
  animateChanges: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(["set-role"]);
const appStore = useAppStore();
const { grimoire } = storeToRefs(appStore);

const iconUrl = ref("");
const alignmentFilterId = `role-alignment-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
const iconLoadSerial = ref(0);
const isRevealing = ref(false);

const reminderLeaves = computed(() => {
  return (props.role.reminders || []).length + (props.role.remindersGlobal || []).length;
});

const tokenBackground = computed(() => {
  return !!props.id && !!props.image
    ? {}
    : { backgroundImage: `url(${tokenBackgroundImage})` };
});

const iconName = computed(() => {
  const nextIconName = props.role.imageAlt || (props.role.id || "").replace(/old1$/, "");
  return nextIconName.replace(/\.png$/i, "");
});

const roleIconKey = computed(() => {
  return [props.role.id, iconName.value, props.role.team, props.role.alignment, props.role.image, grimoire.value.isImageOptIn, grimoire.value.showCustomImages].join("|");
});

const iconStyle = computed(() => {
  return iconUrl.value ? {
    backgroundImage: `url(${iconUrl.value})`,
    filter: getRoleIconFilter(props.role, iconUrl.value, alignmentFilterId),
  } : null;
});

function nameToFontSize(name) {
  return name && name.length > 10 ? "90%" : "110%";
}

async function loadRoleIcon() {
  const serial = iconLoadSerial.value + 1;
  iconLoadSerial.value = serial;
  iconUrl.value = "";
  if (!props.role.id) return;

  try {
    const nextIconUrl = await loadRoleIconUrl(props.role, {
      allowExternalImage: grimoire.value.showCustomImages,
      isImageOptIn: grimoire.value.isImageOptIn,
    });
    if (serial === iconLoadSerial.value) {
      iconUrl.value = nextIconUrl || "";
    }
  } catch (error) {
    if (serial === iconLoadSerial.value) {
      iconUrl.value = "";
    }
  }
}

function setRole() {
  emit("set-role");
}

function endReveal() {
  isRevealing.value = false;
}

watch(roleIconKey, () => {
  void loadRoleIcon();
}, { immediate: true });

/* The token turns face-up when a role lands on it. Deliberately not `immediate`:
   a grimoire that already has roles assigned must not flip every token on mount,
   only the one that just changed. Role pickers key their lists by `role.id`, so
   filtering there remounts items rather than mutating this prop — no stray flips.

   The class is cleared on `animationend` (rather than left in place) so the next
   reveal replays the keyframe; the extra tick before setting it is what lets the
   browser see the class go away and come back. */
watch(() => props.role.id, async (nextRoleId, previousRoleId) => {
  if (!props.animateChanges || !nextRoleId || nextRoleId === previousRoleId) return;

  isRevealing.value = false;
  await nextTick();
  isRevealing.value = true;
});
</script>

<style scoped lang="scss">
.token {
  position: relative;
  border-radius: 50%;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  // background: url("../assets/token.png") center center;
  background-size: 100%;
  text-align: center;
  border: 3px solid var(--ts-surface-leather-deep, #241a10);
  box-shadow:
    0 0 0 1px rgba(240, 217, 144, 0.28),
    inset 0 0 0 2px var(--ts-border-subtle, rgba(214, 184, 106, 0.22)),
    0 3px 10px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 250ms,
    box-shadow 250ms;

  /* The token is clickable, so it needs to say so. The transition above was
     already declared for these two properties but nothing ever changed them. */
  &:hover {
    border-color: var(--ts-border-strong, #8f7443);
    box-shadow:
      0 0 0 1px var(--ts-accent-gold, #d6b86a),
      inset 0 0 0 2px rgba(240, 217, 144, 0.3),
      0 4px 16px rgba(0, 0, 0, 0.55),
      0 0 20px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16));
  }

  /* Turning face-up. The card has no printed back — `backface-visibility` hides
     it for the first half-turn instead, so it swings into view edge-on the way a
     dealt token does rather than showing its own face mirrored.

     ts-token-flip (styles/motion.scss) rests at rotateY(0deg), so the global
     reduced-motion gate in theme.scss lands it face-up with no turn at all. */
  &.is-revealing {
    backface-visibility: hidden;
    animation: ts-token-flip 480ms var(--ts-ease-out, ease-out) both;
  }

  &:hover .name .label {
    stroke: black;
    fill: white;
    @-moz-document url-prefix() {
      &.mozilla {
        stroke: none;
        filter: drop-shadow(0 1.5px 0 black) drop-shadow(0 -1.5px 0 black)
          drop-shadow(1.5px 0 0 black) drop-shadow(-1.5px 0 0 black)
          drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
      }
    }
  }

  .icon,
  &:before {
    background-size: cover;
    background-repeat: no-repeat;
    background-position: center;
    border-radius: 50%;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
  }

  span {
    position: absolute;
    width: 100%;
    height: 100%;
    background-size: 100%;
    pointer-events: none;

    &.leaf-left {
      background-image: url("../assets/leaf-left.png");
    }

    &.leaf-orange {
      background-image: url("../assets/leaf-orange.png");
    }

    &.leaf-right {
      background-image: url("../assets/leaf-right.png");
    }

    &.leaf-top1 {
      background-image: url("../assets/leaf-top1.png");
    }

    &.leaf-top2 {
      background-image: url("../assets/leaf-top2.png");
    }

    &.leaf-top3 {
      background-image: url("../assets/leaf-top3.png");
    }

    &.leaf-top4 {
      background-image: url("../assets/leaf-top4.png");
    }

    &.leaf-top5 {
      background-image: url("../assets/leaf-top5.png");
    }
  }

  .name {
    width: 100%;
    height: 100%;
    font-size: 24px; // svg fonts are relative to document font size
    .label {
      fill: black;
      stroke: white;
      stroke-width: 2px;
      paint-order: stroke;
      font-family: var(--ts-font-token, Papyrus, serif);
      font-weight: bold;
      text-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
      letter-spacing: 1px;

      @-moz-document url-prefix() {
        &.mozilla {
          // Vue doesn't support scoped media queries, so we have to use a second css class
          stroke: none;
          text-shadow: none;
          filter: drop-shadow(0 1.5px 0 white) drop-shadow(0 -1.5px 0 white)
            drop-shadow(1.5px 0 0 white) drop-shadow(-1.5px 0 0 white)
            drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
        }
      }
    }
  }

  .edition {
    position: absolute;
    right: 0;
    bottom: 5px;
    width: 30px;
    height: 30px;
    background-size: 100%;
    display: none;
  }
}
</style>
