/**
 * Kartenpin im Terminformular (Issue #446): Klick auf die Karte setzt den Pin, er lässt sich
 * verschieben und entfernen. Lat/Lon landen in versteckten Feldern (`data-kartenpin-lat/lon`),
 * der Server übernimmt sie wie einen Kartenpunkt. Kacheln kommen vom eigenen Proxy (/kacheln).
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const THUERINGEN: L.LatLngExpression = [50.9, 11.0];
const runden = (x: number) => Math.round(x * 1e6) / 1e6;
const HINWEIS = 'Auf die Karte tippen, um den Ort zu markieren. Der Pin lässt sich verschieben.';

function einrichten(box: HTMLElement) {
  const karteEl = box.querySelector<HTMLElement>('[data-kartenpin-karte]');
  const latIn = box.querySelector<HTMLInputElement>('[data-kartenpin-lat]');
  const lonIn = box.querySelector<HTMLInputElement>('[data-kartenpin-lon]');
  const info = box.querySelector<HTMLElement>('[data-kartenpin-info]');
  const weg = box.querySelector<HTMLButtonElement>('[data-kartenpin-weg]');
  if (!karteEl || !latIn || !lonIn || !info || !weg) return;

  const start =
    latIn.value && lonIn.value ? L.latLng(Number(latIn.value), Number(lonIn.value)) : null;
  let karte: L.Map | null = null;
  let marker: L.Marker | null = null;

  const anzeigen = () => {
    const gesetzt = latIn.value !== '' && lonIn.value !== '';
    info.textContent = gesetzt
      ? `Pin gesetzt: ${Number(latIn.value).toFixed(5)}, ${Number(lonIn.value).toFixed(5)}`
      : HINWEIS;
    weg.hidden = !gesetzt;
  };

  const schreiben = (ll: L.LatLng) => {
    latIn.value = String(runden(ll.lat));
    lonIn.value = String(runden(ll.lng));
    anzeigen();
  };

  const setzen = (ll: L.LatLng, mitSchreiben = true) => {
    if (!karte) return;
    if (!marker) {
      marker = L.marker(ll, { draggable: true }).addTo(karte);
      marker.on('dragend', () => marker && schreiben(marker.getLatLng()));
    } else {
      marker.setLatLng(ll);
    }
    if (mitSchreiben) schreiben(ll);
  };

  weg.addEventListener('click', () => {
    marker?.remove();
    marker = null;
    latIn.value = '';
    lonIn.value = '';
    anzeigen();
  });

  // Karte erst bauen, wenn der Termin sichtbar ist (Leaflet misst im eingeklappten Bereich 0 px)
  const details = box.closest('details');
  const starten = () => {
    if (karte) return karte.invalidateSize();
    karte = L.map(karteEl, {
      scrollWheelZoom: false,
      minZoom: 6,
      maxBounds: L.latLngBounds([46.8, 5.0], [55.5, 16.0]),
      maxBoundsViscosity: 1,
    }).setView(start ?? THUERINGEN, start ? 15 : 8);
    L.tileLayer('/kacheln/{z}/{x}/{y}.png', {
      maxZoom: 18,
      minZoom: 6,
      bounds: L.latLngBounds([46.8, 5.0], [55.5, 16.0]),
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(karte);
    karte.on('click', (e: L.LeafletMouseEvent) => setzen(e.latlng));
    if (start) setzen(start, false);
  };
  if (!details || details.open) starten();
  details?.addEventListener('toggle', () => {
    if (details.open) starten();
  });
  anzeigen();
}

document.querySelectorAll<HTMLElement>('[data-kartenpin]').forEach(einrichten);
