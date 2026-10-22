<script lang="ts" setup>
import line1 from "@/assets/dividers/divider-1.svg?url";
import line2 from "@/assets/dividers/divider-2.svg?url";
import { computed } from "vue";

type SliceBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DividerPreset = {
  image: string;
  slices: [SliceBox, SliceBox, SliceBox, SliceBox, SliceBox];
  renderWidths: [number, number, number, number, number];
};

const props = withDefaults(defineProps<{
  lineStyle?: number;
  height?: number;
  centerRepeatWidth?: number;
  dropShadow?: string;
}>(), {
  lineStyle: 1,
  height: 100,
  centerRepeatWidth: 180,
  dropShadow: "none"
});

const DividerPresets: Record<number, DividerPreset> = {
  1: {
    image: line1,
    slices: [
      { x: 0, y: 0, width: 120, height: 134.08 },
      { x: 120, y: 0, width: 700, height: 134.08 },
      { x: 820, y: 0, width: 222, height: 134.08 },
      { x: 1042, y: 0, width: 700, height: 134.08 },
      { x: 1742, y: 0, width: 119.97, height: 134.08 }
    ],
    renderWidths: [88, 160, 0, 160, 88]
  },
  2: {
    image: line2,
    slices: [
      { x: 0, y: 0, width: 120, height: 87.53 },
      { x: 120, y: 0, width: 640, height: 87.53 },
      { x: 760, y: 0, width: 342.73, height: 87.53 },
      { x: 1102.73, y: 0, width: 640, height: 87.53 },
      { x: 1742.73, y: 0, width: 120, height: 87.53 }
    ],
    renderWidths: [100, 170, 0, 170, 100]
  }
};

const preset = computed(() => {
  return DividerPresets[props.lineStyle] || DividerPresets[1];
});

const createSliceUrl = (image: string, box: SliceBox): string => {
  return `${image}#svgView(viewBox(${box.x},${box.y},${box.width},${box.height}))`;
};

const hostStyle = computed(() => {
  const widths = preset.value.renderWidths;

  return {
    height: `${props.height}px`,
    filter: props.dropShadow,
    "--seg-1-width": `${widths[0]}px`,
    "--seg-2-width": `${widths[1]}px`,
    "--seg-4-width": `${widths[3]}px`,
    "--seg-5-width": `${widths[4]}px`,
    "--center-repeat-width": `${props.centerRepeatWidth}px`
  };
});

const segmentStyles = computed(() => {
  const image = preset.value.image;

  return preset.value.slices.map((slice) => {
    return {
      "--mask-url": `url('${createSliceUrl(image, slice)}')`
    };
  });
});

const segmentClass = (index: number): string => {
  return `seg-${index + 1}`;
}
</script>

<template>
  <div class="chapter-divider-line" :style="hostStyle">
    <span
      v-for="(style, index) in segmentStyles"
      :key="index"
      class="divider-segment"
      :class="segmentClass(index)"
      :style="style"
    ></span>
  </div>
</template>

<style scoped lang="scss">
.chapter-divider-line {
  width: 100%;
  display: grid;
  grid-template-columns: var(--seg-1-width) var(--seg-2-width) minmax(0, 1fr) var(--seg-4-width) var(--seg-5-width);
  align-items: center;
}

.divider-segment {
  width: 100%;
  height: 100%;
  background: url("@/assets/gold-foil-texture.webp") repeat center;
  background-size: cover;
  -webkit-mask-image: var(--mask-url);
  mask-image: var(--mask-url);
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.seg-3 {
  mask-repeat: repeat-x;
  -webkit-mask-repeat: repeat-x;
  mask-size: var(--center-repeat-width) 100%;
  -webkit-mask-size: var(--center-repeat-width) 100%;
}
</style>