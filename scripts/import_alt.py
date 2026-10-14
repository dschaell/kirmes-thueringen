#!/usr/bin/env python3
"""Importiert die Termin-Tabelle der alten Seite (mauersberger-haarhausen.de/kirmes)
in db/seed/termine.json.

Aufruf: python3 scripts/import_alt.py <html-datei> [jahr]
Nur Standardbibliothek, keine Abhängigkeiten.
"""
import json
import re
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path


class TableParser(HTMLParser):
    """Sammelt alle Zeilen der Tabelle, deren Kopf 'Datum | Zeit | Gemeinde | Ort | Veranstaltung' ist."""

    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.in_cell = [], None, [], False

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.in_cell, self.cell = True, []
        elif tag == "br" and self.in_cell:
            self.cell.append(" ")

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None and self.in_cell:
            self.row.append(clean("".join(self.cell)))
            self.in_cell = False
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.in_cell:
            self.cell.append(data)


def clean(s):
    s = s.replace(" ", " ").replace("“", '"').replace("”", '"').replace("´", "'")
    return re.sub(r"\s+", " ", s).strip(" ;")


def slugify(s):
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


KREISE = {
    "SÖM": "Sömmerda", "EIC": "Eichsfeld", "WAK": "Wartburgkreis", "UH": "Unstrut-Hainich",
    "GTH": "Gotha", "IK": "Ilm-Kreis", "WL": "Weimarer Land", "HBN": "Hildburghausen",
    "KYF": "Kyffhäuser", "SM": "Schmalkalden-Meiningen", "NDH": "Nordhausen", "SON": "Sonneberg",
    "SLF": "Saalfeld-Rudolstadt", "SOK": "Saale-Orla", "SHK": "Saale-Holzland", "GRZ": "Greiz",
    "ABG": "Altenburger Land", "EF": "Erfurt", "WE": "Weimar", "J": "Jena", "G": "Gera",
    "SHL": "Suhl", "EA": "Eisenach",
}


def kategorie(titel):
    t = titel.lower()
    if "kindertanz" in t or "kinderkirmes" in t or "familien" in t:
        return "kinder"
    if "frühschoppen" in t:
        return "fruehschoppen"
    if "in den mai" in t or "maisprung" in t:
        return "mai"
    if "oster" in t:
        return "ostern"
    if "beerdigung" in t or "kirmesspiele" in t or "umzug" in t or "ständchen" in t or "baum" in t:
        return "brauchtum"
    if "kirmes" in t or "kirme" in t:
        return "kirmes"
    if "disco" in t or "dj" in t or "party" in t or "beat" in t:
        return "party"
    return "tanz"


def ort_split(gemeinde):
    """'*Nohra (WL)' -> ('Nohra', 'WL')."""
    g = gemeinde.lstrip("*").strip()
    m = re.search(r"\(\s*([A-ZÄÖÜ]{1,4})\s*\)\s*$", g)
    if m and m.group(1) in KREISE:
        return g[: m.start()].strip(), m.group(1)
    m = re.search(r"\s([A-ZÄÖÜ]{2,4})\s*\)\s*$", g)  # 'Ottstedt (b. Magdala WL)'
    if m and m.group(1) in KREISE:
        return (g[: m.start()] + ")").strip(), m.group(1)
    if re.match(r"EF-\S", g):
        return g, "EF"
    return g, None


def main(path, jahr):
    p = TableParser()
    p.feed(Path(path).read_text(encoding="utf-8", errors="replace"))
    out, monat = [], None
    for row in p.rows:
        if len(row) < 5:
            continue
        datum, zeit, gemeinde, location, titel = row[:5]
        if datum and not any(row[1:5]):
            monat = datum  # Monats-Zwischenzeile
            continue
        m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4}|\?{2,4})", datum)
        if not gemeinde or not titel or not (m or "?" in datum):
            continue
        ort, kreis = ort_split(gemeinde)
        iso, bestaetigt = None, False
        if m:
            tag, mon, j = m.groups()
            bestaetigt = j.isdigit()
            iso = f"{jahr}-{int(mon):02d}-{int(tag):02d}"
        out.append({
            "id": f"{iso or 'offen'}-{slugify(ort)}-{slugify(titel)[:40]}",
            "datum": iso,
            "bestaetigt": bestaetigt,
            "zeit": zeit if re.match(r"\d{1,2}:\d{2}", zeit) else None,
            "ort": ort,
            "ortSlug": slugify(ort),
            "kreis": kreis,
            "location": location if location not in ('"', "”") else None,
            "titel": titel,
            "kategorie": kategorie(titel),
            "monatAlt": monat,
        })
    # gleichnamige Orte in verschiedenen Kreisen trennen (Zimmern SHK / Zimmern UH)
    kreise_je_ort = {}
    for e in out:
        if e["kreis"]:
            kreise_je_ort.setdefault(e["ortSlug"], set()).add(e["kreis"])
    for e in out:
        if len(kreise_je_ort.get(e["ortSlug"], ())) > 1 and e["kreis"]:
            e["ortSlug"] = f"{e['ortSlug']}-{slugify(e['kreis'])}"
            e["ort"] = f"{e['ort']} ({e['kreis']})"
            e["id"] = f"{e['datum'] or 'offen'}-{e['ortSlug']}-{slugify(e['titel'])[:40]}"
    # doppelte IDs eindeutig machen
    seen = {}
    for e in out:
        n = seen.get(e["id"], 0)
        seen[e["id"]] = n + 1
        if n:
            e["id"] += f"-{n + 1}"
    out.sort(key=lambda e: (e["datum"] or "9999", e["zeit"] or "", e["ort"]))
    dest = Path(__file__).resolve().parent.parent / "db" / "seed" / "termine.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} Termine -> {dest}")
    print(f"bestätigt: {sum(e['bestaetigt'] for e in out)}, ohne Datum: {sum(not e['datum'] for e in out)}, "
          f"ohne Kreis: {sum(not e['kreis'] for e in out)}, Orte: {len({e['ortSlug'] for e in out})}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2026)
