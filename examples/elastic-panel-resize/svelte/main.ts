import { mount, unmount } from "svelte";
import ElasticPanelResize from "./ElasticPanelResize.svelte";
const instance = mount(ElasticPanelResize, { target: document.querySelector("#app")! });
if (import.meta.hot) import.meta.hot.dispose(() => { void unmount(instance); });
