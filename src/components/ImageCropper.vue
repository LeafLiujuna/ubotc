<template>
  <div>
    <div v-show="cropping" class="overlay">
      <div class="cropper-modal">
        <input
          v-show="false"
          type="file"
          ref="upload"
          accept="image/*"
          @change="onFileChange"
        />
        <div v-if="image" class="canvas">
          <img :src="image" ref="imageRef" alt="Image to crop" />
          <div>
            <button @click="startCropping">裁剪</button>
            <button @click="startMoving">移动</button>
            <button @click="cropImage">预览</button>
            <button @click="sendImage">确定</button>
            <button @click="closeCropping">关闭</button>
          </div>
          <div v-if="croppedImage">
            <img :src="croppedImage" alt="Cropped Image" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="js">
import { nextTick, ref } from "vue";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";

const appStore = useAppStore();
const sessionStore = useSessionStore();
const session = sessionStore.$state;

const upload = ref(null);
const imageRef = ref(null);

const image = ref(null);
const croppedImage = ref(null);
const cropper = ref(null);
const cropping = ref(false);

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

async function uploadAvatar() {
  if (!session.sessionId) {
    await showInputModal({
      inputType: "alert",
      inputModal: "text",
      inputData: {
        name: ["头像上传成功！"],
      },
    }).catch(() => null);
    return;
  }
  upload.value?.click();
}

function onFileChange(event) {
  const file = event.target.files?.[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      image.value = e.target?.result || null;
      await nextTick();
      initCropper();
    };
    reader.readAsDataURL(file);
  }
  cropping.value = true;
}

function initCropper() {
  if (cropper.value) {
    cropper.value.destroy();
  }
  cropper.value = new Cropper(imageRef.value, {
    aspectRatio: 1,
    viewMode: 1,
    autoCrop: false,
    autoCropArea: 1,
    dragMode: "move",
    rotatable: false,
  });
}

function startCropping() {
  cropper.value?.setDragMode("crop");
}

function startMoving() {
  cropper.value?.setDragMode("move");
  cropper.value?.clear();
}

function cropImage() {
  const canvas = cropper.value?.getCroppedCanvas();
  if (!canvas) return;
  croppedImage.value = canvas.toDataURL("image/webp");
}

function sendImage() {
  const canvas = cropper.value?.getCroppedCanvas();
  if (!canvas) return;
  croppedImage.value = canvas.toDataURL("image/webp");
  sessionStore.updatePlayerAvatar(croppedImage.value);
  closeCropping();
}

function closeCropping() {
  cropping.value = false;
  if (upload.value) {
    upload.value.value = "";
  }
  image.value = null;
  croppedImage.value = null;
  if (cropper.value) {
    cropper.value.destroy();
  }
  cropper.value = null;
}

defineExpose({
  uploadAvatar,
  closeCropping,
});
</script>

<style scoped>
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.cropper-modal {
  background: #fff; /* Solid background */
  opacity: 1;
  padding: 20px;
  border-radius: 8px;
  position: relative;
  z-index: 1001; /* Ensures it stays on top of the overlay */
  width: 80%;
  height: 80%;
  max-width: 500px;
  overflow-x: scroll;
  overflow-y: scroll;
  display: flex;
  justify-content: center;
  /* align-items: center; */
}

.canvas {
  position: relative;
  width: 90%;
  height: 65%;
}

img {
  max-height: 100%;
  max-width: 100%;
  height: 100%;
  overflow-y: scroll;
  overflow-x: hidden;
}
</style>
