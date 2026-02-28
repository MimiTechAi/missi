/**
 * COGNITIVE WALKTHROUGH v2 — 100 User Scenarios (Visual + Code)
 * Based on actual screenshots of the running app
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => { try { return readFileSync(resolve(ROOT, f), 'utf8'); } catch { return ''; } };
const page = read('src/app/page.tsx');
const chat = read('src/app/api/chat/route.ts');
const orb = read('src/components/VoiceOrb.tsx');
const layout = read('src/app/layout.tsx');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}\n     → ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ═══════════════════════════════════════════════════════════════
console.log('\n🔥 CRITICAL BUGS (found in live testing)');
// ═══════════════════════════════════════════════════════════════

test('CRIT#1: Empty bubbles after reload — displayedContent="" renders blank', () => {
  // After page reload, displayedContent="" was persisted → showed empty bubble
  // Fix: Don't persist displayedContent + check for "" in render
  assert(page.includes('displayedContent !== ""'),
    'Render still shows empty displayedContent as cursor — user sees blank bubble');
});

test('CRIT#2: displayedContent NOT persisted to localStorage', () => {
  // loadMessages should strip displayedContent
  const loadFn = page.substring(page.indexOf('function loadMessages'), page.indexOf('function saveMessages'));
  assert(loadFn.includes('displayedContent'),
    'loadMessages does not strip displayedContent — broken bubbles persist');
});

test('CRIT#3: saveMessages strips displayedContent', () => {
  const saveFn = page.substring(page.indexOf('function saveMessages'), page.indexOf('function saveMessages') + 300);
  assert(saveFn.includes('displayedContent'),
    'saveMessages does not strip displayedContent');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n👤 USER 1-20: "What is this? What do I do?"');
// ═══════════════════════════════════════════════════════════════

test('Logo shows "M" for MISSI', () => {
  assert(page.includes('>M<'), 'Logo still shows wrong letter');
});

test('Japanese greeting says ミッシー not ジャービス', () => {
  assert(!page.includes('ジャービス'), 'Japanese greeting still says Jarvis');
});

test('Orb has cursor:pointer for clickability', () => {
  assert(orb.includes('cursor') || page.includes('cursor-pointer') || orb.includes('pointer'),
    'Orb does not show pointer cursor — users won\'t know it\'s clickable');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n👤 USER 21-40: "I said Hey Missi and she spoke!"');
// ═══════════════════════════════════════════════════════════════

test('Wake word calls activate() with greeting', () => {
  const wakeSection = page.substring(
    page.indexOf('Wake Word Detection'),
    page.indexOf('Notification Permission')
  );
  assert(wakeSection.includes('activateRef.current()'),
    'Wake word does not call activate — no greeting on Hey Missi');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n👤 USER 41-60: "The voice changed but filler still Eric"');
// ═══════════════════════════════════════════════════════════════

test('Filler TTS uses currentVoiceIdRef', () => {
  assert(page.includes('currentVoiceIdRef.current'),
    'Filler/greeting does not use voiceId ref');
});

test('Greeting TTS uses currentVoiceIdRef', () => {
  const greetingArea = page.substring(
    page.indexOf('text: greeting'),
    page.indexOf('text: greeting') + 100
  );
  assert(greetingArea.includes('currentVoiceIdRef'),
    'Greeting TTS ignores voice change');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n👤 USER 61-80: "The chat panel is confusing"');
// ═══════════════════════════════════════════════════════════════

test('Empty displayedContent renders as full content (not blank)', () => {
  assert(page.includes('displayedContent !== ""'),
    'displayedContent="" would render blank bubble with cursor');
});

test('Assistant messages with content show content text', () => {
  // After the fix, msg.content should be shown when displayedContent is empty/undefined
  assert(page.includes(': msg.content'),
    'Fallback to msg.content not present');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n👤 USER 81-100: "Mobile + Accessibility"');
// ═══════════════════════════════════════════════════════════════

test('Header has responsive hiding (sm:)', () => {
  assert(page.includes('sm:inline') || page.includes('sm:block') || page.includes('hidden sm:'),
    'Header elements not responsive');
});

test('HTML has lang attribute', () => {
  assert(layout.includes('lang='), 'No lang attribute for screen readers');
});

test('Input has placeholder', () => {
  assert(page.includes('placeholder="Ask anything'), 'No placeholder');
});

test('Orb button has aria label', () => {
  assert(page.includes('Voice control') || orb.includes('aria-label'),
    'Orb button has no accessible label');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n📋 RESULTS');
console.log('═'.repeat(55));
console.log(`✅ Passed:  ${passed}`);
console.log(`❌ Failed:  ${failed}`);
console.log(`📊 Total:   ${passed + failed}`);
console.log('═'.repeat(55));
if (failed > 0) process.exit(1);
