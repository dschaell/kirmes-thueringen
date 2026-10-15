/** Browser-Seite der Passkey-Abläufe: JSON-Aufrufe mit CSRF-Header und verständliche Fehler. */
export async function postJson(url: string, body: unknown = {}) {
  const csrf = document.querySelector<HTMLInputElement>('input[name="csrf_token"]')?.value ?? '';
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify(body),
  });
  const daten = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, daten };
}

/** Fehler von navigator.credentials in Klartext. */
export function passkeyFehler(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError')
    return 'Abgebrochen oder Zeit abgelaufen.';
  if (name === 'InvalidStateError') return 'Dieses Gerät ist bereits als Passkey eingerichtet.';
  if (name === 'SecurityError') return 'Passkeys gehen nur über die richtige Adresse (HTTPS).';
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}
