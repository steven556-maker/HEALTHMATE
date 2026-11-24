import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// مصدر الحقيقة الوحيد: src/ (TypeScript). vite بيبني dist/، و tsc للفحص بس (noEmit). مفيش نسخة JS مكتوبة يدويًا.
// الـ service worker بيتولّد من هنا (vite-plugin-pwa) ومفيش sw.js يدوي.
export default defineConfig({
  root: ".",
  base: "/HEALTHMATE/",
  publicDir: "web",
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: "index.html" } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // manifest.webmanifest موجود في web/
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest,mp3,webp}"],
        // ملفات MediaPipe كبيرة (wasm + الموديل): بتتخزّن عند أول استخدام بدل ما تتحمّل مع التثبيت
        globIgnores: ["vendor/**"],
        importScripts: ["notify-sw.js"],
        navigateFallbackDenylist: [/^\/vendor\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes("/vendor/"), handler: "CacheFirst", options: { cacheName: "hm-vendor", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 20 } } },
          // نسخة احتياطية لو الملفات المحلية مش متجهزة: بتتخزّن بعد أول تحميل
          { urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|storage\.googleapis\.com)\//, handler: "CacheFirst", options: { cacheName: "hm-mediapipe-cdn", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "hm-fonts", cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});
