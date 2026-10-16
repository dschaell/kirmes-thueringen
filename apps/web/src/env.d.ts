declare namespace App {
  interface Locals {
    /** gesetzt von der Middleware, wenn eine gültige Redaktions-Sitzung besteht */
    adminId?: string;
    /** Anzeigename und Rolle des angemeldeten Mitglieds */
    name?: string;
    rolle?: 'admin' | 'redaktion';
    /** CSRF-Token für Admin-Formulare */
    csrf?: string;
  }
}
