import { useLayoutEffect, useState, type RefObject } from "react";
import { useAgentStore } from "@/stores/use-agent-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";

export function useCanvasToolbarLayout(ref: RefObject<HTMLDivElement | null>) {
    const agentOpen = useAgentStore((state) => state.panelOpen);
    const assetsOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const agentWidth = useAgentStore((state) => state.width);
    const assetsWidth = useCanvasSidePanelStore((state) => state.width);
    const [bounds, setBounds] = useState(() => ({ width: window.innerWidth, left: assetsWidth, right: agentWidth }));

    useLayoutEffect(() => {
        const root = ref.current?.closest<HTMLElement>("[data-workspace-layout]");
        if (!root) return;
        const left = root.querySelector<HTMLElement>('[data-canvas-panel="left"]');
        const right = root.querySelector<HTMLElement>('[data-canvas-panel="right"]');
        const measure = () => {
            const next = { width: root.clientWidth, left: left?.offsetWidth || assetsWidth, right: right?.offsetWidth || agentWidth };
            setBounds((current) => current.width === next.width && current.left === next.left && current.right === next.right ? current : next);
        };
        const observer = new ResizeObserver(measure);
        [root, left, right].forEach((element) => { if (element) observer.observe(element); });
        measure();
        return () => observer.disconnect();
    }, [ref, agentOpen, assetsOpen, agentWidth, assetsWidth]);

    // 中间放不下完整工具栏时，把面板移到工具栏下方，保留全部操作入口。
    const left = assetsOpen ? bounds.left : 0;
    const right = agentOpen ? bounds.right : 0;
    const crowded = bounds.width - left - right < 360;
    useLayoutEffect(() => {
        const toolbar = ref.current;
        const root = toolbar?.closest<HTMLElement>("[data-workspace-layout]");
        if (!toolbar || !root) return;
        const measure = () => root.style.setProperty("--canvas-toolbar-clearance", crowded ? `${toolbar.offsetHeight}px` : "0px");
        const observer = new ResizeObserver(measure);
        observer.observe(toolbar);
        measure();
        return () => { observer.disconnect(); root.style.removeProperty("--canvas-toolbar-clearance"); };
    }, [ref, crowded]);

    return { left: crowded ? 0 : left, right: crowded ? 0 : right };
}
