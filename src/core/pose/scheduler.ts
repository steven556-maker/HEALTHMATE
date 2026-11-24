export interface FrameScheduler {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
}

export function nextInferenceDelay(frameDurationMs: number, targetFps = 20): number {
  return Math.max(0, 1000 / targetFps - frameDurationMs);
}

export function createPoseLoop(
  scheduler: FrameScheduler,
  analyze: () => number | Promise<number>,
  targetFps = 20,
  onError: (error: unknown) => void = () => undefined,
): { start(): void; stop(): void } {
  let generation = 0;
  let running = false;
  let analyzingGeneration: number | null = null;
  let pending: { kind: "raf" | "timeout"; id: number } | null = null;

  const schedule = (run: number, delay = 0) => {
    if (!running || run !== generation || pending) return;
    if (delay > 0) {
      pending = { kind: "timeout", id: scheduler.setTimeout(() => { pending = null; void tick(run); }, delay) };
    } else {
      pending = { kind: "raf", id: scheduler.requestAnimationFrame(() => { pending = null; void tick(run); }) };
    }
  };

  const tick = async (run: number) => {
    if (!running || run !== generation || analyzingGeneration === run) return;
    analyzingGeneration = run;
    let duration = 0;
    try {
      duration = await analyze();
    } catch (error) {
      onError(error);
    } finally {
      if (analyzingGeneration === run) analyzingGeneration = null;
      if (running && run === generation) schedule(run, nextInferenceDelay(duration, targetFps));
    }
  };

  return {
    start() {
      if (running) return;
      generation++;
      running = true;
      schedule(generation);
    },
    stop() {
      running = false;
      generation++;
      if (!pending) return;
      if (pending.kind === "raf") scheduler.cancelAnimationFrame(pending.id);
      else scheduler.clearTimeout(pending.id);
      pending = null;
    },
  };
}
