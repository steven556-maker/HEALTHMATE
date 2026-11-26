// يجهّز ملفات MediaPipe محليًا (web/vendor) عشان التمرين يشتغل offline فعلًا بدل الاعتماد على CDN.
// بيتشغّل تلقائيًا قبل dev/build. لو فشل (مفيش نت لتنزيل الموديل مثلًا) بيحذّر وبيكمّل، والتطبيق بيرجع للـ CDN.
import { cp, mkdir, access, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = resolve(root, "node_modules/@mediapipe/tasks-vision");
const out = resolve(root, "web/vendor");
// lite و full محليين، و heavy بيتحمّل من النت لما المستخدم يختاره
const MODELS = ["lite", "full"].map((v) => ({ name: `pose_landmarker_${v}.task`, url: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${v}/float16/1/pose_landmarker_${v}.task` }));
const exists = (p) => access(p).then(() => true, () => false);

try {
  if (!(await exists(pkg))) throw new Error("@mediapipe/tasks-vision غير مثبّتة (npm install)");
  await mkdir(resolve(out, "mediapipe"), { recursive: true });
  await cp(resolve(pkg, "vision_bundle.mjs"), resolve(out, "mediapipe/vision_bundle.mjs"));
  await cp(resolve(pkg, "wasm"), resolve(out, "mediapipe/wasm"), { recursive: true });
  for (const m of MODELS) {
    const modelPath = resolve(out, "models", m.name);
    if (await exists(modelPath)) continue;
    await mkdir(dirname(modelPath), { recursive: true });
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`تعذّر تنزيل الموديل ${m.name} (${res.status})`);
    await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  }
  console.log("vendor: MediaPipe جاهز في web/vendor");
} catch (error) {
  console.warn(`vendor: تخطّينا استضافة MediaPipe محليًا (${error.message}). التطبيق هيستخدم CDN.`);
}
