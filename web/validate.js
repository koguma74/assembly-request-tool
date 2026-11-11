(function setupValidation(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RequestValidation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createValidation() {
  "use strict";

  const REQUIRED_REPLY_COLUMNS = ["연도", "예산(천원)", "집행액(천원)", "비고"];
  const REQUIRED_REGISTER_COLUMNS = ["접수번호", "접수일", "문항번호", "요구내용", "배분과", "요구기간_시작", "요구기간_끝", "제출기한", "처리상태"];

  function clean(value) { return String(value ?? "").trim(); }
  function issue(type, location, message) { return { 유형: type, 위치: location, 내용: message }; }
  function numberValue(value) {
    const text = clean(value).replaceAll(",", "");
    return text && /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
  }

  function parseReplyRows(matrix) {
    if (!Array.isArray(matrix) || matrix.length < 2) {
      throw new Error("회신 파일은 1행 요구 표시와 2행 머리글이 필요합니다.");
    }
    const marker = clean(matrix[0]?.[0]);
    const headers = (matrix[1] || []).map(clean);
    if (!marker.startsWith("요구:")) throw new Error("1행에 '요구:' 표시가 필요합니다.");
    if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
      throw new Error("2행 머리글에 빈 열이나 중복 열이 있습니다.");
    }
    const missing = REQUIRED_REPLY_COLUMNS.filter((header) => !headers.includes(header));
    if (missing.length) throw new Error(`2행 머리글에 필요한 열이 없습니다: ${missing.join(", ")}`);
    const rows = matrix.slice(2)
      .map((values, index) => ({ values, index }))
      .filter(({ values }) => Array.isArray(values) && values.some((value) => clean(value)))
      .map(({ values, index }) => ({
        행번호: index + 3,
        ...Object.fromEntries(headers.map((header, column) => [header, String(values[column] ?? "")])),
      }));
    return { 요구표시: marker, 머리글: headers, 행: rows };
  }

  function validateReply(parsed, demand, asOfYear = new Date().getFullYear()) {
    const rows = parsed?.행 || [];
    const issues = [];
    const match = clean(demand).match(/최근\s*(\d+)\s*년/);
    if (match) {
      const count = Number(match[1]);
      if (count > 0 && count <= 100) {
        const present = new Set(rows.map((row) => Number(clean(row.연도))).filter(Number.isInteger));
        const missing = Array.from({ length: count }, (_, index) => asOfYear - count + 1 + index)
          .filter((year) => !present.has(year));
        if (missing.length) issues.push(issue("연도 누락", "회신", `${missing.join(", ")}년 행이 없습니다.`));
      }
    }
    const detail = rows.filter((row) => clean(row.연도) !== "합계");
    for (const row of detail) {
      const budget = numberValue(row["예산(천원)"]);
      const spent = numberValue(row["집행액(천원)"]);
      if (budget !== null && spent !== null && spent > budget && !clean(row.비고)) {
        issues.push(issue("초과 집행", `${row.행번호}행`, "집행액이 예산보다 크지만 비고에 사유가 없습니다."));
      }
    }
    const totals = rows.filter((row) => clean(row.연도) === "합계");
    const numericColumns = (parsed?.머리글 || []).filter((header) =>
      header !== "연도" && header !== "비고" && detail.some((row) => numberValue(row[header]) !== null));
    for (const total of totals) {
      for (const header of numericColumns) {
        const declared = numberValue(total[header]);
        if (declared === null) continue;
        const calculated = detail.reduce((sum, row) => sum + (numberValue(row[header]) || 0), 0);
        if (Math.abs(declared - calculated) > 0.000001) {
          issues.push(issue("합계 불일치", `${total.행번호}행 · ${header}`,
            `합계 행 ${declared}와 세부 행 합 ${calculated}가 다릅니다.`));
        }
      }
    }
    return issues;
  }

  function validDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }

  function periodValue(value) {
    const text = clean(value);
    if (/^\d{4}$/.test(text)) return Number(text);
    if (validDate(text)) return Number(text.replaceAll("-", ""));
    return null;
  }

  function validateRegister(rows, departments, today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  })()) {
    if (!Array.isArray(rows)) throw new Error("접수대장 행이 필요합니다.");
    const allowed = new Set(departments || []);
    const issues = [];
    const seenNumbers = new Map();
    const seenContents = new Map();
    rows.forEach((row, index) => {
      const place = `${index + 2}행`;
      for (const column of REQUIRED_REGISTER_COLUMNS) {
        if (!(column in row)) throw new Error(`접수대장에 ${column} 열이 없습니다.`);
      }
      for (const column of ["접수번호", "문항번호", "요구내용", "배분과"]) {
        if (!clean(row[column])) issues.push(issue(`${column} 누락`, place, `${column} 값이 없습니다.`));
      }
      const department = clean(row.배분과);
      if (department && !allowed.has(department)) {
        issues.push(issue("조직도 밖 과", place, `${department}은(는) 조직도에 없습니다.`));
      }
      const start = periodValue(row.요구기간_시작);
      const end = periodValue(row.요구기간_끝);
      if ((clean(row.요구기간_시작) && start === null) ||
          (clean(row.요구기간_끝) && end === null)) {
        issues.push(issue("요구기간 형식", place, "요구기간의 연도 또는 날짜 형식을 확인하세요."));
      } else if (start !== null && end !== null && start > end) {
        issues.push(issue("기간 역전", place, "요구기간 시작이 끝보다 늦습니다."));
      }
      for (const column of ["접수일", "제출기한"]) {
        if (!validDate(row[column])) issues.push(issue("날짜 형식", `${place} · ${column}`, `${column} 날짜가 올바르지 않습니다.`));
      }
      if (validDate(row.접수일) && validDate(row.제출기한) && row.제출기한 < row.접수일) {
        issues.push(issue("기한 역전", place, "제출기한이 접수일보다 빠릅니다."));
      }
      if (validDate(row.제출기한) && row.제출기한 < today &&
          !["제출완료", "확정"].includes(clean(row.처리상태))) {
        issues.push(issue("기한 경과", place, "제출기한이 지났지만 처리가 완료되지 않았습니다."));
      }
      if (String(row.처리상태 ?? "") !== clean(row.처리상태)) {
        issues.push(issue("상태 공백", place, "처리상태 앞뒤에 공백이 있습니다."));
      }
      for (const [column, seen, type] of [
        ["접수번호", seenNumbers, "중복 접수번호"],
        ["요구내용", seenContents, "중복 요구내용 후보"],
      ]) {
        const value = clean(row[column]);
        if (!value) continue;
        if (seen.has(value)) issues.push(issue(type, place, `${seen.get(value)}과(와) 같은 ${column}입니다. 실제 중복 여부를 확인하세요.`));
        else seen.set(value, place);
      }
    });
    return issues;
  }

  return { parseReplyRows, validateReply, validateRegister };
});
