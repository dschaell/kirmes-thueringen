import { describe, expect, it } from 'vitest';
import { appName, istInAppBrowser } from '../src/lib/inapp';
import { passkeyFehler } from '../src/lib/passkey-client';

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
describe('In-App-Browser (Issue #242)', () => {
  it('erkennt Instagram, Facebook, Messenger, TikTok – nicht Safari, Chrome, WhatsApp', () => {
    expect(istInAppBrowser(`${IOS} Instagram 300.0.0.0 (iPhone14,2; iOS 18_0)`)).toBe(true);
    expect(istInAppBrowser(`${IOS} [FBAN/FBIOS;FBAV/450.0]`)).toBe(true);
    expect(istInAppBrowser(`${IOS} musical_ly_35.0`)).toBe(true);
    expect(istInAppBrowser(`${IOS} Version/18.0 Safari/604.1`)).toBe(false);
    expect(istInAppBrowser(`${IOS} CriOS/130.0 Mobile Safari/604.1`)).toBe(false);
    expect(istInAppBrowser(null)).toBe(false);
  });
  it('nennt die App', () => {
    expect(appName(`${IOS} Instagram 300`)).toBe('Instagram');
    expect(appName(`${IOS} [FBAN/FBIOS;FBAV/450.0]`)).toBe('Facebook');
    expect(appName(`${IOS} [FBAN/MessengerForiOS]`)).toBe('dem Messenger');
    expect(appName(`${IOS} musical_ly`)).toBe('TikTok');
    expect(appName(`${IOS} Snapchat/12`)).toBe('Snapchat');
    expect(appName(`${IOS} LinkedInApp`)).toBe('LinkedIn');
    expect(appName(`${IOS} Line/13`)).toBe('einer App');
    expect(appName(undefined)).toBe('einer App');
  });
  it('Abbruch-Meldung gibt den Tipp mit dem Browser', () => {
    expect(passkeyFehler({ name: 'NotAllowedError' })).toContain('Im Browser öffnen');
  });
});
