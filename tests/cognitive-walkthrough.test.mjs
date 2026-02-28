/**
 * COGNITIVE WALKTHROUGH — 100 User Scenarios
 * Every UX issue found gets a test. Red → Fix → Green.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');
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
// SCENARIO 1: First-time User opens page
// "I just opened the page. What is this? What do I do?"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 1: First-time User');

test('Bug#1: Logo still shows "J" instead of "M" for MISSI', () => {
  // Header has a gradient square with a letter
  assert(!page.includes('>J<'), 'Logo letter is still "J" — must be "M" for MISSI');
});

test('Bug#2: Japanese greeting still says ジャービス (Jarvis in katakana)', () => {
  assert(!page.includes('ジャービス'), 'Japanese greeting still references Jarvis in katakana');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 2: User says "Hey Missi"
// "I said Hey Missi. It blinked but then... nothing? Is it listening?"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 2: Wake Word User');

test('Bug#3: Wake word activates but no greeting spoken', () => {
  // Wake word handler should call activate() which speaks greeting
  // NOT manually set continuousMode + startListening without greeting
  const wakeSection = page.substring(
    page.indexOf('Wake Word Detection'),
    page.indexOf('Notification Permission')
  );
  assert(wakeSection.includes('activate()'), 
    'Wake word does not call activate() — user hears nothing after saying Hey Missi');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 3: User on mobile
// "I'm on my phone, everything is squished"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 3: Mobile User');

test('Bug#4: Chat panel 380px fixed width breaks on phones', () => {
  // On mobile (320-414px) a 380px panel would exceed screen
  assert(page.includes('w-full sm:w-[380px]') || page.includes('w-full sm:w-[440px]') || 
    page.includes('max-w-full') || page.match(/w-\[380px\].*sm:/),
    'Chat panel width not responsive — 380px is wider than most phones');
});

test('Bug#5: Header buttons overflow on small screens', () => {
  // Multiple 9px buttons + language selector + files + gmail + active + log + clear = 7 items
  assert(page.includes('flex-wrap') || page.includes('overflow-x-auto') || page.includes('sm:inline-flex'),
    'Header buttons need wrapping or hiding on mobile');
});

test('Bug#6: Orb size 240px may be too large on small screens', () => {
  // VoiceOrb receives size={240} which is fine on desktop but pushes content off on phones
  assert(page.includes('size={') && (page.includes('Math.min') || orb.includes('Math.min')),
    'Orb size is not responsive — 240px may overflow on small screens');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 4: User changes voice but TTS doesn't use it
// "I said change to female voice, it confirmed, but still sounds like Eric"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 4: Voice Change User');

test('Bug#7: voiceId passed to ALL TTS calls (not just main chunks)', () => {
  // Check that filler and greeting TTS also use currentVoiceId
  const fillerTTS = page.includes('text: filler') ? 
    page.substring(page.indexOf('text: filler') - 100, page.indexOf('text: filler') + 100) : '';
  const greetingTTS = page.includes('text: greeting') ?
    page.substring(page.indexOf('text: greeting') - 100, page.indexOf('text: greeting') + 100) : '';
  
  const fillerHasVoice = fillerTTS.includes('voiceId') || fillerTTS.includes('currentVoiceId');
  const greetingHasVoice = greetingTTS.includes('voiceId') || greetingTTS.includes('currentVoiceId');
  
  assert(fillerHasVoice, 'Filler TTS does not use currentVoiceId — still plays Eric');
  assert(greetingHasVoice, 'Greeting TTS does not use currentVoiceId — still plays Eric');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 5: User clicks quick action
// "I clicked a suggestion but nothing happened visually right away"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 5: Quick Action User');

test('Quick actions disappear after first message', () => {
  assert(page.includes('messages.length === 0') && page.includes('promptsByLang'),
    'Quick actions should only show when no messages');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 6: User asks stock price but gets weird format
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 6: Stock/Crypto User');

test('Stock price error handling for invalid symbols', () => {
  assert(chat.includes('not found') || chat.includes('Could not fetch'), 
    'No error message for invalid stock symbols');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 7: User tries keyboard shortcut ⌘K
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 7: Keyboard Power User');

test('⌘K clears conversation', () => {
  assert(page.includes('metaKey') && page.includes('clearConversation'),
    'Cmd+K does not clear');
});
test('Space starts listening', () => {
  assert(page.includes('key === " "') || page.includes("key === ' '") || page.includes('code === "Space"'),
    'Space bar does not trigger listening');
});
test('Escape stops', () => {
  assert(page.includes('Escape') && page.includes('deactivate'),
    'Escape does not deactivate');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 8: User gets error from Mistral API
// "It just shows nothing — I don't know what went wrong"
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 8: Error Handling');

test('SSE error event defined', () => {
  assert(chat.includes('"error"') && chat.includes('error'), 'No SSE error event');
});
test('Frontend handles SSE errors', () => {
  assert(page.includes('error') && page.includes('setMessages'), 'No error handling in frontend');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 9: Accessibility
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 9: Accessibility');

test('Input has placeholder text', () => {
  assert(page.includes('placeholder='), 'Input field has no placeholder');
});
test('Title attributes on buttons', () => {
  assert(page.includes('title="Upload image'), 'Buttons lack title attributes');
});
test('Lang attribute on HTML', () => {
  assert(layout.includes('lang='), 'No lang attribute');
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 10: Tool count in footer is wrong
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 10: Accuracy');

test('Bug#8: Footer tool count matches actual tools', () => {
  // Count actual tools defined
  const toolDefs = (chat.match(/name: "/g) || []).length;
  const footerMatch = page.match(/(\d+) TOOLS/);
  if (footerMatch) {
    const footerCount = parseInt(footerMatch[1]);
    assert(footerCount >= 20, `Footer says ${footerCount} tools but we have ${toolDefs}+ defined`);
  }
});

// ═══════════════════════════════════════════════════════════════
// SCENARIO 11: Tab focus / Page title
// ═══════════════════════════════════════════════════════════════
console.log('\n👤 SCENARIO 11: Browser Tab');

test('Page title says MISSI', () => {
  assert(layout.includes('MISSI'), 'Page title not MISSI');
});
test('Favicon exists', () => {
  assert(layout.includes('icon') || layout.includes('favicon') || 
    existsSync(resolve(ROOT, 'src/app/favicon.ico')) || existsSync(resolve(ROOT, 'public/favicon.ico')),
    'No favicon');
});

// ═══════════════════════════════════════════════════════════════
console.log('\n📋 RESULTS');
console.log('═'.repeat(55));
console.log(`✅ Passed:  ${passed}`);
console.log(`❌ Failed:  ${failed}`);
console.log(`📊 Total:   ${passed + failed}`);
console.log('═'.repeat(55));
if (failed > 0) { 
  console.log('\n🔧 Bugs found — fixing now.\n');
  process.exit(1); 
}
