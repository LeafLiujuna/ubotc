import { createApp, defineAsyncComponent } from "vue";
import App from "./App.vue";
import toast from "./services/toast";
import { router } from "./router";

import 'vue-select/dist/vue-select.css';
import "./main.scss";
import "./icons/gameIcons";
import { createPinia } from "pinia";
import { AuthHelper } from "./helpers/auth";
import { installDisplayPreferences } from "./services/displayPreferences";

window.$toast = toast;

AuthHelper.migrateLegacyToken();

const app = createApp(App);

app.component(
  "font-awesome-icon",
  defineAsyncComponent(async () => {
    const module = await import("@fortawesome/vue-fontawesome");
    return module.FontAwesomeIcon;
  }),
);

const pinia = createPinia();
app.use(pinia);
installDisplayPreferences();
app.use(router);

app.mount("#app");
