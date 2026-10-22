<template>
  <Modal
    class="editions"
    v-if="modals.edition && !isSpectator"
    @close="closeEdition()"
  >
    <div class="editions_scroll">
      <header class="edition-picker-heading">
        <h2>选择一个剧本：</h2>
        <p>选择剧本后，说书人与所有玩家会看到对应的角色与夜晚顺序。</p>
      </header>
      <p
        v-if="isRealtimeRoom"
        class="realtime-hint"
        role="note"
      >
        选择剧本后会同步给所有玩家；只有说书人或房主可以修改。
      </p>
      <p
        v-if="syncMessage"
        class="edition-sync-status"
        :class="{ 'edition-sync-status--error': syncError }"
        :role="syncError ? 'alert' : 'status'"
        aria-live="polite"
      >
        {{ syncMessage }}
      </p>
      <div v-if="isLoading" class="loading-overlay edition-sync-overlay" role="status" aria-live="polite">
        <div class="loading-spinner"></div>
        <p class="loading-text">正在同步剧本…</p>
      </div>
      <div class="edition-browser">
        <div class="tab-container">
          <div class="tab-header">
            <div class="tab-item active">官方剧本</div>
          </div>
          <div class="tab-content">
            <div class="tab-pane active">
              <!-- 筛选和搜索区域 -->
              <div class="filter-search-container">
                <div class="search-box">
                  <input
                    type="text"
                    v-model="searchQuery"
                    placeholder="搜索剧本名称…"
                    class="search-input"
                  />
                </div>
                <div class="filter-options">
                  <div class="filter-group">
                    <label>玩家人数：</label>
                    <select v-model="playerFilter" class="filter-select">
                      <option value="all">全部</option>
                      <option value="5-6">5-6人</option>
                      <option value="7-15">7-15人</option>
                    </select>
                  </div>
                  <div class="filter-group">
                    <label>难度等级：</label>
                    <select v-model="difficultyFilter" class="filter-select">
                      <option value="all">全部</option>
                      <option value="初学者">初学者</option>
                      <option value="中等">中等</option>
                      <option value="进阶">进阶</option>
                    </select>
                  </div>
                </div>
              </div>
              <ul class="editions" tabindex="0" aria-label="剧本列表">
                <li
                  v-for="edition in filteredEditions"
                  :key="edition.id"
                  class="edition-card"
                  :class="[
                    'edition-' + edition.id,
                    { 'edition-card--disabled': isRealtimeRoom && !canEditRealtimeScript },
                  ]"
                  :aria-disabled="isRealtimeRoom && !canEditRealtimeScript"
                  @click="selectHomeEdition(edition)"
                >
                  <div class="edition-image-container">
                    <img
                      :src="edition.image"
                      alt=""
                      class="edition-image"
                      loading="lazy"
                    />
                    <div class="edition-overlay"></div>
                  </div>
                  <div class="edition-info">
                    <div class="edition-heading-row">
                      <h3 class="edition-name">{{ edition.name }}</h3>
                      <span v-if="edition.author" class="edition-author">{{ edition.author }}</span>
                    </div>
                    <p class="edition-description">
                      {{ edition.description || edition.players || "官方剧本" }}
                    </p>
                    <div class="edition-meta">
                      <span class="edition-difficulty">难度：{{ edition.difficulty }}</span>
                      <span v-if="edition.players" class="edition-players">{{ edition.players }}</span>
                      <span v-if="edition.isNonScript" class="edition-badge">角色合集</span>
                    </div>
                  </div>
                </li>
                <li
                  class="edition-card edition-custom"
                  :class="{ 'edition-card--disabled': isRealtimeRoom && !canEditRealtimeScript }"
                  :aria-disabled="isRealtimeRoom && !canEditRealtimeScript"
                  @click="openCustomEdition"
                >
                  <div class="edition-image-container">
                    <img
                      src="https://oss.gstonegames.com/data_file/clocktower/web/editions/custom.png"
                      alt=""
                      class="edition-image"
                      loading="lazy"
                    />
                    <div class="edition-overlay"></div>
                  </div>
                  <div class="edition-info">
                    <div class="edition-heading-row">
                      <h3 class="edition-name"><button type="button" class="custom-toggle" :aria-expanded="isCustom" :disabled="isLoading || (isRealtimeRoom && !canEditRealtimeScript)" @click.stop="openCustomEdition">自定义剧本</button></h3>
                    </div>
                    <p class="edition-description">上传 JSON 或从剪贴板加载自己的剧本与角色。</p>
                    <div v-if="isCustom" ref="customActions" class="custom-import-actions" @click.stop>
                      <button type="button" :disabled="isLoading" @click="openUpload"><font-awesome-icon icon="file-upload" /> 上传</button>
                      <button type="button" :disabled="isLoading" @click="readFromClipboard"><font-awesome-icon icon="clipboard" /> 粘贴</button>
                      <button type="button" :disabled="isLoading" @click="promptURL"><font-awesome-icon icon="link" /> 链接</button>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
    <input type="file" ref="upload" accept="application/json,.json" hidden @change="handleUpload" />
  </Modal>
</template>

<script setup lang="js">
import { useDemoStore } from '@/stores/demo';
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { GameApi } from "@/api/http/game";
import { useGameController } from "@/controllers/GameController";
import { useGameStore } from "@/stores/game";
import editionJSON from "../../data/editions.json";
import { useAppStore } from "@/stores/app";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";
import { useUserStore } from "@/stores/user";
import Modal from "./Modal";

const appStore = useAppStore();
const playersStore = usePlayersStore();
const sessionStore = useSessionStore();
const gameController = useGameController();
const gameStore = useGameStore();
const userStore = useUserStore();

const { modals } = storeToRefs(appStore);
const { isSpectator } = storeToRefs(sessionStore);

const upload = ref(null);
const isCustom = ref(false);
const customActions = ref(null);
const searchQuery = ref("");
const debouncedSearchQuery = ref("");
const searchTimer = ref(null);
const playerFilter = ref("all");
const difficultyFilter = ref("all");
const isLoading = ref(false);
const syncMessage = ref("");
const syncError = ref(false);
const isRealtimeRoom = computed(() => Boolean(sessionStore.sessionId && sessionStore.gameServerId));
const isRoomOwner = computed(() => {
  const userId = userStore.userId;
  return Boolean(userId && gameStore.roomUsers[userId]?.isRoomOwner);
});
const canEditRealtimeScript = computed(() => gameStore.currentIsDm || isRoomOwner.value);

const officialEditions = ref([
        {
          id: 1,
          name: "暗流涌动",
          image:
            "https://oss.gstonegames.com/static/image/team/202206/c_5935045915561_5940ef2d.jpg",
          players: "支持5 - 15",
          difficulty: "初学者",
          author: "The Pandemonium Institute",
          isNonScript: false,
        },
        {
          id: 2,
          name: "黯月初升",
          image:
            "https://oss.gstonegames.com/static/image/team/202206/c_1745145915561_f3303786.jpg",
          players: "支持7 - 15",
          difficulty: "中等",
          author: "The Pandemonium Institute",
          isNonScript: false,
        },
        {
          id: 3,
          name: "梦殒春宵",
          image:
            "https://oss.gstonegames.com/static/image/team/202206/c_3135245915561_027cd2ad.jpg",
          players: "支持7 - 15",
          difficulty: "中等",
          author: "The Pandemonium Institute",
          isNonScript: false,
        },
      ]);

watch(searchQuery, (newVal) => {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value);
  }
  searchTimer.value = setTimeout(() => {
    debouncedSearchQuery.value = newVal;
  }, 300);
});

const filteredEditions = computed(() => {
  return officialEditions.value.map((edition) => {
    const metadata = editionJSON.find((item) =>
      String(item.id) === String(edition.id) || item.name === edition.name,
    );
    return {
      ...edition,
      description: metadata?.description || "",
      difficulty: edition.difficulty || metadata?.level || "随意",
    };
  }).filter((edition) => {
        // 搜索过滤
        const matchesSearch =
      !debouncedSearchQuery.value ||
      edition.name.toLowerCase().includes(debouncedSearchQuery.value.toLowerCase());

        // 玩家人数过滤
        let matchesPlayers = true;
    if (playerFilter.value !== "all") {
      if (playerFilter.value === "5-6") {
            matchesPlayers =
              edition.players &&
              (edition.players.includes("5 - 6") ||
                edition.players.includes("5-6"));
      } else if (playerFilter.value === "7-15") {
            matchesPlayers =
              edition.players &&
              (edition.players.includes("7 - 15") ||
                edition.players.includes("7-15"));
      }
    }

        // 难度等级过滤
        const matchesDifficulty =
      difficultyFilter.value === "all" || edition.difficulty === difficultyFilter.value;

    return matchesSearch && matchesPlayers && matchesDifficulty;
  });
});

onBeforeUnmount(() => {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value);
  }
});

async function showInputModal({ inputType, inputModal, inputData }) {
  return new Promise((resolve, reject) => {
    sessionStore.setInputResolver(resolve);
    sessionStore.setInputRejecter(reject);
    sessionStore.setInputType(inputType);
    sessionStore.setInputModal(inputModal);
    sessionStore.setInputData(inputData);
    appStore.toggleModal("input");
  });
}

function closeEdition() {
  if (appStore.modals.edition) appStore.toggleModal("edition");
  isCustom.value = false;
  syncMessage.value = "";
  syncError.value = false;
}

function setSyncMessage(message, isError = false) {
  syncMessage.value = message;
  syncError.value = isError;
}

async function openCustomEdition() {
  if (isLoading.value) return;
  if (isRealtimeRoom.value && !canEditRealtimeScript.value) {
    setSyncMessage("只有说书人或房主可以设置实时房间剧本。", true);
    return;
  }
  isCustom.value = true;
  await nextTick();
  customActions.value?.scrollIntoView({ block: "nearest" });
}

function openUpload() {
  if (isLoading.value) return;
  upload.value?.click?.();
}

async function handleUpload() {
  if (isRealtimeRoom.value && !canEditRealtimeScript.value) {
    setSyncMessage("只有说书人或房主可以设置实时房间剧本。", true);
    return;
  }
  const file = upload.value?.files?.[0];
  if (file && file.size) {
    isLoading.value = true;
        const reader = new FileReader();
        reader.addEventListener("load", async () => {
          try {
            const roles = JSON.parse(reader.result);
            const script = parseRoles(roles);
            parseStates(roles);
            if (isRealtimeRoom.value) await syncCustomScript(script);
          } catch (e) {
            await showInputModal({
              inputType: "alert",
              inputModal: "text",
              inputData: {
                name: ["读取剧本失败：自定义剧本内容不是有效的 JSON 文件。"],
              },
            }).catch(() => {
              return null;
            });
            return;
          } finally {
            isLoading.value = false;
            if (upload.value) upload.value.value = "";
          }
        });
        reader.readAsText(file);
  }
}

async function promptURL() {
  const input = await showInputModal({
    inputType: "json",
    inputModal: "input",
    inputData: {
      name: ["输入custom-script.json文件的URL"],
      length: 1,
      placeholder: [""],
    },
  }).catch(() => null);
  if (input === null) return;

  const url = input[0];
  if (url) {
    handleURL(url);
  }
}

async function handleURL(url) {
  if (isRealtimeRoom.value && !canEditRealtimeScript.value) {
    setSyncMessage("只有说书人或房主可以设置实时房间剧本。", true);
    return;
  }
  isLoading.value = true;
  try {
    const res = await fetch(url);
    if (res && res.json) {
      try {
        const script = await res.json();
        const realtimeScript = parseRoles(script);
        parseStates(script);
        if (isRealtimeRoom.value) await syncCustomScript(realtimeScript);
      } catch (e) {
        await showInputModal({
              inputType: "alert",
              inputModal: "text",
              inputData: {
                name: ["读取剧本失败：URL 内容不是有效的 JSON 文件。"],
              },
            }).catch(() => {
              return null;
            });
            return;
      }
    }
  } catch (e) {
    await showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["读取剧本失败：网络请求失败，请检查 URL 是否正确。"],
          },
        }).catch(() => {
          return null;
        });
  } finally {
    isLoading.value = false;
  }
}

async function readFromClipboard() {
  if (isRealtimeRoom.value && !canEditRealtimeScript.value) {
    setSyncMessage("只有说书人或房主可以设置实时房间剧本。", true);
    return;
  }
  isLoading.value = true;
  try {
    const text = await navigator.clipboard.readText();
    try {
      const roles = JSON.parse(text);
      const script = parseRoles(roles);
      parseStates(roles);
      if (isRealtimeRoom.value) await syncCustomScript(script);
    } catch (e) {
      await showInputModal({
            inputType: "alert",
            inputModal: "text",
            inputData: {
              name: ["读取剧本失败：剪贴板内容不是有效的 JSON 文件。"],
            },
          }).catch(() => {
            return null;
          });
      return;
    }
  } catch (e) {
    await showInputModal({
          inputType: "alert",
          inputModal: "text",
          inputData: {
            name: ["读取剧本失败：无法访问剪贴板，请确保已授予权限。"],
          },
        }).catch(() => {
          return null;
        });
  } finally {
    isLoading.value = false;
  }
}

function parseRolesAndMeta(roles) {
  if (!roles || !roles.length) return { roles: [], meta: {} };

      // 转换角色格式
  const processedRoles = roles.map((role) =>
    typeof role === "string" ? { id: role } : role,
  );

      // 提取meta信息
  const metaIndex = processedRoles.findIndex(({ id }) => id === "_meta");
  let meta = {};
  if (metaIndex > -1) {
    meta = processedRoles.splice(metaIndex, 1).pop();
  }

  return { roles: processedRoles, meta };
}

function parseRoles(roles) {
  const { roles: processedRoles, meta } = parseRolesAndMeta(roles);
  if (!processedRoles.length) return null;

  if (meta.bootlegger) {
    for (let i = 0; i < meta.bootlegger.length; i += 1) {
      processedRoles.push({
        id: `bootlegger${i}`,
        reminders: [],
        setup: false,
        name: `私货商人${i + 1}`,
        team: "fabled",
        ability: meta.bootlegger[i],
      });
    }
  }

  appStore.setCustomRoles(processedRoles);
  appStore.setEdition(Object.assign({}, meta, { id: "custom" }));
  if (useDemoStore().active) { useDemoStore().scriptChosen = true; useDemoStore().setupStep = "roles"; }
      // check for fabled and set those too, if present
  if (processedRoles.some((role) => appStore.fabled.has(role.id || role))) {
    const fabled = [];
    processedRoles.forEach((role) => {
      if (appStore.fabled.has(role.id || role) && (!meta.bootlegger || role.id !== "bootlegger")) {
        fabled.push(appStore.fabled.get(role.id || role));
      }
    });
    playersStore.setFabled({ fabled });
  }
  isCustom.value = false;
  return {
    name: String(meta.name || meta.title || "自定义剧本"),
    description: meta.description ? String(meta.description) : undefined,
    author: meta.author ? String(meta.author) : undefined,
    logo: meta.logo ? String(meta.logo) : undefined,
    customLabels: meta.customLabels,
    characters: processedRoles.filter((role) => role && role.id && role.team !== "fabled").map((role) => ({
      ...role,
      id: String(role.id),
      name: String(role.name || role.id),
      team: String(role.team || "townsfolk"),
      ability: String(role.ability || ""),
    })),
  };
}

async function syncCustomScript(script) {
  if (!script?.characters?.length) throw new Error("自定义剧本没有可用角色");
  if (!gameController.isConnected) throw new Error("房间正在重连，请稍后再试");
  setSyncMessage("正在上传并同步自定义剧本…");
  const response = await GameApi.uploadGameScript({ gameScript: script, isPublic: false });
  if (response.status < 200 || response.status >= 300 || !response.data?.id) {
    throw new Error(response.message || "自定义剧本上传失败");
  }
  await gameController.updateScript({ scriptId: response.data.id });
  await gameController.refreshGameState();
  closeEdition();
}

function parseStates(roles) {
  const { meta } = parseRolesAndMeta(roles);
  if (!meta) return;

      //状态
  const states = [];
  if (meta.state) {
    meta.state.forEach((state) => {
      states.push({ [state.stateName]: state.stateDescription });
    });
  } else if (meta.status) {
    meta.status.forEach((state) => {
      states.push({ [state.name]: state.skill });
    });
  }
  appStore.setStates(states);
      // 角色类型名字
  const names = {
    townsfolk: meta.townsfolksName ? meta.townsfolksName : "镇民",
    outsider: meta.outsidersName ? meta.outsidersName : "外来者",
    minion: meta.minionsName ? meta.minionsName : "爪牙",
    demon: meta.demonsName ? meta.demonsName : "恶魔",
  };
  appStore.setTeamsNames(names);
      // 夜间顺序
  if (!!meta.firstNight && meta.firstNight.length > 0) {
    const firstNight = meta.firstNight.map((role) =>
      role.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    appStore.setFirstNight(firstNight);
  } else {
    appStore.setFirstNight([]);
  }
  if (!!meta.otherNight && meta.otherNight.length > 0) {
    const otherNight = meta.otherNight.map((role) =>
      role.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    appStore.setOtherNight(otherNight);
  } else {
    appStore.setOtherNight([]);
  }
}

// 卡片 id（集石侧的剧本编号）→ 本地 editions.json 的 id。
// 4 号卡是「无上欢愉」(No Greater Joy)，5 号卡才是「窃窃私语」(Laissez un Faire,
// 即 luf)。二者曾经一起挤在 luf 上，于是 4 号卡显示成窃窃私语、5 号卡被顶到
// 华灯初上——整条链条都错位了一格。
const EDITION_CARD_MAP = {
  1: "tb",
  2: "bmr",
  3: "snv",
  4: "ngj",
  5: "luf",
  20181: "hdcs",
  21136: "syyl",
};

function setHomeEdition(edition) {
  const editionId = EDITION_CARD_MAP[edition.id] || "all";
  const selectedEdition = editionJSON.find((e) => e.id === editionId) || editionJSON[0];

  if (["tb", "bmr", "snv", "ngj", "luf", "all", "custom_ankot"].includes(selectedEdition.id)) {
    appStore.setStates([]);
  }
  appStore.setEdition(selectedEdition);
  if (useDemoStore().active) { useDemoStore().scriptChosen = true; useDemoStore().setupStep = 'roles'; }
}
function resolveEdition(edition) {
  const editionId = EDITION_CARD_MAP[edition.id] || "all";
  return editionJSON.find((item) => item.id === editionId) || editionJSON[0];
}

function buildRealtimeScript(selectedEdition) {
  const characters = Array.from(appStore.roles.values()).map((role) => ({
    ...role,
    id: String(role.id),
    name: String(role.name || role.id),
    team: String(role.team || "townsfolk"),
    ability: String(role.ability || ""),
  }));

  return {
    name: String(selectedEdition.name || selectedEdition.id || "Local script"),
    description: selectedEdition.description ? String(selectedEdition.description) : undefined,
    author: selectedEdition.author ? String(selectedEdition.author) : undefined,
    characters,
  };
}

async function selectHomeEdition(edition) {
  if (!isRealtimeRoom.value) {
    setHomeEdition(edition);
    return;
  }

  if (!gameStore.currentIsDm && !isRoomOwner.value) {
    setSyncMessage("只有说书人可以更换实时房间剧本。", true);
    return;
  }
  if (!gameController.isConnected) {
    setSyncMessage("房间正在重连，请连接恢复后再更换剧本。", true);
    return;
  }

  const previousEdition = appStore.edition;
  const selectedEdition = resolveEdition(edition);
  isLoading.value = true;
  setSyncMessage("正在上传并同步剧本…");
  setHomeEdition(edition);

  try {
    const response = await GameApi.uploadGameScript({
      gameScript: buildRealtimeScript(selectedEdition),
      isPublic: false,
    });
    if (response.status < 200 || response.status >= 300 || !response.data?.id) {
      throw new Error(response.message || "剧本上传失败");
    }

    await gameController.updateScript({ scriptId: response.data.id });
    await gameController.refreshGameState();
    closeEdition();
  } catch (error) {
    appStore.setEdition(previousEdition);
    setSyncMessage(
      error instanceof Error ? error.message : "剧本同步失败，请稍后重试。",
      true,
    );
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped lang="scss">
@use "../../vars.scss" as *;

.editions_scroll {
  overflow-y: auto;
  max-height: 90vh;
  padding: 25px;
  background: linear-gradient(
    135deg,
    rgba(10, 10, 20, 0.95),
    rgba(20, 15, 30, 0.95)
  );
}

.tab-container {
  width: 100%;

  .tab-header {
    display: flex;
    justify-content: center;
    gap: 30px;
    margin-bottom: 40px;
    padding-bottom: 15px;
    border-bottom: 2px solid rgba(74, 59, 92, 0.6);

    .tab-item {
      padding: 12px 35px;
      font-size: 20px;
      color: #ccc;
      cursor: pointer;
      transition: all 0.3s ease;
      border-radius: 8px 8px 0 0;
      position: relative;
      background: rgba(0, 0, 0, 0.3);

      &:hover {
        color: var(--ts-accent-gold, #d6b86a);
        background: rgba(74, 59, 92, 0.2);
        transform: translateY(-2px);
      }

      &.active {
        color: var(--ts-accent-gold, #d6b86a);
        font-weight: bold;
        background: rgba(74, 59, 92, 0.3);

        &::after {
          content: "";
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, var(--ts-accent-gold, #d6b86a), #f4d03f, var(--ts-accent-gold, #d6b86a));
          border-radius: 0 0 4px 4px;
        }
      }
    }
  }

  .tab-content {
    .tab-pane {
      display: none;

      &.active {
        display: block;
      }

      .tip {
        text-align: center;
        margin-bottom: 30px;
        color: #e0e0e0;
        font-size: 16px;
        padding: 15px 20px;
        background: rgba(74, 59, 92, 0.3);
        border-radius: 12px;
        border: 1px solid rgba(212, 175, 55, 0.2);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .filter-search-container {
        margin-bottom: 30px;
        padding: 20px;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 12px;
        border: 1px solid rgba(74, 59, 92, 0.4);

        .search-box {
          margin-bottom: 15px;

          .search-input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid rgba(74, 59, 92, 0.6);
            border-radius: 8px;
            background: rgba(0, 0, 0, 0.7);
            color: #e0e0e0;
            font-size: 16px;
            transition: all 0.3s ease;

            &:focus {
              outline: none;
              border-color: var(--ts-accent-gold, #d6b86a);
              box-shadow: 0 0 10px rgba(212, 175, 55, 0.3);
            }

            &::placeholder {
              color: #999;
            }
          }
        }

        .filter-options {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;

          .filter-group {
            display: flex;
            align-items: center;
            gap: 10px;

            label {
              color: #e0e0e0;
              font-size: 14px;
              font-weight: bold;
            }

            .filter-select {
              padding: 8px 12px;
              border: 1px solid rgba(74, 59, 92, 0.6);
              border-radius: 6px;
              background: rgba(0, 0, 0, 0.7);
              color: #e0e0e0;
              font-size: 14px;
              cursor: pointer;
              transition: all 0.3s ease;

              &:focus {
                outline: none;
                border-color: var(--ts-accent-gold, #d6b86a);
                box-shadow: 0 0 8px rgba(212, 175, 55, 0.3);
              }

              option {
                background: #1a1a2e;
                color: #e0e0e0;
              }
            }
          }
        }
      }
    }
  }
}

ul.editions {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 30px;
  margin: 0;
  padding: 0;
  list-style: none;

  .edition-card {
    border-radius: 16px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.8);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(74, 59, 92, 0.4);
    position: relative;

    &:hover {
      transform: translateY(-12px);
      box-shadow:
        0 16px 32px rgba(0, 0, 0, 0.9),
        0 0 20px rgba(212, 175, 55, 0.1);
      border-color: rgba(212, 175, 55, 0.5);
    }

    &:active {
      transform: translateY(-8px);
      box-shadow:
        0 12px 24px rgba(0, 0, 0, 0.8),
        0 0 15px rgba(212, 175, 55, 0.2);
      background: rgba(212, 175, 55, 0.1);
    }

    &::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--ts-accent-gold, #d6b86a), #f4d03f, var(--ts-accent-gold, #d6b86a));
      transform: scaleX(0);
      transition: transform 0.4s ease;
    }

    &:hover::before {
      transform: scaleX(1);
    }

    .edition-image-container {
      position: relative;
      height: 200px;
      overflow: hidden;

      .edition-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .edition-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(
          to bottom,
          rgba(0, 0, 0, 0.1),
          rgba(0, 0, 0, 0.8)
        );
        z-index: 1;
      }

      &:hover .edition-image {
        transform: scale(1.1);
      }
    }

    .edition-info {
      padding: 25px;
      position: relative;
      z-index: 2;

      .edition-name {
        margin: 0 0 12px 0;
        font-size: 20px;
        font-weight: bold;
        text-align: center;
        color: #fff;
        font-family: var(--ts-font-display);
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      }

      .edition-author {
        margin: 0 0 10px 0;
        font-size: 14px;
        text-align: center;
        color: #aaa;
      }

      .edition-players {
        margin: 0 0 10px 0;
        font-size: 14px;
        text-align: center;
        color: #999;
        background: rgba(74, 59, 92, 0.2);
        padding: 5px 10px;
        border-radius: 15px;
        display: inline-block;
        margin-left: 50%;
        transform: translateX(-50%);
      }

      .edition-difficulty {
        margin: 0;
        font-size: 14px;
        text-align: center;
        color: var(--ts-accent-gold, #d6b86a);
        font-weight: bold;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }
    }
  }
}



// Responsive
@media (max-width: 480px) {
  .editions_scroll {
    padding: 10px;
    max-height: 85vh;
  }

  .tab-container {
    .tab-header {
      gap: 10px;
      margin-bottom: 20px;

      .tab-item {
        padding: 8px 15px;
        font-size: 16px;
      }
    }

    .tab-content {
      .tab-pane {
        .tip {
          margin-bottom: 20px;
          font-size: 14px;
          padding: 12px 15px;
        }

        .filter-search-container {
          margin-bottom: 20px;
          padding: 15px;

          .search-box {
            margin-bottom: 12px;

            .search-input {
              padding: 10px 14px;
              font-size: 14px;
            }
          }

          .filter-options {
            flex-direction: column;
            gap: 10px;

            .filter-group {
              flex-direction: column;
              align-items: flex-start;
              gap: 5px;

              label {
                font-size: 13px;
              }

              .filter-select {
                width: 100%;
                padding: 8px 12px;
                font-size: 13px;
              }
            }
          }
        }
      }
    }
  }

  ul.editions {
    grid-template-columns: 1fr;
    gap: 15px;

    .edition-card {
      border-radius: 12px;

      .edition-image-container {
        height: 160px;
      }

      .edition-info {
        padding: 15px;

        .edition-name {
          font-size: 16px;
          margin-bottom: 8px;
        }

        .edition-players {
          font-size: 12px;
          padding: 4px 8px;
          margin-bottom: 8px;
        }

        .edition-difficulty {
          font-size: 12px;
        }
      }

      &:hover {
        transform: translateY(-8px);
        box-shadow:
          0 12px 24px rgba(0, 0, 0, 0.8),
          0 0 15px rgba(212, 175, 55, 0.1);
      }
    }
  }


}

@media (min-width: 481px) and (max-width: 768px) {
  .editions_scroll {
    padding: 15px;
  }

  .tab-container {
    .tab-header {
      gap: 15px;

      .tab-item {
        padding: 10px 20px;
        font-size: 17px;
      }
    }

    .tab-content {
      .tab-pane {
        .tip {
          margin-bottom: 25px;
          font-size: 15px;
        }

        .filter-search-container {
          margin-bottom: 25px;

          .filter-options {
            gap: 15px;

            .filter-group {
              .filter-select {
                font-size: 13px;
              }
            }
          }
        }
      }
    }
  }

  ul.editions {
    grid-template-columns: 1fr;
    gap: 20px;

    .edition-card {
      .edition-image-container {
        height: 170px;
      }

      .edition-info {
        padding: 18px;

        .edition-name {
          font-size: 17px;
        }
      }
    }
  }


}

@media (min-width: 769px) and (max-width: 1200px) {
  ul.editions {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 25px;
  }
}

// Touch optimization
.edition-card {
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
}

.action-button {
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  min-height: 44px; /* iOS touch target minimum */
  display: flex;
  align-items: center;
  justify-content: center;
}

.script-item {
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
  min-height: 44px; /* iOS touch target minimum */
  display: flex;
  align-items: center;
}

.filter-select {
  touch-action: manipulation;
}

.search-input {
  touch-action: manipulation;
}

.realtime-hint,
.edition-sync-status {
  margin: 0 25px 16px;
  padding: 12px 14px;
  color: rgba(244, 235, 221, 0.88);
  background: rgba(214, 184, 106, 0.08);
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.edition-sync-status--error {
  color: #f4b5b5;
  background: rgba(142, 47, 54, 0.18);
  border-color: rgba(198, 90, 99, 0.5);
}

.edition-card--disabled {
  cursor: not-allowed !important;
  filter: grayscale(0.45);
  opacity: 0.56;
}

.edition-sync-overlay {
  z-index: 5;
}

/* Match the compact, horizontal picker used by botc.app: the modal is a dark
   book leaf and each script is a single row with its artwork on the left. */
:global(.modal-backdrop.editions .modal) {
  width: min(78vw, 1280px);
  max-width: calc(100vw - 48px);
  height: min(72vh, 780px);
  max-height: min(72vh, 780px);
  min-height: 0;
  border-color: rgba(7, 6, 10, 0.96);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(7, 6, 10, 0.78), rgba(13, 10, 18, 0.84)),
    var(--ts-noise-stone);
}

/* The shared modal slot is scrollable by default. The picker owns its scroll
   region in the list, so the outer slot must stay fixed; otherwise browsers
   render two vertical rails side by side. */
:global(.modal-backdrop.editions) {
  background: rgba(3, 2, 8, 0.56);
  backdrop-filter: blur(3px);
}

:global(.modal-backdrop.editions .modal > .slot) {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.edition-picker-heading {
  margin: 0 0 12px;
  padding: 2px 42px 13px 2px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.28);

  h2 {
    margin: 0;
    color: #f4d98c;
    font-family: var(--ts-font-heading, serif);
    font-size: clamp(1.2rem, 2.2vw, 1.65rem);
    font-weight: 400;
    letter-spacing: 0.04em;
  }

  p {
    margin: 5px 0 0;
    color: rgba(244, 235, 221, 0.68);
    font-size: 0.78rem;
  }
}

.editions_scroll {
  min-height: 0;
  max-height: none;
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding: 18px 22px 20px;
  background: rgba(0, 0, 0, 0.24);
}

/* Pass the slot's finite height through every wrapper to the list. Without
   this chain, height:100% resolves against auto and the list is clipped. */
.edition-browser,
.edition-browser .tab-container,
.edition-browser .tab-content,
.edition-browser .tab-container .tab-content .tab-pane.active {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
}

.editions_scroll > .edition-picker-heading,
.editions_scroll > p,
.edition-browser .tab-header,
.edition-browser .filter-search-container {
  flex: 0 0 auto;
}



.tab-header {
  justify-content: flex-start !important;
  margin-bottom: 14px !important;
  padding-bottom: 0 !important;
  border-bottom: 0 !important;

  .tab-item {
    padding: 5px 11px !important;
    color: rgba(244, 235, 221, 0.74) !important;
    background: rgba(255, 255, 255, 0.06) !important;
    border-radius: 4px !important;
    font-size: 0.78rem !important;
    font-weight: 400 !important;
  }
}

.filter-search-container {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px !important;
  padding: 9px 11px !important;
  border-radius: 5px !important;
  background: rgba(255, 255, 255, 0.045) !important;

  .search-box { flex: 1 1 220px; margin-bottom: 0 !important; }
  .search-input { padding: 7px 10px !important; font-size: 0.82rem !important; }
  .filter-options { gap: 10px !important; }
  .filter-group { gap: 5px !important; }
  .filter-group label { font-size: 0.72rem !important; color: rgba(244, 235, 221, 0.68) !important; }
  .filter-select { padding: 6px 8px !important; font-size: 0.72rem !important; }
}

ul.editions {
  display: block !important;
  min-height: 0;
  max-height: none;
  height: auto;
  flex: 1 1 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 8px 0 0 !important;
  margin: 0 !important;
  scrollbar-color: rgba(214, 184, 106, 0.7) transparent;

  .edition-card {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 82px;
    margin: 0 0 8px;
    padding: 7px 10px 7px 7px;
    overflow: hidden;
    border: 1px solid rgba(214, 184, 106, 0.16);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.48);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
    text-align: left;

    &:hover {
      transform: none;
      border-color: rgba(214, 184, 106, 0.7);
      background: rgba(66, 48, 35, 0.52);
      box-shadow: 0 0 15px rgba(214, 184, 106, 0.13);
    }

    &::before { display: none; }

    .edition-image-container {
      flex: 0 0 72px;
      width: 72px;
      height: 72px;
      margin-right: 12px;
      overflow: hidden;
      border: 1px solid rgba(214, 184, 106, 0.32);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.35);

      .edition-image { opacity: 0.78; object-fit: cover; }
      .edition-overlay { background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.28)); }
    }

    &:hover .edition-image { transform: none; opacity: 1; }

    .edition-info {
      min-width: 0;
      flex: 1 1 auto;
      padding: 0 !important;
    }

    .edition-heading-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .edition-name {
      margin: 0 !important;
      color: #e9c96f;
      font-family: var(--ts-font-heading, serif);
      font-size: 1.12rem;
      font-weight: 400;
      line-height: 1.2;
      text-align: left;
      text-shadow: 0 1px 2px #000;
    }

    .edition-author {
      color: rgba(244, 235, 221, 0.52);
      font-size: 0.66rem;
      white-space: nowrap;
    }

    .edition-description {
      display: -webkit-box;
      margin: 4px 0 6px;
      overflow: hidden;
      color: rgba(244, 235, 221, 0.82);
      font-size: 0.76rem;
      line-height: 1.35;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .edition-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(244, 235, 221, 0.68);
      font-size: 0.68rem;
    }

    .edition-difficulty,
    .edition-players,
    .edition-badge {
      margin: 0 !important;
      padding: 2px 7px;
      border: 1px solid rgba(214, 184, 106, 0.28);
      border-radius: 999px;
      background: rgba(214, 184, 106, 0.08);
      color: inherit;
      font-size: inherit;
      font-weight: 400;
      text-align: left;
    }

    .edition-badge { color: #f0d990; }
  }
}

@media (max-width: 991px) {
  :global(.modal-backdrop.editions .modal) {
    width: min(88vw, 900px);
    height: min(74vh, 700px);
    max-height: min(74vh, 700px);
  }
}

@media (max-width: 640px) {
  :global(.modal-backdrop.editions .modal) {
    width: calc(100vw - 20px);
    height: min(82vh, 680px);
    max-height: min(82vh, 680px);
  }
  .editions_scroll { padding: 14px 12px; }
  .filter-search-container { flex-direction: column; align-items: stretch; }
  .filter-search-container .search-box { flex: 0 0 auto; }
  ul.editions .edition-card {
    align-items: flex-start;
    .edition-image-container { flex-basis: 58px; width: 58px; height: 58px; margin-right: 9px; }
    .edition-name { font-size: 1rem; }
    .edition-description { font-size: 0.7rem; }
  }
}

.custom-toggle {
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.custom-import-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 36px;
    padding: 5px 12px;
    border: 1px solid rgba(255, 255, 255, .25);
    border-radius: 4px;
    background: linear-gradient(rgba(95, 95, 95, .7), rgba(16, 16, 16, .8));
    color: #fff;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    &:hover:not(:disabled) { border-color: var(--ts-accent-gold); }
    &:disabled { opacity: .5; cursor: wait; }
  }
}
</style>
