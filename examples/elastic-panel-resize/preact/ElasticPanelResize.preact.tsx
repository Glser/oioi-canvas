import { useEffect, useRef } from "preact/hooks";
import { createMotionRuntime } from "../../../web/src/components/elastic-panel-resize/motion-runtime";
import type { ElasticPanelResizeOptions } from "../../../web/src/components/elastic-panel-resize/ElasticPanelResizeEngine.js";

export function ElasticPanelResize({ options = {} }: { options?: ElasticPanelResizeOptions }) {
    const host = useRef<HTMLDivElement>(null);
    const runtime = useRef<ReturnType<typeof createMotionRuntime> | null>(null);
    useEffect(() => {
        if (!host.current) return;
        const instance = createMotionRuntime();
        runtime.current = instance;
        instance.mount(host.current);
        return () => { instance.destroy(); runtime.current = null; };
    }, []);
    useEffect(() => { runtime.current?.update({ height: undefined, reducedMotion: undefined, ...options }); });
    return <div ref={host} style={{ width: "100%", minWidth: 0 }} />;
}
