"use strict";

const Flow = require("../web/flow.js");
const organization = require("./org.json");

const BLOB_PATH = "cases.json";

function blobTokenOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { token } : {};
}

function createBlobRepository(loadBlob = () => import("@vercel/blob")) {
  return {
    async read() {
      const { get } = await loadBlob();
      const result = await get(BLOB_PATH, {
        access: "private",
        ...blobTokenOptions(),
      });
      if (!result) return Flow.createEmptyDb();
      const text = await new Response(result.stream).text();
      return Flow.normalizeDb(JSON.parse(text));
    },

    async write(db) {
      const { put } = await loadBlob();
      await put(BLOB_PATH, JSON.stringify(db, null, 2), {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        contentType: "application/json",
        ...blobTokenOptions(),
      });
      return db;
    },
  };
}

async function parseRequestBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString("utf8"));
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, status, value) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function recommendWithAi(content, org, fetchOpenAI) {
  const departments = [...new Set(org.map((row) => String(row?.과 || "").trim()).filter(Boolean))];
  if (departments.length !== 26) throw new Error("조직도 26개 과를 확인하지 못했습니다.");
  const response = await fetchOpenAI("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `당신은 국회 요구자료의 소관 과 후보만 추천합니다. 다음 조직도 과 목록에서 최대 3개를 고르고, 각 과마다 요구내용에 근거한 한국어 한 문장을 적으세요. 적합한 과가 없으면 후보는 빈 배열, 해당없음은 true로 답하세요. 반드시 JSON 객체 {"후보":[{"과":"...","근거":"..."}],"해당없음":false} 형식으로만 답하세요. 과 목록: ${JSON.stringify(departments)}`,
        },
        { role: "user", content },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI 요청 실패 (${response.status})`);
  const completion = await response.json();
  const answer = JSON.parse(completion?.choices?.[0]?.message?.content || "{}");
  const allowed = new Set(departments);
  const seen = new Set();
  const candidates = [];
  for (const candidate of Array.isArray(answer?.후보) ? answer.후보 : []) {
    if (!candidate || !allowed.has(candidate.과) || seen.has(candidate.과) ||
        typeof candidate.근거 !== "string" || !candidate.근거.trim()) continue;
    seen.add(candidate.과);
    candidates.push({ 과: candidate.과, 근거: candidate.근거.trim() });
    if (candidates.length === 3) break;
  }
  return { 후보: candidates, 해당없음: candidates.length === 0 };
}

function createHandler({ repository = createBlobRepository(), org = organization, fetchOpenAI = fetch } = {}) {
  return async function handler(request, response) {
    try {
      if (request.method === "GET") return sendJson(response, 200, await repository.read());
      if (request.method !== "POST") {
        response.setHeader("Allow", "GET, POST");
        return sendJson(response, 405, { error: "GET과 POST만 사용할 수 있습니다." });
      }

      let body;
      try {
        body = await parseRequestBody(request);
      } catch (_error) {
        return sendJson(response, 400, { error: "올바른 JSON 요청이 아닙니다." });
      }
      if (body?.작업 === "AI추천") {
        if (typeof body.요구내용 !== "string" || !body.요구내용.trim()) {
          return sendJson(response, 400, { error: "요구내용을 입력하세요." });
        }
        if (!process.env.OPENAI_API_KEY) {
          return sendJson(response, 500, { error: "OPENAI_API_KEY 환경변수가 없습니다. 서버 설정에서 키를 등록하세요." });
        }
        try {
          return sendJson(response, 200, await recommendWithAi(body.요구내용.trim(), org, fetchOpenAI));
        } catch (error) {
          console.error("AI 추천 요청 실패:", error);
          return sendJson(response, 502, { error: "AI 추천을 받지 못했습니다. 잠시 후 다시 시도하세요." });
        }
      }
      const currentDb = await repository.read();
      const nextDb = Flow.apply(currentDb, body, org);
      await repository.write(nextDb);
      const item = nextDb.cases.find((candidate) => candidate.id === body.id) ||
        nextDb.cases[nextDb.cases.length - 1];
      return sendJson(response, 200, {
        ok: true,
        상태: item?.상태 || "",
        version: nextDb.version,
      });
    } catch (error) {
      const status = error instanceof Flow.FlowError ? error.status : 500;
      if (status === 500) console.error(error);
      return sendJson(response, status, {
        error: status === 500 ? "서버 저장 처리 중 오류가 발생했습니다." : error.message,
      });
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createBlobRepository = createBlobRepository;
module.exports.createHandler = createHandler;
