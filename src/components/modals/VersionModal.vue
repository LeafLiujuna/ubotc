<template>
  <Modal v-if="modals.version" @close="close">
    <div class="content">
      <aside>
        <div>
          <h3>更新内容：</h3>
        </div>
        <img
          src="https://botc.app/assets/gossip-DY4wKAxk.webp"
          alt="公告"
        />
        <div class="button" role="button" @click="close">关闭</div>
      </aside>
      <section>
        <div class="versions">
          <h4 class="category">版本 3.2.3</h4>
          <ul>
            <li class="bold">允许自定义奇遇角色</li>
            <li class="bold">旅行者角色 ID 同时兼容 traveller 与 traveler 两种写法</li>
            <li class="bold">问题修复</li>
          </ul>
        </div>
      </section>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { useAppStore } from "@/stores/app";
import { storeToRefs } from "pinia";
import Modal from "./Modal";

const appStore = useAppStore();
const { modals, version, lastVersion } = storeToRefs(appStore);

function close() {
  if (version.value !== lastVersion.value) {
    appStore.setLastVersion(version.value);
  }
  appStore.toggleModal("version");
}
</script>

<style scoped lang="scss">
.content {
  display: flex;
  flex-direction: row;
  gap: 20px;

  aside {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 15px;

    h3 {
      margin: 0;
      font-size: 1.2rem;
    }

    a {
      color: #0066cc;
      text-decoration: none;
      font-weight: bold;

      &:hover {
        text-decoration: underline;
      }
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
    }

    .button {
      background-color: #4a7ec6;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      text-align: center;
      cursor: pointer;
      font-weight: bold;

      &:hover {
        background-color: #3a6eb6;
      }
    }
  }

  section {
    flex: 2;
    display: flex;
    flex-direction: column;
    gap: 20px;

    .versions {
      text-align: left;

      h4 {
        text-align: left;
        margin-bottom: 10px;
        padding-left: 5px;
        font-weight: bold;
        font-size: 1.1rem;
        color: purple;
      }

      ul {
        list-style: none;
        padding: 0;
        margin: 0;

        display: block;
        flex-wrap: initial;

        padding-left: 25px;
        margin-top: 5px;
        margin-bottom: 0;
      }

      li {
        text-align: left;
        line-height: 1.5;

        display: list-item;

        margin-bottom: 5px;
        font-weight: bold;
      }
    }
  }
}

.warning {
  color: red;
}
</style>
