const fs = require("node:fs");
const path = require("node:path");
const { classify, parseCsv } = require("./web/engine.js");

function readCsv(filePath) {
  const [headers, ...rows] = parseCsv(fs.readFileSync(filePath, "utf8"));
  return rows
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [header.trim(), row[index] || ""]),
      ),
    );
}

const testCases = readCsv(
  path.join(__dirname, "data", "시험_요구문항_40건.csv"),
);
let firstPlaceCorrect = 0;
let topThreeCorrect = 0;
const incorrectCases = [];

for (const testCase of testCases) {
  const candidates = classify(testCase.요구내용);
  const departments = candidates.map((candidate) => candidate.과);
  const correctDepartment = testCase.정답_배분과;

  if (departments[0] === correctDepartment) firstPlaceCorrect += 1;
  if (departments.includes(correctDepartment)) topThreeCorrect += 1;

  if (departments[0] !== correctDepartment) {
    incorrectCases.push({
      시험번호: testCase.시험번호,
      요구내용: testCase.요구내용,
      정답: correctDepartment,
      "엔진 결과": departments.join(" > ") || "후보 없음",
    });
  }
}

console.log(
  `1순위 정답 ${firstPlaceCorrect}/${testCases.length} · 3순위 안 ${topThreeCorrect}/${testCases.length}`,
);
console.log("\n틀린 문항");
if (incorrectCases.length === 0) {
  console.log("없음");
} else {
  console.table(incorrectCases);
}
