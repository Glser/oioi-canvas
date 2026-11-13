import { render } from "solid-js/web";
import { ElasticPanelResize } from "./ElasticPanelResize.solid";
const dispose = render(() => <ElasticPanelResize />, document.querySelector("#app")!);
if (import.meta.hot) import.meta.hot.dispose(dispose);
