"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("./web/lib/xlsx.full.min.js");
const Engine = require("./web/engine.js");
const Validation = require("./web/validate.js");
const Flow = require("./web/flow.js");
const organization = require("./api/org.json");

function sampleReply(department) {
  const file = path.join(__dirname, "부서회신", `회신_${department}.xlsx`);
  const workbook = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
    header: 1, defval: "", raw: false,
  });
  return Validation.parseReplyRows(matrix);
}

const demand = "최근 5년간 위원회 운영 현황";
const regional = sampleReply("지역정책과");
const safety = sampleReply("안전정책과");
const industry = sampleReply("산업정책과");
const regionalCopy = structuredClone(regional);

assert.ok(Validation.validateReply(regional, demand, 2026).some((item) =>
  item.유형 === "연도 누락" && item.내용.includes("2023")));
assert.ok(Validation.validateReply(safety, demand, 2026).some((item) =>
  item.유형 === "초과 집행"));
assert.ok(Validation.validateReply(industry, demand, 2026).some((item) =>
  item.유형 === "합계 불일치"));
assert.deepEqual(regional, regionalCopy, "회신 점검은 원본 행을 변경하지 않아야 합니다.");
assert.throws(() => Validation.parseReplyRows([["연도"], ["예산(천원)"]]), /요구:/);
console.log("회신 샘플 3종: 연도 누락·초과 집행·합계 불일치 확인");

const csv = fs.readFileSync(path.join(__dirname, "data", "검증용_접수대장_120건.csv"), "utf8").replace(/^\uFEFF/, "");
const [headers, ...values] = Engine.parseCsv(csv);
const rows = values.filter((row) => row.some((value) => value.trim())).map((row) =>
  Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
assert.equal(rows.length, 120);
const originalRows = structuredClone(rows);
const findings = Validation.validateRegister(rows, organization.map((item) => item.과), "2026-10-01");
for (const type of ["요구내용 누락", "배분과 누락", "조직도 밖 과", "중복 접수번호",
  "중복 요구내용 후보", "기간 역전", "날짜 형식", "기한 역전", "상태 공백"]) {
  assert.ok(findings.some((item) => item.유형 === type), `${type} 검출`);
}
assert.deepEqual(rows, originalRows, "접수대장 점검은 원본 행을 변경하지 않아야 합니다.");
console.log(`검증용 접수대장 ${rows.length}행: 필수 오류 유형과 원본 보존 확인`);

const base = Flow.createEmptyDb();
const receipt = Flow.apply(base, {
  작업: "접수", id: "시험-1", 파일명: "가상.pdf", 위원회: "시험위원회", 의원: "의원A",
  문항번호: "1", 요구내용: demand,
}, organization);
const assigned = Flow.apply(receipt, {
  작업: "배분", id: "시험-1", 주관과: "지역정책과", 협조과: ["안전정책과"], 확정방법: "수정",
}, organization);
const firstReply = Flow.apply(assigned, {
  작업: "회신", id: "시험-1", 과: "지역정책과", 파일명: "회신.xlsx",
  행: regional.행, 확인필요: Validation.validateReply(regional, demand, 2026),
}, organization);
assert.throws(() => Flow.apply(firstReply, {
  작업: "회신", id: "시험-1", 과: "지역정책과", 파일명: "덮어쓰기.xlsx", 행: [],
}, organization), (error) => error.status === 409);
const complete = Flow.apply(firstReply, {
  작업: "회신", id: "시험-1", 과: "안전정책과", 파일명: "회신2.xlsx", 행: safety.행,
}, organization);
assert.equal(complete.cases[0].상태, "회신완료");
assert.throws(() => Flow.apply(complete, { 작업: "확정", id: "시험-1", 확정코멘트: "" }, organization),
  (error) => error.status === 400);
const supplement = Flow.apply(complete, {
  작업: "보완요청", id: "시험-1", 과: "지역정책과", 사유: "2023년 행 확인",
}, organization);
assert.equal(supplement.cases[0].상태, "보완요청");
assert.throws(() => Flow.apply(supplement, {
  작업: "회신", id: "시험-1", 과: "안전정책과", 행: [],
}, organization), (error) => error.status === 403);
assert.throws(() => Flow.apply(supplement, {
  작업: "확정", id: "시험-1", 확정코멘트: "확인",
}, organization), (error) => error.status === 409);
const rereply = Flow.apply(supplement, {
  작업: "회신", id: "시험-1", 과: "지역정책과", 파일명: "보완.xlsx", 행: regional.행,
}, organization);
assert.equal(rereply.cases[0].상태, "회신완료");
assert.equal(rereply.cases[0].보완[0].기존회신.파일명, "회신.xlsx");
assert.ok(rereply.cases[0].보완[0].완료일시);
const final = Flow.apply(rereply, {
  작업: "확정", id: "시험-1", 확정코멘트: "보완 회신 확인",
}, organization);
assert.equal(final.cases[0].상태, "확정");
assert.equal(final.cases[0].log.at(-1).확정코멘트, "보완 회신 확인");
console.log("보완 대상 과 재회신·기존 회신 이력·확정 코멘트 확인");
