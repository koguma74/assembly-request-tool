(function setupCommon(root) {
  "use strict";

  const STORAGE_KEY = "assembly-request-cases-v1";
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

  function readCases() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) return saved;
      if (saved && Array.isArray(saved.cases)) return saved.cases;
      return [];
    } catch (error) {
      console.error("저장 자료를 읽지 못했습니다.", error);
      return [];
    }
  }

  function saveCases(cases) {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      cases,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent("cases:changed", { detail: cases }));
    return cases;
  }

  function makeCaseId(row) {
    return `${row.파일명}::${String(row.문항번호).padStart(3, "0")}`;
  }

  function objectsFromFile(file) {
    return file.text().then(csvToObjects);
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
    initRevealEffects();
    initRipple();
  });

  root.AppCommon = {
    STORAGE_KEY,
    countStatuses,
    csvToObjects,
    fetchText,
    formatDateTime,
    loadReferenceData,
    makeCaseId,
    objectsFromFile,
    parseCsv,
    readCases,
    saveCases,
    toast,
  };
})(window);
