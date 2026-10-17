/** Kurzlebige Terminentwürfe in diesem Tab; keine Zugangs- oder Vorschlagskontaktfelder. */
const PRAEFIX = 'kirmes-terminentwurf:';
const LETZTER = `${PRAEFIX}letzter`;
const DAUER = 20 * 60_000;
function verfallen(key: string, zeit: number) {
  window.setTimeout(
    () => {
      try {
        const text = sessionStorage.getItem(key);
        if (text && JSON.parse(text).zeit === zeit) sessionStorage.removeItem(key);
      } catch {
        /* Kein Zugriff mehr. */
      }
    },
    Math.max(1, zeit + DAUER - Date.now()),
  );
}
const erlaubt =
  /^(version|datum|beginn|titel|veranstaltungsort|kategorie|band|info|bestaetigt|muttizettel|speise|preis|s-(id|version|datum|beginn|titel|kat|band|vo|info|mutti|best|loeschen))$/;
try {
  for (const key of Object.keys(sessionStorage)) {
    if (!key.startsWith(PRAEFIX) || key === LETZTER) continue;
    try {
      const d = JSON.parse(sessionStorage.getItem(key) ?? '{}');
      if (typeof d.zeit !== 'number' || Date.now() - d.zeit < 0 || Date.now() - d.zeit >= DAUER)
        sessionStorage.removeItem(key);
      else verfallen(key, d.zeit);
    } catch {
      sessionStorage.removeItem(key);
    }
  }
  if (
    location.pathname === '/admin/anmelden' &&
    !new URLSearchParams(location.search).has('weiter')
  ) {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(PRAEFIX)) sessionStorage.removeItem(key);
  }
  if (location.pathname === '/admin' && new URLSearchParams(location.search).has('gespeichert')) {
    const key = sessionStorage.getItem(LETZTER);
    if (key) sessionStorage.removeItem(key);
    sessionStorage.removeItem(LETZTER);
  }
} catch {
  /* Speicher im privaten Modus ggf. nicht verfügbar. */
}
for (const abmelden of document.querySelectorAll<HTMLFormElement>(
  'form[action="/admin/abmelden"]',
)) {
  abmelden.addEventListener('submit', () => {
    try {
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(PRAEFIX)) sessionStorage.removeItem(key);
    } catch {
      /* Kein Speicher verfügbar. */
    }
  });
}
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-terminentwurf]')) {
  const parameter = new URLSearchParams(location.search);
  const key =
    PRAEFIX +
    location.pathname +
    new URLSearchParams(
      [...parameter].filter(([name]) => name === 'ort' || name === 'modus'),
    ).toString();
  form.addEventListener('submit', (e) => {
    const submitter = (e as SubmitEvent).submitter;
    const aktion = submitter instanceof HTMLButtonElement ? submitter.value : '';
    if (aktion !== 'speichern' && new FormData(form).get('aktion') !== 'sammel') return;
    const werte = Array.from(new FormData(form)).filter(
      (eintrag): eintrag is [string, string] =>
        erlaubt.test(eintrag[0]) && typeof eintrag[1] === 'string',
    );
    try {
      const zeit = Date.now();
      const text = JSON.stringify({ zeit, werte });
      if (text.length <= 200_000) {
        sessionStorage.setItem(key, text);
        sessionStorage.setItem(LETZTER, key);
        verfallen(key, zeit);
      }
    } catch {
      /* Formular funktioniert ohne Speicherung weiter. */
    }
  });
  try {
    if (document.querySelector('.meldung.gut')) {
      sessionStorage.removeItem(key);
      continue;
    }
    const text = sessionStorage.getItem(key);
    if (!text || text.length > 200_000 || document.querySelector('.meldung[role="alert"]'))
      continue;
    const entwurf: unknown = JSON.parse(text);
    if (
      !entwurf ||
      typeof entwurf !== 'object' ||
      !('zeit' in entwurf) ||
      typeof entwurf.zeit !== 'number' ||
      Date.now() - entwurf.zeit < 0 ||
      Date.now() - entwurf.zeit >= DAUER ||
      !('werte' in entwurf) ||
      !Array.isArray(entwurf.werte) ||
      !entwurf.werte.every(
        (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          typeof v[0] === 'string' &&
          erlaubt.test(v[0]) &&
          typeof v[1] === 'string',
      )
    ) {
      sessionStorage.removeItem(key);
      continue;
    }
    const werte = entwurf.werte as [string, string][];
    const hinweis = document.createElement('div');
    hinweis.className = 'meldung';
    hinweis.setAttribute('role', 'status');
    const textfeld = document.createElement('p');
    textfeld.textContent =
      'In diesem Tab sind noch ungespeicherte Terminfelder vorhanden (höchstens 20 Minuten). Du kannst sie übernehmen oder verwerfen. Gespeichert wird erst nach deinem nächsten Klick auf Speichern.';
    const uebernehmen = document.createElement('button');
    uebernehmen.type = 'button';
    uebernehmen.className = 'knopf zweit';
    uebernehmen.textContent = 'Eingaben übernehmen';
    const verwerfen = document.createElement('button');
    verwerfen.type = 'button';
    verwerfen.className = 'knopf zweit';
    verwerfen.textContent = 'Entwurf verwerfen';
    const reihe = document.createElement('div');
    reihe.className = 'knopfreihe';
    reihe.append(uebernehmen, verwerfen);
    hinweis.append(textfeld, reihe);
    form.before(hinweis);
    uebernehmen.addEventListener('click', () => {
      const index = new Map<string, number>();
      for (const feld of Array.from(form.elements)) {
        if (
          !(
            feld instanceof HTMLInputElement ||
            feld instanceof HTMLSelectElement ||
            feld instanceof HTMLTextAreaElement
          ) ||
          !erlaubt.test(feld.name)
        )
          continue;
        const eingaben = werte.filter(([name]) => name === feld.name).map(([, wert]) => wert);
        if (feld instanceof HTMLInputElement && feld.type === 'checkbox')
          feld.checked = eingaben.includes(feld.value);
        else {
          const i = index.get(feld.name) ?? 0;
          if (eingaben[i] !== undefined) feld.value = eingaben[i];
          index.set(feld.name, i + 1);
        }
        feld.dispatchEvent(new Event('change'));
      }
      form.dispatchEvent(new Event('entwurf-uebernommen'));
      hinweis.remove();
      form.querySelector<HTMLElement>('input:not([type="hidden"]),textarea,button')?.focus();
    });
    verwerfen.addEventListener('click', () => {
      sessionStorage.removeItem(key);
      hinweis.remove();
    });
  } catch {
    /* Defekter/gesperrter Speicher darf die Bearbeitung nicht verhindern. */
  }
}
