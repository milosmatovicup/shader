import { defineConfig } from "vite";

export default defineConfig({
  root: "./src",
  base: "./",
  server: {
    open: true,
  },
  plugins: [
  ],
  build: {
    outDir: "../dist/",
    emptyOutDir: true,
    minify: "terser",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
