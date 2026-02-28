// JARVIS E2E Re-Test — with rate limit delays
const BASE = "http://localhost:3333";
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function test(name, body, checks) {
  process.stdout.write(`${name}\n`);
  try {
    const start = Date.now();
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const elapsed = Date.now() - start;
    if (!res.ok) { console.log(`  ❌ HTTP ${res.status}\n`); return false; }
    const d = await res.json();
    if (d.error) { console.log(`  ❌ ${d.error}\n`); return false; }
    const results = checks(d);
    const ok = results.every(r => r.ok);
    console.log(`  ${ok ? "✅" : "❌"} ${elapsed}ms | ${d.model?.label} | Tools: ${d.toolResults?.map(t=>t.tool).join(",")||"none"} | Docs: ${d.documents?.length||0}`);
    if (d.plan) console.log(`  Plan: [${d.plan.join(" → ")}]`);
    console.log(`  "${d.content?.slice(0,100)}..."`);
    for (const r of results) { if (!r.ok) console.log(`  ⛔ ${r.check}`); }
    console.log("");
    return ok;
  } catch(e) { console.log(`  ❌ ${e.message}\n`); return false; }
}

async function tts(name, text, lang) {
  process.stdout.write(`${name}\n`);
  const res = await fetch(`${BASE}/api/tts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: lang }) });
  const ok = res.ok && res.headers.get("content-type")?.includes("audio");
  const size = ok ? (await res.arrayBuffer()).byteLength : 0;
  console.log(`  ${ok ? "✅" : "❌"} ${(size/1024).toFixed(1)}KB ${lang}\n`);
  return ok;
}

async function run() {
  console.log("\n🔬 JARVIS E2E AUDIT — " + new Date().toLocaleString() + "\n");
  let p=0, f=0;
  
  // Tests with 3s delay between each
  if (await test("1. web_search", {messages:[{role:"user",content:"Search who won the 2024 Super Bowl"}]},
    d=>[{check:"content",ok:d.content?.length>20},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="web_search")}])) p++; else f++;
  await delay(3000);

  if (await test("2. get_weather", {messages:[{role:"user",content:"Weather in London?"}]},
    d=>[{check:"content",ok:d.content?.length>20},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="get_weather")},{check:"temp",ok:/\d/.test(d.content)}])) p++; else f++;
  await delay(3000);

  if (await test("3. get_time", {messages:[{role:"user",content:"What time is it in Sydney Australia?"}]},
    d=>[{check:"content",ok:d.content?.length>10},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="get_time")}])) p++; else f++;
  await delay(3000);

  if (await test("4. calculate", {messages:[{role:"user",content:"Calculate 17.5% tip on $234.80 bill"}]},
    d=>[{check:"content",ok:d.content?.length>5},{check:"has number",ok:/\d+\.\d+/.test(d.content)}])) p++; else f++;
  await delay(3000);

  if (await test("5. run_code", {messages:[{role:"user",content:"Run code to generate first 10 prime numbers"}]},
    d=>[{check:"content",ok:d.content?.length>10},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="run_code")}])) p++; else f++;
  await delay(3000);

  if (await test("6. read_webpage", {messages:[{role:"user",content:"Read https://news.ycombinator.com and tell me the top story"}]},
    d=>[{check:"content",ok:d.content?.length>20},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="read_webpage")}])) p++; else f++;
  await delay(3000);

  if (await test("7. translate", {messages:[{role:"user",content:"Translate 'Good morning, how are you?' into German and Japanese"}]},
    d=>[{check:"content",ok:d.content?.length>10},{check:"tool",ok:d.toolResults?.some(t=>t.tool==="translate")}])) p++; else f++;
  await delay(3000);

  if (await test("8. Codestral routing", {messages:[{role:"user",content:"Write a Python class for a binary search tree with insert and search methods"}]},
    d=>[{check:"content",ok:d.content?.length>50},{check:"codestral",ok:d.model?.model==="codestral-latest"},{check:"code",ok:/class|def /i.test(d.content)}])) p++; else f++;
  await delay(3000);

  if (await test("9. Research + Document (mistral-large)", {messages:[{role:"user",content:"Research the top 3 electric car companies and create a comparison report"}]},
    d=>[{check:"content",ok:d.content?.length>30},{check:"large",ok:d.model?.model==="mistral-large-latest"},{check:"plan",ok:d.plan?.length>=2},{check:"tools>=2",ok:d.toolResults?.length>=2},{check:"document",ok:d.documents?.length>=1}])) p++; else f++;
  await delay(4000);

  if (await test("10. German", {messages:[{role:"user",content:"Wie spät ist es in Berlin und wie ist das Wetter?"}]},
    d=>[{check:"content",ok:d.content?.length>20},{check:"german",ok:/ist|der|die|das|Grad|Uhr|Berlin/i.test(d.content)},{check:"tools",ok:d.toolResults?.length>=1}])) p++; else f++;
  await delay(3000);

  if (await test("11. French", {messages:[{role:"user",content:"Recherche les dernières nouvelles sur l'intelligence artificielle"}]},
    d=>[{check:"content",ok:d.content?.length>20},{check:"french",ok:/les|des|est|une|intelligence|artificielle/i.test(d.content)}])) p++; else f++;
  await delay(3000);

  if (await test("12. Multi-turn memory", {messages:[
    {role:"user",content:"Remember: my favorite city is Tokyo"},
    {role:"assistant",content:"Got it, Tokyo is your favorite city."},
    {role:"user",content:"What is the weather in my favorite city?"}]},
    d=>[{check:"content",ok:d.content?.length>10},{check:"tokyo weather",ok:d.toolResults?.some(t=>t.tool==="get_weather")}])) p++; else f++;
  await delay(3000);

  if (await test("13. summarize_text", {messages:[{role:"user",content:"Summarize this text in bullets: Artificial intelligence is transforming every industry from healthcare to finance. Machine learning models can now diagnose diseases, predict market trends, and automate manufacturing. The global AI market is expected to reach $1.8 trillion by 2030. Companies like OpenAI, Google, and Mistral are leading the charge."}]},
    d=>[{check:"content",ok:d.content?.length>20}])) p++; else f++;
  await delay(3000);

  // TTS tests
  if (await tts("14. TTS English", "The weather today is sunny with a high of twenty-five degrees.", "en-US")) p++; else f++;
  await delay(1000);
  if (await tts("15. TTS German", "Das Wetter heute ist sonnig mit einer Höchsttemperatur von fünfundzwanzig Grad.", "de-DE")) p++; else f++;
  await delay(1000);
  if (await tts("16. TTS French", "Le temps aujourd'hui est ensoleillé avec un maximum de vingt-cinq degrés.", "fr-FR")) p++; else f++;

  console.log("\n" + "═".repeat(50));
  console.log(`  RESULT: ${p}/${p+f} PASSED (${((p/(p+f))*100).toFixed(0)}%)`);
  if (f===0) console.log("  🏆 ALL TESTS PASSED — AUDIT COMPLETE");
  else console.log(`  ⚠️ ${f} TESTS FAILED`);
  console.log("═".repeat(50) + "\n");
}

run();
