"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function inlineScripts(file) {
  const html = fs.readFileSync(file, "utf8");
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].replace(/^\s*import[\s\S]*?;\s*$/gm, ""));
}

for (const name of ["index.html", "assign.html", "dept.html", "collect.html"]) {
  const scripts = inlineScripts(path.join(__dirname, "web", name));
  assert.ok(scripts.length, `${name}에 화면 스크립트가 있어야 합니다.`);
  scripts.forEach((script) => new AsyncFunction(script));
}

console.log("시작·배분·현업 회신·취합 화면 스크립트 문법 시험 통과");
