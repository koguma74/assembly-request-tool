(function setupCommon(root) {
  "use strict";

  const STORAGE_KEY = "assembly-request-cases-v1";
  const USE_SERVER = window.location.hostname.endsWith(".vercel.app");
  const API_URL = "/api/app";
  let activeDb = null;
  let historyRows = null;
  const REDUCE_MOTION = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  function parseCsv(text) {
    if (root.AllocationEngine?.parseCsv) {
      return root.AllocationEngine.parseCsv(text);
    }
    throw new Error("CSV 처리 기능을 불러오지 못했습니다.");
  }

  function rowsToObjects(rows) {
    const [headers, ...body] = rows;
    if (!headers) return [];
    return body
      .filter((row) => row.some((value) => value.trim() !== ""))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header.trim(), row[index] || ""]),
        ),
      );
  }

  function csvToObjects(text) {
    return rowsToObjects(parseCsv(String(text).replace(/^\uFEFF/, "")));
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`${url} 자료를 읽지 못했습니다 (${response.status}).`);
    }
    return response.text();
  }

  async function loadReferenceData() {
    const [rulesText, organizationText] = await Promise.all([
      fetchText("./data/rules_보강.csv"),
      fetchText("./data/A부_조직도_26개과.csv"),
    ]);
    const organization = csvToObjects(organizationText);
    const departments = organization.map((item) => item.과.trim()).filter(Boolean);

    if (departments.length !== 26 || new Set(departments).size !== 26) {
      throw new Error("조직도에서 서로 다른 26개 과를 확인하지 못했습니다.");
    }

    return {
      departments,
      organization,
      classify: root.AllocationEngine.createClassifier(rulesText, organizationText),
    };
  }

  function emptyDb() {
    return { version: 0, updatedAt: "", cases: [], log: [] };
  }

  function normalizeDb(value) {
    if (root.Flow?.normalizeDb) return root.Flow.normalizeDb(value);
    if (Array.isArray(value)) return { ...emptyDb(), cases: value };
    if (value && Array.isArray(value.cases)) return value;
    return emptyDb();
  }

  function readLocalDb() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return normalizeDb(saved);
    } catch (error) {
      console.error("저장 자료를 읽지 못했습니다.", error);
      return emptyDb();
    }
  }

  function readDb() {
    if (!activeDb) activeDb = USE_SERVER ? emptyDb() : readLocalDb();
    return normalizeDb(activeDb);
  }

  function saveDb(db) {
    const payload = {
      version: Number(db?.version) || 0,
      updatedAt: db?.updatedAt || new Date().toISOString(),
      cases: Array.isArray(db?.cases) ? db.cases : [],
      log: Array.isArray(db?.log) ? db.log : [],
    };
    activeDb = normalizeDb(payload);
    if (!USE_SERVER) localStorage.setItem(STORAGE_KEY, JSON.stringify(activeDb));
    window.dispatchEvent(new CustomEvent("cases:changed", { detail: payload.cases }));
    return activeDb;
  }

  async function responseJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `서버 요청에 실패했습니다 (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function loadDb() {
    if (!USE_SERVER) {
      activeDb = readLocalDb();
    } else {
      activeDb = normalizeDb(await responseJson(await fetch(API_URL, { cache: "no-store" })));
    }
    window.dispatchEvent(new CustomEvent("cases:changed", { detail: activeDb.cases }));
    return readDb();
  }

  async function applyRequest(request, organization) {
    if (!USE_SERVER) return saveDb(root.Flow.apply(readDb(), request, organization));
    await responseJson(await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }));
    return loadDb();
  }

  function readCases() {
    return readDb().cases;
  }

  function saveCases(cases) {
    const db = readDb();
    db.cases = cases;
    db.version += 1;
    db.updatedAt = new Date().toISOString();
    return saveDb(db).cases;
  }

  function makeCaseId(row) {
    return `${row.파일명}::${String(row.문항번호).padStart(3, "0")}`;
  }

  async function loadHistory() {
    if (historyRows) return historyRows;
    historyRows = csvToObjects(await fetchText("./data/접수대장.csv"));
    return historyRows;
  }

  function historyForCase(item, rows = historyRows || []) {
    const keyword = String(item?.후보?.[0]?.근거키워드 || "").trim();
    if (!keyword) return { keyword: "", count: 0, primary: "-", recent: [] };
    const lowered = keyword.toLocaleLowerCase("ko-KR");
    const matched = rows.filter((row) =>
      String(row.요구내용 || "").toLocaleLowerCase("ko-KR").includes(lowered),
    );
    const counts = new Map();
    matched.forEach((row) => {
      const department = String(row.배분과 || "").trim();
      if (department) counts.set(department, (counts.get(department) || 0) + 1);
    });
    const primary = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))[0]?.[0] || "-";
    const recent = [...matched]
      .sort((a, b) => String(b.접수일 || "").localeCompare(String(a.접수일 || "")))
      .slice(0, 5);
    return { keyword, count: matched.length, primary, recent };
  }

  async function objectsFromFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "csv") return csvToObjects(await file.text());
    if (!["xlsx", "xls"].includes(extension) || !root.XLSX) {
      throw new Error("CSV 또는 XLSX 파일을 선택하세요.");
    }
    const workbook = root.XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
    });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error("엑셀 파일에 읽을 시트가 없습니다.");
    return root.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
      defval: "",
      raw: false,
    });
  }

  function safeSpreadsheetValue(value) {
    const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  }

  function exportCasesWorkbook(cases = readCases()) {
    if (!root.XLSX) throw new Error("SheetJS를 불러오지 못했습니다.");
    if (!cases.length) throw new Error("내보낼 저장 문항이 없습니다.");
    const rows = cases.map((item) => ({
      상태: safeSpreadsheetValue(item.상태),
      위원회: safeSpreadsheetValue(item.위원회),
      의원: safeSpreadsheetValue(item.의원),
      제출기한: safeSpreadsheetValue(item.제출기한),
      문항번호: safeSpreadsheetValue(item.문항번호),
      요구내용: safeSpreadsheetValue(item.요구내용),
      세부항목: safeSpreadsheetValue(item.세부항목),
      비고: safeSpreadsheetValue(item.비고),
      주관과: safeSpreadsheetValue(item.주관과),
      협조과: safeSpreadsheetValue(item.협조과 || []),
      확정방법: safeSpreadsheetValue(item.확정방법),
      후보: safeSpreadsheetValue((item.후보 || []).map((candidate) => candidate.과)),
      최종일시: safeSpreadsheetValue(item.일시),
    }));
    const sheet = root.XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [10, 20, 10, 13, 10, 48, 42, 30, 18, 24, 12, 30, 22]
      .map((width) => ({ wch: width }));
    const workbook = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(workbook, sheet, "배분현황");
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    root.XLSX.writeFile(workbook, `요구자료_배분현황_${stamp}.xlsx`, {
      compression: true,
    });
  }

  function countStatuses(cases = readCases()) {
    const counts = {
      전체: cases.length,
      접수: 0,
      배분확정: 0,
      회신중: 0,
      회신완료: 0,
      확인필요: 0,
      확정: 0,
    };
    for (const item of cases) {
      if (Object.prototype.hasOwnProperty.call(counts, item.상태)) {
        counts[item.상태] += 1;
      }
      if (!item.후보?.length) counts.확인필요 += 1;
    }
    return counts;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function toast(message, tone = "info") {
    let region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      document.body.append(region);
    }
    const item = document.createElement("div");
    item.className = `toast toast--${tone}`;
    item.textContent = message;
    region.append(item);
    requestAnimationFrame(() => item.classList.add("toast--show"));
    window.setTimeout(() => {
      item.classList.remove("toast--show");
      window.setTimeout(() => item.remove(), 220);
    }, 3200);
  }

  function initNavigation() {
    const page = document.body.dataset.page;
    document.querySelectorAll("[data-nav]").forEach((link) => {
      if (link.dataset.nav === page) link.setAttribute("aria-current", "page");
    });
    document.querySelectorAll("[data-coming-soon]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        toast(`${button.textContent.trim()} 화면은 다음 단계에서 연결합니다.`);
      });
    });
  }

  function initStorageMode() {
    const banner = document.createElement("div");
    banner.className = `storage-mode storage-mode--${USE_SERVER ? "server" : "browser"}`;
    banner.textContent = USE_SERVER
      ? "저장 위치: Vercel 서버 · Blob"
      : "저장 위치: 이 브라우저";
    const header = document.querySelector(".app-header");
    if (header) header.insertAdjacentElement("afterend", banner);
    document.querySelectorAll("[data-storage-label]").forEach((element) => {
      element.textContent = USE_SERVER ? "Vercel 서버에 저장" : "이 브라우저에 저장";
    });
  }

  function revealNewContent(container) {
    const targets = container.matches?.("[data-reveal]")
      ? [container]
      : [...container.querySelectorAll("[data-reveal]")];
    requestAnimationFrame(() => targets.forEach((target) => {
      if (target.hasAttribute("data-stagger")) {
        [...target.children].forEach((child, index) => {
          child.style.transitionDelay = `${index * 70}ms`;
        });
      }
      target.classList.add("show");
    }));
  }

  function initRevealEffects() {
    const targets = [...document.querySelectorAll("[data-reveal]")];
    if (!targets.length) return;
    if (REDUCE_MOTION || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("show"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target.hasAttribute("data-stagger")) {
            [...entry.target.children].forEach((child, index) => {
              child.style.transitionDelay = `${index * 70}ms`;
            });
          }
          entry.target.classList.add("show");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.02 },
    );
    targets.forEach((target) => observer.observe(target));
  }

  function initRipple() {
    if (REDUCE_MOTION) return;
    document.addEventListener("pointerdown", (event) => {
      const button = event.target.closest(".button");
      if (!button || button.disabled) return;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.6;
      const ripple = document.createElement("span");
      ripple.className = "button__ripple";
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      button.append(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), {
        once: true,
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initStorageMode();
    initRevealEffects();
    initRipple();
  });

  root.AppCommon = {
    API_URL,
    STORAGE_KEY,
    USE_SERVER,
    applyRequest,
    countStatuses,
    csvToObjects,
    exportCasesWorkbook,
    fetchText,
    formatDateTime,
    historyForCase,
    loadDb,
    loadHistory,
    loadReferenceData,
    makeCaseId,
    objectsFromFile,
    parseCsv,
    readDb,
    readCases,
    revealNewContent,
    saveDb,
    saveCases,
    toast,
  };
})(window);
