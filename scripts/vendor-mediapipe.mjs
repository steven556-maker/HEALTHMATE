// يجهّز ملفات MediaPipe محليًا (web/vendor) عشان التمرين يشتغل offline فعلًا بدل الاعتماد على CDN.
// بيتشغّل تلقائيًا قبل dev/build. لو فشل (مفيش نت لتنزيل الموديل مثلًا) بيحذّر وبيكمّل، والتطبيق بيرجع للـ CDN.
import { cp, mkdir, access, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = resolve(root, "node_modules/@mediapipe/tasks-vision");
const out = resolve(root, "web/vendor");
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const exists = (p) => access(p).then(() => true, () => false);

try {
  if (!(await exists(pkg))) throw new Error("@mediapipe/tasks-vision غير مثبّتة (npm install)");
  await mkdir(resolve(out, "mediapipe"), { recursive: true });
  await cp(resolve(pkg, "vision_bundle.mjs"), resolve(out, "mediapipe/vision_bundle.mjs"));
  await cp(resolve(pkg, "wasm"), resolve(out, "mediapipe/wasm"), { recursive: true });
  const modelPath = resolve(out, "models/pose_landmarker_lite.task");
  if (!(await exists(modelPath))) {
    await mkdir(dirname(modelPath), { recursive: true });
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`تعذّر تنزيل الموديل (${res.status})`);
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  }
  console.log("vendor: MediaPipe جاهز في web/vendor");
} catch (error) {
  console.warn(`vendor: تخطّينا استضافة MediaPipe محليًا (${error.message}). التطبيق هيستخدم CDN.`);
}
