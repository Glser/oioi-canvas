<script lang="ts">
import { createMotionRuntime } from "../../../web/src/components/elastic-panel-resize/motion-runtime";
import type { ElasticPanelResizeOptions } from "../../../web/src/components/elastic-panel-resize/ElasticPanelResizeEngine.js";

let { options = {} }: { options?: ElasticPanelResizeOptions } = $props();
function elastic(node: HTMLElement, initial: ElasticPanelResizeOptions) {
    const runtime = createMotionRuntime(initial);
    runtime.mount(node);
    return {
        update(next: ElasticPanelResizeOptions) { runtime.update({ height: undefined, reducedMotion: undefined, ...next }); },
        destroy() { runtime.destroy(); },
    };
}
</script>

<div use:elastic={options} style="width:100%;min-width:0"></div>
