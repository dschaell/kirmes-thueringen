/** Einheitliche Auswahlhilfen; die ursprünglichen Felder bleiben für Formulare und ohne JS erhalten. */
const beschriftung = (feld: HTMLInputElement | HTMLSelectElement) => {
  const label = Array.from(feld.labels?.[0]?.childNodes ?? [])
    .filter((knoten) => knoten.nodeType === Node.TEXT_NODE)
    .map((knoten) => knoten.textContent?.trim())
    .filter(Boolean)
    .join(' ');
  return feld.getAttribute('aria-label') || label || feld.name;
};

function knopf(text: string, klasse = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = klasse;
  element.textContent = text;
  return element;
}

for (const feld of document.querySelectorAll<HTMLSelectElement>('select:not([multiple])')) {
  if (feld.size > 1 || feld.disabled) continue;
  const rahmen = document.createElement('span');
  rahmen.className = 'auswahlfeld';
  feld.before(rahmen);
  rahmen.append(feld);
  const ausloeser = knopf('', 'auswahl-ausloeser');
  const liste = document.createElement('span');
  liste.className = 'auswahl-optionen';
  liste.hidden = true;
  liste.id = `auswahl-${crypto.randomUUID()}`;
  liste.setAttribute('role', 'listbox');
  liste.setAttribute('aria-label', beschriftung(feld));
  ausloeser.setAttribute('aria-haspopup', 'listbox');
  ausloeser.setAttribute('aria-expanded', 'false');
  ausloeser.setAttribute('aria-controls', liste.id);
  const fehler = document.createElement('span');
  fehler.className = 'auswahl-fehler';
  fehler.id = `${liste.id}-fehler`;
  fehler.setAttribute('role', 'alert');
  fehler.hidden = true;
  ausloeser.setAttribute('aria-describedby', fehler.id);
  const optionen: HTMLButtonElement[] = [];
  const abgleichen = () => {
    const text = feld.selectedOptions[0]?.textContent ?? 'Bitte wählen';
    ausloeser.textContent = text;
    ausloeser.setAttribute('aria-label', `${beschriftung(feld)}: ${text}`);
    if (feld.validity.valid) {
      ausloeser.removeAttribute('aria-invalid');
      fehler.hidden = true;
    }
    optionen.forEach((option, index) => {
      option.setAttribute('aria-selected', String(index === feld.selectedIndex));
    });
  };
  const schliessen = () => {
    liste.hidden = true;
    ausloeser.setAttribute('aria-expanded', 'false');
  };
  const oeffnen = () => {
    abgleichen();
    liste.hidden = false;
    ausloeser.setAttribute('aria-expanded', 'true');
    const ausgewaehlt = optionen[feld.selectedIndex];
    (ausgewaehlt && !ausgewaehlt.disabled
      ? ausgewaehlt
      : optionen.find((option) => !option.disabled)
    )?.focus();
  };
  Array.from(feld.options).forEach((option, index) => {
    const eintrag = knopf(option.textContent ?? '');
    eintrag.setAttribute('role', 'option');
    eintrag.disabled = option.disabled;
    eintrag.tabIndex = -1;
    eintrag.addEventListener('click', () => {
      feld.selectedIndex = index;
      abgleichen();
      schliessen();
      ausloeser.focus();
      feld.dispatchEvent(new Event('input', { bubbles: true }));
      feld.dispatchEvent(new Event('change', { bubbles: true }));
    });
    optionen.push(eintrag);
    liste.append(eintrag);
  });
  let suchtext = '';
  let letzteTaste = 0;
  rahmen.addEventListener('keydown', (ereignis) => {
    if (ereignis.key === 'Escape') {
      schliessen();
      ausloeser.focus();
    } else if (ereignis.key === 'Tab') {
      schliessen();
      ausloeser.focus();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ereignis.key)) {
      ereignis.preventDefault();
      if (liste.hidden) return oeffnen();
      const verfuegbar = optionen.filter((option) => !option.disabled);
      const index = verfuegbar.indexOf(document.activeElement as HTMLButtonElement);
      const ziel =
        ereignis.key === 'Home'
          ? 0
          : ereignis.key === 'End'
            ? verfuegbar.length - 1
            : (index + (ereignis.key === 'ArrowDown' ? 1 : -1) + verfuegbar.length) %
              verfuegbar.length;
      verfuegbar[ziel]?.focus();
    } else if (
      ereignis.key.length === 1 &&
      !ereignis.ctrlKey &&
      !ereignis.metaKey &&
      ereignis.key !== ' '
    ) {
      if (liste.hidden) oeffnen();
      suchtext = Date.now() - letzteTaste > 700 ? ereignis.key : suchtext + ereignis.key;
      letzteTaste = Date.now();
      optionen
        .find(
          (option) =>
            !option.disabled &&
            option.textContent
              ?.toLocaleLowerCase('de')
              .startsWith(suchtext.toLocaleLowerCase('de')),
        )
        ?.focus();
    }
  });
  ausloeser.addEventListener('click', () => (liste.hidden ? oeffnen() : schliessen()));
  document.addEventListener('click', (ereignis) => {
    if (ereignis.target instanceof Node && !rahmen.contains(ereignis.target)) schliessen();
  });
  rahmen.addEventListener('focusout', (ereignis) => {
    if (ereignis.relatedTarget instanceof Node && !rahmen.contains(ereignis.relatedTarget))
      schliessen();
  });
  feld.addEventListener('change', abgleichen);
  feld.addEventListener('focus', () => ausloeser.focus());
  feld.form?.addEventListener('reset', () => queueMicrotask(abgleichen));
  feld.addEventListener('invalid', (ereignis) => {
    ereignis.preventDefault();
    fehler.textContent = feld.validationMessage;
    fehler.hidden = false;
    ausloeser.setAttribute('aria-invalid', 'true');
    ausloeser.focus();
  });
  feld.classList.add('auswahl-original');
  feld.tabIndex = -1;
  feld.setAttribute('aria-hidden', 'true');
  rahmen.append(ausloeser, liste, fehler);
  abgleichen();
}

const iso = (datum: Date) =>
  `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
for (const feld of document.querySelectorAll<HTMLInputElement>('input[type="date"]')) {
  if (feld.disabled || feld.readOnly || typeof HTMLDialogElement === 'undefined') continue;
  const rahmen = document.createElement('span');
  rahmen.className = 'datumsfeld';
  feld.setAttribute('aria-label', beschriftung(feld));
  feld.before(rahmen);
  rahmen.append(feld);
  const ausloeser = knopf('', 'kalender-ausloeser');
  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  symbol.setAttribute('viewBox', '0 0 24 24');
  symbol.setAttribute('aria-hidden', 'true');
  const linien = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  linien.setAttribute('d', 'M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM3 10h18M8 2v4M16 2v4');
  symbol.append(linien);
  ausloeser.append(symbol);
  ausloeser.setAttribute('aria-label', `Kalender öffnen: ${beschriftung(feld)}`);
  ausloeser.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.className = 'datumsauswahl';
  dialog.setAttribute('aria-label', `Datum wählen: ${beschriftung(feld)}`);
  const kopf = document.createElement('div');
  kopf.className = 'kalender-kopf';
  const zurueck = knopf('‹');
  zurueck.setAttribute('aria-label', 'Vorheriger Monat');
  const weiter = knopf('›');
  weiter.setAttribute('aria-label', 'Nächster Monat');
  const monat = document.createElement('strong');
  monat.setAttribute('aria-live', 'polite');
  const tage = document.createElement('div');
  tage.className = 'kalender-tage';
  const aktionen = document.createElement('div');
  aktionen.className = 'kalender-aktionen';
  const heute = knopf('Heute');
  const leeren = knopf('Leeren');
  const fertig = knopf('Schließen');
  let ansicht = new Date();
  const erlaubt = (wert: string) =>
    (!feld.min || wert >= feld.min) && (!feld.max || wert <= feld.max);
  const waehlen = (wert: string) => {
    feld.value = wert;
    dialog.close();
    ausloeser.focus();
    feld.dispatchEvent(new Event('input', { bubbles: true }));
    feld.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const zeichnen = (fokus?: string) => {
    monat.textContent = ansicht.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    tage.replaceChildren();
    for (const tag of ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']) {
      const name = document.createElement('span');
      name.textContent = tag;
      name.className = 'wochentag';
      tage.append(name);
    }
    const jahr = ansicht.getFullYear();
    const nummer = ansicht.getMonth();
    const leer = (new Date(jahr, nummer, 1).getDay() + 6) % 7;
    for (let index = 0; index < leer; index++) tage.append(document.createElement('span'));
    const anzahl = new Date(jahr, nummer + 1, 0).getDate();
    for (let tag = 1; tag <= anzahl; tag++) {
      const datum = new Date(jahr, nummer, tag);
      const wert = iso(datum);
      const eintrag = knopf(String(tag));
      eintrag.dataset.datum = wert;
      eintrag.tabIndex = wert === (fokus ?? (feld.value || iso(new Date()))) ? 0 : -1;
      eintrag.setAttribute('aria-label', datum.toLocaleDateString('de-DE', { dateStyle: 'full' }));
      eintrag.setAttribute('aria-pressed', String(wert === feld.value));
      if (wert === iso(new Date())) eintrag.setAttribute('aria-current', 'date');
      eintrag.disabled = !erlaubt(wert);
      eintrag.addEventListener('click', () => waehlen(wert));
      eintrag.addEventListener('keydown', (ereignis) => {
        const schritt = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ereignis.key];
        if (schritt === undefined) return;
        ereignis.preventDefault();
        const ziel = new Date(jahr, nummer, tag + schritt);
        if (!erlaubt(iso(ziel))) return;
        ansicht = ziel;
        zeichnen(iso(ziel));
      });
      tage.append(eintrag);
      if (wert === fokus) queueMicrotask(() => eintrag.focus());
    }
    if (!tage.querySelector('button[tabindex="0"]:not(:disabled)')) {
      const erster = tage.querySelector<HTMLButtonElement>('button:not(:disabled)');
      if (erster) erster.tabIndex = 0;
    }
    heute.disabled = !erlaubt(iso(new Date()));
  };
  zurueck.addEventListener('click', () => {
    ansicht = new Date(ansicht.getFullYear(), ansicht.getMonth() - 1, 1);
    zeichnen();
  });
  weiter.addEventListener('click', () => {
    ansicht = new Date(ansicht.getFullYear(), ansicht.getMonth() + 1, 1);
    zeichnen();
  });
  heute.addEventListener('click', () => waehlen(iso(new Date())));
  leeren.addEventListener('click', () => waehlen(''));
  fertig.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => ausloeser.focus());
  ausloeser.addEventListener('click', () => {
    ansicht = feld.value ? new Date(`${feld.value}T12:00:00`) : new Date();
    if (!erlaubt(iso(ansicht))) ansicht = new Date(`${feld.min || feld.max}T12:00:00`);
    zeichnen(iso(ansicht));
    dialog.showModal();
  });
  kopf.append(zurueck, monat, weiter);
  aktionen.append(heute, leeren, fertig);
  dialog.append(kopf, tage, aktionen);
  rahmen.append(ausloeser);
  document.body.append(dialog);
}
