/**
 * Phone number normalization utilities.
 * Handles Nigerian national format (080..., 081..., 070..., 090..., 091...)
 * as well as international formats (+234..., +1..., etc.).
 */

export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');
  if (!cleaned) return '';

  // Nigerian 11-digit format starting with 0: e.g. 08162051907 -> +2348162051907
  if (/^0\d{10}$/.test(cleaned)) {
    return `+234${cleaned.slice(1)}`;
  }

  // 13-digit format starting with 234 without +: 2348162051907 -> +2348162051907
  if (/^234\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  // Already E.164 with +
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  // Digits without +
  if (/^\d{7,15}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return cleaned;
}

export function isValidPhoneNumber(raw: string): boolean {
  const normalized = normalizePhoneNumber(raw);
  return /^\+[1-9]\d{6,14}$/.test(normalized);
}

/**
 * Returns all common format variants for matching in local storage.
 * e.g. for "08162051907":
 * ["+2348162051907", "08162051907", "2348162051907"]
 */
export function getPhoneNumberVariants(raw: string): string[] {
  const cleaned = raw.trim().replace(/[\s\-().]/g, '');
  const variants = new Set<string>();
  if (!cleaned) return [];

  variants.add(cleaned);
  if (cleaned.startsWith('+')) {
    variants.add(cleaned.slice(1));
  } else {
    variants.add(`+${cleaned}`);
  }

  // Nigerian formats
  if (cleaned.startsWith('+234') && cleaned.length === 14) {
    variants.add(`0${cleaned.slice(4)}`);
    variants.add(cleaned.slice(1));
  } else if (cleaned.startsWith('234') && cleaned.length === 13) {
    variants.add(`+${cleaned}`);
    variants.add(`0${cleaned.slice(3)}`);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    variants.add(`+234${cleaned.slice(1)}`);
    variants.add(`234${cleaned.slice(1)}`);
  }

  return Array.from(variants);
}

/**
 * Returns all prefix variants for matching telephone numbers by prefix.
 * e.g. for "0201888": ["0201888", "+234201888", "234201888", "+0201888"]
 */
export function getPrefixVariants(rawPrefix: string): string[] {
  const cleaned = rawPrefix.trim().replace(/[\s\-().*#]/g, '');
  const variants = new Set<string>();
  if (!cleaned) return [];

  variants.add(cleaned);
  if (cleaned.startsWith('+')) {
    variants.add(cleaned.slice(1));
  } else {
    variants.add(`+${cleaned}`);
  }

  // Nigerian prefix variants
  if (cleaned.startsWith('+234')) {
    variants.add(`0${cleaned.slice(4)}`);
    variants.add(cleaned.slice(1));
  } else if (cleaned.startsWith('234')) {
    variants.add(`+${cleaned}`);
    variants.add(`0${cleaned.slice(3)}`);
  } else if (cleaned.startsWith('0')) {
    variants.add(`+234${cleaned.slice(1)}`);
    variants.add(`234${cleaned.slice(1)}`);
    variants.add(`+${cleaned}`);
  }

  return Array.from(variants);
}
