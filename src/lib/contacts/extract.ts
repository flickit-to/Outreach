// Helpers to extract structured fields from a contact's email address.
//
// The big one is extractCompanyFromEmail() — turns "ryan@acme.com.au" into
// "Acme" so that auto-created contacts get a sensible company by default.
// Personal-email domains (gmail, etc.) return null so we don't write
// "Gmail" as someone's company.

// Domains where the name on the left of @ is the *person*, not the *company*.
// Lowercased. Subdomain matches handled in normalizeDomain().
const PERSONAL_DOMAINS = new Set([
  // Google
  "gmail.com",
  "googlemail.com",
  // Microsoft
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.com.au",
  "hotmail.fr",
  "outlook.com",
  "outlook.com.au",
  "live.com",
  "live.com.au",
  "msn.com",
  // Apple
  "icloud.com",
  "me.com",
  "mac.com",
  // Proton
  "protonmail.com",
  "proton.me",
  "pm.me",
  // Yahoo
  "yahoo.com",
  "yahoo.com.au",
  "yahoo.co.uk",
  "yahoo.fr",
  "yahoo.de",
  "yahoo.in",
  // AOL
  "aol.com",
  // Others
  "mail.com",
  "gmx.com",
  "gmx.de",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
  "fastmail.fm",
  "tutanota.com",
  "tutanota.de",
  "tutamail.com",
  "tuta.io",
  "tuta.com",
  "hey.com",
  "duck.com",
  "tutanota.com",
]);

// "Country code" second-level domains used in compound TLDs (acme.com.au).
// When we split a domain and see one of these as the second-to-last part,
// we drop two segments not one.
const COMPOUND_TLD_INDICATORS = new Set([
  "co",
  "com",
  "net",
  "org",
  "edu",
  "gov",
  "ac",
  "or",
  "ne",
  "go",
]);

/**
 * Returns the "company-meaningful" part of an email domain, lowercased.
 *   ryan@acme.com.au       → "acme"
 *   sarah@harvard.edu      → "harvard"
 *   john@gmail.com         → null  (personal)
 *   m@stripe.com           → "stripe"
 *   x@finance.bigco.com    → "bigco"  (drops the leftmost subdomain when there is one)
 *   ""                     → null
 */
export function extractCompanySlug(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const rawDomain = email.slice(at + 1).trim().toLowerCase();
  if (!rawDomain) return null;
  if (PERSONAL_DOMAINS.has(rawDomain)) return null;

  const parts = rawDomain.split(".").filter(Boolean);
  if (parts.length < 2) return null;

  // Determine how many trailing TLD parts to drop.
  // E.g.  acme.com.au           → drop 2 ("com.au"), keep "acme"
  //       acme.co.uk            → drop 2 ("co.uk"), keep "acme"
  //       acme.com              → drop 1 ("com"), keep "acme"
  //       finance.bigco.com     → drop 1 ("com"), keep "bigco" (last meaningful)
  let dropFromEnd = 1;
  if (
    parts.length >= 3 &&
    COMPOUND_TLD_INDICATORS.has(parts[parts.length - 2])
  ) {
    dropFromEnd = 2;
  }
  const meaningful = parts.slice(0, parts.length - dropFromEnd);
  if (meaningful.length === 0) return null;
  // Take the LAST meaningful part — that's usually the brand name (e.g.
  // "bigco" in finance.bigco.com).
  const slug = meaningful[meaningful.length - 1];
  if (!slug) return null;
  return slug;
}

/**
 * Title-cases the company slug for display.
 *   "acme"            → "Acme"
 *   "stripe-pro"      → "Stripe Pro"
 *   "abctech"         → "Abctech"
 */
export function companyDisplayName(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Convenience: returns the inferred company display name, or null if the
 * email is personal / malformed / can't be parsed.
 */
export function extractCompanyFromEmail(email: string): string | null {
  const slug = extractCompanySlug(email);
  if (!slug) return null;
  return companyDisplayName(slug);
}
