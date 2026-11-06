export const DOCS_URL = import.meta.env.VITE_DOC_URL || "https://docs.canvas.best";

export const NEW_API_ENABLED = import.meta.env.VITE_NEW_API_ENABLED !== "false";
export const NEW_API_BASE_URL = (import.meta.env.VITE_NEW_API_URL || "https://api.oioi.lat").replace(/\/+$/, "");
export const NEW_API_CHANNEL_ID = "newapi-auto";

// Official plugin registry URL: CI publishes to plugins-dist for jsDelivr delivery; an environment variable may override it for self-hosting.
export const PLUGIN_REGISTRY_URL = import.meta.env.VITE_PLUGIN_REGISTRY_URL || "https://cdn.jsdelivr.net/gh/basketikun/infinite-canvas@plugins-dist/official-plugins.json";
