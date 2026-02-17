export const createTimerEngine = ({ durationSeconds, onTick, onTimeout }) => {
  let running = false;
  let start = 0;
  let elapsedBeforePause = 0;
  let rafId = 0;

  const frame = () => {
    if (!running) return;
    const elapsedSeconds = Math.floor((performance.now() - start) / 1000) + elapsedBeforePause;
    const remaining = Math.max(0, durationSeconds - elapsedSeconds);
    onTick(remaining);
    if (remaining <= 0) {
      running = false;
      onTimeout();
      return;
    }
    rafId = window.requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      start = performance.now();
      rafId = window.requestAnimationFrame(frame);
    },
    pause() {
      if (!running) return;
      running = false;
      elapsedBeforePause += Math.floor((performance.now() - start) / 1000);
      if (rafId) window.cancelAnimationFrame(rafId);
    },
    stop() {
      running = false;
      elapsedBeforePause = 0;
      if (rafId) window.cancelAnimationFrame(rafId);
    },
    getElapsedSeconds() {
      if (!running) return elapsedBeforePause;
      return elapsedBeforePause + Math.floor((performance.now() - start) / 1000);
    }
  };
};

export const createInactivityMonitor = ({ timeoutMs, onTimeout }) => {
  let timer = 0;
  const events = ["mousemove", "keydown", "touchstart", "scroll"];

  const reset = () => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  };

  return {
    start() {
      events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
      reset();
    },
    stop() {
      if (timer) window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    },
    reset
  };
};