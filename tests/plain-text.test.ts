import { test } from "node:test";
import assert from "node:assert/strict";
import { stripMarkdown } from "../src/core/plain-text.ts";
import { buildSystem } from "../worker/src/index.ts";

test("stripMarkdown: بيشيل النجوم والعناوين ويحوّل النقاط", () => {
  assert.equal(stripMarkdown("**مهم**: كُل *فول*\n* بيض\n* رز\n*Disclaimer*"), "مهم: كُل فول\n- بيض\n- رز\nDisclaimer");
  assert.equal(stripMarkdown("## عنوان\nنص `كود`"), "عنوان\nنص كود");
});
test("stripMarkdown: النص العادي ومعادلات الضرب ما بتتغيرش", () => {
  assert.equal(stripMarkdown("3 * 4 = 12"), "3 * 4 = 12");
  assert.equal(stripMarkdown("سلام"), "سلام");
});
test("buildSystem: سؤال عربي يختار برومبت مصري حتى لو اللغة en", () => {
  const s = buildSystem("en", "عايز اكل اكله كويسه علشان بضخم", "");
  assert.match(s, /العامية المصرية/); assert.match(s, /فول/); assert.match(s, /Markdown/);
});
test("buildSystem: سؤال إنجليزي واللغة en يرد بنفس اللغة ومصري للأكل", () => {
  const s = buildSystem("en", "what should I eat to bulk", "");
  assert.match(s, /same language/); assert.match(s, /koshari/);
});
