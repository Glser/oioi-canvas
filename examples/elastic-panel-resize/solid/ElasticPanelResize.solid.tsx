import { createEffect, onCleanup, onMount } from "solid-js";
import { createMotionRuntime } from "../../../web/src/components/elastic-panel-resize/motion-runtime";
import type { ElasticPanelResizeOptions } from "../../../web/src/components/elastic-panel-resize/ElasticPanelResizeEngine.js";

export function ElasticPanelResize(props: { options?: ElasticPanelResizeOptions }) {
    let host!: HTMLDivElement;
    const runtime = createMotionRuntime();
    onMount(() => runtime.mount(host));
    createEffect(() => runtime.update({ height: undefined, reducedMotion: undefined, ...props.options }));
    onCleanup(() => runtime.destroy());
    return <div ref={host} style={{ width: "100%", "min-width": "0" }} />;
}
