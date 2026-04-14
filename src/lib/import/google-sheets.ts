import type { RawImportRow } from "./csv";

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export async function fetchGoogleSheet(
  sheetUrl: string,
  apiKey: string
): Promise<RawImportRow[]> {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error("Invalid Google Sheets URL");

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1?key=${apiKey}`
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "Failed to fetch sheet");
  }

  const data = await response.json();
  const rows: string[][] = data.values || [];

  if (rows.length < 2) return [];

  const headers = rows[0].map((h: string) => h.trim().toLowerCase());
  const result: RawImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row: RawImportRow = {};
    headers.forEach((header: string, j: number) => {
      row[header] = rows[i][j] || "";
    });
    result.push(row);
  }

  return result;
}
