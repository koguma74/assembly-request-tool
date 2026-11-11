(function initializeEngine(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory({
      papa: require("./lib/papaparse.min.js"),
      readText(filePath) {
        return require("node:fs").readFileSync(filePath, "utf8");
      },
      resolveDefaultPaths() {
        const path = require("node:path");
        return {
          rules: path.join(
            __dirname,
            "..",
            "rules_보강.csv",
          ),
          organization: path.join(
            __dirname,
            "..",
            "data",
            "A부_조직도_26개과.csv",
          ),
        };
      },
    });
  } else {
    const api = factory({ papa: root.Papa });
    root.AllocationEngine = api;
    root.classify = api.classify;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createEngine(nodeIo) {
  "use strict";

  nodeIo ||= {};

  let activeClassifier = null;

  function parseCsv(text) {
    if (!nodeIo.papa?.parse) {
      throw new Error("Papa Parse를 불러오지 못했습니다.");
    }
    const result = nodeIo.papa.parse(String(text).replace(/^\uFEFF/, ""), {
      delimiter: ",",
      dynamicTyping: false,
      skipEmptyLines: false,
    });
    const quoteError = result.errors.find((error) => error.code === "MissingQuotes");
    if (quoteError) {
      throw new Error(`CSV 인용부호를 확인하세요: ${quoteError.message}`);
    }
    return result.data.map((row) => row.map((value) => String(value ?? "")));
  }

  function csvToObjects(text) {
    const [headers, ...rows] = parseCsv(text);
    if (!headers) return [];

    return rows
      .filter((row) => row.some((value) => value.trim() !== ""))
      .map((row) =>
        Object.fromEntries(
          headers.map((header, index) => [header.trim(), row[index] || ""]),
        ),
      );
  }

  function requireColumns(rows, columns, name) {
    if (rows.length === 0) {
      throw new Error(`${name} CSV에 데이터가 없습니다.`);
    }

    for (const column of columns) {
      if (!Object.prototype.hasOwnProperty.call(rows[0], column)) {
        throw new Error(`${name} CSV에 필수 열이 없습니다: ${column}`);
      }
    }
  }

  function createClassifier(rulesCsvText, organizationCsvText) {
    const rules = csvToObjects(rulesCsvText);
    const organization = csvToObjects(organizationCsvText);

    requireColumns(
      rules,
      ["과", "키워드", "제외어", "우선순위"],
      "배분기준표",
    );
    requireColumns(organization, ["과"], "조직도");

    const allowedDepartments = new Set(
      organization.map((item) => item.과.trim()).filter(Boolean),
    );
    const preparedRules = rules.map((rule, sourceIndex) => ({
      department: rule.과.trim(),
      keyword: rule.키워드.trim(),
      normalizedKeyword: rule.키워드.trim().toLocaleLowerCase(),
      exclusions: rule.제외어
        .split("|")
        .map((word) => word.trim().toLocaleLowerCase())
        .filter(Boolean),
      priority: Number(rule.우선순위),
      sourceIndex,
    }));

    for (const rule of preparedRules) {
      if (!rule.department || !rule.keyword || !Number.isFinite(rule.priority)) {
        throw new Error("배분기준표에 과·키워드·우선순위가 올바르지 않은 행이 있습니다.");
      }
    }

    return function classifyWithLoadedData(requestText) {
      const normalizedRequest = String(requestText || "").toLocaleLowerCase();
      if (!normalizedRequest.trim()) return [];

      const bestByDepartment = new Map();

      for (const rule of preparedRules) {
        if (!allowedDepartments.has(rule.department)) continue;
        if (!normalizedRequest.includes(rule.normalizedKeyword)) continue;
        if (rule.exclusions.some((word) => normalizedRequest.includes(word))) continue;

        const score = rule.priority + Array.from(rule.keyword).length / 10;
        const candidate = {
          과: rule.department,
          점수: score,
          근거키워드: rule.keyword,
          sourceIndex: rule.sourceIndex,
        };
        const previous = bestByDepartment.get(rule.department);

        if (
          !previous ||
          candidate.점수 > previous.점수 ||
          (candidate.점수 === previous.점수 &&
            candidate.sourceIndex < previous.sourceIndex)
        ) {
          bestByDepartment.set(rule.department, candidate);
        }
      }

      return [...bestByDepartment.values()]
        .sort(
          (left, right) =>
            right.점수 - left.점수 || left.sourceIndex - right.sourceIndex,
        )
        .slice(0, 3)
        .map(({ 과, 점수, 근거키워드 }) => ({ 과, 점수, 근거키워드 }));
    };
  }

  function classify(requestText) {
    if (!activeClassifier) {
      throw new Error(
        "배분기준표가 준비되지 않았습니다. 브라우저에서는 먼저 AllocationEngine.initialize()를 호출하세요.",
      );
    }
    return activeClassifier(requestText);
  }

  async function initialize(options = {}) {
    const rulesUrl =
      options.rulesUrl || "../data/배분기준표_소관키워드_304건.csv";
    const organizationUrl =
      options.organizationUrl || "../data/A부_조직도_26개과.csv";

    const [rulesResponse, organizationResponse] = await Promise.all([
      fetch(rulesUrl),
      fetch(organizationUrl),
    ]);

    if (!rulesResponse.ok) {
      throw new Error(`배분기준표를 읽지 못했습니다: ${rulesResponse.status}`);
    }
    if (!organizationResponse.ok) {
      throw new Error(`조직도를 읽지 못했습니다: ${organizationResponse.status}`);
    }

    activeClassifier = createClassifier(
      await rulesResponse.text(),
      await organizationResponse.text(),
    );
    return api;
  }

  const api = { classify, initialize, createClassifier, parseCsv };

  if (nodeIo.resolveDefaultPaths && nodeIo.readText) {
    const paths = nodeIo.resolveDefaultPaths();
    activeClassifier = createClassifier(
      nodeIo.readText(paths.rules),
      nodeIo.readText(paths.organization),
    );
  }

  return api;
});
