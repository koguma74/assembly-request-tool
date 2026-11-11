"use strict";

const assert = require("node:assert/strict");
const { createHandler } = require("./api/app.js");
const organization = require("./api/org.json");

function createFakeRepository() {
  let db = { version: 0, updatedAt: "", cases: [], log: [] };
  let writes = 0;
  return {
    async read() { return structuredClone(db); },
    async write(nextDb) { db = structuredClone(nextDb); writes += 1; },
    snapshot() { return structuredClone(db); },
    writeCount() { return writes; },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = String(value); },
  };
}

async function request(handler, method, body) {
  const response = createResponse();
  await handler({ method, body }, response);
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : null };
}

async function run() {
  const repository = createFakeRepository();
  const handler = createHandler({ repository, org: organization });
  const results = [];
  const check = async (name, task) => { await task(); results.push({ 시험: name, 결과: "통과" }); };

  await check("GET 빈 cases.json", async () => {
    const response = await request(handler, "GET");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.cases, []);
  });

  await check("접수와 설계 밖 개인정보 제거", async () => {
    const response = await request(handler, "POST", {
      작업: "접수", id: "의원C-01", 파일명: "가상요구서.pdf",
      위원회: "행정안전위원회", 의원: "의원C", 제출기한: "2026-11-20",
      문항번호: "1", 요구내용: "디지털전환 사업 현황", 세부항목: "연도별 실적",
      비고: "개인정보 제외", 이름: "버려야 할 이름", 연락처: "010-0000-0000",
      임의필드: "저장 금지",
    });
    assert.equal(response.status, 200);
    const item = repository.snapshot().cases[0];
    assert.equal(item.상태, "접수");
    assert.equal("이름" in item, false);
    assert.equal("연락처" in item, false);
    assert.equal("임의필드" in item, false);
  });

  await check("조직도 밖 주관과 400", async () => {
    const response = await request(handler, "POST", {
      작업: "배분", id: "의원C-01", 주관과: "없는과", 협조과: [], 확정방법: "규칙",
    });
    assert.equal(response.status, 400);
    assert.equal(repository.snapshot().cases[0].상태, "접수");
  });

  await check("배분확정", async () => {
    const response = await request(handler, "POST", {
      작업: "배분", id: "의원C-01", 주관과: "디지털정책과",
      협조과: ["운영지원과"], 확정방법: "규칙", 후보: ["디지털정책과", "운영지원과"],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.상태, "배분확정");
  });

  await check("담당 아닌 과 회신 403", async () => {
    const response = await request(handler, "POST", {
      작업: "회신", id: "의원C-01", 과: "안전정책과", 파일명: "회신.xlsx", 행: [],
    });
    assert.equal(response.status, 403);
  });

  await check("일부 과 회신은 회신중", async () => {
    const response = await request(handler, "POST", {
      작업: "회신", id: "의원C-01", 과: "디지털정책과", 파일명: "주관과_회신.xlsx",
      행: [{ 연도: "2026", 항목: "사업", 연락처: "삭제" }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.상태, "회신중");
    assert.equal("연락처" in repository.snapshot().cases[0].과별회신[0].행[0], false);
  });

  await check("모든 과 회신은 회신완료", async () => {
    const response = await request(handler, "POST", {
      작업: "회신", id: "의원C-01", 과: "운영지원과", 파일명: "협조과_회신.xlsx",
      행: [{ 연도: "2026", 항목: "지원" }],
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.상태, "회신완료");
  });

  await check("순서에 맞지 않는 회신 409", async () => {
    const response = await request(handler, "POST", {
      작업: "회신", id: "의원C-01", 과: "디지털정책과", 파일명: "중복회신.xlsx", 행: [],
    });
    assert.equal(response.status, 409);
  });

  await request(handler, "POST", {
    작업: "접수", id: "의원C-02", 파일명: "가상요구서.pdf", 위원회: "행정안전위원회",
    의원: "의원C", 문항번호: "2", 요구내용: "안전정책 현황",
  });
  await request(handler, "POST", {
    작업: "배분", id: "의원C-02", 주관과: "안전정책과", 협조과: [], 확정방법: "수정",
  });

  await check("재배정 사유 누락 400", async () => {
    const response = await request(handler, "POST", {
      작업: "재배정요청", id: "의원C-02", 과: "안전정책과", 사유: "",
    });
    assert.equal(response.status, 400);
  });

  await check("담당 아닌 과 재배정요청 403", async () => {
    const response = await request(handler, "POST", {
      작업: "재배정요청", id: "의원C-02", 과: "디지털정책과", 사유: "소관 아님",
    });
    assert.equal(response.status, 403);
  });

  await check("재배정요청 후 다시 배분", async () => {
    let response = await request(handler, "POST", {
      작업: "재배정요청", id: "의원C-02", 과: "안전정책과",
      사유: "시설 안전 소관으로 판단", 희망과: "시설안전과",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.상태, "재배정요청");
    response = await request(handler, "POST", {
      작업: "배분", id: "의원C-02", 주관과: "시설안전과", 협조과: [], 확정방법: "수정",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.상태, "배분확정");
    assert.equal(repository.snapshot().cases[1].재배정.length, 1);
  });

  await check("가짜 저장소 저장 횟수와 최종 GET", async () => {
    assert.equal(repository.writeCount(), 8);
    const response = await request(handler, "GET");
    assert.equal(response.status, 200);
    assert.equal(response.body.cases.length, 2);
    assert.equal(response.body.version, 8);
  });

  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
  try {
    const fakeAiHandler = (answer, inspect = () => {}) => createHandler({
      repository,
      org: organization,
      fetchOpenAI: async (url, options) => {
        inspect(url, options);
        return {
          ok: true,
          async json() { return { choices: [{ message: { content: JSON.stringify(answer) } }] }; },
        };
      },
    });

    await check("AI추천 정상 후보와 호출 설정", async () => {
      const aiHandler = fakeAiHandler({
        후보: [{ 과: "디지털정책과", 근거: "디지털전환 사업을 담당합니다." }],
        해당없음: false,
      }, (url, options) => {
        assert.equal(url, "https://api.openai.com/v1/chat/completions");
        assert.equal(options.headers.Authorization, "Bearer test-only-key");
        const payload = JSON.parse(options.body);
        assert.equal(payload.model, "gpt-4o-mini");
        assert.equal(payload.temperature, 0);
        assert.deepEqual(payload.response_format, { type: "json_object" });
        assert.equal(payload.messages[1].content, "디지털전환 사업 실적");
      });
      const response = await request(aiHandler, "POST", {
        작업: "AI추천", 요구내용: "디지털전환 사업 실적", 연락처: "전송 금지",
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        후보: [{ 과: "디지털정책과", 근거: "디지털전환 사업을 담당합니다." }],
        해당없음: false,
      });
    });

    await check("AI추천 목록 밖 과 제거·중복 제거·3개 제한", async () => {
      const aiHandler = fakeAiHandler({ 후보: [
        { 과: "없는과", 근거: "잘못된 후보입니다." },
        { 과: "디지털정책과", 근거: "디지털 전환 업무입니다." },
        { 과: "디지털정책과", 근거: "중복 후보입니다." },
        { 과: "데이터정책과", 근거: "데이터 업무입니다." },
        { 과: "정보보호과", 근거: "정보보호 업무입니다." },
        { 과: "운영지원과", 근거: "운영지원 업무입니다." },
      ] });
      const response = await request(aiHandler, "POST", { 작업: "AI추천", 요구내용: "여러 업무" });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.후보.map((item) => item.과),
        ["디지털정책과", "데이터정책과", "정보보호과"]);
      assert.equal(response.body.해당없음, false);
    });

    await check("AI추천 해당없음 응답과 저장 없음", async () => {
      const aiHandler = fakeAiHandler({ 후보: [], 해당없음: true });
      const response = await request(aiHandler, "POST", { 작업: "AI추천", 요구내용: "해당 소관 없음" });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { 후보: [], 해당없음: true });
      assert.equal(repository.writeCount(), 8);
    });

    await check("AI 키 없음 안내", async () => {
      delete process.env.OPENAI_API_KEY;
      const response = await request(fakeAiHandler({ 후보: [] }), "POST", {
        작업: "AI추천", 요구내용: "업무 내용",
      });
      assert.equal(response.status, 500);
      assert.match(response.body.error, /OPENAI_API_KEY/);
      assert.equal(repository.writeCount(), 8);
    });
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }

  console.table(results);
  console.log(`최종 상태: ${repository.snapshot().cases.map((item) => `${item.id}=${item.상태}`).join(", ")}`);
  console.log(`가짜 저장소 쓰기: ${repository.writeCount()}회`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
