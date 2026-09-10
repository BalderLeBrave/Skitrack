/** File d’actualisation : on ne force rien, on prend le prochain relevé périmé. */

export function pickRoundRobin(
  ids: readonly string[],
  start: number,
  take: number,
  stale: (id: string) => boolean,
): { picked: string[]; next: number; scanned: number } {
  const picked: string[] = [];
  if (ids.length === 0 || take <= 0) return { picked, next: 0, scanned: 0 };
  let i = ((start % ids.length) + ids.length) % ids.length;
  let scanned = 0;
  while (picked.length < take && scanned < ids.length) {
    const id = ids[i]!;
    if (stale(id)) picked.push(id);
    i = (i + 1) % ids.length;
    scanned += 1;
  }
  return { picked, next: i, scanned };
}
