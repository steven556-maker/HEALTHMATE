export type CueAction = (done: () => void) => () => void;

/** Serializes recorded and synthesized cues, with immediate cancellation on interrupt/mute. */
export class AudioCoordinator {
  private queue: CueAction[] = [];
  private activeCancel: (() => void) | null = null;
  private activeId = 0;
  private muted = false;

  enqueue(action: CueAction, interrupt = false): boolean {
    if (this.muted) return false;
    if (interrupt) this.stop();
    this.queue.push(action);
    this.pump();
    return true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stop();
  }

  stop(): void {
    this.queue = [];
    const cancel = this.activeCancel;
    this.activeCancel = null;
    this.activeId++;
    cancel?.();
  }

  private pump(): void {
    if (this.muted || this.activeCancel || this.queue.length === 0) return;
    const action = this.queue.shift()!;
    const id = ++this.activeId;
    let finished = false;
    this.activeCancel = () => undefined;
    const done = () => {
      if (finished) return;
      finished = true;
      if (this.activeId !== id) return;
      this.activeCancel = null;
      this.pump();
    };
    try {
      const cancel = action(done);
      if (!finished && this.activeId === id) this.activeCancel = cancel;
    } catch {
      done();
    }
  }
}
