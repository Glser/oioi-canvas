import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({ plugins: [vue()], resolve: { dedupe: ["react", "react-dom"] }, server: { fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } } });
