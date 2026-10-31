/**
 * Termine merken (Issue #295): nur in diesem Browser (localStorage) – kein Konto, kein Server,
 * kein Tracking. Knöpfe mit data-merken="<Termin-ID>" sind ohne JavaScript ausgeblendet.
 */
import { gemerkte, ID, speichere } from './merkliste';

export { gemerkte, speichere, SCHLUESSEL } from './merkliste';

function zeige(k: HTMLButtonElement, an: boolean) {
  k.setAttribute('aria-pressed', String(an));
  const text = k.querySelector('.merken-text');
  if (text) text.textContent = an ? 'Gemerkt' : 'Merken';
}

for (const k of document.querySelectorAll<HTMLButtonElement>('button[data-merken]')) {
  const id = k.dataset.merken ?? '';
  if (!ID.test(id)) continue;
  k.hidden = false;
  zeige(k, gemerkte().includes(id));
  k.addEventListener('click', () => {
    const alle = gemerkte();
    const an = !alle.includes(id);
    speichere(an ? [...alle, id] : alle.filter((x) => x !== id));
    zeige(k, an);
    // Push (Issue #348): angemeldete Geräte gleichen die Merkliste mit dem Server ab
    void navigator.serviceWorker
      ?.getRegistration('/')
      .then((r) => r?.pushManager.getSubscription())
      .then((sub) => sub && import('./push').then((m) => m.abgleichen(sub)))
      .catch(() => undefined);
  });
}
