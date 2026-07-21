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
        // The 3D skin renderer and LiveKit are already on-demand chunks. Their
        // engines are slightly above Vite's generic 500 kB threshold, while
        // keeping them out of the startup bundle is the important boundary.
        chunkSizeWarningLimit: 550,
        rollupOptions: {
          input: {
            main: resolve(__dirname, "src/renderer/index.html"),
            updater: resolve(__dirname, "src/renderer/updater.html"),
          },
          output: {
            manualChunks(id) {
              const moduleId = id.replace(/\\/g, "/");
              if (/node_modules\/(react|react-dom|scheduler)\//.test(moduleId)) {
                return "react-vendor";
              }
              if (
                /node_modules\/(jotai|i18next|react-i18next)\//.test(moduleId)
              ) {
                return "state-vendor";
              }
              if (/node_modules\/(radix-ui|@radix-ui)\//.test(moduleId)) {
                return "radix-vendor";
              }
              return undefined;
            },
          },
        },
      },
    },
  };
});
