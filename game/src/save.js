// localStorage save/load for Solmar Bay progress.
import { SAVE_KEY, createDefaultSave } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { ...createDefaultSave(), ...parsed };
  } catch (err) {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      money: Math.floor(state.money),
      xp: Math.floor(state.xp),
      missionsDone: state.missionsDone,
      bestMoney: Math.max(state.bestMoney || 0, Math.floor(state.money)),
      playTime: Math.floor(state.time),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) { /* storage unavailable — play on without saving */ }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}

export function applySaveToState(state, save) {
  if (!save) return;
  state.money = save.money || 0;
  state.xp = save.xp || 0;
  state.missionsDone = Math.min(save.missionsDone || 0, 3);
  state.bestMoney = save.bestMoney || 0;
}
