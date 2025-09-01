import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  base: "./",
  build: {
    lib: {
      entry: "src/main.ts",
      name: "MitsukeLive",
      formats: ["es"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].js",
        manualChunks: undefined,
      },
    },
    sourcemap: true,
    minify: false,
  },
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["tests/**/*"],
      outDir: "dist",
    }),
  ],
});
