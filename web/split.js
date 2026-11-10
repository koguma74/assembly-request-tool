(function setupSplitter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RequestSplitter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSplitter() {
  "use strict";

  const FIELDS = [
    "파일명",
    "위원회",
    "의원",
    "제출기한",
    "문항번호",
    "요구내용",
    "세부항목",
    "비고",
  ];
  const HEADER_RE = /^(\S+위원회)\s+(\S+)\s+의원실\s+자료요구서$/;
  const DEADLINE_RE = /제출기한:\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./;
  const ITEM_RE = /^(\d+)\.\s*(.*)$/;
  const SUBITEM_RE = /^([가나])\.\s*(.*)$/;
  const EXPECTED_COUNT_RE = /_(\d+)문항\.pdf$/i;

  function cleanLine(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function joinToTarget(parts, index, text) {
    const cleaned = cleanLine(text);
    if (!cleaned) return;
    if (index === null) {
      if (parts.length) parts[parts.length - 1] += ` ${cleaned}`;
      else parts.push(cleaned);
    } else if (parts[index]) {
      parts[index] += ` ${cleaned}`;
    }
  }

  function parseLines(rawLines, fileName) {
    const lines = rawLines.map(cleanLine).filter(Boolean);
    let committee = "";
    let member = "";
    let deadline = "";

    for (const line of lines) {
      const headerMatch = line.match(HEADER_RE);
      if (headerMatch) [, committee, member] = headerMatch;
      const deadlineMatch = line.match(DEADLINE_RE);
      if (deadlineMatch) {
        deadline = `${deadlineMatch[1]}-${String(deadlineMatch[2]).padStart(2, "0")}-${String(deadlineMatch[3]).padStart(2, "0")}`;
      }
    }

    if (!committee || !member) {
      throw new Error(`머리말에서 위원회·의원을 찾지 못했습니다: ${fileName}`);
    }
    if (!deadline) {
      throw new Error(`제출기한을 찾지 못했습니다: ${fileName}`);
    }

    const parsed = [];
    let current = null;
    let target = null;

    for (const line of lines) {
      if (HEADER_RE.test(line)) continue;
      if (
        line.startsWith("수신:") ||
        line.startsWith("담당 보좌관:") ||
        line === "끝."
      ) {
        continue;
      }

      const itemMatch = line.match(ITEM_RE);
      if (itemMatch) {
        current = {
          파일명: fileName,
          위원회: committee,
          의원: member,
          제출기한: deadline,
          문항번호: itemMatch[1],
          요구내용_parts: [cleanLine(itemMatch[2])],
          세부항목_parts: [],
          비고_parts: [],
        };
        parsed.push(current);
        target = ["요구내용_parts", 0];
        continue;
      }

      if (!current) continue;
      const subitemMatch = line.match(SUBITEM_RE);
      if (subitemMatch) {
        current.세부항목_parts.push(
          `${subitemMatch[1]}. ${cleanLine(subitemMatch[2])}`,
        );
        target = ["세부항목_parts", current.세부항목_parts.length - 1];
        continue;
      }
      if (line.startsWith("※")) {
        current.비고_parts.push(cleanLine(line.replace(/^※\s*/, "")));
        target = ["비고_parts", current.비고_parts.length - 1];
        continue;
      }
      if (target) joinToTarget(current[target[0]], target[1], line);
    }

    return parsed.map((item) => ({
      파일명: item.파일명,
      위원회: item.위원회,
      의원: item.의원,
      제출기한: item.제출기한,
      문항번호: item.문항번호,
      요구내용: item.요구내용_parts.join(" "),
      세부항목: item.세부항목_parts.join(" / "),
      비고: item.비고_parts.join(" / "),
    }));
  }

  function textItemsToLines(items) {
    const lines = [];
    let pieces = [];
    let currentY = null;
    let previousEndX = null;
    let previousFontSize = 10;

    function flush() {
      const line = cleanLine(pieces.join(""));
      if (line) lines.push(line);
      pieces = [];
      currentY = null;
      previousEndX = null;
    }

    for (const item of items) {
      if (!Object.prototype.hasOwnProperty.call(item, "str")) continue;
      const text = String(item.str || "");
      const transform = item.transform || [];
      const x = Number(transform[4]);
      const y = Number(transform[5]);
      const fontSize = Math.max(Math.abs(Number(transform[0])) || 10, 1);

      if (currentY !== null && Number.isFinite(y) && Math.abs(y - currentY) > 2) {
        flush();
      }
      if (currentY === null && Number.isFinite(y)) currentY = y;

      if (text) {
        const gap = Number.isFinite(previousEndX) && Number.isFinite(x)
          ? x - previousEndX
          : 0;
        const needsSpace =
          pieces.length > 0 &&
          !/\s$/.test(pieces[pieces.length - 1]) &&
          !/^\s/.test(text) &&
          gap > Math.min(previousFontSize, fontSize) * 0.16;
        if (needsSpace) pieces.push(" ");
        pieces.push(text);
        previousEndX = Number.isFinite(x)
          ? x + (Number(item.width) || text.length * fontSize * 0.5)
          : null;
        previousFontSize = fontSize;
      }
      if (item.hasEOL) flush();
    }
    flush();
    return lines;
  }

  function validate(fileName, rows) {
    const countMatch = fileName.match(EXPECTED_COUNT_RE);
    if (!countMatch) {
      throw new Error(`파일명에서 문항 수를 찾지 못했습니다: ${fileName}`);
    }
    const expected = Number(countMatch[1]);
    const numbers = rows.map((row) => Number(row.문항번호));
    const consecutive = numbers.every((number, index) => number === index + 1);
    const last = numbers.at(-1) || 0;
    const matched = rows.length === expected && last === expected && consecutive;
    return {
      파일명: fileName,
      파일명의문항수: expected,
      뽑은문항수: rows.length,
      마지막번호: last,
      번호연속: consecutive,
      일치: matched,
    };
  }

  async function parsePdfData(data, fileName, pdfjsLib) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(data) });
    const document = await loadingTask.promise;
    const lines = [];
    try {
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        lines.push(...textItemsToLines(content.items));
      }
    } finally {
      await loadingTask.destroy();
    }
    const rows = parseLines(lines, fileName);
    const result = validate(fileName, rows);
    if (!result.일치) {
      throw new Error(
        `${fileName}: 파일명 ${result.파일명의문항수}문항과 추출 ${result.뽑은문항수}문항이 일치하지 않습니다.`,
      );
    }
    return { rows, validation: result };
  }

  async function parsePdfFiles(files, pdfjsLib, onProgress = () => {}) {
    const allRows = [];
    const validations = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      onProgress({ current: index, total: files.length, fileName: file.name });
      const result = await parsePdfData(await file.arrayBuffer(), file.name, pdfjsLib);
      allRows.push(...result.rows);
      validations.push(result.validation);
      onProgress({ current: index + 1, total: files.length, fileName: file.name });
    }
    return { rows: allRows, validations };
  }

  return {
    FIELDS,
    cleanLine,
    parseLines,
    parsePdfData,
    parsePdfFiles,
    textItemsToLines,
    validate,
  };
});
