declare namespace App {
  interface Locals {
    /** gesetzt von der Middleware, wenn eine gültige Redaktions-Sitzung besteht */
    adminId?: string;
    /** CSRF-Token für Admin-Formulare */
    csrf?: string;
  }
}
