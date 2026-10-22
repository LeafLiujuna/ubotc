<template>
  <span class="icon" :style="iconStyle"><RoleAlignmentFilter :filter-id="alignmentFilterId" :alignment="role.alignment" /></span>
</template>

<script>
import { useId } from 'vue';
import { getRoleIconFilter, loadRoleIconUrl } from "@/utils/roleIcons";
import RoleAlignmentFilter from './RoleAlignmentFilter.vue';
import { useAppStore } from "@/stores/app";

export default {
  name: "RoleIcon",
  components: { RoleAlignmentFilter },
  setup() {
    return { alignmentFilterId: `role-alignment-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}` };
  },
  props: {
    role: {
      type: Object,
      default: () => ({}),
    },
    allowExternalImage: {
      type: Boolean,
      default: true,
    },
    isImageOptIn: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      iconUrl: "",
      iconLoadSerial: 0,
    };
  },
  computed: {
    iconKey() {
      const role = this.role || {};
      return [
        role.id,
        role.role,
        role.imageAlt,
        role.image,
        role.team,
        role.alignment,
        this.allowExternalImage,
        this.isImageOptIn,
        useAppStore().grimoire.showCustomImages,
      ].join("|");
    },
    iconStyle() {
      return this.iconUrl
        ? { backgroundImage: `url(${this.iconUrl})`, filter: getRoleIconFilter(this.role, this.iconUrl, this.alignmentFilterId) }
        : null;
    },
  },
  watch: {
    iconKey: {
      handler: "loadIcon",
      immediate: true,
    },
  },
  methods: {
    async loadIcon() {
      const serial = ++this.iconLoadSerial;
      this.iconUrl = "";

      try {
        const iconUrl = await loadRoleIconUrl(this.role, {
          allowExternalImage: this.allowExternalImage && useAppStore().grimoire.showCustomImages,
          isImageOptIn: this.isImageOptIn,
        });
        if (serial === this.iconLoadSerial) {
          this.iconUrl = iconUrl || "";
        }
      } catch (error) {
        if (serial === this.iconLoadSerial) this.iconUrl = "";
      }
    },
  },
};
</script>

<style scoped>
.icon {
  display: inline-block;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}
</style>
