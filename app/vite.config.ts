import { defineConfig } from "vite";

export default defineConfig({
  // 相対パス: GitHub Pages のサブパス配信とローカルプレビューの両方で動く
  base: "./",
  build: {
    chunkSizeWarningLimit: 1200, // three.js 本体が ~700KB あるため
  },
});
