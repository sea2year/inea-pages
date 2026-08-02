// ================================================================
// Automated preview leak diagnostic — runs via Playwright
// Usage: node js/diagnostic.mjs
// ================================================================
import { chromium } from 'playwright';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const appUrl = 'file://' + path.join(projectRoot, 'index.html');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(appUrl, { waitUntil: 'networkidle' });

// Wait a moment for canvas rendering
await page.waitForTimeout(2000);

console.log('=== DIAGNOSTIC RESULTS ===\n');

// ─── 1. DOM elements check ───
console.log('1. DOM ELEMENTS IN RIGHT HALF (>720px):');
const elements = await page.evaluate(() => {
  const results = [];
  const ids = ['preview-screen', 'preview-bg', 'preview-wrapper',
    'preview-video', 'group-preview-canvas', 'transform-overlay-canvas',
    'preview-status', 'canvas-wrap', 'right-panel', 'fabric-canvas', 'main-canvas'];

  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) { results.push({ id, found: false }); continue; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    results.push({
      id,
      found: true,
      display: cs.display,
      position: cs.position,
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage,
      zIndex: cs.zIndex,
      overflow: cs.overflow,
      border: cs.border,
      borderRadius: cs.borderRadius,
      opacity: cs.opacity,
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      isInRightHalf: r.left > 720
    });
  }
  return results;
});

for (const el of elements) {
  if (!el.found) { console.log(`  ✗ ${el.id}: NOT FOUND`); continue; }
  const bgTag = el.background === 'rgba(0, 0, 0, 0)' ? ' ⚡TRANSPARENT' :
    el.background === 'rgb(255, 255, 255)' ? ' ⚡WHITE' : '';
  console.log(`  ${el.id}: ${el.display} ${el.width}×${el.height} at(${el.left},${el.top}) bg=${el.background}${bgTag} z=${el.zIndex} pos=${el.position}`);
}

// ─── 2. Background chain ───
console.log('\n2. BACKGROUND CHAIN (preview-wrapper → body):');
const chain = await page.evaluate(() => {
  const results = [];
  let el = document.getElementById('preview-wrapper');
  let depth = 0;
  while (el && depth < 15) {
    const bg = getComputedStyle(el).backgroundColor;
    const name = el.id || el.className || el.tagName;
    const isTransparent = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
    const isWhite = bg === 'rgb(255, 255, 255)';
    results.push({ depth, name, bg, leak: isTransparent || isWhite });
    el = el.parentElement;
    depth++;
  }
  return results;
});

for (const c of chain) {
  const tag = c.leak ? ' ⚠ LEAK SOURCE' : '';
  console.log(`  L${c.depth}: ${c.name} → ${c.bg}${tag}`);
}

// ─── 3. Right-half white elements ───
console.log('\n3. WHITE/TRANSPARENT ELEMENTS ON RIGHT HALF (potential leaks):');
const rightWhite = await page.evaluate(() => {
  const results = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.left < 720 || r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') continue;
    const bg = cs.backgroundColor;
    const isWhite = bg === 'rgb(255, 255, 255)' || bg === '#ffffff' || bg === '#fff';
    const isTransparent = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
    if (isWhite || isTransparent) {
      results.push({
        id: el.id || 'N/A',
        tag: el.tagName,
        className: (typeof el.className === 'string') ? el.className : '',
        bg,
        type: isWhite ? 'WHITE' : 'TRANSPARENT',
        pos: cs.position,
        zIndex: cs.zIndex,
        rect: `${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.left)},${Math.round(r.top)})`,
      });
    }
  }
  return results;
});

for (const el of rightWhite) {
  const label = el.id !== 'N/A' ? `#${el.id}` : `${el.tag}.${el.className}`;
  console.log(`  ${el.type}: ${label} [${el.rect}] z=${el.zIndex} bg=${el.bg}`);
}

// ─── 4. Preview wrapper children ───
console.log('\n4. PREVIEW WRAPPER CHILDREN:');
const children = await page.evaluate(() => {
  const wrapper = document.getElementById('preview-wrapper');
  if (!wrapper) return [{ error: 'preview-wrapper not found' }];
  const results = [];
  for (const child of wrapper.children) {
    const cs = getComputedStyle(child);
    const r = child.getBoundingClientRect();
    results.push({
      id: child.id || child.tagName,
      display: cs.display,
      bg: cs.backgroundColor,
      position: cs.position,
      width: Math.round(r.width),
      height: Math.round(r.height),
      tag: child.tagName,
    });
  }
  return results;
});

for (const c of children) {
  const visible = c.display !== 'none' ? ' [VISIBLE]' : '';
  console.log(`  ${c.id}: ${c.display} bg=${c.bg} ${c.width}×${c.height} pos=${c.position}${visible}`);
}

// ─── 5. Gap Analysis ───
console.log('\n5. GAP ANALYSIS (preview-screen coverage):');
const gaps = await page.evaluate(() => {
  const ps = document.getElementById('preview-screen');
  const bg = document.getElementById('preview-bg');
  const wrapper = document.getElementById('preview-wrapper');
  if (!ps || !bg || !wrapper) return [{ error: 'elements not found' }];
  const psR = ps.getBoundingClientRect();
  const bgR = bg.getBoundingClientRect();
  const wR = wrapper.getBoundingClientRect();
  return {
    screen: `${Math.round(psR.width)}×${Math.round(psR.height)} at (${Math.round(psR.left)},${Math.round(psR.top)})`,
    bgBox: `${Math.round(bgR.width)}×${Math.round(bgR.height)} at (${Math.round(bgR.left)},${Math.round(bgR.top)})`,
    wrapper: `${Math.round(wR.width)}×${Math.round(wR.height)} at (${Math.round(wR.left)},${Math.round(wR.top)})`,
    rightGap: Math.round(psR.right - wR.right),
    bottomGap: Math.round(psR.bottom - wR.bottom),
    bgToWrapperRight: Math.round(bgR.right - wR.right),
    bgToWrapperBottom: Math.round(bgR.bottom - wR.bottom),
    wrapperToScreenRight: Math.round(psR.right - wR.right),
  };
});

console.log(`  Screen: ${gaps.screen}`);
console.log(`  BG Box: ${gaps.bgBox}`);
console.log(`  Wrapper: ${gaps.wrapper}`);
console.log(`  Right gap (screen.right - wrapper.right): ${gaps.rightGap}px`);
console.log(`  Bottom gap: ${gaps.bottomGap}px`);

// ─── 6. CSS Conflict Detection ───
console.log('\n6. CSS CONFLICTS:');
const conflicts = await page.evaluate(() => {
  const results = [];
  const wrapper = document.getElementById('preview-wrapper');
  if (wrapper) {
    const pos = getComputedStyle(wrapper).position;
    const w = getComputedStyle(wrapper).width;
    results.push({ element: '#preview-wrapper', position: pos, width: w });
    if (pos !== 'absolute') results.push({ conflict: 'position is not absolute!' });
    if (w !== '247px') results.push({ conflict: `width is ${w}, expected 247px` });
  }

  // Check style rules
  let globalPW = 0, scopedPW = 0;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!rule.selectorText) continue;
        if (rule.selectorText === '#preview-wrapper') globalPW++;
        if (rule.selectorText.includes('#preview-screen') && rule.selectorText.includes('#preview-wrapper')) scopedPW++;
      }
    } catch(e) {}
  }
  results.push({ globalPreviewWrapperRules: globalPW, scopedPreviewWrapperRules: scopedPW });
  return results;
});

console.log('  Conflicts:', JSON.stringify(conflicts, null, 2));

// ─── 7. Screenshot ───
await page.screenshot({ path: path.join(projectRoot, 'diagnostic-screenshot.png'), fullPage: false });
console.log('\n7. Screenshot saved to: diagnostic-screenshot.png');

// ─── 8. Simulate edit mode if there's an edit box ───
const hasEditBoxes = await page.evaluate(() => {
  return (window.state?.editBoxes || []).length;
});
console.log(`\n8. EDIT BOXES: ${hasEditBoxes}`);

await browser.close();
console.log('\n=== DIAGNOSTIC COMPLETE ===');
