import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

export function readCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const resolvedPath = path.resolve(filePath);
    const records = [];

    if (!fs.existsSync(resolvedPath)) {
      reject(new Error(`CSV file was not found: ${resolvedPath}`));
      return;
    }

    fs.createReadStream(resolvedPath)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
        })
      )
      .on("data", (record) => {
        records.push(record);
      })
      .on("error", (error) => {
        reject(error);
      })
      .on("end", () => {
        resolve(records);
      });
  });
}