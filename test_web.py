"""시작 화면 처리 기록의 필터·엑셀 결과를 실제 화면 스크립트로 검증한다."""

import json
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent
NODE_CHECK = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('./web/lib/xlsx.full.min.js');
const html = fs.readFileSync('web/index.html', 'utf8');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
const nodes = new Map();
function node(selector) {
  if (!nodes.has(selector)) nodes.set(selector, {
    value: '', innerHTML: '', textContent: '',
    addEventListener() {},
  });
  return nodes.get(selector);
}
const db = {
  cases: [
    { id: '의원A-01', 상태: '확정' },
    { id: '의원B-01', 상태: '회신중' },
  ],
  log: [
    { 일시: '2026-11-10T23:30:00.000Z', 작업: '접수', 문항: '의원A-01' },
    { 일시: '2026-11-11T00:00:00.000Z', 작업: '배분', 문항: '의원A-01', 주관과: '산업정책과', 협조과: ['운영지원과'] },
    { 일시: '2026-11-11T01:00:00.000Z', 작업: '회신', 문항: '의원A-01', 과: '산업정책과' },
    { 일시: '2026-11-11T02:00:00.000Z', 작업: '확정', 문항: '의원A-01' },
    { 일시: '2026-11-11T03:00:00.000Z', 작업: '배분', 문항: '의원B-01', 주관과: '데이터정책과' },
  ],
};
const context = {
  document: {
    querySelector: node,
    querySelectorAll: () => [],
    addEventListener() {},
  },
  window: { addEventListener() {} },
  matchMedia: () => ({ matches: true }),
  AppCommon: { readDb: () => db, toast() {} },
  XLSX,
  Chart: class {},
  Intl, Date, Map, Set,
};
vm.runInNewContext(script, context, { filename: 'web/index.html' });
node('#log-department').value = '산업정책과';
context.renderActivity();
const departmentCount = context.filteredActivityRows().length;
const countLabel = node('#log-count').textContent;
const displayedRows = (node('#log-table').innerHTML.match(/<tr>/g) || []).length - 1;
let excelRows = -1;
let excelFile = '';
XLSX.writeFile = (workbook, filename) => {
  excelFile = filename;
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  excelRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).length - 1;
};
context.downloadActivityWorkbook();
node('#log-department').value = '';
node('#log-case').value = '의원A';
context.renderActivity();
const prefixCount = context.filteredActivityRows().length;
node('#log-case').value = '-01';
context.renderActivity();
const nonPrefixCount = context.filteredActivityRows().length;
console.log(JSON.stringify({
  departmentCount, countLabel, displayedRows, excelRows, excelFile,
  prefixCount, nonPrefixCount,
  koreanTime: context.koreanTime('2026-11-10T23:30:00.000Z'),
}));
"""

NODE_DEADLINE_CHECK = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('./web/lib/xlsx.full.min.js');
const html = fs.readFileSync('web/collect.html', 'utf8');
const script = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].at(-1)[1];
const nodes = new Map();
function node(selector) {
  if (!nodes.has(selector)) nodes.set(selector, {
    value: '', innerHTML: '', textContent: '',
    addEventListener() {}, setAttribute() {}, getAttribute() { return 'false'; },
    focus() {},
  });
  return nodes.get(selector);
}
const cases = [
  { id: 'A-01', 상태: '배분확정', 주관과: '산업정책과', 협조과: [], 제출기한: '2026-11-12', 요구내용: '산업 실적', 과별회신: [] },
  { id: 'B-01', 상태: '회신중', 주관과: '산업정책과', 협조과: ['운영지원과'], 제출기한: '2026-11-10', 요구내용: '산업 현황', 과별회신: [{ 과: '운영지원과' }] },
  { id: 'C-01', 상태: '보완요청', 주관과: '데이터정책과', 협조과: [], 제출기한: '2026-11-11', 요구내용: '데이터 현황', 과별회신: [{ 과: '데이터정책과' }], 보완: [{ 과: '데이터정책과', 사유: '보완' }] },
  { id: 'D-01', 상태: '배분확정', 주관과: '안전정책과', 협조과: [], 제출기한: '2026-02-30', 요구내용: '안전 현황', 과별회신: [] },
  { id: 'E-01', 상태: '회신완료', 주관과: '산업정책과', 협조과: [], 제출기한: '2026-11-11', 요구내용: '완료 문항', 과별회신: [{ 과: '산업정책과' }] },
  { id: 'F-01', 상태: '배분확정', 주관과: '산업정책과', 협조과: [], 제출기한: '2026-11-14', 요구내용: '먼 기한', 과별회신: [] },
];
let textBlob;
let textFilename;
const context = {
  document: {
    querySelector: node,
    addEventListener() {},
    createElement: () => ({ click() {}, remove() {}, set download(value) { textFilename = value; } }),
    body: { append() {} },
  },
  matchMedia: () => ({ matches: true }),
  AppCommon: { readCases: () => cases, toast() {} },
  XLSX, Chart: class {}, Date, Intl, Map, Set, Blob,
  URL: { createObjectURL(blob) { textBlob = blob; return 'blob:test'; }, revokeObjectURL() {} },
  setTimeout() {},
};
vm.runInNewContext(script, context, { filename: 'web/collect.html' });
node('#deadline-base').value = '2026-11-11';
node('#deadline-days').value = '2';
node('#deadline-sender').value = '국회 총괄 담당';
const result = context.deadlineResult();
context.renderDeadline();
const countLabel = node('#deadline-count').textContent;
const industryKinds = result.targets.filter(row => row.과 === '산업정책과').map(row => row.구분);
const zeroCount = context.deadlineResult(cases, '2026-11-01', 0).targets.length;
node('#deadline-base').value = '2026-11-01';
node('#deadline-days').value = '0';
context.renderDeadline();
const zeroLabel = node('#deadline-count').textContent;
node('#deadline-base').value = '2026-11-11';
node('#deadline-days').value = '2';
let sheetNames = [];
let excelCounts = [];
XLSX.writeFile = (workbook) => {
  sheetNames = workbook.SheetNames;
  excelCounts = sheetNames.map(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1 }).length - 1);
};
context.downloadDeadlineWorkbook();
context.downloadReminderText();
(async () => {
  const text = await textBlob.text();
  console.log(JSON.stringify({
    targetCount: result.targets.length, checkCount: result.checks.length,
    countLabel, industryKinds, zeroCount, zeroLabel, sheetNames, excelCounts,
    excludedReplied: !result.targets.some(row => row.과 === '운영지원과'),
    textFilename, text,
  }));
})().catch(error => { console.error(error); process.exitCode = 1; });
"""


class ActivityLogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["node", "-e", NODE_CHECK], cwd=ROOT, check=True,
            capture_output=True, text=True, encoding="utf-8",
        )
        cls.result = json.loads(result.stdout.strip())

    def test_department_filter_matches_excel_rows(self):
        self.assertEqual(self.result["departmentCount"], 2)
        self.assertEqual(self.result["displayedRows"], self.result["departmentCount"])
        self.assertEqual(self.result["excelRows"], self.result["departmentCount"])
        self.assertEqual(self.result["countLabel"], "2건 / 전체 5건")
        self.assertEqual(self.result["excelFile"], "처리기록_국회요구자료.xlsx")

    def test_case_filter_uses_prefix(self):
        self.assertEqual(self.result["prefixCount"], 4)
        self.assertEqual(self.result["nonPrefixCount"], 0)

    def test_utc_time_is_displayed_in_korea(self):
        self.assertIn("08:30:00", self.result["koreanTime"])


class DeadlineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["node", "-e", NODE_DEADLINE_CHECK], cwd=ROOT, check=True,
            capture_output=True, text=True, encoding="utf-8",
        )
        cls.result = json.loads(result.stdout.strip())

    def test_due_tomorrow_and_overdue(self):
        self.assertEqual(self.result["industryKinds"], ["기한 경과", "D-1"])
        self.assertTrue(self.result["excludedReplied"])
        self.assertEqual(self.result["targetCount"], 3)
        self.assertEqual(self.result["countLabel"], "대상 3건 · 2개 과")
        self.assertEqual(self.result["checkCount"], 1)

    def test_no_targets(self):
        self.assertEqual(self.result["zeroCount"], 0)
        self.assertEqual(self.result["zeroLabel"], "대상 0건 · 0개 과")

    def test_reminder_workbook(self):
        self.assertEqual(self.result["sheetNames"], ["독촉목록", "확인필요"])
        self.assertEqual(self.result["excelCounts"], [3, 1])

    def test_department_notice(self):
        self.assertEqual(self.result["textFilename"], "과별_국회요구자료_회신안내.txt")
        for phrase in ["수신: 산업정책과", "제목: 국회 요구자료 회신 요청", "건수: 2건",
                       "D-1", "기한 경과", "목록:", "발신: 국회 총괄 담당"]:
            self.assertIn(phrase, self.result["text"])


if __name__ == "__main__":
    unittest.main()
