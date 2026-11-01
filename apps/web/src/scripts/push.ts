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

/**
 * Ergebnis des Abgleichs: „an“ = Server kennt das Gerät; „leer“ = noch nichts gemerkt oder gefolgt –
 * das Gerät bleibt angemeldet, der Server hat nichts zu melden (Issue #393); „ohne“ = keine
 * Anmeldung im Browser; sonst „fehler-<HTTP-Status>“.
 */
export type Abgleich = 'an' | 'leer' | 'ohne' | `fehler-${number}`;

/** Listen mit dem Server abgleichen; ohne Orte und Termine löscht der Server das Abo */
export async function abgleichen(sub?: PushSubscription | null): Promise<Abgleich> {
  const s = sub ?? (unterstuetzt() ? await anmeldung() : null);
  if (!s) return 'ohne';
  const j = s.toJSON();
  const orte = gefolgte();
  const termine = lies(GEMERKT) === 'aus' ? [] : gemerkte();
  if (!orte.length && !termine.length) {
    // Nicht abmelden: in der App ist die Merkliste anfangs leer (eigener Speicher, getrennt von
    // Safari). Beim ersten Merken meldet merken.ts das Gerät wieder an.
    const r = await fetch('/push/abo', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: s.endpoint }),
    });
    return r.ok ? 'leer' : `fehler-${r.status}`;
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
  return r.ok ? 'an' : `fehler-${r.status}`;
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
        else if (!s) {
          if (!aktiv) status.textContent = 'Benachrichtigungen sind gerade nicht verfügbar.';
        } else {
          const e = await abgleichen(s);
          if (e.startsWith('fehler'))
            status.textContent = `Das hat nicht geklappt – der Server antwortet gerade nicht (${e.slice(7)}). Bitte später noch einmal versuchen.`;
          else if (e === 'leer' && !aktiv && box.dataset.push !== 'ort')
            status.textContent =
              'Eingeschaltet. Sobald du einen Termin merkst, melden wir uns dazu.';
        }
      }
    } catch (e) {
      // Grund mit angeben – sonst lässt sich vor Ort nicht klären, was schiefging (Issue #393)
      const grund = e instanceof Error && e.name && e.name !== 'Error' ? ` (${e.name})` : '';
      status.textContent = `Das hat nicht geklappt – bitte später noch einmal versuchen.${grund}`;
    } finally {
      knopf.disabled = false;
      await zeige();
    }
  });
  await zeige();
}

for (const box of document.querySelectorAll<HTMLElement>('[data-push]')) void einrichten(box);
