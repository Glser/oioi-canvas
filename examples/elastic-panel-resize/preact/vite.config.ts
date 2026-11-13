import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
export default defineConfig({ plugins: [preact()], resolve: { dedupe: ["react", "react-dom"] }, server: { fs: { allow: [fileURLToPath(new URL("../../../", import.meta.url))] } } });
