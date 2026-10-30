/**
 * Vereinsprofil auf der Ortsseite (Issue #310): ein kurzer Text zur Kirmes, Links zu Website,
 * Instagram und Facebook und ein öffentlicher Kontakt. Links nur https; Instagram/Facebook nur auf
 * ihre eigenen Adressen, damit keine fremden Seiten untergeschoben werden.
 */
import { err, ok, type Result, type Validierungsfehler } from './result.js';

export interface Ortsprofil {
  readonly text: string | null;
  readonly website: string | null;
  readonly instagram: string | null;
  readonly facebook: string | null;
  readonly kontakt: string | null;
}
export type OrtsprofilEingabe = { [K in keyof Ortsprofil]?: string | null };

export const PROFIL_TEXT_MAX = 800;
const LINK_MAX = 300;
const KONTAKT_MAX = 200;
const HOSTS: Record<'instagram' | 'facebook', RegExp> = {
  instagram: /^(www\.)?instagram\.com$/,
  facebook: /^(www\.|m\.)?facebook\.com$/,
};

/** Steuerzeichen raus, Zeilenumbrüche bleiben (nur im Text) */
const sauber = (s: string | null | undefined, umbrueche = false) =>
  (s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cc}/gu, (c) => (umbrueche && c === '\n' ? c : ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || null;

function link(
  feld: 'website' | 'instagram' | 'facebook',
  roh: string | null | undefined,
  fehler: Validierungsfehler[],
): string | null {
  const s = sauber(roh);
  if (!s) return null;
  // „instagram.com/kv-muster“ ohne https:// ist üblich – ergänzen
  const mitSchema = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  // Nur https, Host ohne Zugangsdaten, keine Leerzeichen (Core kennt kein URL-Objekt)
  const m = /^https:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?([/?#][^\s]*)?$/i.exec(mitSchema);
  const host = m?.[1]?.toLowerCase();
  const url = host ? { hostname: host, href: `https://${host}${m?.[2] ?? '/'}` } : null;
  const hostOk = feld === 'website' || (url !== null && HOSTS[feld].test(url.hostname));
  if (!url || !hostOk || mitSchema.length > LINK_MAX) {
    fehler.push({
      feld,
      code: 'LINK_UNGUELTIG',
      meldung:
        feld === 'website'
          ? 'Website: bitte eine Adresse mit https://.'
          : `${feld === 'instagram' ? 'Instagram' : 'Facebook'}: bitte den Link zu eurer Seite auf ${feld}.com.`,
    });
    return null;
  }
  return url.href;
}

export function validiereOrtsprofil(
  e: OrtsprofilEingabe,
): Result<Ortsprofil, Validierungsfehler[]> {
  const fehler: Validierungsfehler[] = [];
  const text = sauber(e.text, true);
  if (text && text.length > PROFIL_TEXT_MAX)
    fehler.push({
      feld: 'text',
      code: 'TEXT_LAENGE',
      meldung: `Text: höchstens ${PROFIL_TEXT_MAX} Zeichen.`,
    });
  const kontakt = sauber(e.kontakt);
  if (kontakt && kontakt.length > KONTAKT_MAX)
    fehler.push({
      feld: 'kontakt',
      code: 'KONTAKT_LAENGE',
      meldung: `Kontakt: höchstens ${KONTAKT_MAX} Zeichen.`,
    });
  const profil = {
    text,
    website: link('website', e.website, fehler),
    instagram: link('instagram', e.instagram, fehler),
    facebook: link('facebook', e.facebook, fehler),
    kontakt,
  };
  return fehler.length ? err(fehler) : ok(profil);
}
