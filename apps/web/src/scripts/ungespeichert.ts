/** Warnt vor dem Verlassen bearbeiteter Formulare; keine personenbezogenen Entwürfe speichern. */
const formen = new Set<HTMLFormElement>();
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-ungespeichert]')) {
  form.addEventListener('entwurf-uebernommen', () => formen.add(form));
  form.addEventListener('input', () => formen.add(form));
  form.addEventListener('change', () => formen.add(form));
  form.addEventListener('reset', () => formen.delete(form));
  form.addEventListener('submit', (e) =>
    queueMicrotask(() => {
      if (!e.defaultPrevented) formen.delete(form);
    }),
  );
}
window.addEventListener('beforeunload', (e) => {
  if (formen.size) {
    e.preventDefault();
    e.returnValue = '';
  }
});
