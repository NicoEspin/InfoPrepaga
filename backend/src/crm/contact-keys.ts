import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export function contactKeys(email?: string | null, phone?: string | null) {
  const emailKey = email?.trim().toLowerCase() || null;
  const raw = phone?.trim() ?? '';
  // Parse a complete number only: prose containing digits is not a phone key.
  const parsed =
    raw && /^[+\d\s()./-]+$/.test(raw)
      ? parsePhoneNumberFromString(raw, {
          defaultCountry: 'AR',
          extract: false,
        })
      : undefined;
  return {
    emailKey,
    phoneKey: parsed?.isValid() ? String(parsed.number) : null,
  };
}
