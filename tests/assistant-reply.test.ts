import { test } from "node:test";
import assert from "node:assert/strict";
import { getAssistantReply } from "../src/core/assistant-reply.ts";
import type { Attempt } from "../src/core/assistant-reply.ts";
import { staticReply } from "../worker/src/fallback.js";

const script = (steps: Attempt[]) => { const calls: number[] = []; return { calls, attempt: async () => { calls.push(calls.length); return steps.shift() ?? ({ kind: "failed", final: false } as Attempt); } }; };
const noPause = async () => undefined;

test("فشل مؤقت ثم نجاح: المستخدم يشوف رد الذكاء الاصطناعي بس (إعادة صامتة)", async () => {
  const s = script([{ kind: "failed", final: false }, { kind: "ai", text: "رد حقيقي" }]);
  assert.deepEqual(await getAssistantReply("سلام", "e", "t", "{}", "ar", s.attempt, noPause), { text: "رد حقيقي", source: "ai" });
  assert.equal(s.calls.length, 2);
});

test("فشل كل المحاولات: رد ثابت مناسب للسؤال بدل رسالة خطأ", async () => {
  const s = script([]);
  const out = await getAssistantReply("I have chest pain", "e", "t", "{}", "en", s.attempt, noPause) as { text: string; source: string };
  assert.equal(s.calls.length, 3);
  assert.equal(out.source, "fallback");
  assert.match(out.text, /urgent medical help/);
});

test("timeout: بدون إعادة فورية، ورد ثابت", async () => {
  const s = script([{ kind: "failed", final: true }]);
  const out = await getAssistantReply("hello", "e", "t", "{}", "en", s.attempt, noPause) as { text: string };
  assert.equal(s.calls.length, 1);
  assert.match(out.text, /HEALTHMATE assistant/);
});

test("الـ Worker رجّع رد ثابت بسبب فشل مؤقت: نحاول تاني، ولو نجح الذكاء الاصطناعي نعرضه", async () => {
  const s = script([{ kind: "fallback", text: "ثابت", temporary: true }, { kind: "ai", text: "ذكي" }]);
  assert.deepEqual(await getAssistantReply("x", "e", "t", "{}", "ar", s.attempt, noPause), { text: "ذكي", source: "ai" });
});

test("حصة منتهية (رد ثابت غير مؤقت): نعرضه فورًا من غير إعادة", async () => {
  const s = script([{ kind: "fallback", text: "ثابت", temporary: false }]);
  assert.deepEqual(await getAssistantReply("x", "e", "t", "{}", "ar", s.attempt, noPause), { text: "ثابت", source: "fallback" });
  assert.equal(s.calls.length, 1);
});

test("تسجيل الدخول والحد اليومي بيظهروا كرسائل معلومة، مش كأخطاء", async () => {
  assert.deepEqual(await getAssistantReply("x", "e", "t", "{}", "ar", script([{ kind: "notice", key: "assistantLimit" }]).attempt, noPause), { notice: "assistantLimit" });
});

test("الردود الثابتة: عربي/إنجليزي، الأمان أولًا، وكلمة قصيرة ما بتلقطش نص كلمة تانية", () => {
  assert.match(staticReply("عندي ألم في الصدر", "ar"), /طلب مساعدة طبية/);
  assert.match(staticReply("ازاي اغير جرعة الدواء", "ar"), /جرعات/);
  assert.match(staticReply("المساعد ده بيعمل ايه", "ar"), /HEALTHMATE/);
  assert.match(staticReply("this", "en"), /Here is what I can help with/); // "hi" جوه "this" مش تحية
  assert.match(staticReply("hi", "en"), /HEALTHMATE assistant/);
});
