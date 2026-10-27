// Biga Panel ön yüzü: React + Vite. Çıktı web/dist (sunucu STATIC_DIR ile burayı sunar).
// Geliştirme: /api isteklerini API_TARGET'a (varsayılan http://localhost:3000) aktarır; SSE akışı tamponlanmaz.
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const root = fileURLToPath(new URL(".", import.meta.url));
const apiTarget = process.env.API_TARGET ?? "http://localhost:3000";

export default defineConfig({
  root,
  publicDir: "public",
  resolve: {
    alias: { "@shared": fileURLToPath(new URL("../src/shared", import.meta.url)) },
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false }, // kaynak haritaları üretimde sunulmaz
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        configure: (proxy) => {
          // SSE: ara katmanlar tamponlamasın
          proxy.on("proxyRes", (res) => {
            if (String(res.headers["content-type"] ?? "").includes("text/event-stream")) {
              res.headers["cache-control"] = "no-cache, no-transform";
              res.headers["x-accel-buffering"] = "no";
            }
          });
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // Kendi service worker'ımız (push + notificationclick bizde); eklenti sadece önbellek listesini enjekte eder.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false, // kaydı src/lib/push.ts yapar
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png", "badge-96.png"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        rollupFormat: "iife", // klasik SW: tüm tarayıcılarda (Firefox dahil) çalışır
        sourcemap: false,
      },
      manifest: {
        id: "/",
        name: "Biga Panel",
        short_name: "Biga Panel",
        description: "Şirketin WhatsApp numaraları için ekip gelen kutusu",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#f3f6f4",
        theme_color: "#f3f6f4",
        lang: "tr",
        dir: "ltr",
        categories: ["business", "productivity"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
