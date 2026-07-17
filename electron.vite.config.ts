import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const alias = {
  "@": resolve(__dirname, "src"),
  "@renderer": resolve(__dirname, "src/renderer/src"),
};

export default defineConfig(() => {
  return {
    main: {
      plugins: [
        externalizeDepsPlugin({
          include: [
            "bufferutil",
            "utf-8-validate",
            "encoding",
            "register-scheme",
          ],
        }),
      ],
      resolve: {
        alias,
      },
      build: {
        minify: "esbuild" as const,
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      resolve: {
        alias,
      },
      build: {
        minify: "esbuild" as const,
      },
    },
    renderer: {
      resolve: {
        alias,
      },
      plugins: [
        react({
          babel: {
            plugins: [["babel-plugin-react-compiler", {}]],
          },
        }),
        tailwindcss(),
      ],
      build: {
        minify: "esbuild" as const,
        rollupOptions: {
          input: {
            main: resolve(__dirname, "src/renderer/index.html"),
            updater: resolve(__dirname, "src/renderer/updater.html"),
          },
        },
      },
    },
  };
});
