export const MAI_SESSION_ID_STORAGE_KEY = 'mai.session_id';

function makeSessionId(): string {
  return `float-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getOrCreateSessionId(): string {
  try {
    const existing = window.localStorage.getItem(MAI_SESSION_ID_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    return makeSessionId();
  }
  const fresh = makeSessionId();
  try {
    window.localStorage.setItem(MAI_SESSION_ID_STORAGE_KEY, fresh);
  } catch {
    // localStorage unavailable — session id lives for this call only
  }
  return fresh;
}

export function resetSessionId(): string {
  const fresh = makeSessionId();
  try {
    window.localStorage.setItem(MAI_SESSION_ID_STORAGE_KEY, fresh);
  } catch {
    // ignore
  }
  return fresh;
}
