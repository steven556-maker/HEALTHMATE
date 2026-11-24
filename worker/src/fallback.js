export const fallbackData = {
  faq: [
    {
      // أمان أولًا: لازم يفضل أول إدخال عشان أي عرض خطير يتوجّه لطلب مساعدة طبية حتى لو الذكاء الاصطناعي مش متاح.
      keywords: ["ألم في الصدر", "الم الصدر", "ضيق نفس", "ضيق في التنفس", "دوخة شديدة", "chest pain", "shortness of breath", "can't breathe", "cannot breathe", "severe dizziness"],
      answer: "الأعراض دي ممكن تكون خطيرة. وقّف التمرين فورًا واطلب مساعدة طبية عاجلة (الإسعاف أو أقرب طوارئ). التطبيق للتوعية فقط ولا يستبدل الطبيب.",
      answerEn: "These symptoms can be serious. Stop exercising now and get urgent medical help (emergency services or the nearest emergency room). This app is for awareness only and does not replace a clinician.",
    },
    {
      keywords: ["سعر", "تكلفة", "اشتراك", "price", "cost", "subscription"],
      answer: "التطبيق لا يعرض حاليًا تفاصيل أسعار أو اشتراكات. يمكنك استخدام المزايا المتاحة في النسخة الحالية.",
      answerEn: "The app does not currently list pricing or subscription details. You can use the features available in this version.",
    },
    {
      keywords: ["تواصل", "دعم", "مساعدة", "contact", "support", "help"],
      answer: "للدعم أو الإبلاغ عن مشكلة، تواصل عبر صفحة المشروع: https://github.com/steven556-maker/HEALTHMATE/issues",
      answerEn: "For support or to report an issue, use the project page: https://github.com/steven556-maker/HEALTHMATE/issues",
    },
    {
      keywords: ["مميزات", "بيعمل ايه", "وظيفة", "features", "what can", "what does"],
      answer: "يساعدك HEALTHMATE على متابعة التمارين المنزلية أمام الكاميرا، وتسجيل التقدم، وتنظيم الأدوية والتذكيرات، مع مساعد للتوعية الصحية. تحليل الكاميرا يتم على جهازك.",
      answerEn: "HEALTHMATE helps track home exercises with your camera, log progress, organize medications and reminders, and get general health awareness. Camera analysis runs on your device.",
    },
    {
      keywords: ["الكاميرا", "كاميرا", "زاوية", "camera", "angle", "filming"],
      answer: "ثبّت الهاتف بحيث يظهر جسمك كله، وصوّر من الجنب لأن زوايا المفاصل بتتحسب غلط من الأمام. الإضاءة الكويسة بتحسّن العدّ. الفيديو بيتحلل على جهازك.",
      answerEn: "Place your phone so your whole body is visible and film from the side, because joint angles are miscounted from the front. Good lighting improves counting. Video is analysed on your device.",
    },
    {
      keywords: ["خصوصية", "الفيديو", "فيديو", "privacy", "video"],
      answer: "تحليل الكاميرا بيتم على جهازك، والفيديو مبيترفعش ولا بيتخزن. السجلات بتفضل على الجهاز، ومبتترفعش لحسابك إلا لو سجّلت دخول ووافقت على المزامنة.",
      answerEn: "Camera analysis runs on your device, and video is never uploaded or stored. Your records stay on the device and are only synced to your account if you sign in and consent.",
    },
    {
      keywords: ["ايه التمارين", "التمارين المتاحة", "what exercises", "which exercises", "available exercises"],
      answer: "التمارين المتاحة: سكوات، ضغط، بلانك، لانج، جسر الأرداف، جلسة الحيطة، والوقوف من الكرسي (30 ثانية).",
      answerEn: "Available exercises: squat, push-up, plank, lunge, glute bridge, wall sit, and sit-to-stand (30 s).",
    },
    {
      keywords: ["تغيير اللغة", "اللغة", "language"],
      answer: "تقدر تبدّل بين العربية والإنجليزية من زر اللغة في التطبيق، واتجاه الواجهة (يمين/شمال) بيتغيّر معاها.",
      answerEn: "You can switch between Arabic and English with the language button; the layout direction (RTL/LTR) switches with it.",
    },
    {
      keywords: ["السلام عليكم", "مرحبا", "اهلا", "صباح الخير", "مساء الخير", "هاي", "hello", "hi", "hey"],
      answer: "أهلًا بيك! أنا مساعد HEALTHMATE. اسألني عن التمارين، وضع الكاميرا، تنظيم الأدوية والتذكيرات، النوم والتوتر، وهساعدك بمعلومات صحية عامة.",
      answerEn: "Hi! I'm the HEALTHMATE assistant. Ask me about exercises, camera setup, medication reminders, sleep or stress, and I'll share general health awareness.",
    },
    {
      keywords: ["دواء", "ادويه", "الادويه", "جرعه", "جرعة", "علاج", "medication", "medicine", "dose", "dosage", "pills"],
      answer: "ما أقدرش أحدد جرعات أو أغيّر أو أوقف دواء. التزم بتعليمات طبيبك أو الصيدلي. التطبيق بيساعدك بس تنظّم المواعيد وتسجّل الالتزام وتاخد تذكير.",
      answerEn: "I can't recommend doses or change or stop any medication. Follow your doctor's or pharmacist's instructions. The app only helps you organise schedules, log adherence and get reminders.",
    },
    {
      keywords: ["الم", "وجع", "اصابه", "شد عضلي", "pain", "hurts", "injury", "injured", "sore"],
      answer: "لو حسّيت بألم حاد أثناء التمرين وقّف فورًا وارتاح. الشد العضلي الخفيف بعد التمرين طبيعي، لكن لو الألم مستمر أو بيزيد كلّم طبيب. التطبيق للتوعية ولا يستبدل الطبيب.",
      answerEn: "If you feel sharp pain while exercising, stop and rest. Mild muscle soreness afterwards is common, but if pain persists or gets worse, see a clinician. This app is for awareness only.",
    },
    {
      keywords: ["نوم", "ارق", "توتر", "قلق", "مزاج", "sleep", "insomnia", "stress", "anxiety", "mood"],
      answer: "ثبّت ميعاد نوم قريب كل يوم، وقلّل الشاشات والكافيين قبل النوم بساعة أو اتنين، وجرّب تمرين تنفّس هادي. لو المشكلة مستمرة أو مأثرة على يومك، كلّم طبيب أو مختص.",
      answerEn: "Keep a steady bedtime, cut screens and caffeine an hour or two before bed, and try slow breathing. If problems persist or affect your day, talk to a clinician or specialist.",
    },
    {
      keywords: ["تسخين", "اسخن", "الاحماء", "warm up", "warm-up", "warmup", "stretch"],
      answer: "ابدأ بـ 3–5 دقايق مشي أو حركات خفيفة للمفاصل قبل التمرين، واختم بتمدد هادي. ابدأ بمستوى سهل وزوّد بالتدريج.",
      answerEn: "Start with 3–5 minutes of easy walking or gentle joint mobility, finish with light stretching, begin at an easy level and progress gradually.",
    },
    {
      keywords: ["مياه", "ماء", "شرب", "اكل", "تغذيه", "رجيم", "water", "hydration", "diet", "nutrition", "food"],
      answer: "اشرب مية بانتظام خلال اليوم، واعتمد على أكل متنوّع فيه خضار وبروتين وحبوب كاملة. لخطة غذاء مخصّصة أو لو عندك مرض مزمن، استشر أخصائي تغذية أو طبيب.",
      answerEn: "Drink water regularly, eat varied meals with vegetables, protein and whole grains. For a personal plan or if you have a chronic condition, consult a dietitian or doctor.",
    },
  ],
  default: "خلّيني أساعدك بالمتاح: التمارين وضبط الكاميرا، تنظيم الأدوية والتذكيرات، النوم والتوتر، أو متابعة تقدمك. اكتب سؤالك بشكل أبسط أو اختار واحد من الموضوعات دي. وللأعراض الخطيرة اطلب مساعدة طبية فورًا.",
  defaultEn: "Here is what I can help with: exercises and camera setup, medication reminders, sleep and stress, or tracking your progress. Try asking in a simpler way or pick one of those topics. For serious symptoms, get medical help right away.",
};

/** يشيل التشكيل ويوحّد الألف والواو والياء عشان المطابقة تشتغل مهما اتكتبت الكلمة. */
export function normalizeArabic(value) {
  return String(value).normalize("NFD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .toLocaleLowerCase("ar").replace(/\s+/g, " ").trim();
}

function matches(normalized, keyword) {
  const word = normalizeArabic(keyword);
  if (/^[a-z' -]+$/.test(word)) return new RegExp(`(^|[^a-z])${word.replace(/[-\s]/g, "[-\\s]?")}([^a-z]|$)`).test(normalized);
  // كلمة عربية قصيرة (مثلًا "الم") بتطابق كلمة كاملة بس، عشان ما تلقطش نص كلمات تانية ("المساعد").
  if (word.length <= 3) return normalized.split(/[^\p{L}\p{N}]+/u).some((token) => token === word || token === `ال${word}`);
  return normalized.includes(word);
}

/** رد ثابت من غير أي اتصال: أول إدخال مطابق (الأمان أولًا)، وإلا الرد الافتراضي. */
export function staticReply(question, locale) {
  const normalized = normalizeArabic(question);
  const match = fallbackData.faq.find((item) => item.keywords.some((word) => matches(normalized, word)));
  if (!match) return locale === "en" ? fallbackData.defaultEn : fallbackData.default;
  return locale === "en" ? match.answerEn : match.answer;
}
