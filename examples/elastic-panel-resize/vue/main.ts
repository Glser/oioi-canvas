import { createApp } from "vue";
import ElasticPanelResize from "./ElasticPanelResize.vue";
const app = createApp(ElasticPanelResize);
app.mount("#app");
if (import.meta.hot) import.meta.hot.dispose(() => app.unmount());
