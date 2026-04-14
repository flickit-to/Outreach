import { z } from "zod";
import type { RawImportRow } from "./csv";

const emailSchema = z.string().email();

export interface NormalizedContact {
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  role: string;
  tags: string[];
}

export interface NormalizeResult {
  valid: NormalizedContact[];
  errors: string[];
}

export function normalizeContacts(rows: RawImportRow[]): NormalizeResult {
  const valid: NormalizedContact[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = (row.email || "").trim().toLowerCase();

    if (!email) {
      errors.push(`Row ${i + 1}: Missing email`);
      continue;
    }

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      errors.push(`Row ${i + 1}: Invalid email "${email}"`);
      continue;
    }

    if (seen.has(email)) {
      errors.push(`Row ${i + 1}: Duplicate email "${email}"`);
      continue;
    }
    seen.add(email);

    const tags = (row.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Handle name: split if single "name" field, or use first_name/last_name
    let firstName = (row.first_name || row.firstname || "").trim();
    let lastName = (row.last_name || row.lastname || "").trim();
    if (!firstName && !lastName && row.name) {
      const parts = row.name.trim().split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    }

    valid.push({
      email,
      first_name: firstName,
      last_name: lastName,
      company: (row.company || "").trim(),
      role: (row.role || "").trim(),
      tags,
    });
  }

  return { valid, errors };
}
