import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      name: "MitsukeLive",
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
        manualChunks: undefined, // Disable manual chunking for individual files
      },
    },
    sourcemap: true,
  },
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["tests/**/*"],
      outDir: "dist",
    }),
  ],
});
