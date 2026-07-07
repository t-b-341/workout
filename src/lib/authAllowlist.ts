/**
 * App-level allowlist gate (defense-in-depth). The PRIMARY signup control is
 * the Supabase dashboard "disable public signup" setting. This gate limits the
 * app UI to known user IDs after authentication.
 *
 * ALLOWED_USER_IDS is a comma-separated list of Supabase user UUIDs, provided
 * via NEXT_PUBLIC_ALLOWED_USER_IDS. If unset/empty, the gate is DISABLED
 * (fails open) so setup is not blocked.
 */
export function allowedUserIds(): string[] {
  const raw = process.env.NEXT_PUBLIC_ALLOWED_USER_IDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isUserAllowed(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const allow = allowedUserIds();
  if (allow.length === 0) return true; // gate disabled — fail open
  return allow.includes(userId);
}
