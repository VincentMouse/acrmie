export function normalizePhoneNumber(phone: string): string {
  // Remove spaces and dashes
  let normalized = phone.replace(/[\s-]/g, '');
  
  // Remove leading 0 or 63
  if (normalized.startsWith('63')) {
    normalized = normalized.slice(2);
  } else if (normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }
  
  return normalized;
}

export function validatePhoneNumber(phone: string): { isValid: boolean; normalized: string; error?: string } {
  const normalized = normalizePhoneNumber(phone);
  
  // Must be exactly 10 digits
  if (normalized.length !== 10) {
    return { isValid: false, normalized, error: 'Must be 10 digits' };
  }
  
  // Must be all digits
  if (!/^\d+$/.test(normalized)) {
    return { isValid: false, normalized, error: 'Must contain only digits' };
  }
  
  // Must start with 9
  if (!normalized.startsWith('9')) {
    return { isValid: false, normalized, error: 'Must start with 9' };
  }
  
  return { isValid: true, normalized };
}
