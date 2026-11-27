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
        // التحميل الأول يبقى خفيف: صور التمارين اتلغت (رسم SVG داخلي)، والصوتيات بتتخزّن عند أول تشغيل
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        // ملفات MediaPipe كبيرة (wasm + الموديل): بتتخزّن عند أول استخدام بدل ما تتحمّل مع التثبيت
        globIgnores: ["vendor/**", "assets/usda-foods-*.js", "assets/cloud-sync-*.js"],
        importScripts: ["notify-sw.js"],
        navigateFallbackDenylist: [/^\/vendor\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes("/vendor/"), handler: "CacheFirst", options: { cacheName: "hm-vendor", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 20 } } },
          // صور التمارين على الكروت: مش في الـ precache، بتتخزّن بعد أول ظهور
          { urlPattern: ({ url }) => url.pathname.includes("/images/exercises/"), handler: "CacheFirst", options: { cacheName: "hm-exercise-images", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 40 } } },
          // الحزم الكبيرة اللي بتتحمّل عند الطلب (بحث الأكل، المزامنة): أول طلب من الشبكة وبعدين من الكاش
          { urlPattern: ({ url }) => /\/assets\/(usda-foods|cloud-sync)-[^/]+\.js$/.test(url.pathname), handler: "CacheFirst", options: { cacheName: "hm-lazy-chunks", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 10 } } },
          // التسجيلات الصوتية بتتطلب أول مرة بس وبعدين بتشتغل من الكاش
          { urlPattern: ({ url }) => url.pathname.includes("/audio/"), handler: "CacheFirst", options: { cacheName: "hm-audio", cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 30 } } },
          // نسخة احتياطية لو الملفات المحلية مش متجهزة: بتتخزّن بعد أول تحميل
          { urlPattern: /^https:\/\/(cdn\.jsdelivr\.net|storage\.googleapis\.com)\//, handler: "CacheFirst", options: { cacheName: "hm-mediapipe-cdn", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "hm-fonts", cacheableResponse: { statuses: [0, 200] } } },
        ],
      },
    }),
  ],
});
