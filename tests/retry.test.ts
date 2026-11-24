import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry } from "../worker/src/retry.js";

test("retry: transient status waits with exponential delay, then succeeds", async () => {
  let calls = 0;
  const delays: number[] = [];
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error("busy"), { status: 429 });
    return "ok";
  }, { wait: async (ms) => { delays.push(ms); } });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.ok(delays[0] >= 400 && delays[0] <= 600);
  assert.ok(delays[1] >= 800 && delays[1] <= 1200);
});

test("retry: honors Retry-After and does not retry a 400", async () => {
  const delays: number[] = [];
  let calls = 0;
  await withRetry(async () => {
    calls++;
    if (calls === 1) throw Object.assign(new Error("busy"), { status: 429, headers: new Headers({ "Retry-After": "0.2" }) });
    return "ok";
  }, { wait: async (ms) => { delays.push(ms); } });
  assert.deepEqual(delays, [200]);

  calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls++;
    throw Object.assign(new Error("invalid"), { status: 400 });
  }, { wait: async () => undefined }));
  assert.equal(calls, 1);
});
