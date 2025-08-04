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
        manualChunks: {
          tensorflow: ["@tensorflow/tfjs"],
          yaml: ["js-yaml"],
          core: [
            "src/lib/detection-controller.ts",
            "src/lib/yolo-inference.ts",
          ],
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
