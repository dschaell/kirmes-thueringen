declare namespace App {
  interface Locals {
    /** gesetzt von der Middleware, wenn eine gültige Redaktions-Sitzung besteht */
    adminId?: string;
    /** Anzeigename und Rolle des angemeldeten Mitglieds */
    name?: string;
    rolle?: 'admin' | 'redaktion' | 'kirmesgesellschaft';
    /** nur Kirmesgesellschaft: ihr Ort (Issue #180) */
    ortSlug?: string | null;
    ortName?: string | null;
    /** CSRF-Token für Admin-Formulare */
    csrf?: string;
  }
}
