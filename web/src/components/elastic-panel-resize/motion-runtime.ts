import { attachElasticPanelResize, createElasticPanelResize } from "./ElasticPanelResizeEngine.js";
import type { ElasticPanelResizeController, ElasticPanelResizeOptions, ElasticSidebarAttachment, ElasticSidebarOptions } from "./ElasticPanelResizeEngine.js";

/** Shared native lifecycle. Options can change before/after mount, without resetting the gesture. */
export function createMotionRuntime(initial: ElasticPanelResizeOptions = {}) {
    let options = { ...initial };
    let controller: ElasticPanelResizeController | null = null;
    let mountedHost: HTMLElement | null = null;
    return {
        mount(host: HTMLElement, attachment?: ElasticSidebarAttachment, sidebarOptions?: ElasticSidebarOptions) {
            if (host === mountedHost) return;
            controller?.destroy();
            controller = attachment && sidebarOptions
                ? attachElasticPanelResize(host, attachment, { ...sidebarOptions, ...options })
                : createElasticPanelResize(host, options);
            mountedHost = host;
        },
        update(patch: ElasticPanelResizeOptions & Partial<ElasticSidebarOptions> = {}) {
            options = { ...options, ...patch };
            controller?.update(patch);
        },
        destroy() {
            controller?.destroy();
            controller = null;
            mountedHost = null;
        },
    };
}
