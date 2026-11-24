import { test } from "node:test";
import assert from "node:assert/strict";
import { syncSnapshot, type SyncRow } from "../src/core/sync.ts";
import type { Snapshot } from "../src/core/merge.ts";
import { SYNC_KEYS } from "../src/core/merge.ts";

const session = (id: string, at: number) => ({ id, exerciseId: "squat", at, goodReps: 1, badReps: 0, holdSeconds: 0, updatedAt: at });

test("نطاق البيانات المتزامنة لا يحتوي سجل المساعد أو أسرار Web Push", () => {
  assert.deepEqual(SYNC_KEYS, ["hm.sessions", "hm.checkins", "hm.settings", "hm.medications", "hm.routine", "hm.parq"]);
  assert.ok(!SYNC_KEYS.includes("hm.assistant.chat" as never));
  assert.ok(!SYNC_KEYS.includes("hm.push.private" as never));
});

test("المزامنة تعيد المحاولة بعد تعارض الجهاز وتحتفظ بتغييرات الطرفين", async () => {
  let local: Snapshot = { "hm.sessions": [session("local", 10)] };
  let remote: SyncRow = { data: { "hm.sessions": [session("remote", 11)] }, version: 2 };
  let attempts = 0;
  let writes = 0;
  await syncSnapshot({
    readLocal: () => local,
    writeLocal: (next) => { writes++; local = next; },
    fetchRemote: async () => ({ ...remote }),
    pushRemote: async (snapshot, row) => {
      attempts++;
      if (attempts === 1) { remote = { data: { "hm.sessions": [...remote.data["hm.sessions"] as object[], session("other-device", 12)] }, version: 3 }; return false; }
      assert.equal(row?.version, 3);
      remote = { data: snapshot, version: 4 };
      return true;
    },
  });
  assert.equal(attempts, 2);
  assert.equal(writes, 1);
  assert.deepEqual((local["hm.sessions"] as { id: string }[]).map((item) => item.id).sort(), ["local", "other-device", "remote"]);
});

test("انقطاع الشبكة لا يكتب لقطة جزئية إلى التخزين المحلي", async () => {
  const local: Snapshot = { "hm.sessions": [session("device", 1)] };
  let writes = 0;
  await assert.rejects(syncSnapshot({
    readLocal: () => local,
    writeLocal: () => { writes++; },
    fetchRemote: async () => { throw new TypeError("network unavailable"); },
    pushRemote: async () => true,
  }), /network unavailable/);
  assert.equal(writes, 0);
});

test("التعارض المستمر يفشل بوضوح بعد حد المحاولات", async () => {
  let reads = 0;
  await assert.rejects(syncSnapshot({
    readLocal: () => ({ "hm.sessions": [session("device", 1)] }),
    writeLocal: () => assert.fail("should not write"),
    fetchRemote: async () => { reads++; return { data: {}, version: reads }; },
    pushRemote: async () => false,
    maxRetries: 2,
  }), /sync_conflict/);
  assert.equal(reads, 3);
});
