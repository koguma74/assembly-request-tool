const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  const root = __dirname;
  const { parseCsv } = require("./web/engine.js");
  const parsed = parseCsv('이름,내용\r\nA,"쉼표, 포함"\r\nB,"겹따옴표 ""확인"""\r\nC,"두 줄\n내용"');
  assert.equal(parsed[1][1], "쉼표, 포함");
  assert.equal(parsed[2][1], '겹따옴표 "확인"');
  assert.equal(parsed[3][1], "두 줄\n내용");
  assert.throws(() => parseCsv('열\n"닫히지 않음'), /인용부호/);

  const XLSX = require("./web/lib/xlsx.full.min.js");
  const sourceRows = [{ 파일명: "가상.pdf", 문항번호: "1", 요구내용: "시험" }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceRows), "문항목록");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const restoredBook = XLSX.read(bytes, { type: "buffer" });
  const restoredRows = XLSX.utils.sheet_to_json(restoredBook.Sheets.문항목록, { defval: "", raw: false });
  assert.deepEqual(restoredRows, sourceRows);

  const { default: Fuse } = await import(
    pathToFileURL(path.join(root, "web", "lib", "fuse.min.mjs")).href
  );
  const fuse = new Fuse([{ 요구내용: "디지털 전환 실적" }, { 요구내용: "재난 안전 점검" }], {
    keys: ["요구내용"],
    threshold: 0.34,
  });
  assert.equal(fuse.search("디지털")[0].item.요구내용, "디지털 전환 실적");

  const indexHtml = fs.readFileSync(path.join(root, "web", "index.html"), "utf8");
  const assignHtml = fs.readFileSync(path.join(root, "web", "assign.html"), "utf8");
  const deptHtml = fs.readFileSync(path.join(root, "web", "dept.html"), "utf8");
  const commonJs = fs.readFileSync(path.join(root, "web", "common.js"), "utf8");
  assert.match(indexHtml, /chart\.umd\.min\.js/);
  assert.match(indexHtml, /new Chart/);
  assert.match(assignHtml, /tabulator\.min\.js/);
  assert.match(assignHtml, /new Tabulator/);
  assert.match(assignHtml, /xlsx\.full\.min\.js/);
  assert.match(assignHtml, /new Fuse/);
  assert.match(assignHtml, /재배정요청/);
  assert.match(deptHtml, /회신 엑셀 올리기/);
  assert.match(deptHtml, /재배정 요청 보내기/);
  assert.match(commonJs, /hostname\.endsWith\("\.vercel\.app"\)/);
  assert.match(commonJs, /\/api\/app/);
  const historyText = fs.readFileSync(path.join(root, "web", "data", "접수대장.csv"), "utf8");
  assert.equal(
    parseCsv(historyText.replace(/^\uFEFF/, "")).slice(1)
      .filter((row) => row.some((value) => String(value).trim())).length,
    520,
  );

  console.log("Papa Parse · SheetJS · Chart.js · Fuse.js · Tabulator · 회신 화면 · 과거 이력 연결 시험 통과");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
