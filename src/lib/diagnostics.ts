export const DIAGNOSTICS_ADMIN_EMAIL = 'jusntrader38@gmail.com';

export const isDiagnosticsAdmin = (email?: string | null) =>
  String(email || '').trim().toLowerCase() === DIAGNOSTICS_ADMIN_EMAIL;
