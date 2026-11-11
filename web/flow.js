(function setupFlow(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Flow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFlow() {
  "use strict";

  const CASE_FIELDS = [
    "id", "파일명", "위원회", "의원", "제출기한", "문항번호", "요구내용",
    "세부항목", "비고", "상태", "주관과", "협조과", "확정방법", "후보",
    "과별회신", "재배정", "보완", "확정코멘트", "일시", "log",
  ];
  const REQUIRED_RECEIPT_FIELDS = [
    "id", "파일명", "위원회", "의원", "문항번호", "요구내용",
  ];
  const ASSIGNMENT_METHODS = new Set(["규칙", "AI", "수정"]);
  const SENSITIVE_KEY_RE = /^(이름|성명|연락처|전화번호|휴대전화|휴대폰|이메일|전자우편|주민등록번호|주소|담당자|담당자명)$/;

  class FlowError extends Error {
    constructor(status, message) {
      super(message);
      this.name = "FlowError";
      this.status = status;
    }
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value) {
    return String(value ?? "").trim();
  }

  function stripSensitive(value) {
    if (Array.isArray(value)) return value.map(stripSensitive);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !SENSITIVE_KEY_RE.test(key.trim()))
        .map(([key, item]) => [key, stripSensitive(item)]),
    );
  }

  function sanitizeLog(value) {
    if (!Array.isArray(value)) return [];
    const allowed = new Set([
      "일시", "작업", "문항", "과", "주관과", "협조과", "확정방법",
      "사유", "희망과", "확정코멘트", "상태",
    ]);
    return value.map((entry) =>
      Object.fromEntries(
        Object.entries(stripSensitive(entry || {})).filter(([key]) => allowed.has(key)),
      ),
    );
  }

  function sanitizeCase(value) {
    const source = stripSensitive(value || {});
    const item = Object.fromEntries(
      CASE_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(source, key))
        .map((key) => [key, clone(source[key])]),
    );
    item.id = cleanText(item.id);
    item.협조과 = Array.isArray(item.협조과)
      ? [...new Set(item.협조과.map(cleanText).filter(Boolean))]
      : [];
    item.후보 = Array.isArray(item.후보)
      ? item.후보.map((candidate) =>
          typeof candidate === "string" ? { 과: cleanText(candidate) } : stripSensitive(candidate),
        )
      : [];
    item.과별회신 = Array.isArray(item.과별회신)
      ? item.과별회신.map(stripSensitive)
      : [];
    item.재배정 = Array.isArray(item.재배정) ? item.재배정.map(stripSensitive) : [];
    item.보완 = Array.isArray(item.보완) ? item.보완.map(stripSensitive) : [];
    item.log = sanitizeLog(item.log);
    return item;
  }

  function createEmptyDb() {
    return { version: 0, updatedAt: "", cases: [], log: [] };
  }

  function normalizeDb(value) {
    const source = Array.isArray(value) ? { cases: value } : value || {};
    return {
      version: Number.isFinite(Number(source.version)) ? Number(source.version) : 0,
      updatedAt: cleanText(source.updatedAt),
      cases: Array.isArray(source.cases) ? source.cases.map(sanitizeCase) : [],
      log: sanitizeLog(source.log),
    };
  }

  function organizationDepartments(organization) {
    const rows = Array.isArray(organization)
      ? organization
      : Array.isArray(organization?.departments) ? organization.departments : [];
    const departments = rows
      .map((row) => cleanText(typeof row === "string" ? row : row?.과))
      .filter(Boolean);
    const uniqueDepartments = new Set(departments);
    if (uniqueDepartments.size !== 26) {
      throw new FlowError(500, "조직도에서 서로 다른 26개 과를 확인하지 못했습니다.");
    }
    return uniqueDepartments;
  }

  function requireText(value, label) {
    const text = cleanText(value);
    if (!text) throw new FlowError(400, `${label} 값이 필요합니다.`);
    return text;
  }

  function requireDepartment(value, label, departments) {
    const department = requireText(value, label);
    if (!departments.has(department)) {
      throw new FlowError(400, `${department}은(는) 조직도에 없는 과입니다.`);
    }
    return department;
  }

  function requireCase(db, id) {
    const cleanId = requireText(id, "id");
    const item = db.cases.find((candidate) => candidate.id === cleanId);
    if (!item) throw new FlowError(404, `${cleanId} 문항을 찾지 못했습니다.`);
    return item;
  }

  function requireState(item, allowed, action) {
    if (!allowed.includes(item.상태)) {
      throw new FlowError(
        409,
        `${item.상태 || "상태 없음"} 단계에서는 ${action} 작업을 할 수 없습니다.`,
      );
    }
  }

  function appendLog(db, item, entry) {
    const logEntry = stripSensitive({
      일시: entry.일시,
      작업: entry.작업,
      문항: item.id,
      상태: item.상태,
      ...(entry.과 ? { 과: entry.과 } : {}),
      ...(entry.주관과 ? { 주관과: entry.주관과 } : {}),
      ...(entry.협조과 ? { 협조과: clone(entry.협조과) } : {}),
      ...(entry.확정방법 ? { 확정방법: entry.확정방법 } : {}),
      ...(entry.사유 ? { 사유: entry.사유 } : {}),
      ...(entry.희망과 ? { 희망과: entry.희망과 } : {}),
      ...(entry.확정코멘트 ? { 확정코멘트: entry.확정코멘트 } : {}),
    });
    item.log = [...(item.log || []), logEntry];
    db.log = [...(db.log || []), logEntry];
  }

  function applyReceipt(db, request, departments, now) {
    const source = request.문항 && typeof request.문항 === "object" ? request.문항 : request;
    const item = sanitizeCase(source);
    for (const field of REQUIRED_RECEIPT_FIELDS) requireText(item[field], field);
    if (db.cases.some((candidate) => candidate.id === item.id)) {
      throw new FlowError(409, `${item.id} 문항은 이미 접수되어 있습니다.`);
    }
    if (cleanText(item.주관과)) requireDepartment(item.주관과, "주관과", departments);
    item.후보.forEach((candidate) => {
      if (cleanText(candidate?.과)) requireDepartment(candidate.과, "후보 과", departments);
    });
    item.상태 = "접수";
    item.주관과 = cleanText(item.주관과);
    item.협조과 = [];
    item.확정방법 = "";
    item.과별회신 = [];
    item.재배정 = [];
    item.보완 = [];
    item.확정코멘트 = "";
    item.일시 = now;
    item.log = [];
    db.cases.push(item);
    appendLog(db, item, { 일시: now, 작업: "접수" });
  }

  function applyAssignment(db, request, departments, now) {
    const item = requireCase(db, request.id);
    requireState(item, ["접수", "재배정요청", "배분확정"], "배분");
    const primary = requireDepartment(request.주관과, "주관과", departments);
    const collaboration = Array.isArray(request.협조과) ? request.협조과 : [];
    const collaborators = [...new Set(collaboration.map(cleanText).filter(Boolean))];
    collaborators.forEach((department) => requireDepartment(department, "협조과", departments));
    if (collaborators.includes(primary)) {
      throw new FlowError(400, "주관과를 협조과에 함께 지정할 수 없습니다.");
    }
    const method = requireText(request.확정방법, "확정방법");
    if (!ASSIGNMENT_METHODS.has(method)) {
      throw new FlowError(400, "확정방법은 규칙, AI, 수정 중 하나여야 합니다.");
    }
    const candidates = Array.isArray(request.후보) ? request.후보 : item.후보 || [];
    candidates.forEach((candidate) => {
      const department = typeof candidate === "string" ? candidate : candidate?.과;
      if (cleanText(department)) requireDepartment(department, "후보 과", departments);
    });
    const assignmentChanged = item.주관과 !== primary ||
      JSON.stringify(item.협조과 || []) !== JSON.stringify(collaborators);
    if (assignmentChanged && item.과별회신?.length) item.과별회신 = [];
    item.상태 = "배분확정";
    item.주관과 = primary;
    item.협조과 = collaborators;
    item.확정방법 = method;
    item.후보 = candidates.map((candidate) =>
      typeof candidate === "string" ? { 과: candidate } : stripSensitive(candidate),
    );
    item.일시 = now;
    appendLog(db, item, {
      일시: now, 작업: "배분", 주관과: primary, 협조과: collaborators, 확정방법: method,
    });
  }

  function assignedDepartments(item) {
    return [item.주관과, ...(item.협조과 || [])].filter(Boolean);
  }

  function applyReply(db, request, departments, now) {
    const item = requireCase(db, request.id);
    requireState(item, ["배분확정", "회신중", "보완요청"], "회신");
    const department = requireDepartment(request.과, "과", departments);
    const assigned = assignedDepartments(item);
    if (!assigned.includes(department)) {
      throw new FlowError(403, `${department}은(는) 이 문항의 담당 과가 아닙니다.`);
    }
    const previousIndex = item.과별회신.findIndex((candidate) => candidate.과 === department);
    if (previousIndex >= 0 && item.상태 !== "보완요청") {
      throw new FlowError(409, `${department} 회신은 이미 저장되었습니다. 수정이 필요하면 보완요청 이력을 남기세요.`);
    }
    if (item.상태 === "보완요청") {
      const pending = [...item.보완].reverse().find((entry) => !entry.완료일시);
      if (!pending || pending.과 !== department) {
        throw new FlowError(403, `${department}은(는) 이번 보완요청의 대상 과가 아닙니다.`);
      }
      pending.완료일시 = now;
    }
    const reply = stripSensitive({
      과: department,
      파일명: cleanText(request.파일명),
      요구표시: cleanText(request.요구표시),
      머리글: Array.isArray(request.머리글) ? request.머리글.map(cleanText) : [],
      행: Array.isArray(request.행) ? request.행 : [],
      메모: cleanText(request.메모),
      확인필요: Array.isArray(request.확인필요) ? request.확인필요 : [],
      일시: now,
    });
    if (previousIndex >= 0) item.과별회신[previousIndex] = reply;
    else item.과별회신.push(reply);
    const replied = new Set(item.과별회신.map((candidate) => candidate.과));
    item.상태 = assigned.every((candidate) => replied.has(candidate)) ? "회신완료" : "회신중";
    item.일시 = now;
    appendLog(db, item, { 일시: now, 작업: "회신", 과: department });
  }

  function applyReassignmentRequest(db, request, departments, now) {
    const item = requireCase(db, request.id);
    requireState(item, ["배분확정", "회신중"], "재배정요청");
    const department = requireDepartment(request.과, "과", departments);
    if (!assignedDepartments(item).includes(department)) {
      throw new FlowError(403, `${department}은(는) 이 문항의 담당 과가 아닙니다.`);
    }
    const reason = requireText(request.사유, "재배정 사유");
    const preferred = cleanText(request.희망과);
    if (preferred) requireDepartment(preferred, "희망과", departments);
    item.재배정.push(stripSensitive({
      일시: now,
      과: department,
      사유: reason,
      희망과: preferred,
      이전주관과: item.주관과,
      이전협조과: clone(item.협조과),
      기존회신: clone(item.과별회신),
    }));
    item.상태 = "재배정요청";
    item.일시 = now;
    appendLog(db, item, {
      일시: now, 작업: "재배정요청", 과: department, 사유: reason, 희망과: preferred,
    });
  }

  function applySupplementRequest(db, request, departments, now) {
    const item = requireCase(db, request.id);
    requireState(item, ["회신중", "회신완료"], "보완요청");
    const department = requireDepartment(request.과, "과", departments);
    if (!assignedDepartments(item).includes(department) ||
        !item.과별회신.some((reply) => reply.과 === department)) {
      throw new FlowError(403, `${department}은(는) 보완을 요청할 회신 과가 아닙니다.`);
    }
    const reason = requireText(request.사유, "보완 사유");
    item.보완.push(stripSensitive({
      일시: now, 과: department, 사유: reason,
      기존회신: clone(item.과별회신.find((reply) => reply.과 === department)),
    }));
    item.상태 = "보완요청";
    item.일시 = now;
    appendLog(db, item, { 일시: now, 작업: "보완요청", 과: department, 사유: reason });
  }

  function applyConfirmation(db, request, now) {
    const item = requireCase(db, request.id);
    requireState(item, ["회신완료"], "확정");
    const comment = requireText(request.확정코멘트, "확정 코멘트");
    item.확정코멘트 = comment;
    item.상태 = "확정";
    item.일시 = now;
    appendLog(db, item, { 일시: now, 작업: "확정", 확정코멘트: comment });
  }

  function apply(value, request, organization) {
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new FlowError(400, "JSON 요청 객체가 필요합니다.");
    }
    const action = requireText(request.작업, "작업");
    const departments = organizationDepartments(organization);
    const db = normalizeDb(value);
    const now = new Date().toISOString();
    if (action === "접수") applyReceipt(db, request, departments, now);
    else if (action === "배분") applyAssignment(db, request, departments, now);
    else if (action === "회신") applyReply(db, request, departments, now);
    else if (action === "재배정요청") applyReassignmentRequest(db, request, departments, now);
    else if (action === "보완요청") applySupplementRequest(db, request, departments, now);
    else if (action === "확정") applyConfirmation(db, request, now);
    else {
      throw new FlowError(
        400,
        `${action} 작업은 이 저장 흐름에서 지원하지 않습니다. AI추천은 서버 API를 사용합니다.`,
      );
    }
    db.version += 1;
    db.updatedAt = now;
    return db;
  }

  return { FlowError, apply, createEmptyDb, normalizeDb, sanitizeCase };
});
