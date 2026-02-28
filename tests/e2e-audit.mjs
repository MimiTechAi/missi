// JARVIS E2E Audit — Real Production Test
// No mocks, no dummies, no simulations. Every call hits the real API.

const BASE = "http://localhost:3333";

async function testChat(name, body, checks) {
  process.stdout.write(`━━━ ${name} ━━━\n`);
  try {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const elapsed = Date.now() - start;
    
    if (!res.ok) {
      console.log(`❌ FAIL: HTTP ${res.status} — ${await res.text()}`);
      return false;
    }
    
    const data = await res.json();
    
    if (data.error) {
      console.log(`❌ FAIL: ${data.error}`);
      return false;
    }
    
    const results = checks(data);
    const passed = results.every(r => r.ok);
    
    console.log(`${passed ? "✅ PASS" : "❌ FAIL"} | ${elapsed}ms | Model: ${data.model?.label || "?"}`);
    if (data.plan) console.log(`   Plan: ${data.plan.length} steps`);
    console.log(`   Tools: ${data.toolResults?.map(t => t.tool).join(", ") || "none"} (${data.toolResults?.length || 0} calls)`);
    if (data.documents?.length) console.log(`   Documents: ${data.documents.length} created`);
    console.log(`   Response: ${data.content?.slice(0, 120)}...`);
    
    for (const r of results) {
      if (!r.ok) console.log(`   ⛔ ${r.check}: FAILED`);
    }
    
    console.log("");
    return passed;
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}\n`);
    return false;
  }
}

async function testTTS(name, text, lang) {
  process.stdout.write(`━━━ ${name} ━━━\n`);
  try {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: lang }),
    });
    const elapsed = Date.now() - start;
    
    if (!res.ok) {
      const err = await res.text();
      console.log(`❌ FAIL: HTTP ${res.status} — ${err}\n`);
      return false;
    }
    
    const contentType = res.headers.get("content-type");
    const buffer = await res.arrayBuffer();
    const size = buffer.byteLength;
    
    const ok = contentType?.includes("audio") && size > 1000;
    console.log(`${ok ? "✅ PASS" : "❌ FAIL"} | ${elapsed}ms | ${contentType} | ${(size / 1024).toFixed(1)}KB\n`);
    return ok;
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}\n`);
    return false;
  }
}

async function run() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  JARVIS E2E AUDIT — REAL PRODUCTION TEST               ║");
  console.log(`║  ${new Date().toISOString()}                    ║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  
  let passed = 0;
  let failed = 0;
  const total = 16;
  
  // ── 1. web_search ──
  (await testChat("TEST 1/16: web_search", 
    { messages: [{ role: "user", content: "Search for the current CEO of Tesla" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 20 },
      { check: "used web_search", ok: d.toolResults?.some(t => t.tool === "web_search") },
      { check: "mentions Elon or Tesla", ok: /elon|musk|tesla/i.test(d.content) },
    ]
  )) ? passed++ : failed++;

  // ── 2. get_weather ──
  (await testChat("TEST 2/16: get_weather",
    { messages: [{ role: "user", content: "What is the weather in Paris right now?" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 20 },
      { check: "used get_weather", ok: d.toolResults?.some(t => t.tool === "get_weather") },
      { check: "has temperature", ok: /\d+.*°|degree|celsius/i.test(d.content) },
    ]
  )) ? passed++ : failed++;

  // ── 3. get_time ──
  (await testChat("TEST 3/16: get_time",
    { messages: [{ role: "user", content: "What time is it in Tokyo?" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 10 },
      { check: "used get_time", ok: d.toolResults?.some(t => t.tool === "get_time") },
    ]
  )) ? passed++ : failed++;

  // ── 4. calculate ──
  (await testChat("TEST 4/16: calculate",
    { messages: [{ role: "user", content: "Calculate the square root of 1764" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 5 },
      { check: "used calculate", ok: d.toolResults?.some(t => t.tool === "calculate") },
      { check: "correct answer 42", ok: d.content?.includes("42") },
    ]
  )) ? passed++ : failed++;

  // ── 5. run_code ──
  (await testChat("TEST 5/16: run_code",
    { messages: [{ role: "user", content: "Run JavaScript code to generate the first 10 Fibonacci numbers" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 10 },
      { check: "used run_code", ok: d.toolResults?.some(t => t.tool === "run_code") },
    ]
  )) ? passed++ : failed++;

  // ── 6. read_webpage ──
  (await testChat("TEST 6/16: read_webpage",
    { messages: [{ role: "user", content: "Read the content from https://mistral.ai and tell me what they do" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 30 },
      { check: "used read_webpage", ok: d.toolResults?.some(t => t.tool === "read_webpage") },
      { check: "mentions AI or model", ok: /ai|model|language|mistral/i.test(d.content) },
    ]
  )) ? passed++ : failed++;

  // ── 7. translate ──
  (await testChat("TEST 7/16: translate",
    { messages: [{ role: "user", content: "Translate 'The weather is beautiful today' into French" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 10 },
      { check: "used translate", ok: d.toolResults?.some(t => t.tool === "translate") },
      { check: "has French text", ok: /temps|beau|aujourd/i.test(d.content) },
    ]
  )) ? passed++ : failed++;

  // ── 8. generate_code → Codestral routing ──
  (await testChat("TEST 8/16: generate_code → Codestral",
    { messages: [{ role: "user", content: "Write a TypeScript function to debounce any callback" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 50 },
      { check: "routed to Codestral", ok: d.model?.model === "codestral-latest" },
      { check: "has code", ok: /function|const|=>|return/i.test(d.content) },
    ]
  )) ? passed++ : failed++;

  // ── 9. Complex research → mistral-large + plan + document ──
  (await testChat("TEST 9/16: Multi-step Research + Document",
    { messages: [{ role: "user", content: "Research the top 3 programming languages in 2026 and create a comparison report" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 30 },
      { check: "routed to Large", ok: d.model?.model === "mistral-large-latest" },
      { check: "has plan", ok: Array.isArray(d.plan) && d.plan.length >= 2 },
      { check: "multiple tool calls", ok: d.toolResults?.length >= 2 },
      { check: "created document", ok: d.documents?.length >= 1 },
    ]
  )) ? passed++ : failed++;

  // ── 10. German language ──
  (await testChat("TEST 10/16: German → German response",
    { messages: [{ role: "user", content: "Wie ist das Wetter in Berlin?" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 20 },
      { check: "responds in German", ok: /ist|der|die|das|und|Grad|Celsius|Berlin|Wetter|Temperatur/i.test(d.content) },
      { check: "used get_weather", ok: d.toolResults?.some(t => t.tool === "get_weather") },
    ]
  )) ? passed++ : failed++;

  // ── 11. French language ──
  (await testChat("TEST 11/16: French → French response",
    { messages: [{ role: "user", content: "Quelle heure est-il à New York?" }] },
    (d) => [
      { check: "has content", ok: d.content?.length > 10 },
      { check: "responds in French", ok: /est|heure|il|à|New York|actuellement/i.test(d.content) },
      { check: "used get_time", ok: d.toolResults?.some(t => t.tool === "get_time") },
    ]
  )) ? passed++ : failed++;

  // ── 12. Conversation memory (multi-turn) ──
  (await testChat("TEST 12/16: Multi-turn conversation",
    { messages: [
      { role: "user", content: "My name is Alex and I live in Munich" },
      { role: "assistant", content: "Nice to meet you, Alex! Munich is a wonderful city." },
      { role: "user", content: "What is the weather where I live?" },
    ] },
    (d) => [
      { check: "has content", ok: d.content?.length > 10 },
      { check: "remembers Munich", ok: d.toolResults?.some(t => t.tool === "get_weather" && /munich|münchen/i.test(JSON.stringify(t.args))) },
    ]
  )) ? passed++ : failed++;

  // ── 13. Error handling — empty message ──
  (await testChat("TEST 13/16: Edge case — empty message",
    { messages: [{ role: "user", content: "" }] },
    (d) => [
      { check: "has response (not crash)", ok: d.content?.length > 0 || d.error !== undefined },
    ]
  )) ? passed++ : failed++;

  // ── 14. TTS English ──
  (await testTTS("TEST 14/16: TTS English", "Hello, I am Jarvis, your voice AI assistant.", "en-US")) ? passed++ : failed++;

  // ── 15. TTS German (multilingual model) ──
  (await testTTS("TEST 15/16: TTS German", "Hallo, ich bin Jarvis, dein KI-Assistent.", "de-DE")) ? passed++ : failed++;

  // ── 16. TTS French (multilingual model) ──
  (await testTTS("TEST 16/16: TTS French", "Bonjour, je suis Jarvis, votre assistant IA.", "fr-FR")) ? passed++ : failed++;

  // ── SUMMARY ──
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log(`║  RESULTS: ${passed}/${total} PASSED · ${failed}/${total} FAILED                       ║`);
  console.log(`║  Score: ${((passed / total) * 100).toFixed(0)}%                                             ║`);
  if (failed === 0) {
    console.log("║  🏆 ALL TESTS PASSED — PRODUCTION READY                ║");
  } else {
    console.log("║  ⚠️  ISSUES FOUND — SEE ABOVE                          ║");
  }
  console.log("╚══════════════════════════════════════════════════════════╝");
  
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(console.error);
