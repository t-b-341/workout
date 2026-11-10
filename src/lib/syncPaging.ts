/**
 * Read every page of a PostgREST select.
 *
 * The server returns at most 1,000 rows per response. `from` / `to` are
 * 0-based and inclusive, matching `.range()`. A page shorter than `pageSize`
 * ends the loop. If any page fails, the error is returned with no rows —
 * a partial list must not be reconciled as a complete table.
 */
const SERVER_PAGE_CAP = 1000;

export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: E | null }>,
  pageSize = SERVER_PAGE_CAP,
): Promise<{ rows: T[]; error: E | null }> {
  const requested = Number.isFinite(pageSize) ? Math.floor(pageSize) : SERVER_PAGE_CAP;
  // The server cap wins even if the caller asks for a larger page.
  const size = Math.min(SERVER_PAGE_CAP, Math.max(1, requested));
  const rows: T[] = [];

  for (let from = 0; ; from += size) {
    const to = from + size - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { rows: [], error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < size) return { rows, error: null };
  }
}
