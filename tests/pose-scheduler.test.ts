import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoseLoop, nextInferenceDelay, type FrameScheduler } from "../src/core/pose/scheduler.ts";

class FakeScheduler implements FrameScheduler {
  nextId = 1;
  rafs = new Map<number, () => void>();
  timers = new Map<number, () => void>();
  requestAnimationFrame(callback: () => void) { const id = this.nextId++; this.rafs.set(id, callback); return id; }
  cancelAnimationFrame(id: number) { this.rafs.delete(id); }
  setTimeout(callback: () => void) { const id = this.nextId++; this.timers.set(id, callback); return id; }
  clearTimeout(id: number) { this.timers.delete(id); }
  frame() { const entry = this.rafs.entries().next().value; assert.ok(entry, "one frame should be queued"); const [id, callback] = entry; this.rafs.delete(id); callback(); }
  timeout() { const entry = this.timers.entries().next().value; assert.ok(entry, "one timer should be queued"); const [id, callback] = entry; this.timers.delete(id); callback(); }
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test("التحليل المتأخر يحجز callback واحدًا فقط بعد اكتماله", async () => {
  const clock = new FakeScheduler();
  const work = deferred<number>();
  let calls = 0;
  const loop = createPoseLoop(clock, () => { calls++; return work.promise; });
  loop.start();
  clock.frame();
  assert.equal(calls, 1);
  assert.equal(clock.rafs.size + clock.timers.size, 0);
  work.resolve(80);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clock.rafs.size + clock.timers.size, 1);
  clock.frame();
  assert.equal(calls, 2);
  assert.equal(clock.rafs.size + clock.timers.size, 0);
  loop.stop();
});

test("الإيقاف وإعادة التشغيل يبطلان نتيجة الجيل القديم", async () => {
  const clock = new FakeScheduler();
  const oldWork = deferred<number>();
  let calls = 0;
  const loop = createPoseLoop(clock, () => (++calls === 1 ? oldWork.promise : 0));
  loop.start();
  clock.frame();
  loop.stop();
  loop.start();
  assert.equal(clock.rafs.size, 1);
  clock.frame();
  assert.equal(calls, 2);
  oldWork.resolve(0);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clock.rafs.size + clock.timers.size, 1);
  loop.stop();
  assert.equal(clock.rafs.size + clock.timers.size, 0);
});

test("تأخير التحليل يحد المعدل المستهدف ويمنع التأخير السالب", () => {
  assert.equal(nextInferenceDelay(10), 40);
  assert.equal(nextInferenceDelay(80), 0);
});

test("خطأ التحليل يحرر القفل ويبلغ المعالج ثم يوقف الحلقة", async () => {
  const clock = new FakeScheduler();
  let errors = 0;
  const loop = createPoseLoop(clock, () => { throw new Error("camera frame failed"); }, 20, () => { errors++; loop.stop(); });
  loop.start();
  clock.frame();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(errors, 1);
  assert.equal(clock.rafs.size + clock.timers.size, 0);
});
