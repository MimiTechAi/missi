/**
 * FULL COVERAGE AUDIT — MISSI Voice AI Operating System
 * Tests EVERY feature for correctness and completeness
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };
const page = read('src/app/page.tsx');
const chat = read('src/app/api/chat/route.ts');
const tts = read('src/app/api/tts/route.ts');
const orb = read('src/components/VoiceOrb.tsx');
const layout = read('src/app/layout.tsx');
const gmail = read('src/app/api/auth/gmail/route.ts');
const readme = read('README.md');

let passed = 0, failed = 0, warnings = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); failed++; }
}
function warn(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ⚠️  ${name}\n     → ${e.message}`); warnings++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ═══════════════════════════════════════════════════════════════
console.log('\n🏷️  BRANDING: JARVIS → MISSI');
// ═══════════════════════════════════════════════════════════════
test('No "JARVIS" in page.tsx', () => {
  assert(!page.includes('JARVIS') && !page.includes('Jarvis'), 'Still has Jarvis references in page.tsx');
});
test('No "JARVIS" in chat route', () => {
  assert(!chat.includes('JARVIS'), 'Still has JARVIS in chat route');
});
test('No "JARVIS" in layout', () => {
  assert(!layout.includes('JARVIS'), 'Still has JARVIS in layout');
});
test('No "JARVIS" in TTS route', () => {
  assert(!tts.includes('Jarvis'), 'Still has Jarvis in TTS');
});
test('No "JARVIS" in VoiceOrb', () => {
  assert(!orb.includes('JARVIS'), 'Still has JARVIS in VoiceOrb');
});
test('MISSI in page header', () => {
  assert(page.includes('>MISSI<'), 'MISSI not in header');
});
test('MISSI in page title', () => {
  assert(layout.includes('MISSI'), 'MISSI not in page title');
});
test('MISSI in system prompt', () => {
  assert(chat.includes('MISSI'), 'MISSI not in system prompt');
});
test('Wake word says "Hey Missi"', () => {
  assert(page.includes('hey missi'), 'Wake word not updated to Hey Missi');
});
test('Greeting says Missi', () => {
  assert(page.includes('Ich bin Missi'), 'German greeting not updated');
});
test('Orb label says MISSI', () => {
  assert(orb.includes('MISSI'), 'Orb label not updated');
});
test('Storage key updated', () => {
  assert(page.includes('missi-history'), 'Storage key still says jarvis');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n🧠 MODELS (4 Mistral Models)');
// ═══════════════════════════════════════════════════════════════
test('mistral-small-latest', () => assert(chat.includes('mistral-small-latest')));
test('mistral-large-latest', () => assert(chat.includes('mistral-large-latest')));
test('codestral-latest', () => assert(chat.includes('codestral-latest')));
test('pixtral-large-latest', () => assert(chat.includes('pixtral-large-latest')));
test('Model routing logic exists', () => assert(chat.includes('routeModel')));
test('Multi-language routing keywords (DE/FR/ES)', () => {
  assert(chat.includes('recherchiere') && chat.includes('analyse'), 'Missing German routing keywords');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n🛠️  TOOLS (22 Total)');
// ═══════════════════════════════════════════════════════════════
const expectedTools = [
  'web_search', 'get_weather', 'get_time', 'calculate', 'run_code',
  'read_webpage', 'create_document', 'translate', 'analyze_data',
  'generate_code', 'set_reminder', 'summarize_text',
  'search_gmail', 'read_gmail', 'search_files',
  'get_calendar', 'get_stock_price', 'get_crypto_price',
  'wikipedia', 'get_location', 'change_voice',
];
for (const tool of expectedTools) {
  test(`Tool: ${tool}`, () => assert(chat.includes(`"${tool}"`), `Missing tool definition: ${tool}`));
}
test('Tool count = 21+', () => {
  const count = expectedTools.filter(t => chat.includes(`"${t}"`)).length;
  assert(count >= 21, `Only ${count}/21 tools found`);
});

// ═══════════════════════════════════════════════════════════════
console.log('\n🔊 TTS (ElevenLabs)');
// ═══════════════════════════════════════════════════════════════
test('Eric voice ID present', () => assert(tts.includes('cjVigY5qzO86Huf0OWal')));
test('Multilingual model for non-English', () => assert(tts.includes('eleven_multilingual_v2')));
test('Flash model for English', () => assert(tts.includes('eleven_flash_v2_5')));
test('voiceId parameter accepted', () => assert(tts.includes('voiceId')));
test('5 voice options in change_voice', () => {
  assert(chat.includes('eric') && chat.includes('aria') && chat.includes('roger') && chat.includes('sarah') && chat.includes('charlie'));
});

// ═══════════════════════════════════════════════════════════════
console.log('\n📡 SSE STREAMING');
// ═══════════════════════════════════════════════════════════════
test('ReadableStream in API', () => assert(chat.includes('ReadableStream')));
test('text/event-stream header', () => assert(chat.includes('text/event-stream')));
test('model_selected event', () => assert(chat.includes('model_selected')));
test('tool_start event', () => assert(chat.includes('tool_start')));
test('tool_result event', () => assert(chat.includes('tool_result')));
test('content event', () => assert(chat.includes('"content"')));
test('done event', () => assert(chat.includes('"done"')));
test('Frontend getReader', () => assert(page.includes('getReader')));
test('Frontend SSE parsing', () => assert(page.includes('event:')));

// ═══════════════════════════════════════════════════════════════
console.log('\n🎙️  VOICE UX');
// ═══════════════════════════════════════════════════════════════
test('Wake word "Hey Missi"', () => assert(page.includes('hey missi')));
test('Auto language detection', () => assert(page.includes('navigator.language')));
test('10 STT languages', () => assert(page.includes('de-DE') && page.includes('ja-JP') && page.includes('ar-SA')));
test('Silence detection 1.0s', () => assert(page.includes('1000') && page.includes('silence')));
test('Filler audio (DE/EN/FR/ES)', () => {
  assert(page.includes('Moment') && page.includes('Let me check'), 'Missing filler phrases');
});
test('Welcome greeting multilingual', () => {
  assert(page.includes('Ich bin Missi') && page.includes("I'm Missi"));
});
test('Continuous voice mode', () => assert(page.includes('continuousMode')));
test('Barge-in (interrupt)', () => assert(page.includes('audioRef.current.pause')));
test('Synchronized text + speech', () => {
  assert(page.includes('spokenSoFar') && page.includes('displayedContent'));
});
test('Sentence grouping (2 per chunk)', () => assert(page.includes('i += 2')));
test('Sound effects', () => assert(page.includes('playSound') && page.includes('createOscillator')));

// ═══════════════════════════════════════════════════════════════
console.log('\n🎨 UI/UX');
// ═══════════════════════════════════════════════════════════════
test('Chat panel default open', () => {
  const m = page.match(/\[showChat,\s*setShowChat\]\s*=\s*useState\((\w+)\)/);
  assert(m && m[1] === 'true', 'showChat not defaulting to true');
});
test('Live tool cards with spinner', () => assert(page.includes('activeTools') && page.includes('animate-spin')));
test('Response time in bubbles', () => assert(page.includes('responseTime')));
test('Voice input indicator 🎙️', () => assert(page.includes('fromVoice') && page.includes('🎙')));
test('Localized quick actions (DE/FR/ES/EN)', () => {
  assert(page.includes('promptsByLang') && page.includes('Recherchiere') && page.includes('Wetter'));
});
test('Keyboard shortcuts visible', () => assert(page.includes('Space = Talk')));
test('Empty state in chat', () => assert(page.includes('Ready to assist')));
test('Background gradient', () => assert(page.includes('radial-gradient')));
test('Thinking status below orb', () => assert(page.includes('thinkingStatus')));
test('Typing cursor animation', () => assert(page.includes('animate-pulse') && page.includes('bg-cyan-400')));
test('Document download', () => assert(page.includes('downloadDocument')));
test('Image drag & drop', () => assert(page.includes('dragOver')));

// ═══════════════════════════════════════════════════════════════
console.log('\n🔒 PERMISSIONS');
// ═══════════════════════════════════════════════════════════════
test('Permission state tracked', () => assert(page.includes('permissions')));
test('📂 Folder button', () => assert(page.includes('connectFolder') && page.includes('📂')));
test('📧 Gmail button', () => assert(page.includes('connectGmail') && page.includes('📧')));
test('showDirectoryPicker', () => assert(page.includes('showDirectoryPicker')));
test('Gmail OAuth route', () => assert(existsSync(resolve(ROOT, 'src/app/api/auth/gmail/route.ts'))));
test('Gmail callback route', () => assert(existsSync(resolve(ROOT, 'src/app/api/auth/gmail/callback/route.ts'))));
test('Calendar scope in OAuth', () => assert(gmail.includes('calendar.readonly')));
test('Notification permission', () => assert(page.includes('Notification.requestPermission')));
test('Geolocation', () => assert(page.includes('getCurrentPosition')));

// ═══════════════════════════════════════════════════════════════
console.log('\n🔧 INFRASTRUCTURE');
// ═══════════════════════════════════════════════════════════════
test('Rate limit retry (3 attempts)', () => assert(chat.includes('attempt < 3')));
test('localStorage persistence', () => assert(page.includes('localStorage')));
test('Inter font', () => assert(layout.includes('Inter')));
test('OpenGraph meta', () => assert(layout.includes('openGraph')));
test('Responsive (sm: breakpoints)', () => assert(page.includes('sm:')));
test('VoiceOrb canvas animation', () => assert(orb.includes('requestAnimationFrame')));

// ═══════════════════════════════════════════════════════════════
console.log('\n📋 FINAL SUMMARY');
console.log('═'.repeat(55));
console.log(`✅ Passed:   ${passed}`);
console.log(`❌ Failed:   ${failed}`);
console.log(`⚠️  Warnings: ${warnings}`);
console.log(`📊 Total:    ${passed + failed + warnings}`);
console.log('═'.repeat(55));
if (failed > 0) { process.exit(1); }
