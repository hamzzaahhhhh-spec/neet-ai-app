const SESSION_KEY_PREFIX = "neet_session_";
const PERFORMANCE_HISTORY_KEY = "neet_performance_history";
const PERFORMANCE_BACKUP_KEY = "neet_performance_history_backup";
const HASH_HISTORY_KEY = "neet_hash_history";

const safeParse = (raw, fallback) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const read = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  return safeParse(raw, fallback);
};

const write = (key, value) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const validatePerformanceModel = (model) => {
  if (!model || typeof model !== "object") return false;
  if (typeof model.overallAccuracy !== "number") return false;
  if (!model.subjectStats || !model.topicStats || !model.difficultyStats) return false;
  return true;
};

export const saveSessionState = (date, payload) => {
  write(`${SESSION_KEY_PREFIX}${date}`, {
    ...payload,
    savedAt: Date.now()
  });
};

export const loadSessionState = (date) => read(`${SESSION_KEY_PREFIX}${date}`, null);

export const clearSessionState = (date) => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${SESSION_KEY_PREFIX}${date}`);
};

export const getPerformanceHistory = () => {
  const value = read(PERFORMANCE_HISTORY_KEY, []);
  if (!Array.isArray(value)) return [];
  return value;
};

export const savePerformanceHistory = (entry) => {
  const existing = getPerformanceHistory();
  const next = [...existing, entry].slice(-120);
  write(PERFORMANCE_HISTORY_KEY, next);
  write(PERFORMANCE_BACKUP_KEY, next);
  return next;
};

export const restorePerformanceHistory = () => {
  const primary = read(PERFORMANCE_HISTORY_KEY, null);
  if (Array.isArray(primary)) return primary;

  const backup = read(PERFORMANCE_BACKUP_KEY, []);
  if (Array.isArray(backup)) {
    write(PERFORMANCE_HISTORY_KEY, backup);
    return backup;
  }
  return [];
};

export const getLatestPerformance = () => {
  const history = getPerformanceHistory();
  return history.length ? history[history.length - 1] : null;
};

export const registerQuestionHashes = (date, hashes) => {
  const store = read(HASH_HISTORY_KEY, {});
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const sanitized = Object.entries(store).reduce((acc, [day, value]) => {
    const dayValue = value || {};
    if (Number(dayValue.timestamp || 0) >= cutoff) {
      acc[day] = dayValue;
    }
    return acc;
  }, {});

  sanitized[date] = {
    timestamp: Date.now(),
    hashes: Array.from(new Set(hashes))
  };

  write(HASH_HISTORY_KEY, sanitized);
};

export const isQuestionHashDuplicate = (hash) => {
  const store = read(HASH_HISTORY_KEY, {});
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return Object.values(store).some((entry) => {
    if (!entry || Number(entry.timestamp || 0) < cutoff) return false;
    return Array.isArray(entry.hashes) && entry.hashes.includes(hash);
  });
};

export const localStorageAvailable = () => {
  try {
    if (typeof window === "undefined") return false;
    const key = "neet_storage_test";
    window.localStorage.setItem(key, "ok");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};