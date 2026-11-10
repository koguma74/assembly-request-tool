const fs = require("node:fs");
const path = require("node:path");

const inputPath = path.join(__dirname, "data", "A부_조직도_26개과.csv");
const outputPath = path.join(__dirname, "org.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (inQuotes) {
    throw new Error("CSV의 인용부호가 닫히지 않았습니다.");
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

const csvText = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
const [headers, ...rows] = parseCsv(csvText);
const requiredHeaders = ["실국", "과", "대표키워드"];

for (const header of requiredHeaders) {
  if (!headers.includes(header)) {
    throw new Error(`필수 열이 없습니다: ${header}`);
  }
}

const columnIndex = Object.fromEntries(
  headers.map((header, index) => [header, index]),
);

const org = rows
  .filter((row) => row.some((value) => value.trim() !== ""))
  .map((row) => ({
    실국: row[columnIndex.실국].trim(),
    과: row[columnIndex.과].trim(),
    대표키워드: row[columnIndex.대표키워드]
      .split("|")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
  }));

fs.writeFileSync(outputPath, `${JSON.stringify(org, null, 2)}\n`, "utf8");

console.log(`원소 수: ${org.length}`);
console.log("첫 원소:");
console.log(JSON.stringify(org[0], null, 2));
