// ================================================================
// DOM refs
// ================================================================
const canvasWrap = document.getElementById('canvas-wrap');
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');
const zoomBadge = document.getElementById('zoom-badge');
const statusCards = document.getElementById('status-cards');
const statusHint = document.getElementById('status-hint');

const helpPanel = document.getElementById('help-panel');
const hiddenVideo = document.getElementById('hidden-video');
const playbackVideo = document.getElementById('preview-video');
const groupPreviewCanvas = document.getElementById('group-preview-canvas');
const volumeInput = document.getElementById('volume-input');
const layerList = document.getElementById('layer-list');
const previewDot = document.getElementById('preview-dot');
const previewTime = document.getElementById('preview-time');
const previewName = document.getElementById('preview-name');
const propsContent = document.getElementById('props-content');
const ctxMenu = document.getElementById('context-menu');

// Transform overlay
const transformOverlayCanvas = document.getElementById('transform-overlay-canvas');
const fullscreenOverlay = document.getElementById('fullscreen-preview-overlay');
const fullscreenCanvas = document.getElementById('fullscreen-preview-canvas');
const eboxImmersiveOverlay = document.getElementById('ebox-immersive-overlay');
const eboxImmersiveCanvas = document.getElementById('ebox-immersive-canvas');
const eboxImmersiveTools = document.getElementById('ebox-immersive-tools');
const previewWrapper = document.getElementById('preview-wrapper');

// ================================================================
// Resize handles — drag to resize left/right panels
// ================================================================
const resizeHandleLeft = document.getElementById('resize-handle-left');
const resizeHandleRight = document.getElementById('resize-handle-right');
const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');

let _resizeState = null; // { handle, startX, startWidth }

function startResize(e, handle, panel) {
  e.preventDefault();
  _resizeState = {
    handle,
    startX: e.clientX,
    startWidth: panel.getBoundingClientRect().width
  };
  handle.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onResizeMove(e) {
  if (!_resizeState) return;
  const dx = e.clientX - _resizeState.startX;
  const handle = _resizeState.handle;
  const panel = handle === resizeHandleLeft ? leftPanel : rightPanel;
  const isRight = handle === resizeHandleRight;

  let newWidth;
  if (isRight) {
    newWidth = _resizeState.startWidth - dx;
  } else {
    newWidth = _resizeState.startWidth + dx;
  }

  // Clamp: min 120px, max 500px
  newWidth = Math.max(120, Math.min(500, newWidth));
  panel.style.width = newWidth + 'px';
}

function stopResize() {
  if (!_resizeState) return;
  _resizeState.handle.classList.remove('active');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  _resizeState = null;
  // Trigger canvas resize after panel resize
  resizeCanvas();
  render();
}

resizeHandleLeft.addEventListener('mousedown', (e) => startResize(e, resizeHandleLeft, leftPanel));
resizeHandleRight.addEventListener('mousedown', (e) => startResize(e, resizeHandleRight, rightPanel));
window.addEventListener('mousemove', onResizeMove);
window.addEventListener('mouseup', stopResize);

// ================================================================
// Canvas setup & resize
// ================================================================
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  syncFabricSizeAndTransform();
}

window.addEventListener('resize', () => {
  resizeCanvas();
  render();
});

// ================================================================
// Coordinate helpers
// ================================================================
function screenToWorld(sx, sy) {
  return {
    x: (sx - state.canvas.offsetX) / state.canvas.zoom,
    y: (sy - state.canvas.offsetY) / state.canvas.zoom
  };
}

function worldToScreen(wx, wy) {
  return {
    x: wx * state.canvas.zoom + state.canvas.offsetX,
    y: wy * state.canvas.zoom + state.canvas.offsetY
  };
}

function getCardWidth(card) {
  if (card.type === 'text') return card.width || 200;
  if (card.type === 'image') return card.width || 200;
  if (card.type === 'composition') {
    const dur = (card.trimOut - card.trimIn) || card.totalDuration || 5;
    return Math.max(CARD_MIN_WIDTH, dur * PIXELS_PER_SECOND);
  }
  const dur = (card.trimOut - card.trimIn) || card.duration;
  return Math.max(CARD_MIN_WIDTH, dur * PIXELS_PER_SECOND);
}

// ================================================================
// Dynamic card coloring
// ================================================================
function isDynamicCard(card) {
  return card.type === 'video' || card.type === 'synthesized-video';
}

function getCardColors(card) {
  if (isDynamicCard(card) && card.accentColor) {
    const { r, g, b } = card.accentColor;
    const blendWhite38 = (c) => Math.round(c + (255 - c) * 0.38);
    const blendWhite35 = (c) => Math.round(c * 0.65 + 255 * 0.35);

    return {
      border: `rgb(${r},${g},${b})`,
      shadow: `rgba(${r},${g},${b},0.18)`,
      gradientTop: `rgba(255,255,255,0)`,
      gradientBot: `rgba(${r},${g},${b},0.25)`,
      badgeFill: `rgba(${blendWhite38(r)},${blendWhite38(g)},${blendWhite38(b)},0.8)`,
      badgeStroke: `rgb(${r},${g},${b})`,
      badgeText: `rgb(${r},${g},${b})`,
      label: `rgb(${r},${g},${b})`,
      duration: `rgb(${blendWhite35(r)},${blendWhite35(g)},${blendWhite35(b)})`,
      handleColor: (alpha) => `rgba(${r},${g},${b},${alpha})`,
    };
  }

  // Non-dynamic or legacy: preserve existing hardcoded type colors
  // (render.js still uses per-type logic via direct color values for non-dynamic cards)
  return {
    border: (card.type === 'audio') ? 'rgb(243,93,93)' : ((card.type === 'composition') ? '#D4FF00' : 'rgb(101,84,203)'),
    shadow: 'rgba(101,84,203,0.18)',
    gradientTop: 'rgba(255,255,255,0)',
    gradientBot: 'rgba(101,84,203,0.25)',
    label: '#1a1a1a',
    duration: '#999',
    handleColor: (alpha) => {
      if (card.type === 'audio') return `rgba(243,93,93,${alpha})`;
      if (card.type === 'composition') return `rgba(212,255,0,${alpha})`;
      return `rgba(101,84,203,${alpha})`;
    },
  };
}

function findGroupContainingCard(cardId) {
  for (const group of state.groups) {
    if (group.cardIds.includes(cardId)) return group;
  }
  return null;
}

function buildGroupTimeline(group) {
  const memberCards = group.cardIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean);
  if (memberCards.length === 0) return null;

  let startX = Infinity, endX = -Infinity;
  const timelineCards = [];

  for (const card of memberCards) {
    const cw = getCardWidth(card);
    if (card.x < startX) startX = card.x;
    if (card.x + cw > endX) endX = card.x + cw;
    timelineCards.push({
      cardId: card.id,
      card,
      x: card.x,
      width: cw,
      localStartTime: card.trimIn,
      localEndTime: card.trimOut
    });
  }

  if (startX >= endX) return null;

  const totalPixels = endX - startX;
  const totalDuration = totalPixels / PIXELS_PER_SECOND;

  return { startX, endX, totalPixels, totalDuration, cards: timelineCards };
}

function buildGroupChains(group) {
  // Build chains from connections within the group.
  // A chain = sequential cards linked by connections, playing in order.
  // Unconnected cards each form their own single-card chain.
  // Chains composite on top of each other (multi-track overlay).
  const conns = state.connections.filter(c =>
    group.cardIds.includes(c.fromCardId) && group.cardIds.includes(c.toCardId) &&
    c.type !== 'keyframe'
  );

  const chains = [];
  const assigned = new Set();
  const targets = new Set(conns.map(c => c.toCardId));

  // Follow chains starting from root cards (not targeted by any connection)
  for (const cardId of group.cardIds) {
    if (assigned.has(cardId)) continue;
    if (targets.has(cardId)) continue;

    const chain = [];
    let current = cardId;
    while (current && group.cardIds.includes(current) && !assigned.has(current)) {
      assigned.add(current);
      const card = state.cards.find(c => c.id === current);
      const nextConn = conns.find(c => c.fromCardId === current);
      chain.push({ cardId: current, card, nextConn: nextConn || null });
      current = nextConn ? nextConn.toCardId : null;
    }
    if (chain.length > 0) chains.push(chain);
  }

  // Remaining cards (e.g. mid-chain starts or circular refs)
  for (const cardId of group.cardIds) {
    if (!assigned.has(cardId)) {
      assigned.add(cardId);
      const card = state.cards.find(c => c.id === cardId);
      chains.push([{ cardId, card, nextConn: null }]);
    }
  }

  return chains;
}

function getDownstreamCardIds(cardId) {
  // BFS from cardId following outgoing connections
  const result = [];
  const visited = new Set([cardId]);
  const queue = [cardId];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const conn of state.connections) {
      if (conn.fromCardId === cur && !visited.has(conn.toCardId)) {
        visited.add(conn.toCardId);
        queue.push(conn.toCardId);
        result.push(conn.toCardId);
      }
    }
  }
  return result;
}

// ================================================================
// Edit box & composition card helpers
// ================================================================
function generateId(prefix) {
  return (prefix || 'el') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function findEditBoxById(id) {
  return state.editBoxes.find(eb => eb.id === id);
}

function findConnectedEditBoxes(ebId) {
  // BFS to find all edit boxes connected via eb-keyframe connections
  const visited = new Set();
  const queue = [ebId];
  visited.add(ebId);
  while (queue.length > 0) {
    const current = queue.shift();
    for (const conn of state.connections) {
      if (conn.type !== 'eb-keyframe') continue;
      let neighbor = null;
      if (conn.fromEditBoxId === current) neighbor = conn.toEditBoxId;
      else if (conn.toEditBoxId === current) neighbor = conn.fromEditBoxId;
      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return Array.from(visited);
}

function findCompositionCardsByEditBoxId(editBoxId) {
  return state.compositionCards.filter(cc => cc.editBoxId === editBoxId);
}

function screenToEditBoxLocal(sx, sy, eb) {
  // Convert screen coords to world coords, then to edit-box local space
  const world = screenToWorld(sx, sy);
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  return {
    x: (world.x - eb.x - cam.offsetX) / cam.zoom,
    y: (world.y - eb.y - cam.offsetY) / cam.zoom
  };
}

function editBoxHitTest(sx, sy, eb) {
  // Shapes are in world coords — convert screen to world for hit testing
  const world = screenToWorld(sx, sy);
  const shapes = eb.shapes || [];
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const hitR = 8;
    if (s.shapeType === 'rect' || s.shapeType === 'text') {
      if (world.x >= s.left - hitR && world.x <= s.left + (s.width || 100) + hitR &&
          world.y >= s.top - hitR && world.y <= s.top + (s.height || 40) + hitR) {
        return i;
      }
    } else if (s.shapeType === 'ellipse') {
      const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
      const rx = s.width / 2 + hitR, ry = s.height / 2 + hitR;
      if (((world.x - cx) ** 2) / (rx * rx) + ((world.y - cy) ** 2) / (ry * ry) <= 1) {
        return i;
      }
    } else if (s.shapeType === 'line') {
      const d1 = Math.sqrt((world.x - s.x1) ** 2 + (world.y - s.y1) ** 2);
      const d2 = Math.sqrt((world.x - s.x2) ** 2 + (world.y - s.y2) ** 2);
      if (d1 <= hitR || d2 <= hitR) return i;
      const ldx = s.x2 - s.x1, ldy = s.y2 - s.y1;
      const lenSq = ldx * ldx + ldy * ldy;
      if (lenSq > 0) {
        let t = Math.max(0, Math.min(1, ((world.x - s.x1) * ldx + (world.y - s.y1) * ldy) / lenSq));
        const px = s.x1 + t * ldx, py = s.y1 + t * ldy;
        if (Math.sqrt((world.x - px) ** 2 + (world.y - py) ** 2) <= hitR) return i;
      }
    }
  }
  return -1;
}

// ================================================================
// Edit Box keyframe chain helpers
// ================================================================
function buildEditBoxChain(startEditBoxId) {
  // BFS from startEditBoxId along eb-keyframe connections to find the complete chain.
  // Returns an ordered array of editBoxId strings (left-to-right by x position).
  const visited = new Set();
  const queue = [startEditBoxId];
  const allNodes = [];

  // Collect all connected edit boxes via BFS
  while (queue.length > 0) {
    const cur = queue.shift();
    if (visited.has(cur)) continue;
    visited.add(cur);
    allNodes.push(cur);

    // Find all eb-keyframe connections involving this edit box
    for (const conn of state.connections) {
      if (conn.type !== 'eb-keyframe') continue;
      if (conn.fromEditBoxId === cur && !visited.has(conn.toEditBoxId)) {
        queue.push(conn.toEditBoxId);
      }
      if (conn.toEditBoxId === cur && !visited.has(conn.fromEditBoxId)) {
        queue.push(conn.fromEditBoxId);
      }
    }
  }

  // Sort by x position (left to right)
  const ebs = allNodes.map(id => findEditBoxById(id)).filter(Boolean);
  ebs.sort((a, b) => a.x - b.x);
  return ebs.map(eb => eb.id);
}

function getEditBoxChainDuration(chain) {
  // Total duration = accumulated transition times or spatial distances between adjacent boxes
  if (!chain || chain.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < chain.length - 1; i++) {
    const eb = findEditBoxById(chain[i]);
    const nextEb = findEditBoxById(chain[i + 1]);
    if (!eb || !nextEb) continue;
    const conn = state.connections.find(c =>
      c.type === 'eb-keyframe' &&
      ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
       (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
    );
    if (conn && conn.transitionDuration > 0) {
      total += conn.transitionDuration;
    } else {
      total += Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
    }
  }
  return Math.max(0.5, total);
}

function getEditBoxTimeInChain(chain, editBoxId) {
  // Returns the time offset (seconds) of a given edit box within the chain
  if (!chain || chain.length === 0) return 0;
  const firstEb = findEditBoxById(chain[0]);
  if (!firstEb) return 0;
  const targetIdx = chain.indexOf(editBoxId);
  if (targetIdx < 0) return 0;
  let total = 0;
  for (let i = 0; i < targetIdx; i++) {
    const eb = findEditBoxById(chain[i]);
    const nextEb = findEditBoxById(chain[i + 1]);
    if (!eb || !nextEb) continue;
    const conn = state.connections.find(c =>
      c.type === 'eb-keyframe' &&
      ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
       (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
    );
    if (conn && conn.transitionDuration > 0) {
      total += conn.transitionDuration;
    } else {
      total += Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
    }
  }
  return Math.max(0, total);
}

function lerpColor(cA, cB, t) {
  // Interpolate between two hex colors in HSL space (沿色环最短路径)
  if (!cA || !cB || typeof cA !== 'string' || typeof cB !== 'string') return cB || cA;

  const hexToRgb = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length !== 6) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255
    };
  };

  const rgbToHsl = ({ r, g, b }) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h, s, l };
  };

  const hslToRgb = ({ h, s, l }) => {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };

  const a = hexToRgb(cA), b = hexToRgb(cB);
  if (!a || !b) return cB || cA;

  const hslA = rgbToHsl(a), hslB = rgbToHsl(b);

  // Hue: shortest path on the color wheel
  let dH = hslB.h - hslA.h;
  if (dH > 0.5) dH -= 1;
  if (dH < -0.5) dH += 1;
  const h = ((hslA.h + dH * t) % 1 + 1) % 1;
  const s = lerp(hslA.s, hslB.s, t);
  const l = lerp(hslA.l, hslB.l, t);

  const rgb = hslToRgb({ h, s, l });
  return '#' + rgb.r.toString(16).padStart(2, '0') + rgb.g.toString(16).padStart(2, '0') + rgb.b.toString(16).padStart(2, '0');
}

function interpolateShapes(shapesA, shapesB, t, easing) {
  // Interpolate shapes between two edit boxes.
  // t = 0..1 (0 = shapesA, 1 = shapesB)
  // easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  const et = applyEasing(t, easing || 'linear');

  const result = [];
  const shapesAIndex = {};
  const shapesBIndex = {};

  // Index shapes by id
  for (const s of (shapesA || [])) {
    shapesAIndex[s.id] = s;
  }
  for (const s of (shapesB || [])) {
    shapesBIndex[s.id] = s;
  }

  // Keep track of which shapesB have been processed
  const processedB = new Set();

  // Process shapes from A
  for (const s of (shapesA || [])) {
    const sB = shapesBIndex[s.id];
    if (sB) {
      processedB.add(s.id);
      if (s.shapeType !== sB.shapeType) {
        console.warn('interpolateShapes: shape ' + s.id + ' type mismatch (' + s.shapeType + ' vs ' + sB.shapeType + '), skipping interpolation');
        // Keep the A shape but fade it out
        result.push({ ...s, opacity: (s.opacity != null ? s.opacity : 1) * (1 - et) });
        continue;
      }
      // Same type — interpolate common properties
      const interp = { ...s };
      interp.left = lerp(s.left, sB.left, et);
      interp.top = lerp(s.top, sB.top, et);
      interp.width = lerp(s.width || 0, sB.width || 0, et);
      interp.height = lerp(s.height || 0, sB.height || 0, et);
      interp.opacity = lerp(s.opacity != null ? s.opacity : 1, sB.opacity != null ? sB.opacity : 1, et);
      if (s.shapeType === 'line') {
        interp.x1 = lerp(s.x1, sB.x1, et);
        interp.y1 = lerp(s.y1, sB.y1, et);
        interp.x2 = lerp(s.x2, sB.x2, et);
        interp.y2 = lerp(s.y2, sB.y2, et);
        interp.strokeWidth = lerp(s.strokeWidth || 2, sB.strokeWidth || 2, et);
      }
      if (s.shapeType === 'text') {
        interp.fontSize = lerp(s.fontSize || 24, sB.fontSize || 24, et);
      }
      interp.angle = lerp(s.angle || 0, sB.angle || 0, et);
      // Interpolate fill and stroke colors
      if (s.fill && sB.fill) {
        interp.fill = lerpColor(s.fill, sB.fill, et);
      } else if (sB.fill) {
        interp.fill = sB.fill;
      }
      if (s.stroke && sB.stroke) {
        interp.stroke = lerpColor(s.stroke, sB.stroke, et);
      } else if (sB.stroke) {
        interp.stroke = sB.stroke;
      }
      result.push(interp);
    } else {
      // Shape only in A — fade out
      const faded = { ...s };
      faded.opacity = (s.opacity != null ? s.opacity : 1) * (1 - et);
      result.push(faded);
    }
  }

  // Process shapes only in B — fade in
  for (const s of (shapesB || [])) {
    if (processedB.has(s.id)) continue;
    const fadedIn = { ...s };
    fadedIn.opacity = (s.opacity != null ? s.opacity : 1) * et;
    result.push(fadedIn);
  }

  return result;
}

// Check if two edit box shapes lists share at least one shape with the same id and type
function hasCommonShapes(shapesA, shapesB) {
  if (!shapesA || !shapesB || shapesA.length === 0 || shapesB.length === 0) return false;
  const indexB = {};
  for (const s of shapesB) {
    indexB[s.id] = s;
  }
  for (const s of shapesA) {
    if (indexB[s.id] && indexB[s.id].shapeType === s.shapeType) return true;
  }
  return false;
}

