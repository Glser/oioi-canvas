import { mountElasticPanelResize } from "./vanilla.js";
const instance = mountElasticPanelResize(document.querySelector("#app"));
window.addEventListener("pagehide", () => instance.destroy(), { once: true });
if (import.meta.hot) import.meta.hot.dispose(() => instance.destroy());
