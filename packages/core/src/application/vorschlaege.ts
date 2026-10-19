/** Öffentliche Vorschläge bleiben bis zur bewussten Übernahme von Terminen getrennt. */
import { err, ok, type Validierungsfehler } from '../domain/result.js';
import { KATEGORIEN, validiereTermin, type NeuerTermin } from '../domain/termin.js';
import { LANDKREISE } from '../domain/landkreis.js';
import { validiereSpeisen, type Speise } from '../domain/speisen.js';
import type { Sitzungen } from './admin.js';
import type { OrtRepository } from './ports.js';
import type { Drosselung, Postausgang } from './meldungen.js';
import { erkenneKategorie } from './recherche.js';
import { validiereAlle, type TerminFormular } from './termine-verwalten.js';
import { validiereFestplatz, type Koordinate } from '../domain/festplatz.js';
import {
  istErlaubterKartenlink,
  istKartenKurzlink,
  koordinateAusText,
  nameAusKartenlink,
} from '../domain/redaktion.js';
import type { Kartenlinks } from './festplaetze.js';

export interface VorschlagsZeile extends TerminFormular {
  speisen?: { name: string; preis: string }[];
  /** Öffentlich: Google-Maps-Link oder Koordinaten zum Ort – wird nie gespeichert (Issue #169) */
  karte?: string;
  /** Redaktion: gespeicherter Kartenpunkt des Vorschlags und ob er als Platz übernommen wird */
  platz?: Koordinate | null;
  platzUebernehmen?: boolean;
}
export interface VorschlagEingabe {
  ortSlug: string;
  zeilen: VorschlagsZeile[];
  kontaktName?: string;
  kontaktEmail?: string;
  nachricht?: string;
  falle?: string;
  dauerMs?: number;
}
export interface VorschlagsTermin extends NeuerTermin {
  speisen: readonly Speise[];
  /** Kartenpunkt des Einsenders (nur Zahlen) – Platz entsteht erst beim Übernehmen mit Haken */
  platz: Koordinate | null;
  platzUebernehmen?: boolean;
}
export interface NeuerVorschlag {
  ortSlug: string;
  kontaktName: string | null;
  kontaktEmail: string | null;
  nachricht: string | null;
  termine: VorschlagsTermin[];
}
export interface Vorschlag extends NeuerVorschlag {
  id: string;
  ortName: string;
  erstelltAm: string;
}
export interface VorschlagsRepository {
  /** Ortszeile sperren und Grenze in derselben Transaktion prüfen. ID oder false (Ort voll/unbekannt). */
  lege(v: NeuerVorschlag): Promise<string | false>;
  liste(): Promise<Vorschlag[]>;
  finde(id: string): Promise<Vorschlag | null>;
  anzahl(): Promise<number>;
  /** Status sperren; Termine, Speisen, Protokoll und Kontaktlöschung atomar. Keine Upserts. */
  uebernehme(
    id: string,
    termine: VorschlagsTermin[],
    adminId: string,
  ): Promise<boolean | 'KONFLIKT'>;
  lehneAb(id: string, grund: string | null, adminId: string): Promise<boolean>;
  raeumeAuf(): Promise<void>;
}
const text = (s: string | null | undefined) => (s ?? '').replace(/\p{Cc}/gu, ' ').trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fehler = (feld: string, meldung: string): Validierungsfehler => ({
  feld,
  code: 'UNGUELTIG',
  meldung,
});

/**
 * Kartenpunkt einer Zeile (Issue #169). Öffentlich: Link gegen die Allowlist prüfen, Kurzlink sicher
 * auflösen, nur Koordinaten + Namen behalten. Redaktion: gespeicherten Punkt erneut prüfen.
 * Ohne Namen („Wo genau?“ oder aus dem Link) kein Kartenpunkt – schützt den Hauptfestplatz.
 */
async function kartenpunkt(
  z: VorschlagsZeile,
  nr: number,
  karten: Kartenlinks | undefined,
  redaktion: boolean,
): Promise<{ platz: Koordinate; wo: string } | Validierungsfehler | null> {
  const feld = `zeile${nr}.karte`;
  const fehlerHier = (meldung: string): Validierungsfehler => ({ feld, code: 'KARTE', meldung });
  if (redaktion) {
    if (!z.platz) return null;
    const p = validiereFestplatz({ name: '', lat: z.platz.lat, lon: z.platz.lon });
    return p.ok
      ? { platz: p.value.koordinate, wo: text(z.veranstaltungsort) }
      : fehlerHier(`Veranstaltung ${nr}: Kartenpunkt ungültig.`);
  }
  const roh = text(z.karte);
  if (!roh) return null;
  if (!istErlaubterKartenlink(roh))
    return fehlerHier(
      `Veranstaltung ${nr}: Bitte nur einen Link aus Google Maps („Teilen → Link kopieren“) oder Koordinaten angeben.`,
    );
  const aufgeloest = istKartenKurzlink(roh) ? ((await karten?.aufloesen(roh)) ?? '') : roh;
  const k = koordinateAusText(aufgeloest);
  if (!k) return fehlerHier(`Veranstaltung ${nr}: Kartenpunkt im Link nicht erkannt.`);
  const p = validiereFestplatz({ name: '', lat: k.lat, lon: k.lon });
  if (!p.ok) return fehlerHier(`Veranstaltung ${nr}: Der Kartenpunkt liegt nicht in Thüringen.`);
  const wo = text(z.veranstaltungsort) || nameAusKartenlink(aufgeloest) || '';
  if (!wo)
    return fehlerHier(
      `Veranstaltung ${nr}: Für den Kartenpunkt bitte „Wo genau?“ ausfüllen (z. B. Kirche).`,
    );
  return { platz: p.value.koordinate, wo };
}

export async function pruefeVorschlag(
  e: VorschlagEingabe,
  orte: OrtRepository,
  opt: { karten?: Kartenlinks; redaktion?: boolean } = {},
) {
  const f: Validierungsfehler[] = [];
  const kontaktName = text(e.kontaktName) || null;
  const kontaktEmail = text(e.kontaktEmail) || null;
  const nachricht = text(e.nachricht) || null;
  if ((kontaktName?.length ?? 0) > 120)
    f.push(fehler('kontaktName', 'Name: höchstens 120 Zeichen.'));
  if (
    kontaktEmail &&
    (kontaktEmail.length > 200 ||
      !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(kontaktEmail))
  ) {
    f.push(fehler('kontaktEmail', 'Bitte eine gültige E-Mail-Adresse angeben.'));
  }
  if ((nachricht?.length ?? 0) > 2000)
    f.push(fehler('nachricht', 'Nachricht: höchstens 2000 Zeichen.'));
  const ort = await orte.finde(e.ortSlug);
  if (!ort) return err([fehler('ortSlug', 'Bitte einen Ort aus dem Ortsverzeichnis wählen.')]);
  const punkte: ({ platz: Koordinate; wo: string } | null)[] = [];
  for (const [i, z] of (e.zeilen.length <= 20 ? e.zeilen : []).entries()) {
    const p = await kartenpunkt(z, i + 1, opt.karten, opt.redaktion === true);
    if (p && 'feld' in p) f.push(p);
    punkte.push(p && 'platz' in p ? p : null);
  }
  const speisen: Speise[][] = [];
  let index = 0;
  const v = validiereAlle(e.zeilen, (z) => {
    const punkt = punkte[index++] ?? null;
    const s = validiereSpeisen(
      (z.speisen ?? []).map((s) => ({ name: text(s.name), preis: text(s.preis) })),
    );
    if (!s.ok) return s;
    speisen.push(s.value);
    if (text(z.veranstaltungsort).length > 120)
      return err([fehler('veranstaltungsort', 'Wo genau: höchstens 120 Zeichen.')]);
    return validiereTermin({
      ...z,
      ortSlug: ort.slug,
      landkreis: ort.landkreis,
      titel: text(z.titel),
      beginn: z.beginn || null,
      band: text(z.band),
      pfarrer: text(z.pfarrer),
      info: text(z.info),
      veranstaltungsort: punkt?.wo || text(z.veranstaltungsort),
      // Gewählte Art gilt, sonst aus dem Titel erkennen (Issue #93)
      kategorie:
        z.kategorie && (KATEGORIEN as readonly string[]).includes(z.kategorie)
          ? z.kategorie
          : erkenneKategorie(text(z.titel)),
      bestaetigt: false,
    });
  });
  if (!v.ok) f.push(...v.error);
  if (f.length || !v.ok) return err(f);
  return ok({
    ortSlug: ort.slug,
    kontaktName,
    kontaktEmail,
    nachricht,
    termine: v.value.termine.map((t, i) => ({
      ...t,
      speisen: speisen[i] ?? [],
      platz: punkte[i]?.platz ?? null,
      platzUebernehmen:
        opt.redaktion === true && !!punkte[i] && e.zeilen[i]?.platzUebernehmen === true,
    })),
  } satisfies NeuerVorschlag);
}

/** „Fr., 17.09.2027“ aus ISO-Datum (UTC-Mittag, damit keine Zeitzone den Tag verschiebt). */
const tagText = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return `${'SoMoDiMiDoFrSa'.slice(d * 2, d * 2 + 2)}., ${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
};

/**
 * Benachrichtigung über einen neuen Vorschlag (Issue #171): Ort mit Landkreis, ganzes Programm,
 * direkter Link zur Prüfung. Reiner Text; Eingaben sind schon von Steuerzeichen bereinigt, ein
 * eingereichter Kartenlink kommt nie vor (nur „Kartenpunkt: ja“).
 */
export function vorschlagsMail(
  v: NeuerVorschlag,
  ort: { name: string; landkreis: string },
  id: string,
  website: string,
): { betreff: string; text: string } {
  const basis = website.replace(/\/$/, '');
  const kreis = (LANDKREISE as Record<string, string>)[ort.landkreis] ?? ort.landkreis;
  // Reihenfolge wie eingereicht – der Assistent sortiert nach Tag und Uhrzeit (#149)
  const termine = v.termine;
  const anzahl = termine.length === 1 ? '1 Veranstaltung' : `${termine.length} Veranstaltungen`;
  const ab = termine[0] ? ` ab ${tagText(termine[0].datum)}` : '';
  const programm = termine.map((t) => {
    const details = [
      t.veranstaltungsort,
      t.band && `${t.kategorie === 'tradition' ? 'Musik' : 'Band/DJ'}: ${t.band}`,
      t.pfarrer && `Pfarrer/in: ${t.pfarrer}`,
      t.platz && 'Kartenpunkt',
      t.speisen.length > 0 && 'Essen & Getränke',
    ].filter(Boolean);
    return `- ${tagText(t.datum)}${t.beginn ? `, ${t.beginn} Uhr` : ''} – ${t.titel}${
      details.length ? ` (${details.join(' · ')})` : ''
    }`;
  });
  const nachricht = v.nachricht
    ? v.nachricht.length > 500
      ? `${v.nachricht.slice(0, 500)} …`
      : v.nachricht
    : null;
  const zeilen = [
    `Neuer Vorschlag für ${ort.name} (${kreis})`,
    '',
    'Programm:',
    ...programm,
    '',
    `Eingereicht von: ${v.kontaktName ?? 'ohne Namen'}${v.kontaktEmail ? ' – „Antworten“ geht direkt an den Einsender' : ''}`,
    ...(nachricht ? ['', 'Nachricht:', nachricht] : []),
    '',
    'Jetzt prüfen und übernehmen:',
    `${basis}/admin/kirmes-eintragen?vorschlag=${id}`,
    '',
    `Alle offenen Vorschläge: ${basis}/admin/vorschlaege`,
  ];
  return {
    betreff: `Neuer Kirmesvorschlag: ${ort.name} (${ort.landkreis}) – ${anzahl}${ab}`,
    text: zeilen.join('\n'),
  };
}

export class Vorschlaege {
  constructor(
    private readonly repo: VorschlagsRepository,
    private readonly orte: OrtRepository,
    private readonly sitzungen: Sitzungen,
    private readonly post: Postausgang,
    private readonly jeAbsender: Drosselung,
    private readonly gesamt: Drosselung,
    private readonly website: string,
    /** Löst Kurzlinks sicher auf (nur Google-Hosts) – Issue #169 */
    private readonly karten?: Kartenlinks,
  ) {}
  async melde(e: VorschlagEingabe, herkunft: string) {
    if (text(e.falle) || !Number.isFinite(e.dauerMs) || (e.dauerMs ?? 0) < 3000)
      return ok({ angenommen: true });
    if (!this.jeAbsender.erlaube(herkunft) || !this.gesamt.erlaube('gesamt'))
      return err('ZU_VIELE' as const);
    const v = await pruefeVorschlag(e, this.orte, { karten: this.karten });
    if (!v.ok) return v;
    const id = await this.repo.lege(v.value);
    if (!id) return err('ORT_VOLL' as const);
    // Der gespeicherte Vorschlag bleibt bei einer Mailstörung erreichbar. Kein zweites Eintragen erzwingen.
    try {
      const ort = await this.orte.finde(v.value.ortSlug);
      await this.post.sende({
        ...vorschlagsMail(
          v.value,
          { name: ort?.name ?? v.value.ortSlug, landkreis: ort?.landkreis ?? '' },
          id,
          this.website,
        ),
        ...(v.value.kontaktEmail ? { antwortAn: v.value.kontaktEmail } : {}),
      });
    } catch {
      /* Keine Kontaktdaten oder SMTP-Fehler mit Adressen protokollieren. */
    }
    return ok({ angenommen: true });
  }
  private async berechtigt(token: string) {
    const s = token ? await this.sitzungen.pruefe(token) : null;
    return s && (s.rolle === 'admin' || s.rolle === 'redaktion') ? s : null;
  }
  async liste(token: string) {
    return (await this.berechtigt(token)) ? ok(await this.repo.liste()) : err('VERBOTEN' as const);
  }
  async anzahl(token: string) {
    return (await this.berechtigt(token)) ? ok(await this.repo.anzahl()) : err('VERBOTEN' as const);
  }
  async finde(token: string, id: string) {
    if (!(await this.berechtigt(token))) return err('VERBOTEN' as const);
    const v = UUID.test(id) ? await this.repo.finde(id) : null;
    return v ? ok(v) : err('NICHT_GEFUNDEN' as const);
  }
  async uebernehme(token: string, id: string, e: VorschlagEingabe, bestaetigt: boolean) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    if (!UUID.test(id) || !(await this.repo.finde(id))) return err('NICHT_GEFUNDEN' as const);
    const v = await pruefeVorschlag(e, this.orte, { redaktion: true });
    if (!v.ok) return v;
    const r = await this.repo.uebernehme(
      id,
      v.value.termine.map((t) => ({ ...t, bestaetigt })),
      s.adminId,
    );
    return r === 'KONFLIKT'
      ? err('KONFLIKT' as const)
      : r
        ? ok(true)
        : err('NICHT_GEFUNDEN' as const);
  }
  async lehneAb(token: string, id: string, grund?: string) {
    const s = await this.berechtigt(token);
    if (!s) return err('VERBOTEN' as const);
    const g = text(grund);
    if (g.length > 500) return err([fehler('grund', 'Grund: höchstens 500 Zeichen.')]);
    return UUID.test(id) && (await this.repo.lehneAb(id, g || null, s.adminId))
      ? ok(true)
      : err('NICHT_GEFUNDEN' as const);
  }
}
