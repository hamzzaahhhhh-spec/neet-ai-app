export const debounce = (fn, waitMs) => {
  let timeout = 0;
  return (...args) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), waitMs);
  };
};

export const rafThrottle = (fn) => {
  let pending = false;
  return (...args) => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      fn(...args);
      pending = false;
    });
  };
};

export const smoothScrollToElement = (id) => {
  const element = document.getElementById(id);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const enterFullScreen = async () => {
  const root = document.documentElement;
  if (!document.fullscreenElement && root.requestFullscreen) {
    await root.requestFullscreen();
  }
};

export const exitFullScreen = async () => {
  if (document.fullscreenElement && document.exitFullscreen) {
    await document.exitFullscreen();
  }
};

export const applyUiPreferences = ({ isDark, highContrast, fontScale }) => {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.classList.toggle("contrast", highContrast);
  document.documentElement.style.setProperty("--font-scale", String(fontScale));
};