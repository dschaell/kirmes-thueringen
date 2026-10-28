/** Verwaltung per Bearbeitungslink: Termine und Festplätze der Kirmesgesellschaft (aus verwalten/index.astro, Issue #199). */
import L from 'leaflet';
import { koordinateAusText } from '@kirmes/core';
import { heute as heuteInThueringen } from '../lib/anzeige';
import 'leaflet/dist/leaflet.css';

type Koordinate = { lat: number; lon: number };
type Uebersicht = {
  bezeichnung: string;
  ort: { name: string; koordinate: Koordinate | null };
  festplaetze: { name: string; koordinate: Koordinate }[];
  veranstaltungsorte: string[];
};
type Termin = {
  id: string;
  version: string;
  datum: string;
  beginn: string | null;
  ende?: string | null;
  titel: string;
  veranstaltungsort: string | null;
  kategorie: string;
  bestaetigt: boolean;
  band: string | null;
  info: string | null;
  muttizettel: boolean;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, klasse = '', text = '') => {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text) e.textContent = text;
  return e;
};
const meldung = (text: string, gut = false) => {
  const m = $('meldung');
  m.textContent = text;
  m.className = gut ? 'meldung gut' : 'meldung';
  m.hidden = false;
  m.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
const fehlertext = async (res: Response, standard: string) => {
  const body = await res.json().catch(() => ({}));
  return body.fehler?.map((f: { meldung: string }) => f.meldung).join(' ') || standard;
};

// Token aus dem Fragment übernehmen und aus der Adresszeile entfernen (nicht versehentlich teilen).
const hash = new URLSearchParams(location.hash.slice(1)).get('k');
if (hash) {
  sessionStorage.setItem('kirmes-link', hash);
  history.replaceState(null, '', location.pathname);
}
const token = sessionStorage.getItem('kirmes-link');
const auth = { authorization: `Bearer ${token ?? ''}` };
const api = (pfad: string, init: RequestInit = {}) =>
  fetch(`/verwalten/${pfad}`, {
    ...init,
    headers: {
      ...auth,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });

let daten: Uebersicht;
let termine: Termin[] = [];
let bearbeiteteId: string | null = null;
let bearbeiteteVersion = '';

// ── Laden ────────────────────────────────────────────────────────────────
async function laden() {
  if (!token) {
    $('untertitel').textContent = 'Diese Seite ist nur über einen persönlichen Link erreichbar.';
    return;
  }
  const [r1, r2] = await Promise.all([api('festplaetze'), api('termine')]);
  if (r1.status === 401) {
    sessionStorage.removeItem('kirmes-link');
    $('untertitel').textContent =
      'Der Link ist ungültig oder wurde gesperrt. Bitte fordert über „Termin melden“ einen neuen an.';
    return;
  }
  if (!r1.ok || !r2.ok) {
    meldung('Die Daten konnten gerade nicht geladen werden. Bitte später erneut versuchen.');
    return;
  }
  daten = await r1.json();
  termine = await r2.json();
  $('titel').textContent = `Kirmes in ${daten.ort.name}`;
  $('untertitel').textContent = `Angemeldet als ${daten.bezeichnung}.`;
  $('bereich').hidden = false;
  zeigeTermine();
  zeigePlaetze();
}

// ── Termine ──────────────────────────────────────────────────────────────
const datumText = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

function zeigeTermine() {
  const heute = heuteInThueringen(); // nicht UTC – sonst ist zwischen 0 und 2 Uhr noch gestern
  $('keine-termine').hidden = termine.length > 0;
  $('terminliste').replaceChildren(
    ...termine.map((t) => {
      const li = el('li', 'eintrag');
      const zeit = el('span', 'zeit', t.beginn ?? '');
      if (t.beginn && t.ende) zeit.append(el('span', 'bis', `bis ${t.ende}`));
      const info = el('div');
      const titel = el('strong', '', t.titel);
      const wo = el(
        'div',
        'wo',
        `${datumText(t.datum)}${t.veranstaltungsort ? ' · ' + t.veranstaltungsort : ''}${t.band ? ' · ' + t.band : ''}${t.datum < heute ? ' · vorbei' : ''}`,
      );
      const status = el(
        'span',
        t.bestaetigt ? 'bestaetigt' : 'kat',
        t.bestaetigt ? '✓ bestätigt' : 'noch nicht bestätigt',
      );
      info.append(titel, ' ', status, wo);
      const knoepfe = el('div', 'knopfreihe');
      if (!t.bestaetigt) {
        const b = el('button', 'knopf', 'Bestätigen');
        b.type = 'button';
        b.addEventListener('click', () => bestaetigen(t));
        knoepfe.append(b);
      }
      const aendern = el('button', 'knopf zweit', 'Ändern');
      aendern.type = 'button';
      aendern.addEventListener('click', () => bearbeiten(t));
      const loeschen = el('button', 'knopf zweit', 'Löschen');
      loeschen.type = 'button';
      loeschen.addEventListener('click', () => entfernen(t));
      knoepfe.append(aendern, loeschen);
      li.append(zeit, info, knoepfe);
      return li;
    }),
  );
  $('orte-liste').replaceChildren(
    ...daten.veranstaltungsorte.map((n) => {
      const o = el('option');
      o.value = n;
      return o;
    }),
  );
}

const formular = $<HTMLFormElement>('terminformular');
const feld = (name: string) =>
  formular.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;

function bearbeiten(t: Termin) {
  bearbeiteteId = t.id;
  bearbeiteteVersion = t.version;
  feld('datum').value = t.datum;
  feld('beginn').value = t.beginn ?? '';
  (feld('mitende') as HTMLInputElement).checked = Boolean(t.ende);
  feld('ende').value = t.ende ?? '';
  feld('titel').value = t.titel;
  feld('veranstaltungsort').value = t.veranstaltungsort ?? '';
  feld('kategorie').value = t.kategorie;
  feld('kategorie').dispatchEvent(new Event('change'));
  feld('band').value = t.band ?? '';
  feld('info').value = t.info ?? '';
  (feld('muttizettel') as HTMLInputElement).checked = t.muttizettel;
  $('formular-titel').textContent = 'Termin ändern';
  $('termin-abbrechen').hidden = false;
  formular.scrollIntoView({ behavior: 'smooth' });
}

function formularLeeren() {
  bearbeiteteId = null;
  bearbeiteteVersion = '';
  formular.reset();
  $('formular-titel').textContent = 'Termin hinzufügen';
  $('termin-abbrechen').hidden = true;
}
$('termin-abbrechen').addEventListener('click', formularLeeren);

formular.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = JSON.stringify({
    ...(bearbeiteteId ? { version: bearbeiteteVersion } : {}),
    datum: feld('datum').value,
    beginn: feld('beginn').value || null,
    // ohne Haken keine Endzeit (Issue #288)
    ende: ((feld('mitende') as HTMLInputElement).checked && feld('ende').value) || null,
    titel: feld('titel').value,
    veranstaltungsort: feld('veranstaltungsort').value || null,
    kategorie: feld('kategorie').value || null,
    band: feld('band').value || null,
    info: feld('info').value || null,
    muttizettel: (feld('muttizettel') as HTMLInputElement).checked,
  });
  const res = bearbeiteteId
    ? await api(`termine/${bearbeiteteId}`, { method: 'PUT', body })
    : await api('termine', { method: 'POST', body });
  if (!res.ok) return meldung(await fehlertext(res, 'Der Termin konnte nicht gespeichert werden.'));
  const { hinweise = [] } = await res.json();
  meldung(
    ['Termin gespeichert.', ...hinweise.map((h: { meldung: string }) => h.meldung)].join(' '),
    true,
  );
  formularLeeren();
  await laden();
});

async function bestaetigen(t: Termin) {
  const res = await api(`termine/${t.id}/bestaetigen?version=${encodeURIComponent(t.version)}`, {
    method: 'POST',
  });
  if (!res.ok) return meldung(await fehlertext(res, 'Bestätigen fehlgeschlagen.'));
  meldung(`„${t.titel}“ ist jetzt als bestätigt markiert.`, true);
  await laden();
}

async function entfernen(t: Termin) {
  if (!confirm(`„${t.titel}“ am ${datumText(t.datum)} wirklich löschen?`)) return;
  const res = await api(`termine/${t.id}?version=${encodeURIComponent(t.version)}`, {
    method: 'DELETE',
  });
  if (!res.ok) return meldung('Löschen fehlgeschlagen.');
  meldung('Termin gelöscht.', true);
  await laden();
}

// ── Festplätze ───────────────────────────────────────────────────────────
let auswahl: string | null = null;
let karte: L.Map | null = null;
let pin: L.Marker | null = null;
let punkt: Koordinate | null = null;
const THUERINGEN = { lat: 50.9, lon: 11.03 };
const pinIcon = L.divIcon({
  className: 'pin',
  html: '<span></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function zeigePlaetze() {
  const namen = [
    '',
    ...new Set([
      ...termine.map((t) => t.veranstaltungsort).filter((n): n is string => Boolean(n)),
      ...daten.veranstaltungsorte,
      ...daten.festplaetze.map((f) => f.name),
    ]),
  ].filter((n, i, a) => a.indexOf(n) === i);
  $('plaetze').replaceChildren(
    ...namen.map((name) => {
      const vorhanden = daten.festplaetze.find((f) => f.name === name);
      const li = el('li', 'eintrag platz');
      const info = el('div');
      info.append(
        el('strong', '', name || 'Standard-Festplatz'),
        el('div', 'leise klein', vorhanden ? 'eingetragen ✓' : 'noch kein Pin'),
      );
      const knopf = el('button', 'knopf zweit', vorhanden ? 'Ändern' : 'Pin setzen');
      knopf.type = 'button';
      knopf.addEventListener('click', () => pinBearbeiten(name));
      li.append(info, knopf);
      return li;
    }),
  );
}

function setzePunkt(k: Koordinate, zoom?: number) {
  punkt = { lat: Math.round(k.lat * 1e6) / 1e6, lon: Math.round(k.lon * 1e6) / 1e6 };
  if (!karte) return;
  if (pin) pin.setLatLng([punkt.lat, punkt.lon]);
  else {
    pin = L.marker([punkt.lat, punkt.lon], { draggable: true, icon: pinIcon }).addTo(karte);
    const neuerPin = pin;
    neuerPin.on('dragend', () => {
      const p = neuerPin.getLatLng();
      setzePunkt({ lat: p.lat, lon: p.lng });
    });
  }
  if (zoom) karte.setView([punkt.lat, punkt.lon], zoom);
  $('koordinate').textContent = `Pin: ${punkt.lat.toFixed(5)}, ${punkt.lon.toFixed(5)}`;
  $<HTMLButtonElement>('speichern').disabled = false;
}

function pinBearbeiten(name: string) {
  auswahl = name;
  $('editor').hidden = false;
  $('aktuell').textContent = name || 'Standard-Festplatz';
  const vorhanden = daten.festplaetze.find((f) => f.name === name);
  $('entfernen').hidden = !vorhanden;
  const start = vorhanden?.koordinate ?? daten.ort.koordinate ?? THUERINGEN;
  const zoom = vorhanden ? 17 : daten.ort.koordinate ? 15 : 9;
  if (!karte) {
    karte = L.map('karte').setView([start.lat, start.lon], zoom);
    L.tileLayer('/kacheln/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(karte);
    karte.on('click', (e: L.LeafletMouseEvent) =>
      setzePunkt({ lat: e.latlng.lat, lon: e.latlng.lng }),
    );
  } else karte.setView([start.lat, start.lon], zoom);
  pin?.remove();
  pin = null;
  punkt = null;
  $<HTMLButtonElement>('speichern').disabled = true;
  $('koordinate').textContent = 'Noch kein Pin gesetzt – auf die Karte klicken.';
  if (vorhanden) setzePunkt(vorhanden.koordinate);
  $('editor').scrollIntoView({ behavior: 'smooth' });
}

// Google-Maps-Link oder Koordinaten – gleiche Logik wie im Core: Pin (!3d…!4d) vor Kartenmitte (@…)
const ausText = (text: string): Koordinate | null => koordinateAusText(text);

$('einfuegen').addEventListener('input', (e) => {
  const k = ausText((e.target as HTMLInputElement).value);
  if (k) setzePunkt(k, 18);
});

$('standort').addEventListener('click', () => {
  if (!navigator.geolocation) return meldung('Euer Browser kann den Standort nicht bestimmen.');
  navigator.geolocation.getCurrentPosition(
    (p) => setzePunkt({ lat: p.coords.latitude, lon: p.coords.longitude }, 18),
    () =>
      meldung(
        'Standort nicht verfügbar. Bitte Freigabe im Browser erlauben oder Pin auf der Karte setzen.',
      ),
    { enableHighAccuracy: true, timeout: 15_000 },
  );
});

$('adresssuche').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $<HTMLInputElement>('adresse').value.trim();
  if (!q) return;
  const url = new URL('/adresssuche.json', location.origin);
  url.searchParams.set('q', q.includes(daten.ort.name) ? q : `${q}, ${daten.ort.name}`);
  try {
    const res = await fetch(url);
    if (res.status === 429) return meldung('Bitte einen Moment warten und erneut suchen.');
    if (!res.ok) throw new Error('nicht erreichbar');
    const treffer = (await res.json()) as { lat: number; lon: number } | null;
    if (treffer) setzePunkt(treffer, 18);
    else meldung('Adresse nicht gefunden – bitte den Pin direkt auf der Karte setzen.');
  } catch {
    meldung(
      'Die Adresssuche ist gerade nicht erreichbar – bitte den Pin direkt auf der Karte setzen.',
    );
  }
});

$('speichern').addEventListener('click', async () => {
  if (auswahl === null || !punkt) return;
  const res = await api('festplaetze', {
    method: 'PUT',
    body: JSON.stringify({ name: auswahl, lat: punkt.lat, lon: punkt.lon }),
  });
  if (!res.ok) return meldung(await fehlertext(res, 'Der Punkt konnte nicht gespeichert werden.'));
  meldung(
    `Gespeichert: „${auswahl || 'Standard-Festplatz'}“. In wenigen Minuten führt die Route auf der Website dorthin.`,
    true,
  );
  const gewaehlt = auswahl;
  await laden();
  pinBearbeiten(gewaehlt);
});

$('entfernen').addEventListener('click', async () => {
  if (auswahl === null || !confirm('Eintrag wirklich entfernen?')) return;
  const res = await api(`festplaetze?name=${encodeURIComponent(auswahl)}`, { method: 'DELETE' });
  if (!res.ok) return meldung('Entfernen fehlgeschlagen.');
  meldung('Eintrag entfernt.', true);
  $('editor').hidden = true;
  await laden();
});

laden();
