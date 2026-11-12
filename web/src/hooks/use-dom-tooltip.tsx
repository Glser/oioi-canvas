import { Tooltip } from "antd";
import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

// Delegate only explicitly marked dynamic content; never rewrite titles across the document.
export function useDomTooltip(containerRef: RefObject<HTMLElement | null>) {
    const [target, setTarget] = useState<{ element: HTMLElement; title: string; rect: DOMRect } | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const show = (event: Event) => {
            const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tooltip]") : null;
            if (!element || !container.contains(element) || !element.dataset.tooltip) return;
            setTarget((current) => current?.element === element ? current : { element, title: element.dataset.tooltip!, rect: element.getBoundingClientRect() });
        };
        const hide = () => setTarget(null);
        const leave = (event: Event) => {
            const next = (event as MouseEvent | FocusEvent).relatedTarget;
            if (!(next instanceof Node) || !(event.target instanceof Element) || !event.target.closest("[data-tooltip]")?.contains(next)) hide();
        };
        const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
        container.addEventListener("mouseover", show);
        container.addEventListener("focusin", show);
        container.addEventListener("mouseout", leave);
        container.addEventListener("focusout", leave);
        container.addEventListener("pointerdown", hide);
        container.addEventListener("keydown", keydown);
        return () => {
            container.removeEventListener("mouseover", show);
            container.removeEventListener("focusin", show);
            container.removeEventListener("mouseout", leave);
            container.removeEventListener("focusout", leave);
            container.removeEventListener("pointerdown", hide);
            container.removeEventListener("keydown", keydown);
        };
    }, [containerRef]);

    useEffect(() => {
        if (!target) return;
        const reposition = () => setTarget((current) => current?.element.isConnected && current.element.contains(document.activeElement)
            ? { ...current, rect: current.element.getBoundingClientRect() } : null);
        window.addEventListener("scroll", reposition, true);
        window.addEventListener("resize", reposition);
        return () => { window.removeEventListener("scroll", reposition, true); window.removeEventListener("resize", reposition); };
    }, [target]);

    return target?.element.isConnected ? createPortal(
        <Tooltip title={target.title} open>
            <span aria-hidden style={{ position: "fixed", pointerEvents: "none", left: target.rect.left, top: target.rect.top, width: target.rect.width, height: target.rect.height }} />
        </Tooltip>, document.body,
    ) : null;
}
