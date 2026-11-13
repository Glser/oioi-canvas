import { useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject } from "react";
import { createMotionRuntime } from "./motion-runtime";
import type { ElasticPanelResizeOptions, ElasticSidebarOptions } from "./ElasticPanelResizeEngine.js";

export type { ElasticPanelResizeOptions } from "./ElasticPanelResizeEngine.js";
type Props = { options?: ElasticPanelResizeOptions; className?: string; style?: CSSProperties };

/** Empty, self-contained scene. The engine owns animation state, not the React render loop. */
export function ElasticPanelResize({ options = {}, className, style }: Props) {
    const host = useRef<HTMLDivElement>(null);
    const runtime = useRef<ReturnType<typeof createMotionRuntime> | null>(null);
    const latest = useRef(options);
    latest.current = options;
    useEffect(() => {
        if (!host.current) return;
        const instance = createMotionRuntime(latest.current);
        runtime.current = instance;
        instance.mount(host.current);
        return () => { instance.destroy(); runtime.current = null; };
    }, []);
    useEffect(() => { runtime.current?.update({ height: undefined, reducedMotion: undefined, ...options }); });
    return <div ref={host} className={className} style={{ minWidth: 0, width: "100%", ...style }} />;
}

type HandleProps = ElasticSidebarOptions & {
    panelRef: RefObject<HTMLDivElement | null>;
    side: "left" | "right";
};

/** Native grip for an existing sidebar; keeps content, theme and open/close animation intact. */
export function ElasticPanelResizeHandle({ panelRef, side, ...options }: HandleProps) {
    const host = useRef<HTMLDivElement>(null);
    const runtime = useRef<ReturnType<typeof createMotionRuntime> | null>(null);
    const latest = useRef(options);
    latest.current = options;
    useEffect(() => {
        const shell = panelRef.current;
        const node = host.current;
        if (!shell?.parentElement || !node?.parentElement) return;
        const instance = createMotionRuntime(latest.current);
        runtime.current = instance;
        instance.mount(node, { panel: shell, container: shell.parentElement, controls: node.parentElement, side }, latest.current);
        return () => { instance.destroy(); runtime.current = null; };
    }, [panelRef, side]);
    useLayoutEffect(() => { runtime.current?.update({ height: undefined, reducedMotion: undefined, ...options }); });
    return <div ref={host} data-elastic-sidebar={side} style={{ position: "absolute", top: 0, bottom: 0, [side === "right" ? "left" : "right"]: -16, width: 32, zIndex: 40, pointerEvents: options.disabled ? "none" : "auto" }} />;
}
