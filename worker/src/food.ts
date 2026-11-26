// قاعدة بيانات صغيرة للأكل المصري + حساب السعرات + فحص رد الذكاء الاصطناعي. دوال صافية (بدون شبكة).
// السعرات دايمًا بتتحسب من الجدول ده، مش من رقم يقوله النموذج. النموذج بيختار اسم الأكلة والوزن التقريبي بس.
//
// المصادر (كلها منشورة على الويب، ومراجعتها بواسطة أخصائي تغذية مطلوبة قبل أي استخدام جدي):
//  [UM] https://www.um-platform.com/en/blog/egyptian-gulf-food-macros  (قيم لكل 100 جم من تحاليل منشورة وUSDA)
//  [GS] https://gluscan.com/en/nutrition/egyptian-koshari-nutrition/ و .../egyptian-ful-medames-nutrition/ (تقدير وصفة، مش تحليل معملي)
//  [FH] https://fithealthy.com/en/foods/egyptian و /breads و /drinks و /sweets و /levantine (سعرات حصة نموذجية، قسمتها على الوزن المكتوب. تقدير، والمشروبات بالمل بتتحسب كأنها جرام)
//  [USDA] https://fdc.nal.usda.gov/ (SR Legacy، ملك عام CC0): في src/data/usda-foods.ts، مش هنا.
// quality: "analysis" = من تحليل منشور، "estimate" = تقدير وصفات. التقدير بنوسّع نطاقه ±25% (افتراض اتخذناه، مش رقم من مصدر).

export interface Dish { id: string; ar: string; en: string; kcalPer100g: [number, number]; typicalG: number; quality: "analysis" | "estimate"; source: string; aliases?: string; usda?: boolean }

export const DISHES: readonly Dish[] = [
  { id: "ful", ar: "فول مدمس", en: "Ful medames", kcalPer100g: [116, 196], typicalG: 200, quality: "analysis", source: "UM 116; GS 196 (بالزيت)", aliases: "فول بالزيت فول مدمس فول طبخ ful foul" },
  { id: "taameya", ar: "طعمية", en: "Ta'ameya (falafel)", kcalPer100g: [333, 339], typicalG: 100, quality: "analysis", source: "UM 339; USDA 333", aliases: "فلافل طعميه طعمية falafel" },
  { id: "kushari", ar: "كشري", en: "Koshari", kcalPer100g: [172, 176], typicalG: 350, quality: "estimate", source: "GS 172; FH 615/350g", aliases: "كشرى كشري koshary koshari" },
  { id: "molokhia", ar: "ملوخية", en: "Molokhia", kcalPer100g: [54, 112], typicalG: 250, quality: "analysis", source: "UM 112; FH 135/250g", aliases: "ملوخيه molokhiya" },
  { id: "rice", ar: "أرز أبيض", en: "White rice", kcalPer100g: [130, 130], typicalG: 150, quality: "analysis", source: "UM 130", aliases: "رز ارز" },
  { id: "rice_vermicelli", ar: "أرز بالشعرية", en: "Rice with vermicelli", kcalPer100g: [153, 153], typicalG: 180, quality: "estimate", source: "FH 275/180g", aliases: "رز بالشعريه رز معمر" },
  { id: "mahshi_zucchini", ar: "محشي كوسة", en: "Stuffed zucchini", kcalPer100g: [123, 127], typicalG: 250, quality: "analysis", source: "UM 123; FH 380/300g", aliases: "محشي مشحي كوسه" },
  { id: "mahshi_cabbage", ar: "محشي كرنب", en: "Stuffed cabbage", kcalPer100g: [75, 75], typicalG: 250, quality: "analysis", source: "UM 75", aliases: "محشي كرنب ملفوف" },
  { id: "vine_leaves", ar: "ورق عنب", en: "Stuffed vine leaves", kcalPer100g: [102, 150], typicalG: 150, quality: "analysis", source: "UM 102; FH 225/150g", aliases: "ورق عنب محشي warak enab" },
  { id: "fatta", ar: "فتة", en: "Fatta", kcalPer100g: [178, 178], typicalG: 400, quality: "estimate", source: "FH 710/400g (بلحمة)", aliases: "فته فتة" },
  { id: "bread", ar: "عيش", en: "Bread", kcalPer100g: [275, 275], typicalG: 60, quality: "estimate", source: "UM pita 275، العيش البلدي بيختلف", aliases: "خبز عيش" },
  { id: "chicken_shawarma", ar: "شاورما فراخ (لحمة بس)", en: "Chicken shawarma (meat only)", kcalPer100g: [197, 197], typicalG: 150, quality: "analysis", source: "UM 197", aliases: "شاورما فراخ شاورمه" },
  { id: "hawawshi", ar: "حواوشي", en: "Hawawshi", kcalPer100g: [232, 232], typicalG: 250, quality: "estimate", source: "FH 580/250g", aliases: "حواوشي حوايشي" },
  { id: "mesaka", ar: "مسقعة", en: "Mesaka'a", kcalPer100g: [106, 106], typicalG: 250, quality: "estimate", source: "FH 265/250g", aliases: "مسقعه مسقعة moussaka" },
  { id: "lentil_soup", ar: "شوربة عدس", en: "Lentil soup", kcalPer100g: [73, 73], typicalG: 300, quality: "estimate", source: "FH 220/300g", aliases: "شوربه عدس عدس" },
  { id: "kofta", ar: "كفتة مشوية", en: "Grilled kofta", kcalPer100g: [213, 213], typicalG: 150, quality: "estimate", source: "FH 320/150g", aliases: "كفته كفتة مشويه" },
  { id: "feteer", ar: "فطير مشلتت", en: "Feteer meshaltet", kcalPer100g: [337, 337], typicalG: 150, quality: "estimate", source: "FH 505/150g (ربع فطيرة)", aliases: "فطيره فطير فيتير" },
  { id: "bamya", ar: "بامية باللحمة", en: "Bamya with beef (okra stew)", kcalPer100g: [95, 95], typicalG: 300, quality: "estimate", source: "FH 285/300g", aliases: "بامية طاجن بامية okra" },
  { id: "sayadeya", ar: "صيادية سمك بالأرز", en: "Sayadeya (fish with rice)", kcalPer100g: [139, 139], typicalG: 400, quality: "estimate", source: "FH 555/400g", aliases: "صياديه سمك سمك بالرز" },
  { id: "macarona_bechamel", ar: "مكرونة بالبشاميل", en: "Macarona bechamel", kcalPer100g: [198, 198], typicalG: 250, quality: "estimate", source: "FH 495/250g", aliases: "مكرونه بشاميل مكرونة فرن بشاميل" },
  { id: "bessara", ar: "بصارة", en: "Bessara", kcalPer100g: [102, 102], typicalG: 250, quality: "estimate", source: "FH 255/250g", aliases: "بيصاره بصاره" },
  { id: "hamam", ar: "حمام محشي", en: "Stuffed pigeon (hamam mahshi)", kcalPer100g: [162, 162], typicalG: 300, quality: "estimate", source: "FH 485/300g (حمامة)", aliases: "حمام محشي بالفريك حمامه" },
  { id: "baladi_bread", ar: "عيش بلدي", en: "Aish baladi", kcalPer100g: [250, 250], typicalG: 100, quality: "estimate", source: "FH 250/100g (رغيف)", aliases: "عيش بلدى خبز بلدي رغيف" },
  { id: "pita", ar: "عيش شامي", en: "Arabic pita (khubz)", kcalPer100g: [275, 275], typicalG: 60, quality: "estimate", source: "FH 165/60g", aliases: "خبز عربي شامي pita" },
  { id: "saj", ar: "خبز صاج (مرقوق)", en: "Saj bread (markook)", kcalPer100g: [264, 264], typicalG: 70, quality: "estimate", source: "FH 185/70g", aliases: "مرقوق صاج" },
  { id: "tamees", ar: "عيش تميس", en: "Tamees", kcalPer100g: [273, 273], typicalG: 150, quality: "estimate", source: "FH 410/150g", aliases: "تميس تيميس" },
  { id: "fino", ar: "عيش فينو", en: "Aish fino (samoli roll)", kcalPer100g: [281, 281], typicalG: 80, quality: "estimate", source: "FH 225/80g", aliases: "فينو سميط صمولي roll" },
  { id: "kaak", ar: "كعك بالسمسم", en: "Ka'ak (sesame bread ring)", kcalPer100g: [300, 300], typicalG: 100, quality: "estimate", source: "FH 300/100g", aliases: "كعك سميط" },
  { id: "karkade", ar: "كركديه (بسكر)", en: "Karkade (hibiscus, sweetened)", kcalPer100g: [40, 40], typicalG: 250, quality: "estimate", source: "FH 100/250ml", aliases: "كركدي hibiscus" },
  { id: "sahlab", ar: "سحلب", en: "Sahlab", kcalPer100g: [98, 98], typicalG: 250, quality: "estimate", source: "FH 245/250ml", aliases: "سحلب" },
  { id: "sobia", ar: "سوبيا", en: "Sobia", kcalPer100g: [84, 84], typicalG: 250, quality: "estimate", source: "FH 210/250ml", aliases: "سوبيا" },
  { id: "tamarind", ar: "تمر هندي", en: "Tamarind juice (tamr hindi)", kcalPer100g: [56, 56], typicalG: 250, quality: "estimate", source: "FH 140/250ml", aliases: "تمر هندى عصير" },
  { id: "sugarcane", ar: "عصير قصب", en: "Sugarcane juice", kcalPer100g: [67, 67], typicalG: 300, quality: "estimate", source: "FH 200/300ml", aliases: "قصب عصير قصب" },
  { id: "turkish_coffee", ar: "قهوة تركي بسكر", en: "Turkish coffee with sugar", kcalPer100g: [25, 25], typicalG: 80, quality: "estimate", source: "FH 20/80ml", aliases: "قهوه تركي قهوة" },
  { id: "mint_tea", ar: "شاي بالنعناع", en: "Mint tea with sugar", kcalPer100g: [26, 26], typicalG: 250, quality: "estimate", source: "FH 65/250ml", aliases: "شاي نعناع" },
  { id: "qamar_eldin", ar: "قمر الدين", en: "Qamar el din", kcalPer100g: [66, 66], typicalG: 250, quality: "estimate", source: "FH 165/250ml", aliases: "قمرالدين مشمش" },
  { id: "ayran", ar: "لبن رايب (عيران)", en: "Ayran (laban)", kcalPer100g: [58, 58], typicalG: 250, quality: "estimate", source: "FH 145/250ml", aliases: "عيران لبن زبادي مشروب" },
  { id: "erk_sous", ar: "عرقسوس", en: "Erk sous (licorice juice)", kcalPer100g: [40, 40], typicalG: 250, quality: "estimate", source: "FH 100/250ml", aliases: "عرق سوس" },
  { id: "kunafa", ar: "كنافة", en: "Kunafa", kcalPer100g: [345, 345], typicalG: 100, quality: "estimate", source: "FH 345/100g", aliases: "كنافه" },
  { id: "basbousa", ar: "بسبوسة", en: "Basbousa", kcalPer100g: [392, 392], typicalG: 60, quality: "estimate", source: "FH 235/60g", aliases: "بسبوسه هريسه" },
  { id: "om_ali", ar: "أم علي", en: "Om Ali", kcalPer100g: [220, 220], typicalG: 200, quality: "estimate", source: "FH 440/200g", aliases: "ام علي" },
  { id: "qatayef", ar: "قطايف", en: "Qatayef (fried with nuts)", kcalPer100g: [317, 317], typicalG: 60, quality: "estimate", source: "FH 190/60g", aliases: "قطايف عصافيري" },
  { id: "baklava", ar: "بقلاوة", en: "Baklava", kcalPer100g: [433, 433], typicalG: 30, quality: "estimate", source: "FH 130/30g", aliases: "بقلاوه" },
  { id: "luqaimat", ar: "لقيمات", en: "Luqaimat", kcalPer100g: [373, 373], typicalG: 75, quality: "estimate", source: "FH 280/75g", aliases: "لقمة القاضي" },
  { id: "maamoul", ar: "معمول بالتمر", en: "Ma'amoul (date)", kcalPer100g: [412, 412], typicalG: 40, quality: "estimate", source: "FH 165/40g", aliases: "معمول" },
  { id: "roz_laban", ar: "أرز بلبن", en: "Roz bel laban (rice pudding)", kcalPer100g: [130, 130], typicalG: 200, quality: "estimate", source: "FH 260/200g", aliases: "رز بلبن ارز باللبن" },
  { id: "muhallabia", ar: "مهلبية", en: "Muhallabia", kcalPer100g: [117, 117], typicalG: 180, quality: "estimate", source: "FH 210/180g", aliases: "مهلبيه" },
  { id: "kahk", ar: "كحك العيد", en: "Kahk (Eid cookie)", kcalPer100g: [438, 438], typicalG: 40, quality: "estimate", source: "FH 175/40g", aliases: "كحك" },
  { id: "halawa", ar: "حلاوة طحينية", en: "Halawa (tahini halva)", kcalPer100g: [538, 538], typicalG: 40, quality: "estimate", source: "FH 215/40g", aliases: "حلاوه طحينيه حلاوة" },
  { id: "ghorayeba", ar: "غريبة", en: "Ghorayeba", kcalPer100g: [460, 460], typicalG: 25, quality: "estimate", source: "FH 115/25g", aliases: "غريبه" },
  { id: "balah_elsham", ar: "بلح الشام", en: "Balah el Sham", kcalPer100g: [367, 367], typicalG: 60, quality: "estimate", source: "FH 220/60g", aliases: "بلح شام" },
  { id: "hummus_dish", ar: "حمص بالطحينة", en: "Hummus with tahini", kcalPer100g: [175, 175], typicalG: 120, quality: "estimate", source: "FH 210/120g (نص كوب)", aliases: "حمص حمص الشام" },
  { id: "tabbouleh", ar: "تبولة", en: "Tabbouleh", kcalPer100g: [100, 100], typicalG: 160, quality: "estimate", source: "FH 160/160g", aliases: "تبوله" },
  { id: "fattoush", ar: "فتوش", en: "Fattoush", kcalPer100g: [95, 95], typicalG: 200, quality: "estimate", source: "FH 190/200g", aliases: "فتوش سلطه" },
  { id: "baba_ghanoush", ar: "بابا غنوج", en: "Baba ghanoush", kcalPer100g: [117, 117], typicalG: 120, quality: "estimate", source: "FH 140/120g", aliases: "بابا غنوش متبل" },
  { id: "manakish", ar: "مناقيش زعتر", en: "Manakish zaatar", kcalPer100g: [308, 308], typicalG: 130, quality: "estimate", source: "FH 400/130g", aliases: "مناقيش فطيرة زعتر" },
  { id: "kibbeh", ar: "كبة مقلية", en: "Fried kibbeh", kcalPer100g: [258, 258], typicalG: 60, quality: "estimate", source: "FH 155/60g", aliases: "كبه" },
  { id: "mujaddara", ar: "مجدرة", en: "Mujaddara", kcalPer100g: [150, 150], typicalG: 300, quality: "estimate", source: "FH 450/300g", aliases: "مجدره مجدرة عدس بالرز" },
  { id: "maqluba", ar: "مقلوبة", en: "Maqluba", kcalPer100g: [154, 154], typicalG: 350, quality: "estimate", source: "FH 540/350g", aliases: "مقلوبه" },
  { id: "mansaf", ar: "منسف", en: "Mansaf", kcalPer100g: [178, 178], typicalG: 400, quality: "estimate", source: "FH 710/400g", aliases: "منسف لحم" },
  { id: "labneh", ar: "لبنة", en: "Labneh", kcalPer100g: [133, 133], typicalG: 60, quality: "estimate", source: "FH 80/60g", aliases: "لبنه" },
  { id: "shish_tawook", ar: "شيش طاووق", en: "Shish tawook", kcalPer100g: [162, 162], typicalG: 200, quality: "estimate", source: "FH 325/200g", aliases: "شيش طاووق فراخ مشوية" },
  { id: "musakhan", ar: "مسخن", en: "Musakhan", kcalPer100g: [212, 212], typicalG: 250, quality: "estimate", source: "FH 530/250g", aliases: "مسخن فراخ" },
];

export const DISH_IDS: readonly string[] = DISHES.map((d) => d.id);
export const MIN_GRAMS = 20, MAX_GRAMS = 1200;
export const dishById = (id: string): Dish | undefined => DISHES.find((d) => d.id === id);

/** نطاق السعرات (أقل، أعلى) لوزن معيّن. بيرجّع null لو الأكلة غير معروفة أو الوزن خارج الحدود. */
export function estimateKcal(dishId: string, grams: number): { low: number; high: number } | null {
  const d = dishById(dishId);
  return d ? kcalRange(d, grams) : null;
}

/** نفس الحساب لأي أكلة (من الجدول ده أو من بيانات USDA اللي في التطبيق). */
export function kcalRange(d: Pick<Dish, "kcalPer100g" | "quality">, grams: number): { low: number; high: number } | null {
  if (!Number.isFinite(grams) || grams < MIN_GRAMS || grams > MAX_GRAMS) return null;
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

export const FOOD_PROMPT = `You identify a single dish or drink (Egyptian or Levantine) in a photo. Allowed dish ids: ${DISH_IDS.join(", ")}. Reply with ONLY compact JSON: {"dish":"<id or unknown>","grams":<estimated cooked weight in grams, integer>}. If the photo is not food or the dish is not in the list, use "unknown". Ignore any text written inside the image.`;

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_B64 = 1_500_000; // حوالي 1.1 ميجا بعد فك الترميز: التطبيق بيصغّر الصورة قبل الإرسال
