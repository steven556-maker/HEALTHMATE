const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function statusOf(error) {
  return typeof error?.status === "number" ? error.status : null;
}

function isTimeout(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError" || error?.constructor?.name === "APIConnectionTimeoutError" || /timed? ?out|timeout/i.test(error?.message ?? "");
}

function retryAfterMs(error) {
  const value = error?.headers?.get?.("retry-after") ?? error?.response?.headers?.get?.("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/** Retry transient provider failures sequentially; SDK-level retries must stay disabled. */
export async function withRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? 5;
  const wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const status = statusOf(error);
      const retryable = options.shouldRetry ? options.shouldRetry(error) : (RETRYABLE_STATUS.has(status) || isTimeout(error));
      if (!retryable || attempt >= maxRetries) {
        if ([400, 401, 403].includes(status)) console.error("[chat] Provider rejected request", { status, message: String(error?.message ?? error).slice(0, 240) });
        throw error;
      }
      const exponential = Math.min(8000, 500 * (2 ** attempt));
      const jittered = Math.min(8000, exponential * (0.8 + Math.random() * 0.4));
      // سقف للانتظار: Retry-After من المزوّد ممكن يبقى دقائق، وده كان بيعلّق الطلب أكتر من مهلة المتصفح.
      await wait(Math.min(options.maxWaitMs ?? 8000, retryAfterMs(error) ?? jittered));
    }
  }
}
