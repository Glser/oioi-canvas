import { render } from "preact";
import { ElasticPanelResize } from "./ElasticPanelResize.preact";
const target = document.querySelector("#app")!;
render(<ElasticPanelResize />, target);
if (import.meta.hot) import.meta.hot.dispose(() => render(null, target));
