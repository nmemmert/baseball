// Tiny localStorage wrapper (Safari private mode can throw).
const KEY = 'skipper-save-v2';
export function saveRaw(str) { try { localStorage.setItem(KEY, str); return true; } catch { return false; } }
export function loadRaw() { try { return localStorage.getItem(KEY); } catch { return null; } }
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
