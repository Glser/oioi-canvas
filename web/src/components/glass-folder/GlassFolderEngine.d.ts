import type { MotionOptions, MotionController } from "./motion-runtime";
export type GlassFolderFile = { id: string; name: string; meta?: string; url?: string; type?: "image" | "video" };
export type GlassFolderOptions = MotionOptions & {
    id?: string;
    label?: string;
    meta?: string;
    openLabel?: string;
    elementsLabel?: string;
    tone?: "light" | "dark";
    renamable?: boolean;
    coverUrl?: string;
    coverType?: "image" | "video";
    files?: GlassFolderFile[];
    onOpen?: (fileId?: string) => void;
    onRename?: (label: string) => void;
};
export function mountGlassFolder(target: HTMLElement, options?: GlassFolderOptions): MotionController;
