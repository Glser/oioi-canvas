import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({ plugins: [svelte()], resolve: { dedupe: ["react", "react-dom"] }, server: { fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } } });
