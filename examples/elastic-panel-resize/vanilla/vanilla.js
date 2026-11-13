import { createElasticPanelResize } from "../../../web/src/components/elastic-panel-resize/ElasticPanelResizeEngine.js";

/** Call after DOM mount. No framework, TS transform or runtime dependency is needed. */
export function mountElasticPanelResize(host, options = {}) {
    const instance = createElasticPanelResize(host, options);
    return {
        update(next) { instance.update(next); },
        destroy() { instance.destroy(); },
    };
}
