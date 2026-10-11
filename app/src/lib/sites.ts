// Shared between the admin "approve a course site" action and the student "request a course site" action.

/** "https://www.udemy.com/course/xyz" -> "udemy.com". A domain also covers its subdomains
 *  (e.g. "udemy.com" matches "course-v2.udemy.com" too) — that's almost always what's wanted for a real site. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^\*\.\s*/, "");
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].split(":")[0];
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return null;
  return s;
}

/** "coursera.org" -> "Coursera", "course-v2.udemy.com" -> "Udemy". Used where a site has no custom name, so
 *  the raw domain never shows up as-is somewhere meant to look like a clean, friendly shortcut label. */
export function prettyDomainName(domain: string): string {
  const parts = domain.split(".");
  const label = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  return label.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
