// بحث الأكل: بيطبّع الإملاء العربي (أ/إ/آ، ى/ي، ة/ه، التشكيل، ال التعريف) وبيترجم الكلمات العربية الشائعة لمفردات USDA الإنجليزية.
// دوال صافية (من غير DOM أو شبكة). بيانات USDA نفسها بتتحمّل لما المستخدم يفتح تبويب الأكل (src/data/usda-foods.ts).
import { DISHES } from "../../worker/src/food.ts";
import type { Dish } from "../../worker/src/food.ts";
import type { UsdaRow } from "../data/usda-foods.ts";

/** توحيد الإملاء: حروف الألف، الياء/الألف المقصورة، التاء المربوطة/الهاء، حذف التشكيل والتطويل، الأرقام الهندية. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[ىیي]/g, "ي").replace(/[ةہه]/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/ک/g, "ك").replace(/پ/g, "ب").replace(/ڤ/g, "ف").replace(/گ/g, "ك").replace(/چ/g, "ج")
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
}
const words = (s: string): string[] => normalizeText(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w));

// عبارات من أكتر من كلمة (بتتبدّل قبل التقسيم). المفاتيح بتتطبّع تلقائيًا.
const PHRASES: Record<string, string> = {
  "فول سوداني": "peanuts", "جوز هند": "coconut", "بطيخ اصفر": "melon cantaloupe", "بطاطس مقليه": "french fried", "بطاطا مقليه": "french fried", "بطاطس محمره": "french fried", "بطاطس شيبس": "potato chips", "بطاطس حلوه": "sweet potato", "بطاطا حلوه": "sweet potato",
  "زيت زيتون": "oil olive", "جبنه قريش": "cheese cottage", "جبنه بيضا": "cheese feta", "جبنه بيضاء": "cheese feta", "جبنه فيتا": "cheese feta", "جبنه رومي": "cheese", "جبنه شيدر": "cheese cheddar",
  "ديك رومي": "turkey", "ايس كريم": "ice cream", "هوت دوج": "hot dog", "بيج ماك": "big mac", "برجر كنج": "burger king", "كوكا كولا": "cola", "عصير برتقال": "orange juice", "لبن رايب": "yogurt", "رز بلبن": "rice pudding", "عيش بلدي": "bread", "عيش فينو": "bread", "بطاطس مهروسه": "potatoes mashed", "صدر فراخ": "chicken breast", "صدور فراخ": "chicken breast", "ورك فراخ": "chicken thigh", "فخذه فراخ": "chicken thigh", "لحمه مفرومه": "beef ground", "كفته مفرومه": "beef ground",
};
// كلمة عربية -> كلمات بحث إنجليزية (أي واحدة منهم تكفي). مفردات USDA بالإنجليزي.
const AR2EN: Record<string, string> = {
  موز: "banana", تفاح: "apple", برتقال: "orange", بلح: "dates", تمر: "dates", عنب: "grapes", بطيخ: "watermelon", مانجو: "mango mangos", فراوله: "strawberries", تين: "figs", رمان: "pomegranates", جوافه: "guavas", ليمون: "lemon lemons", خوخ: "peaches", كمثري: "pears", يوسفي: "tangerines clementines", مشمش: "apricots", شمام: "melon cantaloupe", كنتالوب: "cantaloupe", اناناس: "pineapple", كيوي: "kiwi", توت: "berries blackberries", كرز: "cherries", زبيب: "raisins", مشروم: "mushrooms", فطر: "mushrooms",
  بيض: "egg", بيضه: "egg", لبن: "milk", حليب: "milk", زبادي: "yogurt", زبده: "butter", قشطه: "cream", كريمه: "cream", جبنه: "cheese", جبن: "cheese", فيتا: "feta", موزاريلا: "mozzarella", شيدر: "cheddar", قريش: "cottage", ريكوتا: "ricotta", بارميزان: "parmesan",
  رز: "rice", ارز: "rice", مكرونه: "macaroni spaghetti pasta noodles", باستا: "pasta spaghetti macaroni", اسباجيتي: "spaghetti", شوفان: "oat oats oatmeal", برغل: "bulgur", كسكسي: "couscous", فريك: "freekeh wheat", ذره: "corn", كورن: "corn", فشار: "popcorn", شعير: "barley", كينوا: "quinoa",
  عيش: "bread", خبز: "bread", توست: "bread toast", بسكويت: "cookies crackers biscuits", كيك: "cake", كوكيز: "cookies", كرواسون: "croissants", دونات: "doughnuts", فطيره: "pie", بيتزا: "pizza", برجر: "hamburger patty", همبرجر: "hamburger patty", ساندويتش: "sandwich", سندوتش: "sandwich", ساندوتش: "sandwich", ناجتس: "nuggets", ماكدونالدز: "mcdonald's", كنتاكي: "kfc", شيبسي: "potato chips", شيبس: "chips", بطاطس: "potatoes", بطاطا: "potatoes", تاكو: "taco", بوريتو: "burrito", ستيك: "steak", سوشي: "sushi", وافل: "waffle", بانكيك: "pancakes", بان: "pancakes",
  فراخ: "chicken", دجاج: "chicken", فرخه: "chicken", بط: "duck", ديك: "turkey", لحمه: "beef", لحم: "beef", بقري: "beef", كندوز: "beef", ضاني: "lamb", خروف: "lamb", ماعز: "goat", كبده: "liver", كبد: "liver", جمل: "camel", سجق: "sausage", نقانق: "sausage", مرتديلا: "bologna", لانشون: "luncheon", بسطرمه: "pastrami", بيكون: "bacon", ساجق: "sausage",
  سمك: "fish", تونه: "tuna", سلمون: "salmon", بلطي: "tilapia", سردين: "sardine", جمبري: "shrimp", استاكوزا: "lobster", كابوريا: "crab", حبار: "squid", كاليماري: "squid", بوري: "mullet",
  عدس: "lentils", حمص: "chickpeas hummus", فاصوليا: "beans", فول: "broadbeans fava beans", لوبيا: "cowpeas", بسله: "peas", طحينه: "tahini", طحينيه: "tahini", حلاوه: "halvah", لوبيه: "cowpeas", توفو: "tofu", صويا: "soy", فلافل: "falafel",
  طماطم: "tomatoes", خيار: "cucumber", بصل: "onions", جزر: "carrots", خس: "lettuce", سبانخ: "spinach", باذنجان: "eggplant", بامي: "okra", بامية: "okra", كوسه: "squash zucchini", كرنب: "cabbage", ملفوف: "cabbage", فلفل: "peppers", ثوم: "garlic", زيتون: "olives", بروكلي: "broccoli", قرنبيط: "cauliflower", افوكادو: "avocados", جرجير: "arugula", بقدونس: "parsley", شبت: "dill", كزبره: "coriander", نعناع: "mint", قرع: "pumpkin squash", بنجر: "beets", فجل: "radishes", كرفس: "celery", لفت: "turnips", ملوخيه: "molokhia jute", سلطه: "salad",
  زيت: "oil", سمن: "ghee butter", مارجرين: "margarine", عسل: "honey", سكر: "sugars", مربي: "jams", لوز: "almonds", جوز: "walnuts", كاجو: "cashew", فستق: "pistachio", بندق: "hazelnuts", سمسم: "sesame", لب: "sunflower seeds", ملح: "salt", خل: "vinegar", مايونيز: "mayonnaise", كاتشب: "catsup ketchup", صلصه: "sauce", شوربه: "soup", مسلي: "ghee",
  كولا: "cola", بيبسي: "cola", بيبسى: "cola", كوكاكولا: "cola", سفن: "lemon-lime", عصير: "juice", شاي: "tea", قهوه: "coffee", ماء: "water", ميه: "water", مياه: "water", مشروب: "beverage", ريد: "energy", نسكافيه: "coffee instant", كاكاو: "cocoa", شيكولاته: "chocolate", شوكولاته: "chocolate", شيكولاتة: "chocolate", ايسكريم: "ice cream", جيلاتي: "ice cream", حلويات: "candies", حلوي: "candies", سكاكر: "candies", مصاصه: "candies", جيلي: "gelatin", بودينج: "pudding", كاسترد: "custard",
  مشوي: "roasted grilled broiled", مشويه: "roasted grilled broiled", مسلوق: "boiled", مسلوقه: "boiled", مقلي: "fried", مقليه: "fried", مطبوخ: "cooked", مطبوخه: "cooked", نيء: "raw", ني: "raw", نيئ: "raw", مخبوز: "baked", محمر: "roasted", مفروم: "ground", مفرومه: "ground", مجفف: "dried", مجمد: "frozen", معلب: "canned", بدون: "without", كامل: "whole", قليل: "low", خالي: "fat-free nonfat", دسم: "fat", صدر: "breast", فخذ: "thigh", ورك: "thigh", جناح: "wing", جناحي: "wings",
};
const PHRASE_LIST: [string, string][] = Object.entries(PHRASES).map(([k, v]) => [normalizeText(k), v]);
const DICT = new Map<string, string>(Object.entries(AR2EN).map(([k, v]) => [normalizeText(k), v]));

/** بدائل بحث لكلمة: الكلمة نفسها + ترجمتها لو عربي (بتجرّب كمان بدون ات/ين/ه في الآخر). */
function alternatives(token: string): string[] {
  const out = new Set<string>([token]);
  const tries = [token, token.replace(/(ات|ين|ون)$/, ""), token.replace(/ه$/, ""), token + "ه"];
  for (const t of tries) { const hit = DICT.get(t) ?? DICT.get(t.startsWith("ال") ? t.slice(2) : t); if (hit) for (const w of hit.split(" ")) out.add(w); }
  return [...out].filter((w) => w.length > 0);
}

const hayCache = new WeakMap<Dish, string[]>();
const hay = (d: Dish): string[] => { let h = hayCache.get(d); if (!h) { h = words(`${d.ar} ${d.en} ${d.aliases ?? ""}`); hayCache.set(d, h); } return h; };

/** يحوّل صف USDA لأكلة. الاسم بالإنجليزي (وصف USDA)، والسعرات بتتنقل زي ما هي من المصدر. */
export function usdaToDish(row: UsdaRow): Dish {
  const [fdc, name, kcal, g] = row;
  return { id: `u${fdc}`, ar: name, en: name, kcalPer100g: [kcal, kcal], typicalG: g >= 20 ? g : 100, quality: "analysis", source: `USDA FoodData Central ${fdc}`, usda: true };
}

/** بيدوّر في قائمة الأكلات. كل كلمة في البحث لازم تلاقي كلمة بتبدأ بيها (أو ترجمتها). الأكل المصري/العربي بيتقدّم. */
export function searchFoods(query: string, pool: readonly Dish[], limit = 15): Dish[] {
  let q = normalizeText(query).trim();
  for (const [k, v] of PHRASE_LIST) if (q.includes(k)) q = q.replace(k, ` ${v} `);
  const tokens = words(q);
  if (!tokens.length) return [];
  const alts = tokens.map(alternatives);
  const scored: { d: Dish; s: number }[] = [];
  for (const d of pool) {
    const h = hay(d);
    let score = d.usda ? 0 : 60;
    let ok = true;
    for (const a of alts) {
      let best = -1;
      for (const alt of a) for (let i = 0; i < h.length; i++) {
        const w = h[i] as string;
        if (w === alt || w === `${alt}s` || w === `${alt}es`) best = Math.max(best, 20 - Math.min(i, 10));
        else if (alt.length >= 2 && w.startsWith(alt)) best = Math.max(best, 12 - Math.min(i, 10));
      }
      if (best < 0) { ok = false; break; }
      score += best;
    }
    if (ok) scored.push({ d, s: score - d.en.length / 6 });
  }
  scored.sort((x, y) => y.s - x.s);
  return scored.slice(0, limit).map((x) => x.d);
}

/** الأكلات المصرية والعربية اللي بتظهر لما البحث فاضي. */
export const POPULAR: readonly Dish[] = DISHES.slice(0, 12);
export const allDishes = (usda: readonly Dish[]): readonly Dish[] => [...DISHES, ...usda];
