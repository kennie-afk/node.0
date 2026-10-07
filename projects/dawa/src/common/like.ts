/**
 * A user's search text as a LIKE/ILIKE "contains" pattern. %, _ and the escape character itself are literal
 * characters in what a person types ("50%" is not "50 followed by anything"), so each is escaped; Postgres uses
 * backslash as the default escape for LIKE and ILIKE.
 */
export function likeContains(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
