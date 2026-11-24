import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioCoordinator, type CueAction } from "../src/app/audio-coordinator.ts";

function action(name: string, events: string[], state: { active: number; max: number }): CueAction {
  return () => {
    events.push(`start:${name}`);
    state.active++;
    state.max = Math.max(state.max, state.active);
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      state.active--;
      events.push(`cancel:${name}`);
    };
  };
}

test("MP3 and speech cues share one serial queue and never overlap", () => {
  const coordinator = new AudioCoordinator();
  const events: string[] = [];
  const state = { active: 0, max: 0 };
  let finishFirst = () => undefined;
  coordinator.enqueue((done) => {
    events.push("start:mp3"); state.active++; state.max = Math.max(state.max, state.active);
    finishFirst = () => { events.push("end:mp3"); state.active--; done(); };
    return () => { events.push("cancel:mp3"); state.active--; };
  });
  coordinator.enqueue(action("speech", events, state));
  assert.deepEqual(events, ["start:mp3"]);
  finishFirst();
  assert.deepEqual(events, ["start:mp3", "end:mp3", "start:speech"]);
  assert.equal(state.max, 1);
});

test("interrupt immediately cancels active cue and discards stale queued cues", () => {
  const coordinator = new AudioCoordinator();
  const events: string[] = [];
  const state = { active: 0, max: 0 };
  coordinator.enqueue(action("mp3", events, state));
  coordinator.enqueue(action("old-speech", events, state));
  coordinator.enqueue(action("rep-count", events, state), true);
  assert.deepEqual(events, ["start:mp3", "cancel:mp3", "start:rep-count"]);
  assert.equal(state.max, 1);
});

test("mute immediately cancels active cue and queued cues; muted cues are rejected", () => {
  const coordinator = new AudioCoordinator();
  const events: string[] = [];
  const state = { active: 0, max: 0 };
  coordinator.enqueue(action("speech", events, state));
  coordinator.enqueue(action("mp3", events, state));
  coordinator.setMuted(true);
  assert.deepEqual(events, ["start:speech", "cancel:speech"]);
  assert.equal(coordinator.enqueue(action("muted", events, state)), false);
  coordinator.setMuted(false);
  coordinator.enqueue(action("unmuted", events, state));
  assert.equal(events.at(-1), "start:unmuted");
});
