import { mergeSnapshots, sameSnapshot } from "./merge.ts";
import type { Snapshot } from "./merge.ts";

export interface SyncRow { data: Snapshot; version: number }

export async function syncSnapshot(options: {
  readLocal(): Snapshot;
  writeLocal(snapshot: Snapshot): void;
  fetchRemote(): Promise<SyncRow | null>;
  pushRemote(snapshot: Snapshot, row: SyncRow | null): Promise<boolean>;
  maxRetries?: number;
}): Promise<void> {
  const retries = options.maxRetries ?? 4;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const remote = await options.fetchRemote();
    const merged = mergeSnapshots(options.readLocal(), remote?.data ?? {});
    const unchanged = remote !== null && sameSnapshot(merged, mergeSnapshots(remote.data, {}));
    if (unchanged || await options.pushRemote(merged, remote)) {
      options.writeLocal(mergeSnapshots(options.readLocal(), merged));
      return;
    }
  }
  throw new Error("sync_conflict");
}
