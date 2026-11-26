#!/usr/bin/env python3
"""يولّد src/data/usda-foods.ts من USDA FoodData Central (SR Legacy). بيشتغل مرة واحدة يدويًا، مش جزء من البناء.
المصدر: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip (ملك عام CC0، فاضل الاستشهاد بالمصدر).
الاستخدام: python3 scripts/build-usda-foods.py <فولدر الـ CSV المفكوك> > src/data/usda-foods.ts
القيم (سعرات/100 جم ووزن الحصة) بتتنقل زي ما هي من الملفات، من غير أي تعديل أو تقدير."""
import csv, re, sys

d = sys.argv[1].rstrip("/") + "/"
cats = {r["id"]: r["description"] for r in csv.DictReader(open(d + "food_category.csv", encoding="utf-8"))}
kcal = {}
for r in csv.DictReader(open(d + "food_nutrient.csv", encoding="utf-8")):
    if r["nutrient_id"] == "1008" and r["amount"]:
        kcal[r["fdc_id"]] = float(r["amount"])
portion = {}
for r in csv.DictReader(open(d + "food_portion.csv", encoding="utf-8")):
    if r["fdc_id"] not in portion and r["gram_weight"] and r["amount"]:
        try:
            g = float(r["gram_weight"]) / float(r["amount"])
        except ZeroDivisionError:
            continue
        portion[r["fdc_id"]] = g

# تصنيفات: (اسم USDA) -> (كود، الحد الأقصى لعدد الأكلات). الأقصر وصفًا (الأعم) بيتاخد الأول.
CAP = {
    "Beef Products": ("beef", 70), "Lamb, Veal, and Game Products": ("lamb", 35), "Pork Products": ("pork", 45),
    "Poultry Products": ("poultry", 90), "Sausages and Luncheon Meats": ("sausage", 50), "Finfish and Shellfish Products": ("fish", 150),
    "Dairy and Egg Products": ("dairy", 200), "Fats and Oils": ("fats", 40), "Legumes and Legume Products": ("legumes", 150),
    "Vegetables and Vegetable Products": ("veg", 320), "Fruits and Fruit Juices": ("fruit", 260), "Nut and Seed Products": ("nuts", 80),
    "Cereal Grains and Pasta": ("grains", 120), "Baked Products": ("baked", 220), "Breakfast Cereals": ("cereal", 100),
    "Sweets": ("sweets", 220), "Beverages": ("drinks", 170), "Snacks": ("snacks", 120), "Soups, Sauces, and Gravies": ("soups", 130),
    "Meals, Entrees, and Side Dishes": ("meals", 100),
    "Spices and Herbs": ("spices", 25),
}
CODES = [v[0] for v in CAP.values()]
BAD = re.compile(r"alcohol|\b(beer|whiskey|whisky|vodka|rum|gin|liqueur|brandy|cognac|tequila|sake|champagne|daiquiri|margarita|pina colada|bourbon|schnapps|liquor|beerwurst)\b|\bproof\b|^Beverages, Wine|USDA Commodity|school lunch|babyfood|baby food|infant formula|Includes foods for USDA|^Fast foods|^Restaurant|restaurant", re.I)
# مفيش منتجات بماركات ولا سلاسل مطاعم: أي كلمة كلها حروف كبيرة (3+) أو اسم ماركة معروف بيتشال. أكل عام بس.
BRAND_CAPS = re.compile(r"\b[A-Z]{3,}\b")
BRAND_NAMES = re.compile(r"\b(?:McDonald|Burger King|Wendy|Denny|Applebee|KFC|Pizza Hut|Domino|Subway|Taco Bell|Arby|Popeye|Starbucks|Dunkin|Chick-fil|Carl's|Hardee|Jack in the Box|Sonic|Dairy Queen|Pillsbury|Kellogg|Kraft|Campbell|Nabisco|Oscar Mayer|Hershey|Nestle|Nestl|Gerber|General Mills|Keebler|Pepperidge|Betty Crocker|Heinz|Quaker|Lipton|Coca|Pepsi|Mars|Snickers|Twix|Oreo|Cheerios|Doritos|Lay's|Pringles|Ben & Jerry|Haagen|Healthy Choice|Lean Cuisine|Stouffer|Hormel|Tyson|Jimmy Dean|Morningstar|Boca|Sara Lee|Entenmann|Little Debbie|Hostess|Slim Fast|Ensure|Gatorade|Red Bull|Monster|Powerade|Welch|Ocean Spray|Minute Maid|Tropicana|Hunt's|Del Monte|Chef Boyardee|Progresso|Knorr|Lance|Bisquick|Jell-O|Kool-Aid|Tang|Ovaltine|Carnation|Cool Whip|Land O Lakes|Smucker|Skippy|Jif|Planters|Spam|Velveeta|Philadelphia|Fruit Roll|Pop-Tarts|Eggo|Kashi|Weight Watchers|Atkins|Special K|Frosted|Froot Loops|Lucky Charms|Cap'n|Trix|Wheaties|Raisin Bran|Cocoa Puffs|Life cereal|Cracklin|Post(?=,)|Malt-O-Meal|Nature Valley|Quest|Clif|Luna|PowerBar|Balance|Mother's|Muscle Milk|Reddi|Andrea|Archway|Gamesa|Goya|Schar|Propel|Pockets|Wishbone|Hidden Valley|Bertolli|Ragu|Prego|Rice-A-Roni|Uncle Ben|Zatarain|Old El Paso|Ortega|Mission|Thomas|Wonder|Arnold|Nature's Own|Oroweat|Pepperidge|Rold Gold|Wavy|Ritz|Triscuit|Wheat Thins|Cheez|Goldfish|Fritos|Cheetos|Tostitos|Ruffles|Sun Chips|Funyuns|Combos|Slim Jim|Jack Link|Beyond|Impossible|Silk|Almond Breeze|Horizon|Yoplait|Dannon|Chobani|Fage|Stonyfield|Activia|Danimals|Gogurt|Capri|Motts|Mott's|Snapple|Arizona|Sobe|Vitamin Water|Glaceau|Fanta|Sprite|Mountain Dew|Dr Pepper|7-Up|Sunkist|Hawaiian Punch|Hi-C|Country Time|Crystal Light|Splenda|Equal|Sweet'N|Stevia|Truvia|Nutrasweet)\b", re.I)
# أكلات لازم تكون موجودة (أول وصفين الأقصر بيطابقوا). مفيش أرقام هنا، بس مفاتيح بحث على وصف USDA.
MUST = [r"^Bananas, raw", r"^Apples, raw, with skin", r"^Oranges, raw, all", r"^Dates, deglet", r"^Dates, medjool", r"^Grapes, red or green", r"^Watermelon, raw", r"^Mangos, raw", r"^Strawberries, raw", r"^Figs, raw", r"^Pomegranates, raw", r"^Guavas, common, raw", r"^Lemons, raw", r"^Peaches, yellow, raw", r"^Pears, raw", r"^Tangerines|^Clementines, raw",
  r"^Egg, whole, cooked, hard", r"^Egg, whole, cooked, fried", r"^Egg, whole, raw", r"^Milk, whole", r"^Milk, reduced fat|^Milk, lowfat", r"^Yogurt, plain, whole", r"^Cheese, feta", r"^Cheese, mozzarella", r"^Cheese, cheddar", r"^Cheese, cottage", r"^Butter, salted", r"^Cream, fluid, heavy",
  r"^Rice, white, long-grain, regular, cooked", r"^Rice, brown, long-grain, cooked", r"^Spaghetti, cooked, enriched", r"^Macaroni, cooked, enriched", r"^Oat", r"^Bulgur, cooked", r"^Couscous, cooked", r"^Bread, whole-wheat, commercially", r"^Bread, white, commercially", r"^Bread, pita, white", r"^Bread, pita, whole",
  r"^Chicken, broilers or fryers, breast, meat only, cooked, roasted", r"^Chicken, broilers or fryers, drumstick, meat only, cooked, roasted", r"^Beef, ground, 80% lean meat / 20% fat, patty, cooked, pan-broiled", r"^Beef, ground, 90% lean", r"^Lamb, .*loin.*cooked", r"^Turkey, .*breast.*cooked", r"^Fish, tuna, light, canned in water", r"^Fish, salmon, Atlantic, farmed, cooked", r"^Fish, tilapia, cooked", r"^Fish, sardine, Atlantic, canned in oil", r"^Crustaceans, shrimp, .*cooked",
  r"^Lentils, mature seeds, cooked", r"^Chickpeas.*cooked", r"^Beans, kidney.*cooked", r"^Broadbeans.*cooked", r"^Hummus", r"^Beans, fava|^Cowpeas.*cooked", r"^Tofu, raw, firm", r"^Peanut butter, smooth",
  r"^Potatoes, baked, flesh and skin", r"^Potatoes, boiled, cooked without skin", r"^French fries", r"^Sweet potato, cooked, baked", r"^Tomatoes, red, ripe, raw", r"^Cucumber, with peel, raw", r"^Onions, raw", r"^Carrots, raw", r"^Lettuce, cos|^Lettuce, iceberg", r"^Spinach, raw", r"^Eggplant, raw|^Eggplant, cooked", r"^Okra, cooked", r"^Squash, summer, zucchini.*raw", r"^Cabbage, raw", r"^Peppers, sweet, green, raw", r"^Garlic, raw", r"^Olives, ripe, canned", r"^Broccoli, cooked", r"^Cauliflower, cooked", r"^Avocados, raw, all",
  r"^Oil, olive", r"^Oil, vegetable|^Oil, sunflower", r"^Honey", r"^Sugars, granulated", r"^Seeds, sesame butter, tahini", r"^Nuts, almonds$", r"^Nuts, walnuts, english", r"^Seeds, sunflower seed kernels, dried", r"^Peanuts, all types, dry-roasted",
  r"^Carbonated beverage, cola|^Cola", r"^Beverages, Orange juice|^Orange juice, raw", r"^Tea, brewed", r"^Coffee, brewed", r"^Alcoholic beverage", r"^Beverages, Energy drink",
  r"^Candies, milk chocolate", r"^Candies, semisweet chocolate", r"^Ice creams, vanilla", r"^Cookies, chocolate chip", r"^Cake, chocolate", r"^Croissants, butter", r"^Doughnuts, cake", r"^Pie, apple",
  r"^Pizza, cheese", r"^Pizza, meat", r"^Potatoes, french fried", r"^Sandwich"]
foods = []
for r in csv.DictReader(open(d + "food.csv", encoding="utf-8")):
    c = cats.get(r["food_category_id"])
    desc = r["description"]
    if c == "Fast Foods" and desc.startswith("Pizza,"):
        c = "Meals, Entrees, and Side Dishes"  # البيتزا العامة (من غير ماركة) مصنفة عند USDA تحت Fast Foods
    if c not in CAP or r["fdc_id"] not in kcal or BAD.search(desc) or BRAND_NAMES.search(desc) or [w for w in BRAND_CAPS.findall(desc) if w not in ("USDA", "RTE", "NFS", "UHT")]:
        continue
    foods.append((r["description"].strip(), r["fdc_id"], c))
ODD = re.compile(r"imported|Australian|New Zealand|variety meats|by-products|game meat|Alaska Native|Shoshone|Navajo|Hopi|Apache|Pima|Northern Plains|Oglala|Kiowa|Cherokee", re.I)
foods.sort(key=lambda f: (len(f[0]) + (80 if ODD.search(f[0]) else 0), f[0]))
chosen, seen, count = [], set(), {}
def take(f):
    if f[1] in seen:
        return
    seen.add(f[1]); chosen.append(f); count[f[2]] = count.get(f[2], 0) + 1
for pat in MUST:
    rx = re.compile(pat, re.I)
    for f in [x for x in foods if rx.search(x[0])][:2]:
        take(f)
for f in foods:
    if count.get(f[2], 0) < CAP[f[2]][1]:
        take(f)
chosen.sort(key=lambda f: (CODES.index(CAP[f[2]][0]), f[0]))
def esc(s): return s.replace("\\", "\\\\").replace('"', '\\"')
print("// مولَّد بواسطة scripts/build-usda-foods.py من USDA FoodData Central (SR Legacy، 2018-04، ملك عام CC0). متعدلش بإيدك.")
print("// المصدر: https://fdc.nal.usda.gov/ . كل صف: [fdcId، الوصف، سعرات/100 جم، وزن حصة معتادة بالجرام (0 = مفيش)، رقم التصنيف في USDA_CATEGORIES].")
print("export const USDA_CATEGORIES: readonly string[] = [" + ", ".join('"%s"' % c for c in CODES) + "];")
print("export type UsdaRow = readonly [number, string, number, number, number];")
print("export const USDA_FOODS: readonly UsdaRow[] = [")
for desc, fid, c in chosen:
    g = portion.get(fid, 0)
    g = round(g) if 20 <= g <= 1200 else 0
    k = kcal[fid]; k = int(k) if k == int(k) else round(k, 1)
    print('  [%s, "%s", %s, %d, %d],' % (fid, esc(desc[:90]), k, g, CODES.index(CAP[c][0])))
print("];")
