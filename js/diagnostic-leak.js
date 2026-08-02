// ================================================================
// Preview Screen White Leak Diagnostic
// Paste this entire script into the browser DevTools console
// while the video editor is open.
// ================================================================

(function() {
  'use strict';

  const PASS = 'color: #0a0; font-weight: bold';
  const WARN = 'color: #c80; font-weight: bold';
  const FAIL = 'color: #c00; font-weight: bold';
  const INFO = 'color: #06c; font-weight: bold';

  function cs(el, prop) {
    if (!el) return '(no element)';
    return getComputedStyle(el)[prop];
  }

  function inspect(id) {
    const el = document.getElementById(id);
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    return {
      found: true,
      el,
      tag: el.tagName,
      display: cs(el, 'display'),
      position: cs(el, 'position'),
      background: cs(el, 'backgroundColor'),
      backgroundImage: cs(el, 'backgroundImage'),
      border: cs(el, 'border'),
      borderRadius: cs(el, 'borderRadius'),
      overflow: cs(el, 'overflow'),
      zIndex: cs(el, 'zIndex'),
      opacity: cs(el, 'opacity'),
      rect: { w: Math.round(r.width), h: Math.round(r.height),
              t: Math.round(r.top), l: Math.round(r.left),
              r: Math.round(r.right), b: Math.round(r.bottom) }
    };
  }

  console.group('%c🔍 Preview Screen Leak Diagnostic', 'font-size:16px;font-weight:bold');
  console.log('Run time:', new Date().toLocaleTimeString());

  // ─── 1. DOM inspection ───
  console.group('%c1. DOM Elements', INFO);
  const ids = ['preview-screen', 'preview-bg', 'preview-wrapper',
               'preview-video', 'group-preview-canvas', 'transform-overlay-canvas',
               'preview-status', 'preview-dot', 'preview-time', 'preview-name',
               'canvas-wrap', 'fabric-canvas', 'main-canvas'];
  const nodes = {};
  for (const id of ids) {
    nodes[id] = inspect(id);
    if (!nodes[id].found) {
      console.log(`%c✗ ${id}: NOT FOUND`, FAIL);
    } else {
      const n = nodes[id];
      const bgTag = n.background === 'rgba(0, 0, 0, 0)' ? ' ⚡TRANSPARENT' :
                    n.background === 'rgb(255, 255, 255)' ? ' ⚡WHITE' : '';
      console.log(`%c  ${id}: %c${n.display} %c${n.rect.w}×${n.rect.h} %cat (${n.rect.l},${n.rect.t}) %cbg=${n.background}${bgTag}`,
        '', 'color:#888', '', '', 'color:#888');
    }
  }
  console.groupEnd();

  // ─── 2. Background chain walk ───
  console.group('%c2. Background Chain (preview-wrapper → body)', INFO);
  let el = document.getElementById('preview-wrapper');
  let depth = 0;
  const chainIssues = [];
  while (el && depth < 15) {
    const bg = cs(el, 'backgroundColor');
    const name = el.id || el.className || el.tagName;
    const isTransparent = bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
    const isWhite = bg === 'rgb(255, 255, 255)' || bg === '#ffffff' || bg === '#fff';

    if (isTransparent) {
      console.log(`%c  L${depth}: ${name} → ${bg} ⚡ TRANSPARENT — anything behind shows through`, WARN);
      chainIssues.push({ depth, name, bg, issue: 'transparent' });
    } else if (isWhite && depth > 0 && name !== 'preview-bg') {
      console.log(`%c  L${depth}: ${name} → ${bg} 💡 WHITE — could be leak source`, WARN);
      chainIssues.push({ depth, name, bg, issue: 'white' });
    } else {
      console.log(`  L${depth}: ${name} → ${bg}`);
    }
    el = el.parentElement;
    depth++;
  }
  if (chainIssues.length === 0) console.log('%c  OK: no white or transparent ancestors', PASS);
  console.groupEnd();

  // ─── 3. Preview wrapper children ───
  console.group('%c3. Preview Wrapper Children', INFO);
  const wrapper = document.getElementById('preview-wrapper');
  if (wrapper) {
    for (const child of wrapper.children) {
      const bg = cs(child, 'backgroundColor');
      const disp = cs(child, 'display');
      const pos = cs(child, 'position');
      const cr = child.getBoundingClientRect();
      const name = child.id || child.tagName;

      let issues = [];
      if (disp !== 'none' && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        issues.push('VISIBLE + TRANSPARENT background');
      }
      if (child.tagName === 'CANVAS' && disp !== 'none') {
        issues.push('Canvas visible (check its rendered content)');
      }

      const tag = issues.length > 0 ? WARN : '';
      console.log(`%c  ${name}: display=${disp} bg=${bg} pos=${pos} ${Math.round(cr.width)}×${Math.round(cr.height)} ${issues.join(' | ')}`, tag);
    }
  }
  console.groupEnd();

  // ─── 4. CSS specificity check ───
  console.group('%c4. CSS Conflicts', INFO);
  // Check if there's a global #preview-wrapper rule that conflicts with #preview-screen #preview-wrapper
  if (wrapper) {
    const display = cs(wrapper, 'display');
    const position = cs(wrapper, 'position');
    const width = cs(wrapper, 'width');
    console.log(`  #preview-wrapper computed: display=${display}, position=${position}, width=${width}`);
    if (position !== 'absolute') {
      console.log('%c  ⚠ #preview-wrapper position is not absolute! Global rule may be overriding.', FAIL);
    }
    if (width !== '247px') {
      console.log(`%c  ⚠ #preview-wrapper width is ${width}, expected 247px!`, FAIL);
    }
  }

  // Check all stylesheets for conflicting #preview-wrapper rules
  let globalPWRules = 0;
  let scopedPWRules = 0;
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (rule.selectorText) {
          if (rule.selectorText === '#preview-wrapper') globalPWRules++;
          if (rule.selectorText.includes('#preview-screen') && rule.selectorText.includes('#preview-wrapper')) scopedPWRules++;
        }
      }
    } catch(e) { /* cross-origin sheet */ }
  }
  console.log(`  CSS rules found: ${globalPWRules} global #preview-wrapper, ${scopedPWRules} scoped #preview-screen #preview-wrapper`);
  if (globalPWRules > 0 && scopedPWRules > 0) {
    console.log('%c  ⚠ Both global and scoped #preview-wrapper rules exist — potential conflict!', WARN);
  }
  console.groupEnd();

  // ─── 5. Gap analysis ───
  console.group('%c5. Rectangle Gap Analysis', INFO);
  const ps = document.getElementById('preview-screen');
  const bg = document.getElementById('preview-bg');
  if (ps && bg && wrapper) {
    const psR = ps.getBoundingClientRect();
    const bgR = bg.getBoundingClientRect();
    const wR = wrapper.getBoundingClientRect();

    // Right edge: is there a gap between wrapper.right and screen.right?
    const rightGap = Math.round(psR.right - wR.right);
    console.log(`  Right edge gap (screen.right - wrapper.right): ${rightGap}px ${rightGap > 0 ? '⚠ GAP' : '✓'}`,
      rightGap > 0 ? WARN : PASS);

    // Check if bg-box fully covers preview-screen
    const bgCoverX = Math.round(bgR.left - psR.left);
    const bgCoverY = Math.round(bgR.top - psR.top);
    console.log(`  BG offset from screen: (${bgCoverX}, ${bgCoverY})`);

    // Bottom gap
    const bottomGap = Math.round(psR.bottom - wR.bottom);
    console.log(`  Bottom gap (screen.bottom - wrapper.bottom): ${bottomGap}px ${bottomGap > 20 ? '⚠ GAP' : '✓'}`,
      bottomGap > 20 ? WARN : PASS);

    // Check if preview-screen itself has any border or radius that could leak
    const psBorder = cs(ps, 'border');
    const psRadius = cs(ps, 'borderRadius');
    console.log(`  preview-screen border: ${psBorder}, radius: ${psRadius}`);

    // bg-box border-radius and border → does the border-radius create transparent corners?
    const bgRadius = cs(bg, 'borderRadius');
    const bgBorder = cs(bg, 'border');
    console.log(`  preview-bg radius: ${bgRadius}, border: ${bgBorder}`);
    if (bgRadius !== '0px' && bgRadius !== '20px') {
      console.log(`%c  ⚠ Unexpected border-radius on preview-bg: ${bgRadius}`, WARN);
    }
  }
  console.groupEnd();

  // ─── 6. Edit mode check ───
  console.group('%c6. Edit Mode State', INFO);
  const isEditing = document.body.classList.contains('editbox-editing');
  console.log(`  body.editbox-editing: ${isEditing ? 'YES (active)' : 'no'}`);

  try {
    if (window.state && window.state.interaction) {
      console.log(`  activeEditBoxId: ${window.state.interaction.activeEditBoxId || 'none'}`);
      console.log(`  editingMarkerId: ${window.state.interaction._editingMarkerId || 'none'}`);
    }
  } catch(e) { console.log('  Cannot read state'); }

  try {
    if (window.fabricCanvas) {
      const objs = window.fabricCanvas.getObjects();
      console.log(`  fabricCanvas objects: ${objs.length}`);
      const ebShapes = objs.filter(o => o._isEditBoxShape);
      if (ebShapes.length > 0) {
        console.log(`  edit box shapes on canvas: ${ebShapes.length}`);
        for (const s of ebShapes) {
          const r = s.getBoundingClientRect();
          console.log(`    ${s._shapeType} "${s.text||''}" at (${Math.round(r.left)},${Math.round(r.top)}) ${Math.round(r.width)}×${Math.round(r.height)}`,
            'color:#88C405');
        }
      }
    }
  } catch(e) { console.log('  Cannot read fabricCanvas'); }
  console.groupEnd();

  // ─── Summary ───
  console.group('%c📊 Summary', 'font-size:14px;font-weight:bold');
  const allIssues = [];

  // Check #preview-bg background
  const bgBg = cs(document.getElementById('preview-bg'), 'backgroundColor');
  if (bgBg === 'rgba(0, 0, 0, 0)' || bgBg === 'transparent') {
    allIssues.push('CRITICAL: #preview-bg is completely transparent — white canvas-wrap shows through');
  }

  // Check canvas-wrap background
  const cwBg = cs(document.getElementById('canvas-wrap'), 'backgroundColor');
  if (cwBg === 'rgb(255, 255, 255)') {
    allIssues.push('ROOT: #canvas-wrap has white background (#ffffff) — fix: change #preview-bg to be opaque, or change canvas-wrap bg');
  }

  // Check for global #preview-wrapper conflict
  if (wrapper && cs(wrapper, 'position') !== 'absolute') {
    allIssues.push('CSS CONFLICT: global #preview-wrapper overrides position to relative');
  }

  if (allIssues.length === 0) {
    console.log('%c  ✓ No issues found. If you still see white, check canvas rendering content.', PASS);
  } else {
    for (const issue of allIssues) {
      console.log(`%c  ✗ ${issue}`, FAIL);
    }
  }
  console.groupEnd();

  console.groupEnd(); // main

  // ─── Visual overlay — highlight potential leak sources ───
  window._diagHighlight = function() {
    // Remove previous overlay
    const prev = document.getElementById('_diag-overlay');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = '_diag-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(overlay);

    // Check every positioned element in the right half of the screen
    const vw = window.innerWidth;
    const rightEdge = vw / 2;
    const all = document.querySelectorAll('*');
    let count = 0;

    all.forEach(el => {
      try {
        const r = el.getBoundingClientRect();
        if (r.left < rightEdge || r.width === 0 || r.height === 0) return;
        const bg = getComputedStyle(el).backgroundColor;
        const pos = getComputedStyle(el).position;
        if (pos === 'static') return; // only positioned elements

        if (bg === 'rgb(255, 255, 255)' || bg === '#ffffff' || bg === '#fff') {
          const box = document.createElement('div');
          box.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px solid red;outline-offset:-1px;`;
          box.title = `${el.id||el.className||el.tagName}: ${bg}`;
          overlay.appendChild(box);
          count++;
        } else if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
          const box = document.createElement('div');
          box.style.cssText = `position:absolute;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:2px dashed orange;outline-offset:-1px;`;
          box.title = `${el.id||el.className||el.tagName}: TRANSPARENT (leak risk)`;
          overlay.appendChild(box);
          count++;
        }
      } catch(e) {}
    });

    console.log(`%c🔴 Red outline = solid WHITE background | 🟠 Orange dashed = TRANSPARENT (leak risk)`, 'font-size:13px');
    console.log(`Highlighted ${count} potential leak sources on the right half of the screen.`);
    console.log(`Call _diagClear() to remove highlights.`);
  };

  window._diagClear = function() {
    const ov = document.getElementById('_diag-overlay');
    if (ov) ov.remove();
  };

  // Auto-run highlight
  console.log('%c💡 Call %c_diagHighlight() %cto visually highlight white/transparent elements on the right side',
    '', 'font-weight:bold;color:#c00', '');
  console.log('%c💡 Call %c_diagClear() %cto remove highlights', '', 'font-weight:bold', '');
})();
