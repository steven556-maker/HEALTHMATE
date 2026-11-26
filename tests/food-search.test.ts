import { test } from "node:test";
import assert from "node:assert/strict";
import { DISHES, kcalRange } from "../worker/src/food.ts";
import { allDishes, normalizeText, searchFoods, usdaToDish } from "../src/core/food-search.ts";
import { USDA_CATEGORIES, USDA_FOODS } from "../src/data/usda-foods.ts";

const USDA = USDA_FOODS.map(usdaToDish);
const pool = allDishes(USDA);
const top = (q: string, n = 5): string[] => searchFoods(q, pool, n).map((d) => d.id);
const topNames = (q: string, n = 8): string => searchFoods(q, pool, n).map((d) => d.en).join(" | ");

test("الإملاء العربي: أ/إ/آ، ى/ي، ة/ه، التشكيل، التطويل", () => {
  assert.equal(normalizeText("أرز"), normalizeText("ارز"));
  assert.equal(normalizeText("كشرى"), normalizeText("كشري"));
  assert.equal(normalizeText("طعمية"), normalizeText("طعميه"));
  assert.equal(normalizeText("فُـول"), "فول");
  assert.equal(normalizeText("٢٠٠"), "200");
});
test("بحث الأكل المصري بأكتر من إملاء", () => {
  for (const q of ["كشري", "كشرى", "كُشَري", "koshari", "koshary"]) assert.equal(top(q)[0], "kushari", q);
  for (const q of ["طعمية", "طعميه", "فلافل"]) assert.ok(top(q, 3).includes("taameya"), q);
  for (const q of ["بسبوسة", "بسبوسه"]) assert.equal(top(q)[0], "basbousa", q);
  assert.equal(top("ام علي")[0], "om_ali");
  assert.equal(top("أم علي")[0], "om_ali");
  assert.ok(top("فول", 3).includes("ful"));
  assert.ok(top("الملوخية", 3).includes("molokhia"));
  assert.ok(top("رز", 6).includes("rice"));
  assert.ok(top("مكرونة بشاميل", 3).includes("macarona_bechamel"));
});
test("بحث عربي في قاعدة USDA بيترجم المفردات الشائعة", () => {
  assert.match(topNames("موز"), /Bananas, raw/);
  assert.match(topNames("بطاطس مقلية"), /french fried/i);
  assert.match(topNames("فراخ مشوي"), /Chicken.*(roasted|broiled|grilled)/i);
  assert.match(topNames("ايس كريم"), /Ice cream/i);
  assert.match(topNames("جبنة فيتا"), /feta/i);
  assert.match(topNames("فول سوداني"), /Peanuts/i);
  assert.match(topNames("بيبسي"), /cola/i);
  assert.match(topNames("تونة"), /tuna/i);
  assert.match(topNames("بيتزا"), /pizza/i);
});
test("بحث إنجليزي، وبحث فاضي أو بلا نتيجة", () => {
  assert.match(topNames("banana"), /Bananas, raw/);
  assert.match(topNames("pizza cheese"), /Pizza, cheese/i);
  assert.deepEqual(searchFoods("", pool), []);
  assert.deepEqual(searchFoods("   ", pool), []);
  assert.deepEqual(searchFoods("zzzzqqq", pool), []);
});
test("الأكل المصري بيتقدّم على USDA في نفس البحث", () => {
  const r = searchFoods("rice", pool, 10);
  assert.ok(!r[0]?.usda);
});
test("سلامة بيانات الأكل: مفيش أرقام فاسدة", () => {
  const ids = DISHES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const d of DISHES) assert.ok(d.kcalPer100g[0] > 0 && d.kcalPer100g[0] <= d.kcalPer100g[1] && d.kcalPer100g[1] < 950, d.id);
  assert.ok(DISHES.length >= 60);
  assert.ok(USDA_FOODS.length > 2000);
  assert.equal(new Set(USDA_FOODS.map((r) => r[0])).size, USDA_FOODS.length);
  for (const [fdc, name, kcal, g, cat] of USDA_FOODS) {
    assert.ok(Number.isInteger(fdc) && name.length > 2 && kcal >= 0 && kcal <= 950, String(fdc));
    assert.ok(g === 0 || (g >= 20 && g <= 1200), String(fdc));
    assert.ok(cat >= 0 && cat < USDA_CATEGORIES.length, String(fdc));
  }
});
test("السعرات من USDA بتتنقل زي ما هي (من غير توسيع)", () => {
  const row = USDA_FOODS.find((r) => r[1].startsWith("Bananas, raw"));
  assert.ok(row);
  const d = usdaToDish(row);
  assert.deepEqual(kcalRange(d, 100), { low: row[2], high: row[2] });
  assert.deepEqual(kcalRange(d, 200), { low: Math.round(row[2] * 2), high: Math.round(row[2] * 2) });
  assert.equal(kcalRange(d, 5), null);
});
test("مفيش ماركات ولا مطاعم في قاعدة USDA ولا في نتايج البحث", () => {
  const brand = /McDonald|Burger King|Wendy|Denny|Applebee|KFC|Pizza Hut|Domino|Subway|Taco Bell|Arby|Starbucks|Pillsbury|Kellogg|Nabisco|Quaker|Oscar Mayer|Hershey|Archway|Goya|Gamesa|Muscle Milk|Reddi|Powerade|Propel|Lean Pockets|Fast foods|Restaurant/i;
  for (const r of USDA_FOODS) { assert.ok(!brand.test(r[1]), r[1]); assert.ok(!/\b[A-Z]{3,}\b/.test(r[1].replace(/\b(USDA|RTE|NFS|UHT)\b/g, "")), r[1]); }
  for (const q of ["بطاطس مقلية", "برجر", "فراخ", "بيتزا", "كولا", "جبنة", "ايس كريم", "chicken", "pizza", "fries"]) {
    for (const d of searchFoods(q, pool, 15)) assert.ok(!brand.test(d.en), `${q}: ${d.en}`);
  }
});
test("مفيش مشروبات كحولية في قاعدة USDA ولا في البحث", () => {
  const alcohol = /alcohol|\bbeer|whisk|vodka|\brum\b|\bgin\b|liqueur|liquor|brandy|cognac|tequila|\bsake\b|champagne|daiquiri|margarita|colada|bourbon|schnapps|proof|\bwine\b(?!\s*vinegar)/i;
  for (const r of USDA_FOODS) assert.ok(!alcohol.test(r[1].replace(/Vinegar, red wine/i, "")), r[1]);
  for (const q of ["بيره", "نبيذ", "wine", "beer", "whiskey", "مشروب"]) for (const d of searchFoods(q, pool, 15)) assert.ok(!alcohol.test(d.en.replace(/Vinegar, red wine/i, "")), `${q}: ${d.en}`);
});
