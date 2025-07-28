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
      external: ["@tensorflow/tfjs", "js-yaml"],
      output: {
        globals: {
          "@tensorflow/tfjs": "tf",
          "js-yaml": "jsyaml",
        },
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
