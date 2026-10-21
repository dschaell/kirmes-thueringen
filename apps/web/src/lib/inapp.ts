/**
 * Eingebaute Browser von Apps (Issue #242): Instagram, Facebook, Messenger, TikTok, Snapchat,
 * LinkedIn & Co. unterstützen auf dem iPhone keine Passkeys – das Anlegen bricht sofort ab.
 * Erkannt am User-Agent; WhatsApp und Mail öffnen Links in Safari bzw. Chrome und sind kein Problem.
 */
const IN_APP =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|musical_ly|TikTok|Snapchat|LinkedInApp|Pinterest|Line\//i;

export const istInAppBrowser = (userAgent: string | null | undefined): boolean =>
  !!userAgent && IN_APP.test(userAgent);

/** Name der App für den Hinweis („in Instagram geöffnet“) – sonst „einer App“. */
export function appName(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/Messenger/i.test(ua)) return 'dem Messenger';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
  if (/musical_ly|TikTok/i.test(ua)) return 'TikTok';
  if (/Snapchat/i.test(ua)) return 'Snapchat';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  return 'einer App';
}
