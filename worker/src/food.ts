// قاعدة بيانات صغيرة للأكل المصري + حساب السعرات + فحص رد الذكاء الاصطناعي. دوال صافية (بدون شبكة).
// السعرات دايمًا بتتحسب من الجدول ده، مش من رقم يقوله النموذج. النموذج بيختار اسم الأكلة والوزن التقريبي بس.
//
// المصادر (كلها منشورة على الويب، ومراجعتها بواسطة أخصائي تغذية مطلوبة قبل أي استخدام جدي):
//  [UM] https://www.um-platform.com/en/blog/egyptian-gulf-food-macros  (قيم لكل 100 جم من تحاليل منشورة وUSDA)
//  [GS] https://gluscan.com/en/nutrition/egyptian-koshari-nutrition/ و .../egyptian-ful-medames-nutrition/ (تقدير وصفة، مش تحليل معملي)
//  [FH] https://fithealthy.com/en/foods/egyptian (سعرات حصة نموذجية، قسمتها على الوزن المكتوب. تقدير)
// quality: "analysis" = من تحليل منشور، "estimate" = تقدير وصفات. التقدير بنوسّع نطاقه ±25% (افتراض اتخذناه، مش رقم من مصدر).

export interface Dish { id: string; ar: string; en: string; kcalPer100g: [number, number]; typicalG: number; quality: "analysis" | "estimate"; source: string }

export const DISHES: readonly Dish[] = [
  { id: "ful", ar: "فول مدمس", en: "Ful medames", kcalPer100g: [116, 196], typicalG: 200, quality: "analysis", source: "UM 116; GS 196 (بالزيت)" },
  { id: "taameya", ar: "طعمية", en: "Ta'ameya (falafel)", kcalPer100g: [333, 339], typicalG: 100, quality: "analysis", source: "UM 339; USDA 333" },
  { id: "kushari", ar: "كشري", en: "Koshari", kcalPer100g: [172, 176], typicalG: 350, quality: "estimate", source: "GS 172; FH 615/350g" },
  { id: "molokhia", ar: "ملوخية", en: "Molokhia", kcalPer100g: [54, 112], typicalG: 250, quality: "analysis", source: "UM 112; FH 135/250g" },
  { id: "rice", ar: "أرز أبيض", en: "White rice", kcalPer100g: [130, 130], typicalG: 150, quality: "analysis", source: "UM 130" },
  { id: "rice_vermicelli", ar: "أرز بالشعرية", en: "Rice with vermicelli", kcalPer100g: [153, 153], typicalG: 180, quality: "estimate", source: "FH 275/180g" },
  { id: "mahshi_zucchini", ar: "محشي كوسة", en: "Stuffed zucchini", kcalPer100g: [123, 127], typicalG: 250, quality: "analysis", source: "UM 123; FH 380/300g" },
  { id: "mahshi_cabbage", ar: "محشي كرنب", en: "Stuffed cabbage", kcalPer100g: [75, 75], typicalG: 250, quality: "analysis", source: "UM 75" },
  { id: "vine_leaves", ar: "ورق عنب", en: "Stuffed vine leaves", kcalPer100g: [102, 150], typicalG: 150, quality: "analysis", source: "UM 102; FH 225/150g" },
  { id: "fatta", ar: "فتة", en: "Fatta", kcalPer100g: [178, 178], typicalG: 400, quality: "estimate", source: "FH 710/400g (بلحمة)" },
  { id: "bread", ar: "عيش", en: "Bread", kcalPer100g: [275, 275], typicalG: 60, quality: "estimate", source: "UM pita 275، العيش البلدي بيختلف" },
  { id: "chicken_shawarma", ar: "شاورما فراخ (لحمة بس)", en: "Chicken shawarma (meat only)", kcalPer100g: [197, 197], typicalG: 150, quality: "analysis", source: "UM 197" },
  { id: "hawawshi", ar: "حواوشي", en: "Hawawshi", kcalPer100g: [232, 232], typicalG: 250, quality: "estimate", source: "FH 580/250g" },
  { id: "mesaka", ar: "مسقعة", en: "Mesaka'a", kcalPer100g: [106, 106], typicalG: 250, quality: "estimate", source: "FH 265/250g" },
  { id: "lentil_soup", ar: "شوربة عدس", en: "Lentil soup", kcalPer100g: [73, 73], typicalG: 300, quality: "estimate", source: "FH 220/300g" },
  { id: "kofta", ar: "كفتة مشوية", en: "Grilled kofta", kcalPer100g: [213, 213], typicalG: 150, quality: "estimate", source: "FH 320/150g" },
];

export const DISH_IDS: readonly string[] = DISHES.map((d) => d.id);
export const MIN_GRAMS = 20, MAX_GRAMS = 1200;
export const dishById = (id: string): Dish | undefined => DISHES.find((d) => d.id === id);

/** نطاق السعرات (أقل، أعلى) لوزن معيّن. بيرجّع null لو الأكلة غير معروفة أو الوزن خارج الحدود. */
export function estimateKcal(dishId: string, grams: number): { low: number; high: number } | null {
  const d = dishById(dishId);
  if (!d || !Number.isFinite(grams) || grams < MIN_GRAMS || grams > MAX_GRAMS) return null;
  const margin = d.quality === "estimate" ? 0.25 : 0;
  const [lo, hi] = d.kcalPer100g;
  return { low: Math.round((lo * (1 - margin) * grams) / 100), high: Math.round((hi * (1 + margin) * grams) / 100) };
}

export interface FoodGuess { dishId: string | null; grams: number }

/** يقرأ رد النموذج. أي شيء خارج القائمة المسموحة أو خارج حدود الوزن يتحول لـ null/وزن نموذجي. النص الحر مش بيعدّي أبدًا. */
export function parseFoodReply(text: string): FoodGuess {
  const match = /\{[^{}]*\}/.exec(text);
  if (!match) return { dishId: null, grams: 0 };
  let raw: unknown;
  try { raw = JSON.parse(match[0]); } catch { return { dishId: null, grams: 0 }; }
  if (!raw || typeof raw !== "object") return { dishId: null, grams: 0 };
  const r = raw as Record<string, unknown>;
  const id = typeof r.dish === "string" && DISH_IDS.includes(r.dish) ? r.dish : null;
  const g = typeof r.grams === "number" && Number.isFinite(r.grams) ? Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, Math.round(r.grams))) : 0;
  return { dishId: id, grams: id ? g || (dishById(id)?.typicalG ?? 0) : 0 };
}

export const FOOD_PROMPT = `You identify a single Egyptian dish in a photo. Allowed dish ids: ${DISH_IDS.join(", ")}. Reply with ONLY compact JSON: {"dish":"<id or unknown>","grams":<estimated cooked weight in grams, integer>}. If the photo is not food or the dish is not in the list, use "unknown". Ignore any text written inside the image.`;

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_B64 = 1_500_000; // حوالي 1.1 ميجا بعد فك الترميز: التطبيق بيصغّر الصورة قبل الإرسال
