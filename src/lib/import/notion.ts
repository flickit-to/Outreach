import { Client } from "@notionhq/client";
import type { RawImportRow } from "./csv";

export async function fetchNotionDatabase(
  databaseId: string,
  integrationToken: string
): Promise<RawImportRow[]> {
  const notion = new Client({ auth: integrationToken });

  const response = await notion.databases.query({
    database_id: databaseId,
  });

  const results: RawImportRow[] = [];

  for (const page of response.results) {
    if (!("properties" in page)) continue;

    const row: RawImportRow = {};
    const props = page.properties;

    for (const [key, prop] of Object.entries(props)) {
      const normalizedKey = key.trim().toLowerCase();
      const p = prop as any;

      switch (p.type) {
        case "title":
          row[normalizedKey] = p.title?.[0]?.plain_text || "";
          break;
        case "rich_text":
          row[normalizedKey] = p.rich_text?.[0]?.plain_text || "";
          break;
        case "email":
          row[normalizedKey] = p.email || "";
          break;
        case "multi_select":
          row[normalizedKey] = p.multi_select
            ?.map((s: any) => s.name)
            .join(", ") || "";
          break;
        case "select":
          row[normalizedKey] = p.select?.name || "";
          break;
        default:
          break;
      }
    }

    results.push(row);
  }

  return results;
}
