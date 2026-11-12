export function createEffortMotion(root: HTMLElement, canvas: HTMLCanvasElement, ratio: number, reducedMotion: boolean): {
    moveTo(ratio: number, immediate: boolean): void;
    press(): void;
    drag(velocity: number): void;
    release(): void;
    setReducedMotion(reducedMotion: boolean): void;
    dispose(): void;
};
