// Backup panel: copy the save as a text code, or load a code from another browser or device.
import { S, exportCode, parseCode, replaceState } from '../state.js';

let pending = null, confirmTimer = null;

function setStatus(text, isError = false) {
  const el = document.getElementById('backupStatus');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

export function initBackup() {
  const out = document.getElementById('exportCode');
  const input = document.getElementById('importCode');
  const loadBtn = document.getElementById('importBtn');

  document.getElementById('exportBtn').addEventListener('click', async () => {
    out.value = exportCode(S);
    out.hidden = false;
    out.select();
    try {
      await navigator.clipboard.writeText(out.value);
      setStatus('Save code copied. Paste it somewhere safe, or into the game on another device.');
    } catch (e) {
      setStatus('Save code ready below. Select it and copy it.');
    }
  });

  input.addEventListener('input', () => {
    pending = null;
    loadBtn.textContent = 'Load this save';
  });

  loadBtn.addEventListener('click', () => {
    if (pending) {
      clearTimeout(confirmTimer);
      replaceState(pending);
      pending = null;
      input.value = '';
      loadBtn.textContent = 'Load this save';
      setStatus('Save loaded.');
      return;
    }
    try {
      pending = parseCode(input.value);
    } catch (e) {
      setStatus(e.message, true);
      return;
    }
    const babies = pending.hatched.length;
    loadBtn.textContent = 'Tap again to replace your progress';
    setStatus(`This save has ${babies} ${babies === 1 ? 'baby' : 'babies'} and ${pending.coins} coins. Loading it replaces your current progress.`);
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      pending = null;
      loadBtn.textContent = 'Load this save';
    }, 8000);
  });
}
