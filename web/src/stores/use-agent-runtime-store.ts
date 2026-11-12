import { create } from "zustand";
import localforage from "localforage";
import { fetchAgentRuntimes, fetchAgentRuntimeInfo, type RuntimeCatalog, type RuntimeInfo } from "@/services/api/canvas-agent";
import { useAgentStore } from "./use-agent-store";

const cache = localforage.createInstance({ name: "oioi-canvas", storeName: "agent_runtime_catalog" });
let requestId = 0;
type RuntimeStore = { catalog: RuntimeCatalog | null; info: RuntimeInfo | null; detecting: boolean; error: string; load: (refresh?: boolean) => Promise<void> };

export const useAgentRuntimeStore = create<RuntimeStore>((set) => ({
    catalog: null, info: null, detecting: false, error: "",
    load: async (refresh = false) => {
        const id = ++requestId;
        const { url, token, connected } = useAgentStore.getState();
        set({ detecting: connected, info: null, error: "" });
        try {
            const saved = await cache.getItem<RuntimeCatalog>(url);
            if (id !== requestId) return;
            set({ catalog: saved });
            if (!connected) return;
            const catalog = await fetchAgentRuntimes(url, token, refresh);
            if (id !== requestId) return;
            set({ catalog });
            await cache.setItem(url, catalog);
            if (catalog.runtimes.some((runtime) => runtime.id === "codex" && runtime.status === "detected")) {
                const info = await fetchAgentRuntimeInfo(url, token);
                if (id === requestId) set({ info });
            }
        } catch (error) { if (id === requestId) set({ error: error instanceof Error ? error.message : String(error) }); }
        finally { if (id === requestId) set({ detecting: false }); }
    },
}));
