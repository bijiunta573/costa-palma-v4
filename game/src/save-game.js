// Costa Palma — localStorage save: cash, story progress and the pistol.
// Small and forgiving: a corrupt or missing save simply means "no save".

const KEY = 'costa-palma-save-v1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return { cash: data.cash, missionIndex: data.missionIndex, hasPistol: !!data.hasPistol };
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or a full store: the game simply runs unsaved.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
