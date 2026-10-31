/**
 * Push-Benachrichtigungen im Browser (Issue #348). Gefolgte Orte stehen wie die gemerkten Termine
 * nur in diesem Browser; ist das Gerät angemeldet, gleichen wir beide Listen mit dem Server ab.
 */
import { gemerkte } from './merkliste';

export const FOLGE = 'kirmes-folge';
const ERINNERUNG = 'kirmes-erinnerung';
/** „aus“ = gemerkte Termine nicht melden (gefolgte Orte bleiben) */
const GEMERKT = 'kirmes-push-gemerkt';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const lies = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const schreib = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* privater Modus */
  }
};

export function gefolgte(): string[] {
  try {
    const v: unknown = JSON.parse(lies(FOLGE) ?? '[]');
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && SLUG.test(x))
      : [];
  } catch {
    return [];
  }
}
const erinnerung = () => lies(ERINNERUNG) !== 'aus';

const unterstuetzt = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iPhone = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const alsApp = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** VAPID-Schlüssel (base64url) → Bytes für subscribe() */
function bytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(
    b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4),
  );
  const b = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

let schluessel: Promise<string | null> | null = null;
const holeSchluessel = () =>
  (schluessel ??= fetch('/push/schluessel')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { oeffentlich?: string } | null) => j?.oeffentlich ?? null)
    .catch(() => null));

async function anmeldung(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Erlaubnis holen und anmelden – nur nach einem Klick */
async function anmelden(): Promise<PushSubscription | 'verweigert' | null> {
  const key = await holeSchluessel();
  if (!key) return null;
  if ((await Notification.requestPermission()) !== 'granted') return 'verweigert';
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return (
    (await reg.pushManager.getSubscription()) ??
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) })
  );
}

/** Listen mit dem Server abgleichen; ohne Orte und Termine meldet sich das Gerät ab */
export async function abgleichen(sub?: PushSubscription | null): Promise<boolean> {
  const s = sub ?? (unterstuetzt() ? await anmeldung() : null);
  if (!s) return false;
  const j = s.toJSON();
  const orte = gefolgte();
  const termine = lies(GEMERKT) === 'aus' ? [] : gemerkte();
  if (!orte.length && !termine.length) {
    await fetch('/push/abo', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: s.endpoint }),
    });
    await s.unsubscribe();
    return false;
  }
  const r = await fetch('/push/abo', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: s.endpoint,
      keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
      orte,
      termine,
      erinnerung: erinnerung(),
    }),
  });
  return r.ok;
}

async function einrichten(box: HTMLElement) {
  const knopf = box.querySelector<HTMLButtonElement>('.push-knopf');
  const text = box.querySelector('.push-text');
  const status = box.querySelector('.push-status');
  const ios = box.querySelector<HTMLElement>('.push-ios');
  const erinnerungFeld = box.querySelector<HTMLElement>('.push-erinnerung-feld');
  const erinnerungHaken = box.querySelector<HTMLInputElement>('.push-erinnerung');
  if (!knopf || !status || !(await holeSchluessel())) return;
  box.hidden = false;
  // iPhone in Safari: Push gibt es nur in der Home-Bildschirm-App
  if (!unterstuetzt() || (iPhone() && !alsApp())) {
    knopf.hidden = true;
    if (ios) ios.hidden = !iPhone();
    if (!iPhone()) status.textContent = 'Dieser Browser kann keine Benachrichtigungen empfangen.';
    return;
  }
  const ort = box.dataset.ort ?? '';
  const basisText = text?.textContent ?? '';
  const an = async () =>
    !!(await anmeldung()) &&
    (box.dataset.push === 'ort' ? gefolgte().includes(ort) : lies(GEMERKT) !== 'aus');
  const zeige = async () => {
    const aktiv = await an();
    knopf.setAttribute('aria-pressed', String(aktiv));
    if (text)
      text.textContent =
        box.dataset.push === 'ort'
          ? aktiv
            ? 'Gefolgt'
            : basisText
          : aktiv
            ? 'Benachrichtigungen an'
            : basisText;
    if (erinnerungFeld) erinnerungFeld.hidden = !aktiv;
  };
  if (erinnerungHaken) {
    erinnerungHaken.checked = erinnerung();
    erinnerungHaken.addEventListener('change', async () => {
      schreib(ERINNERUNG, erinnerungHaken.checked ? 'an' : 'aus');
      await abgleichen();
    });
  }
  knopf.addEventListener('click', async () => {
    knopf.disabled = true;
    status.textContent = '';
    try {
      const aktiv = await an();
      if (box.dataset.push === 'ort') {
        const liste = gefolgte().filter((o) => o !== ort);
        schreib(FOLGE, JSON.stringify(aktiv ? liste : [...liste, ort].slice(-50)));
      } else schreib(GEMERKT, aktiv ? 'aus' : 'an');
      {
        const s = aktiv ? await anmeldung() : await anmelden();
        if (s === 'verweigert')
          status.textContent =
            'Benachrichtigungen sind blockiert – bitte in den Einstellungen des Geräts erlauben.';
        else if (!(await abgleichen(s)))
          status.textContent = aktiv ? '' : 'Das hat nicht geklappt.';
      }
    } catch {
      status.textContent = 'Das hat nicht geklappt – bitte später noch einmal versuchen.';
    } finally {
      knopf.disabled = false;
      await zeige();
    }
  });
  await zeige();
}

for (const box of document.querySelectorAll<HTMLElement>('[data-push]')) void einrichten(box);
