import Papa from "papaparse";

export interface RawImportRow {
  email?: string;
  name?: string;
  company?: string;
  tags?: string;
  [key: string]: string | undefined;
}

export function parseCSV(file: File): Promise<RawImportRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
