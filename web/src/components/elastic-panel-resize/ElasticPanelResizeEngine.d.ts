export type ElasticResizeCommit = { percentage: number; cancelled: boolean };
export type ElasticPanelResizeOptions = {
    /** CSS pixels or a CSS height. Omit for a square scene. */
    height?: number | string;
    /** Omit to follow prefers-reduced-motion. */
    reducedMotion?: boolean;
    label?: string;
    disabled?: boolean;
    /** Called only on release, cancellation or keyboard/double-click commit; not each frame. */
    onCommit?: (nominalWidth: number, detail: ElasticResizeCommit) => void;
};
export type ElasticSidebarOptions = ElasticPanelResizeOptions & {
    width: number;
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
};
export type ElasticSidebarAttachment = {
    panel: HTMLElement;
    container: HTMLElement;
    controls?: HTMLElement;
    side: "left" | "right";
};
export type ElasticPanelResizeController<T = ElasticPanelResizeOptions> = {
    update(options?: Partial<T>): void;
    destroy(): void;
};
export function createElasticPanelResize(host: HTMLElement, options?: ElasticPanelResizeOptions): ElasticPanelResizeController;
export function attachElasticPanelResize(host: HTMLElement, attachment: ElasticSidebarAttachment, options: ElasticSidebarOptions): ElasticPanelResizeController<ElasticSidebarOptions>;
