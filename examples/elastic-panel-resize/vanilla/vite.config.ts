import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({ resolve: { dedupe: ["react", "react-dom"] }, server: { fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } } });
