// ================================================================
// Transform Overlay — video transform controls on preview panel
// ================================================================
state.transform = { dragMode: null }; // null | 'body' | 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'

function calculateVideoRect(card) {
  const outW = 320, outH = 180;
  if (card.type !== 'video') return null;
  // Always use fixed 16:9 output frame as reference — no async video dimension
  // detection. This matches compositeGroupFrame behavior for 16:9 sources where
  // the unscaled video fills the entire output. Anchors at top-left (tx, ty).
  const ts = card.transformScale || 1.0;
  const tx = card.transformX || 0;
  const ty = card.transformY || 0;
  return {
    x: tx,
    y: ty,
    w: outW * ts,
    h: outH * ts
  };
}

function shouldShowOverlay() {
  // Show overlay when paused (group mode or card-in-group)
  if (state.playback.isPlaying) {
    return false;
  }
  if (state.playback.pausedAt <= 0) return false;
  if (state.playback.playbackMode === 'group') return true;
  // Also accept linear mode if the selected card belongs to a group
  // (the card-body handler auto-switches to group mode, but this covers edge cases)
  if (state.selection.cardIds.length === 1) {
    const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
    if (card && state.groups.some(g => g.cardIds.includes(card.id))) {
      return true;
    }
  }
  return false;
}

function shouldShowHandles() {
  // Handles only shown when exactly 1 video card is selected
  if (state.selection.cardIds.length !== 1) return false;
  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card || card.type !== 'video') return false;
  return true;
}

// Seek the group playhead so the given card is visible in the preview.
function seekPlayheadToCard(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'video') return;
  const gp = state.playback.groupPlayback;
  if (!gp) return;
  const newPausedAt = (card.x - gp.groupStartX) / PIXELS_PER_SECOND;
  // Use a tiny epsilon so pausedAt > 0 even for cards at the very start of the group,
  // otherwise shouldShowOverlay() returns false and transform handles never appear.
  state.playback.pausedAt = Math.max(0.001, newPausedAt);
}

// ---- Diagnostic: one-shot snapshot of the card-edit flow ----
function _diagnoseCardEdit(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  const gp = state.playback.groupPlayback;
  const group = gp ? state.groups.find(g => g.id === gp.groupId) : null;
  const pb = state.playback;

  console.group('%c[DIAGNOSE] Card Edit Flow: ' + cardId, 'color:#ff0;font-weight:bold');

  // 1. Card info
  if (card) {
    console.log('Card:', {
      id: card.id, type: card.type, x: card.x, y: card.y,
      width: getCardWidth(card),
      transformScale: card.transformScale, transformX: card.transformX, transformY: card.transformY
    });
  } else {
    console.log('Card: NOT FOUND');
  }

  // 2. Group info
  console.log('Group:', group ? {
    id: group.id, cardIds: group.cardIds, collapsed: group.collapsed
  } : 'null');

  // 3. Playback state BEFORE any changes
  console.log('Playback:', {
    isPlaying: pb.isPlaying, playbackMode: pb.playbackMode, pausedAt: pb.pausedAt,
    groupStartX: gp ? gp.groupStartX : 'N/A',
    groupEndX: gp ? gp.groupEndX : 'N/A',
    timelineCardsLen: gp ? (gp.timelineCards ? gp.timelineCards.length : 0) : 'N/A'
  });

  // 4. Chain analysis
  if (group && !group.collapsed) {
    const chains = buildGroupChains(group);
    console.log('Chains (' + chains.length + '):');
    for (let ci = 0; ci < chains.length; ci++) {
      const chain = chains[ci];
      const chainDesc = chain.map((seg, i) => {
        const c = seg.card;
        const cw = c ? getCardWidth(c) : 0;
        const conn = seg.nextConn;
        return '[' + i + '] ' + (c ? c.id.slice(-8) : '?') +
          ' x=' + (c ? c.x : '?') + ' w=' + cw +
          (conn ? ' →(' + conn.transition + ' ' + conn.transitionDuration + 's)→' : '');
      }).join(' | ');
      console.log('  Chain ' + ci + ': ' + chainDesc);

      // Find the card in this chain
      const segIdx = chain.findIndex(s => s.card && s.card.id === cardId);
      if (segIdx >= 0) {
        console.log('  ↑ Card ' + cardId.slice(-8) + ' is at index ' + segIdx + ' in chain ' + ci);
      }
    }
  }

  // 5. Simulate: what will seekPlayheadToCard do?
  if (card && gp) {
    const rawPausedAt = (card.x - gp.groupStartX) / PIXELS_PER_SECOND;
    const finalPausedAt = Math.max(0.001, rawPausedAt);
    console.log('seekPlayheadToCard simulation:', {
      rawPausedAt: rawPausedAt, finalPausedAt: finalPausedAt,
      wouldBeZero: rawPausedAt <= 0
    });
  }

  // 6. After recomposite: what does getActiveCardIdsAtPlayhead say?
  if (group && gp && !group.collapsed) {
    const playheadX = gp.groupStartX + (pb.pausedAt * PIXELS_PER_SECOND);
    const activeIds = getActiveCardIdsAtPlayhead(group, playheadX);
    console.log('Active at playheadX=' + playheadX.toFixed(2) + ':',
      Array.from(activeIds).map(id => id.slice(-8)),
      '| includes target?', activeIds.has(cardId));
  }

  // 7. Overlay/handles checks
  console.log('shouldShowOverlay:', shouldShowOverlay());
  console.log('shouldShowHandles:', shouldShowHandles());

  // 8. calculateVideoRect
  if (card) {
    const rect = calculateVideoRect(card);
    console.log('calculateVideoRect:', rect);
  }

  // 9. ALL video cards in group comparison
  if (group) {
    const allVideoCards = group.cardIds
      .map(cid => state.cards.find(c => c.id === cid))
      .filter(c => c && c.type === 'video');
    console.log('ALL GROUP VIDEO CARDS:',
      allVideoCards.map(c => ({
        id: c.id.slice(-8),
        label: c.label,
        x: c.x,
        w: getCardWidth(c),
        fileURL: c.fileURL ? c.fileURL.slice(-30) : 'none',
        scale: c.transformScale,
        tx: c.transformX,
        ty: c.transformY,
        trimIn: c.trimIn,
        trimOut: c.trimOut
      })));
    // Check if any share the same fileURL
    const urlMap = {};
    for (const c of allVideoCards) {
      if (!urlMap[c.fileURL]) urlMap[c.fileURL] = [];
      urlMap[c.fileURL].push(c.id.slice(-8));
    }
    for (const [url, ids] of Object.entries(urlMap)) {
      if (ids.length > 1) {
        console.log('⚠️ SHARED SOURCE: ' + url.slice(-30) + ' → cards [' + ids.join(', ') + ']');
      }
    }
  }

  console.groupEnd();
}

// Get the set of card IDs that are active (visible in draw list) at the given playhead.
// Mirrors the chain/playhead logic in compositeGroupFrame.
function getActiveCardIdsAtPlayhead(group, playheadX) {
  const active = new Set();
  const chains = buildGroupChains(group);
  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];
      const card = seg.card;
      if (!card || card.type !== 'video') continue;
      const cw = getCardWidth(card);
      if (playheadX < card.x || playheadX >= card.x + cw) continue;
      if (i > 0) {
        const prevSeg = chain[i - 1];
        const prevCard = prevSeg.card;
        const prevConn = prevSeg.nextConn;
        if (prevCard) {
          const prevCw = getCardWidth(prevCard);
          const transDur = (prevConn && prevConn.transitionDuration) || 0.5;
          const transPx = transDur * PIXELS_PER_SECOND;
          const transStart = prevCard.x + prevCw - transPx;
          if (playheadX < transStart) continue;
        }
      }
      active.add(card.id);
      break;
    }
  }
  return active;
}

// Hit test: which video card in the current group is at (mx, my) in overlay CSS coordinates?
// Returns cardId or null. Only considers cards active at the current playhead.
function hitTestVideoInGroup(mx, my) {
  if (state.playback.playbackMode !== 'group') return null;
  const group = state.groups.find(g => g.id === state.playback.groupPlayback.groupId);
  if (!group || group.collapsed) return null;

  const cssW = groupPreviewCanvas.getBoundingClientRect().width;
  const cssH = groupPreviewCanvas.getBoundingClientRect().height;
  if (cssW <= 0 || cssH <= 0) return null;

  const sx = cssW / 320;
  const sy = cssH / 180;

  const gp = state.playback.groupPlayback;
  const playheadX = gp ? (gp.groupStartX + (state.playback.pausedAt * PIXELS_PER_SECOND)) : 0;
  const activeIds = getActiveCardIdsAtPlayhead(group, playheadX);

  const memberCards = group.cardIds
    .map(id => state.cards.find(c => c.id === id))
    .filter(c => c && c.type === 'video' && activeIds.has(c.id))
    .sort((a, b) => a.y - b.y);

  for (let i = 0; i < memberCards.length; i++) {
    const card = memberCards[i];
    const rect = calculateVideoRect(card);
    if (!rect) continue;
    const rx = rect.x * sx;
    const ry = rect.y * sy;
    const rw = rect.w * sx;
    const rh = rect.h * sy;
    if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
      return card.id;
    }
  }
  return null;
}

// Same as hitTestVideoInGroup but uses pre-computed scale factors (for fullscreen)
function hitTestVideoInGroupFS(mx, my, sx, sy) {
  if (state.playback.playbackMode !== 'group') return null;
  const group = state.groups.find(g => g.id === state.playback.groupPlayback.groupId);
  if (!group || group.collapsed) return null;

  const gp = state.playback.groupPlayback;
  const playheadX = gp ? (gp.groupStartX + (state.playback.pausedAt * PIXELS_PER_SECOND)) : 0;
  const activeIds = getActiveCardIdsAtPlayhead(group, playheadX);

  const memberCards = group.cardIds
    .map(id => state.cards.find(c => c.id === id))
    .filter(c => c && c.type === 'video' && activeIds.has(c.id))
    .sort((a, b) => a.y - b.y);

  for (let i = 0; i < memberCards.length; i++) {
    const card = memberCards[i];
    const rect = calculateVideoRect(card);
    if (!rect) continue;
    const rx = rect.x * sx;
    const ry = rect.y * sy;
    const rw = rect.w * sx;
    const rh = rect.h * sy;
    if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
      return card.id;
    }
  }
  return null;
}

function renderTransformOverlay() {
  const shouldShow = shouldShowOverlay();
  if (!shouldShow) {
    transformOverlayCanvas.style.display = 'none';
    return;
  }

  // Get preview canvas actual CSS size
  const previewRect = groupPreviewCanvas.getBoundingClientRect();
  const parentRect = previewWrapper.getBoundingClientRect();
  const cssW = previewRect.width;
  const cssH = previewRect.height;
  if (cssW <= 0 || cssH <= 0) {
    transformOverlayCanvas.style.display = 'none';
    return;
  }

  // Position overlay canvas to match preview canvas
  const ol = previewRect.left - parentRect.left;
  const ot = previewRect.top - parentRect.top;

  const dpr = window.devicePixelRatio || 1;
  transformOverlayCanvas.style.display = 'block';
  transformOverlayCanvas.style.left = ol + 'px';
  transformOverlayCanvas.style.top = ot + 'px';
  transformOverlayCanvas.style.width = cssW + 'px';
  transformOverlayCanvas.style.height = cssH + 'px';
  transformOverlayCanvas.width = cssW * dpr;
  transformOverlayCanvas.height = cssH * dpr;

  const ta = transformOverlayCanvas.getContext('2d');
  ta.setTransform(dpr, 0, 0, dpr, 0, 0);
  ta.clearRect(0, 0, cssW, cssH);

  // Only draw handles if a video card is selected
  if (!shouldShowHandles()) return;

  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card) return;

  const rect = calculateVideoRect(card);
  if (!rect) return;

  // Map 320x180 -> CSS
  const sx = cssW / 320;
  const sy = cssH / 180;

  const rx = rect.x * sx;
  const ry = rect.y * sy;
  const rw = rect.w * sx;
  const rh = rect.h * sy;
  const handleSize = 8;

  // Draw dashed border
  ta.strokeStyle = '#ffffff';
  ta.lineWidth = 1.5;
  ta.setLineDash([4, 3]);
  ta.strokeRect(rx, ry, rw, rh);
  ta.setLineDash([]);

  // Draw 8 handles
  const handles = [
    { id: 'nw', x: rx, y: ry },
    { id: 'n', x: rx + rw / 2, y: ry },
    { id: 'ne', x: rx + rw, y: ry },
    { id: 'e', x: rx + rw, y: ry + rh / 2 },
    { id: 'se', x: rx + rw, y: ry + rh },
    { id: 's', x: rx + rw / 2, y: ry + rh },
    { id: 'sw', x: rx, y: ry + rh },
    { id: 'w', x: rx, y: ry + rh / 2 }
  ];

  ta.fillStyle = '#ffffff';
  ta.strokeStyle = '#D4FF00';
  ta.lineWidth = 1.5;
  for (const h of handles) {
    ta.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    ta.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
  }
}

// ---- Transform interaction ----

function hitTestHandle(mx, my, optCard) {
  const card = optCard || state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card) return null;
  const rect = calculateVideoRect(card);
  if (!rect) return null;

  const previewEl = groupPreviewCanvas;
  const cssW = previewEl.getBoundingClientRect().width;
  const cssH = previewEl.getBoundingClientRect().height;
  if (cssW <= 0 || cssH <= 0) return null;

  const sx = cssW / 320;
  const sy = cssH / 180;

  const rx = rect.x * sx;
  const ry = rect.y * sy;
  const rw = rect.w * sx;
  const rh = rect.h * sy;
  const hitR = 8;

  const handles = [
    { id: 'nw', cx: rx, cy: ry },
    { id: 'n', cx: rx + rw / 2, cy: ry },
    { id: 'ne', cx: rx + rw, cy: ry },
    { id: 'e', cx: rx + rw, cy: ry + rh / 2 },
    { id: 'se', cx: rx + rw, cy: ry + rh },
    { id: 's', cx: rx + rw / 2, cy: ry + rh },
    { id: 'sw', cx: rx, cy: ry + rh },
    { id: 'w', cx: rx, cy: ry + rh / 2 }
  ];

  for (const h of handles) {
    if (Math.abs(mx - h.cx) <= hitR && Math.abs(my - h.cy) <= hitR) return h.id;
  }

  // Body hit test
  if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return 'body';

  return null;
}

function getCursorForHandle(handleId) {
  const cursors = {
    nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
    e: 'e-resize', se: 'se-resize', s: 's-resize',
    sw: 'sw-resize', w: 'w-resize', body: 'move'
  };
  return cursors[handleId] || 'default';
}

let _transformDragState = null;

function _ensureGroupPlaybackMode() {
  const pb = state.playback;
  if (pb.pausedAt <= 0) return false;
  if (pb.playbackMode === 'group') return true;
  // Auto-switch to group mode if we're paused and there's a selected card in a group
  const selCardId = state.selection.cardIds.length === 1 ? state.selection.cardIds[0] : null;
  if (!selCardId) return false;
  const card = state.cards.find(c => c.id === selCardId);
  if (!card) return false;
  const parentGroup = state.groups.find(g => g.cardIds.includes(card.id));
  if (!parentGroup || parentGroup.collapsed) return false;
  const timeline = buildGroupTimeline(parentGroup);
  if (!timeline) return false;
  pb.playbackMode = 'group';
  pb.sequence = [];
  pb.currentCardId = null;
  pb.currentSeqIndex = 0;
  pb.cardProgress = 0;
  pb.pausedCardTime = 0;
  pb.totalDuration = timeline.totalDuration;
  pb.inTransition = false;
  pb.transitionConn = null;
  pb.transitionProgress = 0;
  pb._dissolveOverlayCanvas = null;
  pb._groupPlayheadX = timeline.startX + pb.pausedAt * PIXELS_PER_SECOND;
  pb.groupPlayback = {
    groupId: parentGroup.id,
    groupStartX: timeline.startX,
    groupEndX: timeline.endX,
    totalPixels: timeline.totalPixels,
    timelineCards: timeline.cards
  };
  pb._groupPlaybackGroup = parentGroup;
  preloadGroupVideoEntries(parentGroup);
  return true;
}

function _recompositePreviewForTransform() {
  const pb = state.playback;
  if (!_ensureGroupPlaybackMode()) return null;
  // Clear stale effective props so compositeGroupFrame reads live card transform values
  delete pb._effectiveProps;
  const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
  if (group && !group.collapsed) {
    const playheadX = pb.groupPlayback.groupStartX + (pb.pausedAt * PIXELS_PER_SECOND);
    const resultCanvas = compositeGroupFrame(group, pb.groupPlayback.timelineCards || [], playheadX);
    if (resultCanvas) {
      groupPreviewCanvas.width = 320;
      groupPreviewCanvas.height = 180;
      const pc = groupPreviewCanvas.getContext('2d');
      pc.drawImage(resultCanvas, 0, 0);
      const displayW = rightPanel.clientWidth - 24;
      groupPreviewCanvas.style.width = displayW + 'px';
      groupPreviewCanvas.style.height = (displayW * 180 / 320) + 'px';
      groupPreviewCanvas.style.display = 'block';
      playbackVideo.style.display = 'none';
      return resultCanvas;
    }
  }
  return null;
}

function _recompositeFullscreenForTransform() {
  if (!fullscreenOverlay.classList.contains('fullscreen-active')) return;
  const pb = state.playback;
  if (!_ensureGroupPlaybackMode()) return;
  const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
  if (group && !group.collapsed) {
    const fw = parseInt(fullscreenCanvas.style.width);
    const fh = parseInt(fullscreenCanvas.style.height);
    if (fw > 0 && fh > 0) {
      const playheadX = pb.groupPlayback.groupStartX + (pb.pausedAt * PIXELS_PER_SECOND);
      // Composite at fullscreen resolution to avoid blur
      const resultCanvas = compositeGroupFrame(group, pb.groupPlayback.timelineCards || [], playheadX, Math.round(fw), Math.round(fh));
      const dpr = window.devicePixelRatio || 1;
      const fc = fullscreenCanvas.getContext('2d');
      fc.setTransform(dpr, 0, 0, dpr, 0, 0);
      fc.fillStyle = '#000';
      fc.fillRect(0, 0, fw, fh);
      if (resultCanvas) {
        fc.drawImage(resultCanvas, 0, 0);
      } else if (groupPreviewCanvas.width > 0 && groupPreviewCanvas.height > 0) {
        fc.drawImage(groupPreviewCanvas, 0, 0, fw, fh);
      }
      // Draw transform handles if a video card is selected
      if (shouldShowHandles()) {
        drawFullscreenHandles(fc, fw, fh);
      }
    }
  }
}

function drawFullscreenHandles(fc, fw, fh) {
  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card) return;
  const rect = calculateVideoRect(card);
  if (!rect) return;

  const sx = fw / 320;
  const sy = fh / 180;
  const rx = rect.x * sx;
  const ry = rect.y * sy;
  const rw = rect.w * sx;
  const rh = rect.h * sy;
  const handleSize = 10;

  // Dashed border
  fc.save();
  fc.strokeStyle = '#ffffff';
  fc.lineWidth = 1.5;
  fc.setLineDash([4, 3]);
  fc.strokeRect(rx, ry, rw, rh);
  fc.setLineDash([]);

  // 8 handles
  const handles = [
    { x: rx, y: ry },                    // nw
    { x: rx + rw / 2, y: ry },           // n
    { x: rx + rw, y: ry },               // ne
    { x: rx + rw, y: ry + rh / 2 },      // e
    { x: rx + rw, y: ry + rh },          // se
    { x: rx + rw / 2, y: ry + rh },      // s
    { x: rx, y: ry + rh },               // sw
    { x: rx, y: ry + rh / 2 }            // w
  ];

  fc.fillStyle = '#ffffff';
  fc.strokeStyle = '#D4FF00';
  fc.lineWidth = 1.5;
  for (const h of handles) {
    fc.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    fc.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
  }
  fc.restore();
}

transformOverlayCanvas.addEventListener('mousedown', (e) => {
  // Auto-pause if playing
  if (state.playback.isPlaying) {
    togglePlayback();
  }

  const shouldShow = shouldShowOverlay();
  if (!shouldShow) return;
  e.preventDefault();

  const oRect = transformOverlayCanvas.getBoundingClientRect();
  const mx = e.clientX - oRect.left;
  const my = e.clientY - oRect.top;

  // Step 1: If a video card is already selected, check handle/body hits first
  if (shouldShowHandles()) {
    const selCard = state.cards.find(c => c.id === state.selection.cardIds[0]);
    if (selCard && selCard.type === 'video') {
      const handle = hitTestHandle(mx, my, selCard);
      if (handle === 'body') {
        // Body hit on selected card → start body drag
        const videoRect = calculateVideoRect(selCard);
        if (videoRect) {
          pushUndo();
          _transformDragState = {
            cardId: selCard.id, handle: 'body',
            startMouseX: e.clientX, startMouseY: e.clientY,
            startTransformScale: selCard.transformScale || 1.0,
            startTransformX: selCard.transformX || 0,
            startTransformY: selCard.transformY || 0,
            startRect: { ...videoRect }, isFullscreen: false
          };
          if (selCard.transformScale == null) selCard.transformScale = 1.0;
          if (selCard.transformX == null) selCard.transformX = 0;
          if (selCard.transformY == null) selCard.transformY = 0;
          state.transform.dragMode = 'body';
          renderTransformOverlay();
          e.stopPropagation();
          return;
        }
      } else if (handle) {
        // Handle hit → start corner/edge drag
        const videoRect = calculateVideoRect(selCard);
        if (videoRect) {
          pushUndo();
          _transformDragState = {
            cardId: selCard.id, handle,
            startMouseX: e.clientX, startMouseY: e.clientY,
            startTransformScale: selCard.transformScale || 1.0,
            startTransformX: selCard.transformX || 0,
            startTransformY: selCard.transformY || 0,
            startRect: { ...videoRect }, isFullscreen: false
          };
          if (selCard.transformScale == null) selCard.transformScale = 1.0;
          if (selCard.transformX == null) selCard.transformX = 0;
          if (selCard.transformY == null) selCard.transformY = 0;
          state.transform.dragMode = handle;
          renderTransformOverlay();
          e.stopPropagation();
          return;
        }
      }
      // If handle hit test returned null (click outside the selected card's rect),
      // fall through to Step 2 to pick a different card.
    }
  }

  // Step 2: Click-to-select — find which video card is under the cursor
  const hitCardId = hitTestVideoInGroup(mx, my);
  if (hitCardId) {
    state.selection.cardIds = [hitCardId];
    state.selection.groupIds = [];
    if (_ensureGroupPlaybackMode()) {
      seekPlayheadToCard(hitCardId);
      _recompositePreviewForTransform();
      renderTransformOverlay();
    }
    render();
    return;
  }
});

window.addEventListener('mousemove', (e) => {
  // If not in drag, just update cursor
  if (!state.transform.dragMode) {
    if (shouldShowOverlay()) {
      const oRect = transformOverlayCanvas.getBoundingClientRect();
      const mx = e.clientX - oRect.left;
      const my = e.clientY - oRect.top;
      if (shouldShowHandles()) {
        const handle = hitTestHandle(mx, my);
        transformOverlayCanvas.style.cursor = handle ? getCursorForHandle(handle) : 'default';
      } else {
        // No card selected yet — show pointer if a video is under the cursor (click-to-select)
        const hitId = hitTestVideoInGroup(mx, my);
        transformOverlayCanvas.style.cursor = hitId ? 'pointer' : 'default';
      }
    }
    return;
  }

  const ds = _transformDragState;
  if (!ds) return;

  // Card may have changed
  if (state.selection.cardIds[0] !== ds.cardId) {
    state.transform.dragMode = null;
    _transformDragState = null;
    return;
  }

  const card = state.cards.find(c => c.id === ds.cardId);
  if (!card) { state.transform.dragMode = null; _transformDragState = null; return; }

  // Use appropriate canvas dimensions based on mode
  let cssW, cssH;
  if (ds.isFullscreen) {
    const fRect = fullscreenCanvas.getBoundingClientRect();
    cssW = fRect.width;
    cssH = fRect.height;
  } else {
    cssW = groupPreviewCanvas.getBoundingClientRect().width;
    cssH = groupPreviewCanvas.getBoundingClientRect().height;
  }
  if (cssW <= 0 || cssH <= 0) return;

  const sx = cssW / 320;
  const sy = cssH / 180;

  const dx = (e.clientX - ds.startMouseX) / sx;
  const dy = (e.clientY - ds.startMouseY) / sy;

  const sr = ds.startRect;
  const srCenterX = sr.x + sr.w / 2;
  const srCenterY = sr.y + sr.h / 2;

  if (ds.handle === 'body') {
    // Translate
    card.transformX = ds.startTransformX + dx;
    card.transformY = ds.startTransformY + dy;
  } else {
    // Uniform scale from handle.
    // Anchor is the opposite corner/edge.
    // newScale = startScale * ratio, where ratio depends on handle and dx/dy.
    let ratioX, ratioY, useRatio;
    switch (ds.handle) {
      case 'nw': ratioX = 1 - dx / sr.w; ratioY = 1 - dy / sr.h; useRatio = Math.max(ratioX, ratioY); break;
      case 'n':  ratioX = 1;              ratioY = 1 - dy / sr.h; useRatio = ratioY; break;
      case 'ne': ratioX = 1 + dx / sr.w;  ratioY = 1 - dy / sr.h; useRatio = Math.max(ratioX, ratioY); break;
      case 'e':  ratioX = 1 + dx / sr.w;  ratioY = 1;              useRatio = ratioX; break;
      case 'se': ratioX = 1 + dx / sr.w;  ratioY = 1 + dy / sr.h;  useRatio = Math.max(ratioX, ratioY); break;
      case 's':  ratioX = 1;              ratioY = 1 + dy / sr.h;  useRatio = ratioY; break;
      case 'sw': ratioX = 1 - dx / sr.w;  ratioY = 1 + dy / sr.h;  useRatio = Math.max(ratioX, ratioY); break;
      case 'w':  ratioX = 1 - dx / sr.w;  ratioY = 1;              useRatio = ratioX; break;
      default: return;
    }

    const newScale = Math.max(0.1, Math.min(5.0, ds.startTransformScale * useRatio));
    card.transformScale = newScale;

    // Now adjust tx, ty so the anchor point stays fixed.
    // Compute where the anchor would be in the new rect (without position adjustment),
    // then shift so it stays at its original position.
    const newRect = calculateVideoRect(card);
    if (newRect) {
      let expectedAnchorX, expectedAnchorY;
      switch (ds.handle) {
        case 'nw': expectedAnchorX = sr.x + sr.w; expectedAnchorY = sr.y + sr.h; break;
        case 'n':  expectedAnchorX = srCenterX;   expectedAnchorY = sr.y + sr.h; break;
        case 'ne': expectedAnchorX = sr.x;        expectedAnchorY = sr.y + sr.h; break;
        case 'e':  expectedAnchorX = sr.x;        expectedAnchorY = srCenterY; break;
        case 'se': expectedAnchorX = sr.x;        expectedAnchorY = sr.y; break;
        case 's':  expectedAnchorX = srCenterX;   expectedAnchorY = sr.y; break;
        case 'sw': expectedAnchorX = sr.x + sr.w; expectedAnchorY = sr.y; break;
        case 'w':  expectedAnchorX = sr.x + sr.w; expectedAnchorY = srCenterY; break;
        default:   expectedAnchorX = srCenterX;   expectedAnchorY = srCenterY;
      }
      let actualAnchorX, actualAnchorY;
      switch (ds.handle) {
        case 'nw': actualAnchorX = newRect.x + newRect.w; actualAnchorY = newRect.y + newRect.h; break;
        case 'n':  actualAnchorX = newRect.x + newRect.w / 2; actualAnchorY = newRect.y + newRect.h; break;
        case 'ne': actualAnchorX = newRect.x; actualAnchorY = newRect.y + newRect.h; break;
        case 'e':  actualAnchorX = newRect.x; actualAnchorY = newRect.y + newRect.h / 2; break;
        case 'se': actualAnchorX = newRect.x; actualAnchorY = newRect.y; break;
        case 's':  actualAnchorX = newRect.x + newRect.w / 2; actualAnchorY = newRect.y; break;
        case 'sw': actualAnchorX = newRect.x + newRect.w; actualAnchorY = newRect.y; break;
        case 'w':  actualAnchorX = newRect.x + newRect.w; actualAnchorY = newRect.y + newRect.h / 2; break;
        default:   actualAnchorX = newRect.x + newRect.w / 2; actualAnchorY = newRect.y + newRect.h / 2;
      }
      card.transformX += (expectedAnchorX - actualAnchorX);
      card.transformY += (expectedAnchorY - actualAnchorY);
    }
  }

  // Throttle recomposite
  if (!ds._lastComposite || Date.now() - ds._lastComposite > 33) {
    ds._lastComposite = Date.now();
    _recompositePreviewForTransform();
    _recompositeFullscreenForTransform();
    renderTransformOverlay();
  }
});

window.addEventListener('mouseup', () => {
  if (!state.transform.dragMode) return;
  state.transform.dragMode = null;
  _transformDragState = null;
  render();
});

// ---- Fullscreen preview ----

function enterFullscreen() {
  if (state.playback.isPlaying) return;
  if (state.playback.pausedAt <= 0) return;
  if (state.playback.playbackMode !== 'group') return;

  const group = state.groups.find(g => g.id === state.playback.groupPlayback.groupId);
  if (!group || group.collapsed) return;

  fullscreenOverlay.classList.add('fullscreen-active');

  // Size canvas to fill viewport with 16:9 ratio, leaving 64px padding
  const padding = 64;
  const maxW = window.innerWidth - padding * 2;
  const maxH = window.innerHeight - padding * 2;
  const ratio = 16 / 9;
  let fw, fh;
  if (maxW / maxH > ratio) {
    fh = maxH;
    fw = fh * ratio;
  } else {
    fw = maxW;
    fh = fw / ratio;
  }

  const dpr = window.devicePixelRatio || 1;
  fullscreenCanvas.width = fw * dpr;
  fullscreenCanvas.height = fh * dpr;
  fullscreenCanvas.style.width = fw + 'px';
  fullscreenCanvas.style.height = fh + 'px';

  // Composite at fullscreen resolution to avoid blur
  const fc = fullscreenCanvas.getContext('2d');
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  fc.fillStyle = '#000';
  fc.fillRect(0, 0, Math.ceil(fw), Math.ceil(fh));

  const playheadX = state.playback.groupPlayback.groupStartX + (state.playback.pausedAt * PIXELS_PER_SECOND);
  const resultCanvas = compositeGroupFrame(group, state.playback.groupPlayback.timelineCards || [], playheadX, Math.round(fw), Math.round(fh));
  if (resultCanvas) {
    fc.drawImage(resultCanvas, 0, 0);
  } else if (groupPreviewCanvas.width > 0 && groupPreviewCanvas.height > 0) {
    fc.drawImage(groupPreviewCanvas, 0, 0, fw, fh);
  }
}

function exitFullscreen() {
  fullscreenOverlay.classList.remove('fullscreen-active');
  // No need to recomposite since _recompositeFullscreen already ran on last mousemove
}

// ---- Edit box immersive mode ----
let _immersiveEditBoxId = null;
let _immersiveTool = 'select';

function enterEditBoxImmersive(eboxId) {
  const eb = findEditBoxById(eboxId);
  if (!eb) return;
  _immersiveEditBoxId = eboxId;
  eboxImmersiveOverlay.classList.add('immersive-active');
  eboxImmersiveTools.classList.add('visible');

  // Size canvas to fill viewport with aspect ratio matching edit box
  const padding = 64;
  const maxW = window.innerWidth - padding * 2;
  const maxH = window.innerHeight - padding * 2;
  const ratio = eb.width / eb.height;
  let fw, fh;
  if (maxW / maxH > ratio) {
    fh = maxH;
    fw = fh * ratio;
  } else {
    fw = maxW;
    fh = fw / ratio;
  }

  const dpr = window.devicePixelRatio || 1;
  eboxImmersiveCanvas.width = fw * dpr;
  eboxImmersiveCanvas.height = fh * dpr;
  eboxImmersiveCanvas.style.width = fw + 'px';
  eboxImmersiveCanvas.style.height = fh + 'px';

  renderImmersiveEditBox();
}

function renderImmersiveEditBox() {
  const eb = findEditBoxById(_immersiveEditBoxId);
  if (!eb) return;
  const fc = eboxImmersiveCanvas.getContext('2d');
  const fw = eboxImmersiveCanvas.width / (window.devicePixelRatio || 1);
  const fh = eboxImmersiveCanvas.height / (window.devicePixelRatio || 1);
  const dpr = window.devicePixelRatio || 1;

  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  fc.fillStyle = '#1a1a1a';
  fc.fillRect(0, 0, fw, fh);

  // Scale to fit edit box content
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(fw / eb.width, fh / eb.height);
  fc.save();
  fc.translate(fw / 2, fh / 2);
  fc.scale(scale, scale);
  fc.translate(-eb.width / 2, -eb.height / 2);

  // Draw shapes
  fc.save();
  fc.translate(cam.offsetX, cam.offsetY);
  fc.scale(cam.zoom, cam.zoom);

  for (const s of (eb.shapes || [])) {
    fc.globalAlpha = s.opacity != null ? s.opacity : 1;
    if (s.shapeType === 'rect') {
      if (s.fill) { fc.fillStyle = s.fill; fc.fillRect(s.left, s.top, s.width, s.height); }
      if (s.stroke) { fc.strokeStyle = s.stroke; fc.lineWidth = s.strokeWidth || 2; fc.strokeRect(s.left, s.top, s.width, s.height); }
    } else if (s.shapeType === 'ellipse') {
      fc.beginPath();
      fc.ellipse(s.left + s.width / 2, s.top + s.height / 2, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
      if (s.fill) { fc.fillStyle = s.fill; fc.fill(); }
      if (s.stroke) { fc.strokeStyle = s.stroke; fc.lineWidth = s.strokeWidth || 2; fc.stroke(); }
    } else if (s.shapeType === 'line') {
      fc.strokeStyle = s.stroke || '#D4FF00';
      fc.lineWidth = s.strokeWidth || 2;
      fc.beginPath(); fc.moveTo(s.x1, s.y1); fc.lineTo(s.x2, s.y2); fc.stroke();
    } else if (s.shapeType === 'text') {
      fc.fillStyle = s.fill || '#000';
      fc.font = `${s.fontWeight || 'Bold'} ${s.fontSize || 24}px "${s.fontFamily || 'Inter'}", system-ui, sans-serif`;
      fc.textAlign = s.textAlign || 'left';
      fc.textBaseline = 'top';
      fc.fillText(s.text || '', s.left, s.top);
    }
  }
  fc.globalAlpha = 1;
  fc.restore();
  fc.restore();
}

function exitEditBoxImmersive() {
  eboxImmersiveOverlay.classList.remove('immersive-active');
  eboxImmersiveTools.classList.remove('visible');
  _immersiveEditBoxId = null;
  render();
}

// Immersive canvas events
eboxImmersiveCanvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  exitEditBoxImmersive();
  e.stopPropagation();
});

eboxImmersiveCanvas.addEventListener('wheel', (e) => {
  if (!_immersiveEditBoxId) return;
  e.preventDefault();
  const eb = findEditBoxById(_immersiveEditBoxId);
  if (!eb) return;
  if (!eb.camera) eb.camera = { zoom: 1, offsetX: 0, offsetY: 0 };
  if (e.ctrlKey || e.metaKey) {
    const zf = e.deltaY < 0 ? 1.1 : 0.9;
    eb.camera.zoom = Math.max(0.1, Math.min(5, eb.camera.zoom * zf));
  } else {
    eb.camera.offsetX -= e.deltaX || (e.shiftKey ? e.deltaY : 0);
    eb.camera.offsetY -= e.shiftKey ? 0 : e.deltaY;
  }
  renderImmersiveEditBox();
  render();
});

// Immersive tools
eboxImmersiveTools.querySelectorAll('.float-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    _immersiveTool = btn.dataset.tool;
    eboxImmersiveTools.querySelectorAll('.float-btn').forEach(b => b.classList.toggle('active-tool', b.dataset.tool === _immersiveTool));
  });
});

// Immersive canvas mousedown for drawing
eboxImmersiveCanvas.addEventListener('mousedown', (e) => {
  if (!_immersiveEditBoxId || _immersiveTool === 'select') return;
  e.preventDefault();
  const eb = findEditBoxById(_immersiveEditBoxId);
  if (!eb) return;
  const rect = eboxImmersiveCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const fw = rect.width;
  const fh = rect.height;
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(fw / eb.width, fh / eb.height);
  // Convert screen coords to edit box local coords
  const localX = ((sx - fw / 2) / scale + eb.width / 2 - cam.offsetX) / cam.zoom;
  const localY = ((sy - fh / 2) / scale + eb.height / 2 - cam.offsetY) / cam.zoom;

  const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  if (_immersiveTool === 'rect') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'rect', left: localX, top: localY, width: 0, height: 0, fill: 'rgba(212,255,0,0.2)', stroke: '#D4FF00', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: localX, y: localY };
  } else if (_immersiveTool === 'ellipse') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'ellipse', left: localX, top: localY, width: 0, height: 0, fill: 'rgba(212,255,0,0.2)', stroke: '#D4FF00', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: localX, y: localY };
  } else if (_immersiveTool === 'line') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'line', x1: localX, y1: localY, x2: localX, y2: localY, stroke: '#D4FF00', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: localX, y: localY };
    eb._lineDrawing = true;
  }
  renderImmersiveEditBox();
});

eboxImmersiveCanvas.addEventListener('mousemove', (e) => {
  if (!_immersiveEditBoxId) return;
  const eb = findEditBoxById(_immersiveEditBoxId);
  if (!eb || eb._drawingIdx == null) return;
  const rect = eboxImmersiveCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const fw = rect.width;
  const fh = rect.height;
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.min(fw / eb.width, fh / eb.height);
  const localX = ((sx - fw / 2) / scale + eb.width / 2 - cam.offsetX) / cam.zoom;
  const localY = ((sy - fh / 2) / scale + eb.height / 2 - cam.offsetY) / cam.zoom;

  const s = (eb.shapes || [])[eb._drawingIdx];
  if (!s) return;
  if (eb._lineDrawing) {
    s.x2 = localX;
    s.y2 = localY;
  } else {
    s.left = Math.min(eb._drawStart.x, localX);
    s.top = Math.min(eb._drawStart.y, localY);
    s.width = Math.abs(localX - eb._drawStart.x);
    s.height = Math.abs(localY - eb._drawStart.y);
  }
  renderImmersiveEditBox();
});

eboxImmersiveCanvas.addEventListener('mouseup', (e) => {
  const eb = findEditBoxById(_immersiveEditBoxId);
  if (!eb) return;
  if (eb._drawingIdx != null) {
    if (eb._lineDrawing) {
      const s = (eb.shapes || [])[eb._drawingIdx];
      if (s && Math.abs(s.x2 - s.x1) < 4 && Math.abs(s.y2 - s.y1) < 4) {
        eb.shapes.splice(eb._drawingIdx, 1);
      }
      eb._lineDrawing = false;
    } else {
      const s = (eb.shapes || [])[eb._drawingIdx];
      if (s && s.width < 4 && s.height < 4) {
        eb.shapes.splice(eb._drawingIdx, 1);
      }
    }
    eb._drawingIdx = null;
    eb._drawStart = null;
  }
  renderImmersiveEditBox();
});

// Fullscreen canvas: mousedown for transform
fullscreenCanvas.addEventListener('mousedown', (e) => {
  if (!fullscreenOverlay.classList.contains('fullscreen-active')) return;

  const fRect = fullscreenCanvas.getBoundingClientRect();
  const fw = fRect.width;
  const fh = fRect.height;
  const mx = e.clientX - fRect.left;
  const my = e.clientY - fRect.top;
  const sx = fw / 320;
  const sy = fh / 180;

  // Only respond when handles are showing (video card already selected via timeline)
  if (!shouldShowHandles()) return;

  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card || card.type !== 'video') return;

  const rect = calculateVideoRect(card);
  if (!rect) return;

  const rx = rect.x * sx;
  const ry = rect.y * sy;
  const rw = rect.w * sx;
  const rh = rect.h * sy;
  const hitR = 8;

  const handles = [
    { id: 'nw', cx: rx, cy: ry },
    { id: 'n', cx: rx + rw / 2, cy: ry },
    { id: 'ne', cx: rx + rw, cy: ry },
    { id: 'e', cx: rx + rw, cy: ry + rh / 2 },
    { id: 'se', cx: rx + rw, cy: ry + rh },
    { id: 's', cx: rx + rw / 2, cy: ry + rh },
    { id: 'sw', cx: rx, cy: ry + rh },
    { id: 'w', cx: rx, cy: ry + rh / 2 }
  ];
  let handle = null;
  for (const h of handles) {
    if (Math.abs(mx - h.cx) <= hitR && Math.abs(my - h.cy) <= hitR) { handle = h.id; break; }
  }
  if (!handle && mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) handle = 'body';
  if (!handle) return;

  pushUndo();
  _transformDragState = {
    cardId: card.id,
    handle,
    startMouseX: e.clientX,
    startMouseY: e.clientY,
    startTransformScale: card.transformScale || 1.0,
    startTransformX: card.transformX || 0,
    startTransformY: card.transformY || 0,
    startRect: { ...rect },
    isFullscreen: true
  };
  // Ensure the card has the transform fields
  if (card.transformScale == null) card.transformScale = 1.0;
  if (card.transformX == null) card.transformX = 0;
  if (card.transformY == null) card.transformY = 0;
  state.transform.dragMode = handle;
  e.stopPropagation();
  e.preventDefault();
});

// Fullscreen canvas cursor tracking
fullscreenCanvas.addEventListener('mousemove', (e) => {
  if (!fullscreenOverlay.classList.contains('fullscreen-active')) return;
  if (state.transform.dragMode) return; // handled by window mousemove
  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card || card.type !== 'video') return;

  const fRect = fullscreenCanvas.getBoundingClientRect();
  const fw = fRect.width;
  const fh = fRect.height;
  const sx = fw / 320;
  const sy = fh / 180;

  const rect = calculateVideoRect(card);
  if (!rect) return;

  const mx = e.clientX - fRect.left;
  const my = e.clientY - fRect.top;
  const rx = rect.x * sx;
  const ry = rect.y * sy;
  const rw = rect.w * sx;
  const rh = rect.h * sy;
  const hitR = 8;

  const handles = [
    { id: 'nw', cx: rx, cy: ry },
    { id: 'n', cx: rx + rw / 2, cy: ry },
    { id: 'ne', cx: rx + rw, cy: ry },
    { id: 'e', cx: rx + rw, cy: ry + rh / 2 },
    { id: 'se', cx: rx + rw, cy: ry + rh },
    { id: 's', cx: rx + rw / 2, cy: ry + rh },
    { id: 'sw', cx: rx, cy: ry + rh },
    { id: 'w', cx: rx, cy: ry + rh / 2 }
  ];
  let handle = null;
  for (const h of handles) {
    if (Math.abs(mx - h.cx) <= hitR && Math.abs(my - h.cy) <= hitR) { handle = h.id; break; }
  }
  if (!handle && mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) handle = 'body';
  fullscreenCanvas.style.cursor = handle ? getCursorForHandle(handle) : 'default';
});

// Double-click: enter/exit fullscreen
transformOverlayCanvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  enterFullscreen();
  e.stopPropagation();
});

fullscreenCanvas.addEventListener('dblclick', (e) => {
  e.preventDefault();
  exitFullscreen();
  render();
  e.stopPropagation();
});

groupPreviewCanvas.addEventListener('dblclick', (e) => {
  if (shouldShowOverlay()) {
    e.preventDefault();
    enterFullscreen();
    e.stopPropagation();
  }
});

// Click on preview panel: activate composition card's edit box for light edit mode
groupPreviewCanvas.addEventListener('click', (e) => {
  if (!shouldShowOverlay()) return;
  const gp = state.playback.groupPlayback;
  if (!gp || !gp.timelineCards || !gp.timelineCards.length) return;

  const playheadX = gp.groupStartX + state.playback.pausedAt * PIXELS_PER_SECOND;

  // Find a composition card at the current playhead position
  for (const tcard of gp.timelineCards) {
    const card = tcard.card;
    if (card.type !== 'composition') continue;
    if (playheadX < tcard.x || playheadX > tcard.x + tcard.width) continue;
    const eb = findEditBoxById(card.editBoxId);
    if (!eb) continue;

    // Activate the edit box for editing
    // Save any previously active edit box first
    if (state.interaction.activeEditBoxId && state.interaction.activeEditBoxId !== eb.id) {
      const prevEB = findEditBoxById(state.interaction.activeEditBoxId);
      if (prevEB) _saveFabricToEditBox(prevEB);
    }
    state.interaction.activeEditBoxId = eb.id;
    state.interaction.activeTool = null;
    state.selection.editBoxId = eb.id;
    state.selection.cardIds = [];
    state.selection.shapeIds = [];

    // Pan main canvas to center on the edit box
    const view = state.canvas;
    const canvasEl = document.getElementById('main-canvas');
    if (canvasEl) {
      const cx = canvasEl.clientWidth / 2;
      const cy = canvasEl.clientHeight / 2;
      view.offsetX = -(eb.x + eb.width / 2) * view.zoom + cx;
      view.offsetY = -(eb.y + eb.height / 2) * view.zoom + cy;
    }

    // Load shapes onto Fabric canvas
    _enterEditBoxOnFabric(eb);
    setDrawingTool('select');

    pushUndo();
    render();
    e.stopPropagation();
    return;
  }
});

// Update transform overlay on window resize
window.addEventListener('resize', () => {
  if (shouldShowOverlay()) {
    renderTransformOverlay();
  }
  if (fullscreenOverlay.classList.contains('fullscreen-active')) {
    _recompositeFullscreenForTransform();
  }
});

// ================================================================
// Left-panel layer list
// ================================================================
let _layerDragFromIdx = -1;

function renderLayerList() {
  layerList.innerHTML = '';

  // Edit boxes section
  for (let i = state.editBoxes.length - 1; i >= 0; i--) {
    const eb = state.editBoxes[i];
    const isSelected = state.selection.editBoxId === eb.id;
    const shapeCount = (eb.shapes || []).length;

    const item = document.createElement('div');
    item.className = 'layer-item' + (isSelected ? ' selected' : '');
    item.style.background = isSelected ? 'rgba(124,108,231,0.1)' : 'rgba(124,108,231,0.04)';
    item.style.borderLeft = '3px solid #b3d900';
    item.dataset.editBoxId = eb.id;

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = '编辑盒 ' + (i + 1);
    nameSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b5ab8;';
    item.appendChild(nameSpan);

    // Shape count badge
    if (shapeCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'layer-badge';
      badge.textContent = shapeCount + '图形';
      badge.style.background = '#b3d900';
      item.appendChild(badge);
    }

    item.addEventListener('click', (e) => {
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      item._clickTimer = setTimeout(() => {
        item._clickTimer = null;
        state.selection.editBoxId = eb.id;
        state.selection.cardIds = [];
        state.selection.groupIds = [];
        state.selection.connectionId = null;
        state.selection.connectionIds = [];
        render();
      }, 300);
    });

    item.addEventListener('dblclick', (e) => {
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      enterEditBoxImmersive(eb.id);
    });

    layerList.appendChild(item);
  }

  // Groups section
  for (let i = state.groups.length - 1; i >= 0; i--) {
    const group = state.groups[i];

    const isGroupSelected = state.selection.groupIds.includes(group.id);
    const item = document.createElement('div');
    item.className = 'layer-item group-item' + (isGroupSelected ? ' selected' : '');
    item.dataset.groupId = group.id;
    item.style.background = isGroupSelected ? 'rgba(212,255,0,0.1)' : 'rgba(212,255,0,0.08)';

    // Expand/collapse toggle
    const toggle = document.createElement('span');
    toggle.className = 'group-toggle';
    toggle.textContent = group.collapsed ? '+' : '-';
    toggle.title = group.collapsed ? '展开' : '折叠';
    toggle.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;color:#666;flex-shrink:0;margin-right:4px;';
    toggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // Block collapse/expand during group playback
      if (state.playback.playbackMode === 'group' && state.playback.groupPlayback.groupId === group.id && (state.playback.isPlaying || state.playback.pausedAt > 0)) {
        return;
      }
      pushUndo();
      group.collapsed = !group.collapsed;
      // When collapsing, compute position from current member bbox
      if (group.collapsed) {
        const frame = getGroupFrame(group);
        if (frame) {
          group.x = frame.x;
          group.y = frame.y;
          group.width = Math.max(frame.w, 100);
          group.height = Math.max(frame.h, 40);
        }
      }
      render();
    });
    item.appendChild(toggle);

    // Name (editable on double-click)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = group.name || 'Group';
    nameSpan.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    item.appendChild(nameSpan);

    // Member count badge
    const badge = document.createElement('span');
    badge.className = 'layer-badge';
    badge.textContent = group.cardIds.length + '项';
    badge.style.background = '#6c5ce7';
    item.appendChild(badge);

    // Click to select all members (deferred so dblclick can fire first)
    item.addEventListener('click', (e) => {
      if (e.target.closest('.group-toggle')) return;
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      item._clickTimer = setTimeout(() => {
        item._clickTimer = null;
        state.selection.cardIds = [];
        state.selection.groupIds = [group.id];
        state.selection.connectionId = null;
        state.selection.connectionIds = [];
        render();
      }, 300);
    });

    // Double-click to rename
    item.addEventListener('dblclick', (e) => {
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      const nameEl = item.querySelector('.layer-name');
      if (!nameEl) return;
      const input = document.createElement('input');
      input.className = 'layer-name-input';
      input.value = group.name || '';
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const newName = input.value.trim() || group.name;
        group.name = newName;
        render();
      };
      const cancel = () => { render(); };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      });
    });

    layerList.appendChild(item);
  }

  // Cards section
  for (let i = state.cards.length - 1; i >= 0; i--) {
    const card = state.cards[i];
    const isSelected = state.selection.cardIds.includes(card.id);
    const dur = (card.type === 'text') ? 0 : (card.trimOut - card.trimIn);

    // Find parent group for this card
    const parentGroup = state.groups.find(g => g.cardIds.includes(card.id));

    const item = document.createElement('div');
    let itemClass = 'layer-item' + (isSelected ? ' selected' : '');
    if (parentGroup) itemClass += ' in-group';
    item.className = itemClass;
    item.dataset.cardId = card.id;
    item.dataset.idx = i;
    if (parentGroup) {
      item.style.paddingLeft = '24px';
      item.style.borderLeft = '3px solid #6c5ce7';
    }
    item.draggable = true;

    // Thumbnail canvas
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'layer-thumb';
    thumbCanvas.width = 48;
    thumbCanvas.height = 27;
    const tctx = thumbCanvas.getContext('2d');

    if (card.type === 'text') {
      tctx.fillStyle = '#e8f0fe';
      tctx.fillRect(0, 0, 48, 27);
      tctx.fillStyle = '#D4FF00';
      tctx.font = 'bold 14px "Inter", system-ui, sans-serif';
      tctx.textAlign = 'center';
      tctx.fillText('T', 24, 19);
      tctx.textAlign = 'start';
    } else if (card.type === 'audio' || card.type === 'bgm') {
      // Solid color + waveform icon for audio
      tctx.fillStyle = '#D4FF00';
      tctx.fillRect(0, 0, 48, 27);
      // Mini waveform bars
      if (card.waveform && card.waveform.length > 0) {
        const peaks = card.waveform;
        const barCount = 16;
        for (let j = 0; j < barCount; j++) {
          const idx = Math.floor(j / barCount * peaks.length);
          const peak = peaks[Math.min(idx, peaks.length - 1)];
          const barH = Math.max(1, peak * 20);
          tctx.fillStyle = '#7c6ea0';
          tctx.fillRect(4 + j * 2.5, 13 - barH / 2, 1.8, barH);
        }
      }
      tctx.fillStyle = '#a78bfa';
      tctx.font = '9px "Inter", system-ui, sans-serif';
      tctx.textAlign = 'center';
      tctx.fillText(card.type === 'bgm' ? 'BGM' : 'AUD', 38, 21);
      tctx.textAlign = 'start';
    } else if (card.thumbStrip) {
      try {
        const stripW = card.thumbStrip.width;
        const fracIn = card.trimIn / (card.duration || 1);
        const fracOut = card.trimOut / (card.duration || 1);
        const srcX = stripW * fracIn;
        const srcW = stripW * (fracOut - fracIn);
        if (srcW > 0) {
          tctx.drawImage(card.thumbStrip, srcX, 0, srcW, card.thumbStrip.height, 0, 0, 48, 27);
        } else {
          tctx.fillStyle = '#f0f0f0';
          tctx.fillRect(0, 0, 48, 27);
        }
      } catch (e) {
        tctx.fillStyle = '#f0f0f0';
        tctx.fillRect(0, 0, 48, 27);
      }
    } else {
      tctx.fillStyle = '#f0f0f0';
      tctx.fillRect(0, 0, 48, 27);
    }

    item.appendChild(thumbCanvas);

    // Info: name + duration / description
    const info = document.createElement('div');
    info.className = 'layer-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    if (card.type === 'text') {
      nameSpan.textContent = (card.text || '文字').slice(0, 12);
    } else {
      nameSpan.textContent = card.label;
    }
    info.appendChild(nameSpan);

    const durSpan = document.createElement('span');
    durSpan.className = 'layer-dur';
    if (card.type === 'text') {
      durSpan.textContent = '文字';
    } else {
      durSpan.textContent = formatTime(dur);
    }
    info.appendChild(durSpan);

    item.appendChild(info);

    // Type badge
    if (card.type === 'audio' || card.type === 'bgm') {
      const badge = document.createElement('span');
      badge.className = 'layer-badge';
      badge.textContent = card.type === 'bgm' ? 'BGM' : 'AUD';
      item.appendChild(badge);
    } else if (card.type === 'text') {
      const badge = document.createElement('span');
      badge.className = 'layer-badge';
      badge.textContent = 'T';
      badge.style.background = '#D4FF00';
      item.appendChild(badge);
    } else if (card.type === 'composition') {
      const badge = document.createElement('span');
      badge.className = 'layer-badge';
      badge.textContent = '合成';
      badge.style.background = '#b3d900';
      badge.style.color = '#fff';
      badge.style.fontSize = '8px';
      item.appendChild(badge);
    }

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'layer-drag-handle';
    handle.innerHTML = '<div class="layer-drag-dot-grid"><span></span><span></span><span></span><span></span><span></span><span></span></div>';
    item.appendChild(handle);

    // Click to select (deferred so dblclick can fire first)
    item.addEventListener('click', (e) => {
      if (e.target.closest('.layer-drag-handle')) return; // handled by dnd
      if (e.target.tagName === 'INPUT') return;
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      const shiftKey = e.shiftKey;
      item._clickTimer = setTimeout(() => {
        item._clickTimer = null;
        if (shiftKey) {
          const idx = state.selection.cardIds.indexOf(card.id);
          if (idx >= 0) {
            state.selection.cardIds.splice(idx, 1);
          } else {
            state.selection.cardIds.push(card.id);
          }
        } else {
          state.selection.cardIds = [card.id];
        }
        state.selection.groupIds = [];
        state.selection.connectionId = null;
        state.selection.connectionIds = [];
        state.hoveredConnectionId = null;
        render();
      }, 300);
    });

    // Double-click to rename
    item.addEventListener('dblclick', (e) => {
      if (item._clickTimer) { clearTimeout(item._clickTimer); item._clickTimer = null; }
      const nameEl = item.querySelector('.layer-name');
      if (!nameEl) return;
      const input = document.createElement('input');
      input.className = 'layer-name-input';
      input.value = card.label;
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const newName = input.value.trim() || card.label;
        card.label = newName;
        render();
      };
      const cancel = () => { render(); };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      });
    });

    // Drag events
    item.addEventListener('dragstart', (e) => {
      _layerDragFromIdx = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.id);
      item.style.opacity = '0.4';
    });

    item.addEventListener('dragend', (e) => {
      item.style.opacity = '';
      _layerDragFromIdx = -1;
      // Clear all drag-over indicators
      layerList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      // Show indicator on this item
      layerList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (_layerDragFromIdx < 0) return;
      if (_layerDragFromIdx === i) return;

      // Convert to array position (not reversed)
      const fromIdx = _layerDragFromIdx;
      const toIdx = i;

      pushUndo();
      const card = state.cards.splice(fromIdx, 1)[0];
      // Adjust target index if we removed before it
      const adjustedTo = fromIdx < toIdx ? toIdx - 1 : toIdx;
      state.cards.splice(adjustedTo, 0, card);

      render();
    });

    layerList.appendChild(item);
  }
}

// ================================================================
// Right-panel inspector — dynamic content
// ================================================================
function updateInspector() {
  // Don't rebuild inspector HTML while user is actively editing a field
  // (change handlers blur first before triggering render, so this only
  // blocks rebuilds from external render() calls like mousemove)
  if (document.activeElement && document.activeElement.closest('#props-content')) {
    return;
  }

  // If a line shape is selected (pure 2D canvas), show line inspector
  if (state.selection.shapeId) {
    const shape = state.shapes.find(s => s.id === state.selection.shapeId);
    if (shape && shape.shapeType === 'line') {
      updateLineInspector(shape);
      return;
    }
  }

  // If a Fabric shape is selected, show shape inspector
  const activeObj = fabricCanvas && fabricCanvas.getActiveObject();
  if (activeObj && activeObj._shapeId) {
    updateInspectorForFabricSelection();
    return;
  }

  const selCount = state.selection.cardIds.length;
  const selConn = state.selection.connectionId;
  const selConns = state.selection.connectionIds;

  // Multiple connections selected — batch edit
  if (selConns.length > 1 && selCount === 0) {
    const firstConn = state.connections.find(c => c.id === selConns[0]);
    const firstType = firstConn ? firstConn.transition : 'cut';
    const firstDur = firstConn ? firstConn.transitionDuration : 0.5;
    propsContent.innerHTML = `
      <div class="inspector-row"><label>已选 ${selConns.length} 条连线</label></div>
      <div class="inspector-row">
        <label>批量转场</label>
        <select id="insp-transition-type">
          <option value="cut" ${firstType === 'cut' ? 'selected' : ''}>切</option>
          <option value="dissolve" ${firstType === 'dissolve' ? 'selected' : ''}>叠</option>
          <option value="fade" ${firstType === 'fade' ? 'selected' : ''}>黑</option>
        </select>
      </div>
      <div class="inspector-row">
        <label>时长</label>
        <input type="number" id="insp-transition-dur" value="${firstDur}" step="0.1" min="0.1" max="5">
      </div>
    `;
    bindInspectorEvents(null, null);
    return;
  }

  // Connection selected (single)
  if (selConn && selCount === 0) {
    const conn = state.connections.find(c => c.id === selConn);
    if (!conn) { propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>'; return; }

    const isTween = conn.type === 'tween';
    const isKeyframe = conn.type === 'keyframe';
    const isEbKeyframe = conn.type === 'eb-keyframe';
    if (isEbKeyframe) {
      const fromEb = findEditBoxById(conn.fromEditBoxId);
      const toEb = findEditBoxById(conn.toEditBoxId);
      const fromLabel = fromEb ? ('编辑盒 ' + (fromEb.id || '').slice(0, 8)) : '未知';
      const toLabel = toEb ? ('编辑盒 ' + (toEb.id || '').slice(0, 8)) : '未知';
      const fromShapeCount = fromEb ? (fromEb.shapes || []).length : 0;
      const toShapeCount = toEb ? (toEb.shapes || []).length : 0;
      const hasCommon = fromEb && toEb ? hasCommonShapes(fromEb.shapes || [], toEb.shapes || []) : false;
      const effDur = conn.transitionDuration > 0 ? conn.transitionDuration : (fromEb && toEb ? Math.abs(toEb.x - fromEb.x) / PIXELS_PER_SECOND : 1);
      const effEasing = conn.easing || 'linear';
      propsContent.innerHTML = `
        <div class="inspector-row">
          <label>类型</label>
          <span style="color:#ff9800;">编辑盒关键帧连线</span>
        </div>
        <div class="inspector-row">
          <label>来源</label>
          <span style="font-size:11px;">${fromLabel} (${fromShapeCount} 图形)</span>
        </div>
        <div class="inspector-row">
          <label>目标</label>
          <span style="font-size:11px;">${toLabel} (${toShapeCount} 图形)</span>
        </div>
        <div class="inspector-row">
          <label>图形匹配</label>
          <span style="font-size:11px;color:${hasCommon ? '#4caf50' : '#ff9800'};">${hasCommon ? '有同名图形，可做图形级插值' : '无同名图形，将做整体淡入淡出'}</span>
        </div>
        <div class="inspector-row">
          <label>时长</label>
          <input type="number" id="insp-eb-kf-dur" value="${effDur.toFixed(1)}" step="0.1" min="0.1" max="30">
        </div>
        <div class="inspector-row">
          <label>缓动</label>
          <select id="insp-eb-kf-easing">
            <option value="linear" ${effEasing === 'linear' ? 'selected' : ''}>线性 (Linear)</option>
            <option value="easeIn" ${effEasing === 'easeIn' ? 'selected' : ''}>缓入 (Ease In)</option>
            <option value="easeOut" ${effEasing === 'easeOut' ? 'selected' : ''}>缓出 (Ease Out)</option>
            <option value="easeInOut" ${effEasing === 'easeInOut' ? 'selected' : ''}>缓入缓出 (Ease In-Out)</option>
          </select>
        </div>
      `;
    } else if (isKeyframe) {
      const fromCard = state.cards.find(c => c.id === conn.fromCardId);
      const toCard = state.cards.find(c => c.id === conn.toCardId);
      const aOpacity = fromCard ? (fromCard.opacity != null ? fromCard.opacity : 1) : 1;
      const aScale = fromCard ? (fromCard.transformScale || 1) : 1;
      const aX = fromCard ? (fromCard.transformX || 0) : 0;
      const aY = fromCard ? (fromCard.transformY || 0) : 0;
      const bOpacity = toCard ? (toCard.opacity != null ? toCard.opacity : 1) : 1;
      const bScale = toCard ? (toCard.transformScale || 1) : 1;
      const bX = toCard ? (toCard.transformX || 0) : 0;
      const bY = toCard ? (toCard.transformY || 0) : 0;

      const _diff = (a, b) => Math.abs(a - b) > 0.001;
      const diffOpacity = _diff(aOpacity, bOpacity);
      const diffScale = _diff(aScale, bScale);
      const diffX = _diff(aX, bX);
      const diffY = _diff(aY, bY);

      const activeProps = conn.properties || ['opacity', 'transformScale', 'transformX', 'transformY'];
      const hasProp = (name) => activeProps.includes(name);
      const fmtVal = (a, b, diff) => diff ? `<span style="color:#ff9800;">${a} → ${b}</span>` : `<span style="color:#666;">${a}</span>`;

      const propRow = (id, label, aVal, bVal, diff) => {
        const checked = hasProp(id) ? 'checked' : '';
        const highlight = diff ? 'diff-highlight' : '';
        return `<label class="kf-prop-row ${highlight}">
          <input type="checkbox" id="insp-kf-prop-${id}" ${checked}>
          <span>${label}</span>
          <span style="font-size:10px;font-family:var(--font-mono);margin-left:auto;">${fmtVal(aVal, bVal, diff)}</span>
        </label>`;
      };

      propsContent.innerHTML = `
        <style>
          .kf-prop-row { display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;cursor:pointer; }
          .kf-prop-row.diff-highlight { background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3); }
        </style>
        <div class="inspector-row">
          <label>类型</label>
          <span style="color:#ff9800;">关键帧连线</span>
        </div>
        <div class="inspector-row">
          <label>缓动</label>
          <select id="insp-easing">
            <option value="linear" ${conn.easing === 'linear' ? 'selected' : ''}>线性 (Linear)</option>
            <option value="easeIn" ${conn.easing === 'easeIn' ? 'selected' : ''}>缓入 (Ease In)</option>
            <option value="easeOut" ${conn.easing === 'easeOut' ? 'selected' : ''}>缓出 (Ease Out)</option>
            <option value="easeInOut" ${conn.easing === 'easeInOut' ? 'selected' : ''}>缓入缓出 (Ease In-Out)</option>
          </select>
        </div>
        <div class="inspector-row">
          <label>锚点位置</label>
          <input type="range" id="insp-kf-frompos" min="0" max="100" value="${Math.round((conn.fromPosition || 0) * 100)}">
          <span style="font-family:var(--font-mono);font-size:10px;color:#999;width:32px;text-align:right;">${Math.round((conn.fromPosition || 0) * 100)}%</span>
        </div>
        <div style="margin-top:6px;font-size:11px;color:#aaa;">控制属性</div>
        <div style="display:flex;flex-direction:column;gap:2px;margin-top:2px;">
          ${propRow('opacity', '透明度', aOpacity, bOpacity, diffOpacity)}
          ${propRow('transformScale', '缩放', aScale.toFixed(2), bScale.toFixed(2), diffScale)}
          ${propRow('transformX', '位移 X', Math.round(aX), Math.round(bX), diffX)}
          ${propRow('transformY', '位移 Y', Math.round(aY), Math.round(bY), diffY)}
        </div>
      `;
    } else if (isTween) {
      propsContent.innerHTML = `
        <div class="inspector-row">
          <label>类型</label>
          <span style="color:#D4FF00;">补间连线</span>
        </div>
        <div class="inspector-row">
          <label>缓动</label>
          <select id="insp-easing">
            <option value="linear" ${conn.easing === 'linear' ? 'selected' : ''}>线性 (Linear)</option>
            <option value="easeIn" ${conn.easing === 'easeIn' ? 'selected' : ''}>缓入 (Ease In)</option>
            <option value="easeOut" ${conn.easing === 'easeOut' ? 'selected' : ''}>缓出 (Ease Out)</option>
            <option value="easeInOut" ${conn.easing === 'easeInOut' ? 'selected' : ''}>缓入缓出 (Ease In-Out)</option>
          </select>
        </div>
      `;
    } else {
      propsContent.innerHTML = `
        <div class="inspector-row">
          <label>转场</label>
          <select id="insp-transition-type">
            <option value="cut" ${conn.transition === 'cut' ? 'selected' : ''}>切</option>
            <option value="dissolve" ${conn.transition === 'dissolve' ? 'selected' : ''}>叠</option>
            <option value="fade" ${conn.transition === 'fade' ? 'selected' : ''}>黑</option>
          </select>
        </div>
        <div class="inspector-row">
          <label>时长</label>
          <input type="number" id="insp-transition-dur" value="${conn.transitionDuration}" step="0.1" min="0.1" max="5">
        </div>
      `;
    }
    bindInspectorEvents(selConn, null);
    return;
  }

  // Cards selected
  if (selCount === 0 && selConns.length === 0) {
    // Show marker card inspector when a marker is selected with no cards
    if (state.selection.markerCardId) {
      const marker = state.markerCards.find(m => m.id === state.selection.markerCardId);
      if (marker) {
        const parentCard = state.cards.find(c => c.id === marker.parentCardId);
        const parentLabel = parentCard ? (parentCard.label || '(未命名)') : '(未知卡片)';
        propsContent.innerHTML = `
          <div class="inspector-row" style="font-weight:550; color:#ff9800;">标记卡</div>
          <div class="inspector-row"><label>来源卡片</label><span style="font-size:11px;color:#888;">${escHtml(parentLabel)}</span></div>
          <div class="inspector-row"><label>帧时间</label><span style="font-size:11px;font-family:var(--font-mono);">${(marker.frameTime || 0).toFixed(2)} 秒</span></div>
          <div class="inspector-row"><label>时间位置</label><span style="font-size:11px;font-family:var(--font-mono);">${marker.x.toFixed(0)} px</span></div>
          <div class="inspector-row"><label>透明度</label><input type="range" id="insp-mkr-opacity" min="0" max="100" value="${Math.round((marker.properties.opacity || 1) * 100)}"><span style="font-family:var(--font-mono);font-size:10px;color:#999;width:32px;text-align:right;">${Math.round((marker.properties.opacity || 1) * 100)}%</span></div>
          <div class="inspector-row"><label>缩放</label><input type="range" id="insp-mkr-scale" min="10" max="500" value="${Math.round((marker.properties.transformScale || 1) * 100)}"><span style="font-family:var(--font-mono);font-size:10px;color:#999;width:36px;text-align:right;">${Math.round((marker.properties.transformScale || 1) * 100)}%</span></div>
          <div class="inspector-row"><label>X偏移</label><input type="number" id="insp-mkr-tx" value="${(marker.properties.transformX || 0).toFixed(0)}" step="1" style="width:60px;"></div>
          <div class="inspector-row"><label>Y偏移</label><input type="number" id="insp-mkr-ty" value="${(marker.properties.transformY || 0).toFixed(0)}" step="1" style="width:60px;"></div>
          <div class="inspector-row"><button id="insp-mkr-delete" style="width:100%;height:26px;border:1px solid #e04040;border-radius:4px;background:#f0f0f0;color:#e04040;font-size:11px;cursor:pointer;">删除标记卡</button></div>
        `;
        bindMarkerInspectorEvents(marker);
        return;
      }
    }
    // Group selected — show group properties
    if (state.selection.groupIds.length > 0) {
      const group = state.groups.find(g => g.id === state.selection.groupIds[0]);
      if (group) {
        const mode = group.sizingMode || 'fit';
        const memberCount = group.cardIds.length;
        propsContent.innerHTML = `
          <div class="inspector-row" style="font-weight:550;color:#6554CB;">编辑组</div>
          <div class="inspector-row"><label>名称</label><input type="text" id="insp-group-name" value="${escAttr(group.name || '')}"></div>
          <div class="inspector-row"><label>成员</label><span style="font-size:11px;color:#888;">${memberCount} 张卡片</span></div>
          <div class="inspector-row"><label>模式</label>
            <div style="display:flex;gap:4px;">
              <button id="insp-group-fit" style="flex:1;height:24px;border:1px solid #6554CB;border-radius:4px;background:${mode === 'fit' ? '#6554CB' : '#fff'};color:${mode === 'fit' ? '#fff' : '#6554CB'};font-size:11px;cursor:pointer;">适应</button>
              <button id="insp-group-fixed" style="flex:1;height:24px;border:1px solid #6554CB;border-radius:4px;background:${mode === 'fixed' ? '#6554CB' : '#fff'};color:${mode === 'fixed' ? '#fff' : '#6554CB'};font-size:11px;cursor:pointer;">固定</button>
            </div>
          </div>
          ${mode === 'fixed' ? `
          <div class="inspector-row"><label>宽度</label><input type="number" id="insp-group-width" value="${Math.round(group.width || 200)}" step="1" min="100"></div>
          <div class="inspector-row"><label>高度</label><input type="number" id="insp-group-height" value="${Math.round(group.height || 60)}" step="1" min="60"></div>
          ` : ''}
        `;
        // Bind events
        setTimeout(() => {
          const nameInput = propsContent.querySelector('#insp-group-name');
          if (nameInput) {
            const commitName = () => {
              const v = nameInput.value.trim();
              if (v) { pushUndo(); group.name = v; render(); }
            };
            nameInput.addEventListener('blur', commitName);
            nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { nameInput.blur(); } });
          }
          const fitBtn = propsContent.querySelector('#insp-group-fit');
          const fixedBtn = propsContent.querySelector('#insp-group-fixed');
          if (fitBtn) {
            fitBtn.addEventListener('click', () => {
              if (group.sizingMode === 'fit') return;
              pushUndo();
              group.sizingMode = 'fit';
              group.x = undefined; group.y = undefined; group.width = undefined; group.height = undefined;
              render();
            });
          }
          if (fixedBtn) {
            fixedBtn.addEventListener('click', () => {
              if (group.sizingMode === 'fixed') return;
              pushUndo();
              // Capture current frame dimensions
              const frame = getGroupFrame(group);
              if (frame) {
                group.x = frame.x;
                group.y = frame.y;
                group.width = frame.w;
                group.height = frame.h;
              } else {
                group.x = group.x || 0;
                group.y = group.y || 0;
                group.width = group.width || 200;
                group.height = group.height || 60;
              }
              group.sizingMode = 'fixed';
              render();
            });
          }
          const wInput = propsContent.querySelector('#insp-group-width');
          const hInput = propsContent.querySelector('#insp-group-height');
          if (wInput) {
            const commitW = () => {
              const v = parseInt(wInput.value);
              if (!isNaN(v) && v >= 100) { pushUndo(); group.width = v; render(); }
            };
            wInput.addEventListener('blur', commitW);
            wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { wInput.blur(); } });
          }
          if (hInput) {
            const commitH = () => {
              const v = parseInt(hInput.value);
              if (!isNaN(v) && v >= 60) { pushUndo(); group.height = v; render(); }
            };
            hInput.addEventListener('blur', commitH);
            hInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { hInput.blur(); } });
          }
        }, 0);
        return;
      }
    }
    // No marker selected — show audio mixer or hint
    const audioCards = state.cards.filter(c => c.type === 'audio');
    let mixerHtml = '<div class="inspector-row" style="font-weight:550;">音频混音器</div>';
    for (const ac of audioCards) {
      const isActive = state.bgmEntries && state.bgmEntries.some(e => e.cardId === ac.id && e.active);
      mixerHtml += `<div class="inspector-row" style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(ac.label)}</span>
        <span style="font-size:8px;color:${isActive ? '#4CAF50' : '#999'};min-width:20px;">${isActive ? 'ON' : 'off'}</span>
        <input type="range" class="mixer-vol" data-card-id="${ac.id}" min="0" max="100" value="${Math.round(ac.volume * 100)}" style="width:60px;">
        <span style="font-size:10px;color:#999;width:28px;">${Math.round(ac.volume * 100)}%</span>
      </div>`;
    }
    propsContent.innerHTML = mixerHtml;
    // Bind volume sliders
    setTimeout(() => {
      propsContent.querySelectorAll('.mixer-vol').forEach(slider => {
        slider.addEventListener('input', () => {
          const cid = slider.dataset.cardId;
          const c = state.cards.find(cc => cc.id === cid);
          if (c) {
            c.volume = parseInt(slider.value) / 100;
            // Update active BGM entry volume
            const entry = state.bgmEntries && state.bgmEntries.find(e => e.cardId === cid && e.active);
            if (entry && entry.audio) entry.audio.volume = c.volume;
            render();
          }
        });
      });
    }, 0);
    return;
  }

  // Edit box chain info: show when an edit box is selected and belongs to a chain
  if (selCount === 0 && !selConn && state.selection.editBoxId) {
    const selEb = findEditBoxById(state.selection.editBoxId);
    if (selEb) {
      const ebConns = state.connections.filter(c =>
        c.type === 'eb-keyframe' &&
        (c.fromEditBoxId === state.selection.editBoxId || c.toEditBoxId === state.selection.editBoxId)
      );
      if (ebConns.length > 0) {
        const chain = buildEditBoxChain(state.selection.editBoxId);
        const chainDuration = getEditBoxChainDuration(chain);
        let html = `<div class="inspector-row" style="font-weight:550;color:#ff9800;">关键帧链</div>`;
        html += `<div class="inspector-row"><label>选中</label><span style="font-size:11px;">编辑盒 ${(state.selection.editBoxId || '').slice(0, 8)} (${(selEb.shapes || []).length} 图形)</span></div>`;
        html += `<div class="inspector-row"><label>链长度</label><span style="font-size:11px;">${chain.length} 个编辑盒 / ${chainDuration.toFixed(1)}s</span></div>`;
        html += `<div class="inspector-row" style="margin-top:4px;"><label>链中编辑盒</label></div>`;
        for (let i = 0; i < chain.length; i++) {
          const ebId = chain[i];
          const eb = findEditBoxById(ebId);
          const isCurrent = ebId === state.selection.editBoxId;
          const label = eb ? ('编辑盒 ' + (ebId || '').slice(0, 8)) : ('未知 ' + (ebId || '').slice(0, 8));
          html += `<div class="inspector-row" style="display:flex;align-items:center;gap:4px;${isCurrent ? 'background:rgba(255,152,0,0.1);border-radius:4px;padding:2px 4px;' : ''}">
            <span style="font-size:10px;color:#888;min-width:14px;">${i + 1}.</span>
            <span class="eb-chain-nav" data-eb-id="${escAttr(ebId)}" style="cursor:pointer;color:${isCurrent ? '#ff9800' : '#b3d900'};font-size:11px;flex:1;">${escHtml(label)}${isCurrent ? ' (当前)' : ''}</span>
            <span style="font-size:9px;color:#666;">${eb ? (eb.shapes || []).length : 0} 图形</span>
          </div>`;
        }
        propsContent.innerHTML = html;
        // Bind chain navigation click handlers
        setTimeout(() => {
          propsContent.querySelectorAll('.eb-chain-nav').forEach(el => {
            el.addEventListener('click', () => {
              const ebId = el.dataset.ebId;
              const eb = findEditBoxById(ebId);
              if (!eb) return;
              const canvasEl = document.getElementById('main-canvas');
              if (canvasEl) {
                const pad = 8;
                const availW = canvasEl.clientWidth - pad * 2;
                const availH = canvasEl.clientHeight - pad * 2;
                const fitZoom = Math.min(availW / eb.width, availH / eb.height);
                state.canvas.zoom = Math.min(1, fitZoom);
                state.canvas.offsetX = -(eb.x + eb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
                state.canvas.offsetY = -(eb.y + eb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
              }
              state.selection.editBoxId = eb.id;
              state.selection.cardIds = [];
              render();
            });
          });
        }, 0);
        return;
      }
    }
  }

  // Show first selected card's props
  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card) { propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>'; return; }

  // Multiple cards selected hint
  if (selCount > 1) {
    propsContent.innerHTML = `<div class="inspector-hint">已选 ${selCount} 张卡片</div>`;
    return;
  }

  if (card.type === 'text') {
    propsContent.innerHTML = `
      <div class="inspector-row"><label>文本</label><input type="text" id="insp-text" value="${escAttr(card.text || '')}"></div>
      <div class="inspector-row"><label>字号</label><input type="number" id="insp-fontsize" value="${card.fontSize || 24}" min="8" max="200"></div>
      <div class="inspector-row"><label>颜色</label><input type="color" id="insp-color" value="${card.color || '#000000'}"></div>
      <div class="inspector-row"><label>对齐</label>
        <select id="insp-textalign">
          <option value="left" ${card.textAlign === 'left' ? 'selected' : ''}>左对齐</option>
          <option value="center" ${card.textAlign === 'center' ? 'selected' : ''}>居中</option>
          <option value="right" ${card.textAlign === 'right' ? 'selected' : ''}>右对齐</option>
        </select>
      </div>
      <div class="inspector-row"><label>粗细</label>
        <select id="insp-fontweight">
          <option value="Regular" ${card.fontWeight === 'Regular' ? 'selected' : ''}>常规</option>
          <option value="Bold" ${card.fontWeight === 'Bold' ? 'selected' : ''}>粗体</option>
          <option value="Light" ${card.fontWeight === 'Light' ? 'selected' : ''}>细体</option>
        </select>
      </div>
    `;
    bindInspectorEvents(null, card);
    return;
  }


  const dur = card.trimOut - card.trimIn;
  const maxDuration = card.totalDuration || card.duration;
  const rows = [];

  // Freeze frame indicator
  if (card.isFreezeFrame) {
    rows.push(`<div class="inspector-row" style="margin-bottom:6px;">
      <span style="display:inline-block;background:#D4FF00;color:#fff;font-size:10px;font-weight:600;padding:2px 8px;border-radius:3px;">定格帧</span>
    </div>`);
  }

  rows.push(
    `<div class="inspector-row">
      <label>名称</label>
      <input type="text" id="insp-name" value="${escAttr(card.label || '')}">
    </div>`,
    `<div class="inspector-row">
      <label>总时长</label>
      <input type="text" value="${formatTime(dur)} / ${formatTime(maxDuration)}" readonly style="color:#888;">
    </div>`,
    `<div class="inspector-row">
      <label>Duration</label>
      <input type="number" id="insp-duration" value="${(dur || 0).toFixed(1)}" step="0.1" min="0.1" style="width:60px;">
      <span style="font-size:10px;color:#888;">秒</span>
    </div>`,
    `<div class="inspector-row">
      <label>入点</label>
      <input type="number" id="insp-trimin" value="${(card.trimIn || 0).toFixed(1)}" step="0.1" min="0" max="${((card.trimOut || maxDuration) - 0.1).toFixed(1)}">
    </div>`,
    `<div class="inspector-row">
      <label>出点</label>
      <input type="number" id="insp-trimout" value="${(card.trimOut || maxDuration).toFixed(1)}" step="0.1" min="${((card.trimIn || 0) + 0.1).toFixed(1)}" max="${(maxDuration || 5).toFixed(1)}">
    </div>`);

  // Synthesized-video card: show edit box chain info
  if (card.type === 'synthesized-video') {
    const chain = card.editBoxChain || [];
    const chainDuration = card.totalDuration || 0;
    rows.push(`<div class="inspector-row">
      <label>类型</label>
      <span style="color:#ff9800;font-weight:500;">合成动画</span>
    </div>`);
    rows.push(`<div class="inspector-row">
      <label>链</label>
      <span style="font-size:11px;">${chain.length} 个编辑盒 / ${chainDuration.toFixed(1)}s</span>
    </div>`);
    rows.push(`<div class="inspector-row">
      <label>FPS</label>
      <input type="number" id="insp-synth-fps" value="${card.fps || 30}" min="1" max="60" step="1" style="width:60px;">
    </div>`);
    rows.push(`<div class="inspector-row" style="margin-top:4px;">
      <label>编辑盒链</label>
    </div>`);
    for (let i = 0; i < chain.length; i++) {
      const ebId = chain[i];
      const eb = findEditBoxById(ebId);
      const label = eb ? ('编辑盒 ' + (ebId || '').slice(0, 8)) : ('未知 ' + (ebId || '').slice(0, 8));
      const shapeCount = eb ? (eb.shapes || []).length : 0;
      rows.push(`<div class="inspector-row" style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:10px;color:#888;min-width:14px;">${i + 1}.</span>
        <span class="eb-chain-jump" data-eb-id="${escAttr(ebId)}" style="cursor:pointer;color:#b3d900;font-size:11px;flex:1;" title="跳转到此编辑盒">${escHtml(label)}</span>
        <span style="font-size:9px;color:#666;">${shapeCount} 图形</span>
      </div>`);
    }
    rows.push(`<div class="inspector-row">
      <button id="insp-locate-eb-chain" style="width:100%;height:26px;border:1px solid #ff9800;border-radius:4px;background:#f0f0f0;color:#ff9800;font-size:11px;cursor:pointer;">定位链首编辑盒</button>
    </div>`);
  }

  // Composition card: show edit box link instead of video-specific fields
  if (card.type === 'composition') {
    rows.push(`<div class="inspector-row">
      <button id="insp-locate-editbox" style="width:100%;height:26px;border:1px solid #b3d900;border-radius:4px;background:#f0f0f0;color:#b3d900;font-size:11px;cursor:pointer;">定位编辑盒</button>
    </div>`);
  }

  if (card.type !== 'synthesized-video') {
    rows.push(
      `<div class="inspector-row">
        <label>音量</label>
        <input type="range" id="insp-volume" min="0" max="100" value="${Math.round((card.volume || 1) * 100)}">
        <span style="font-family:var(--font-mono);font-size:10px;color:#999;width:32px;text-align:right;">${Math.round((card.volume || 1) * 100)}%</span>
      </div>`,
      `<div class="inspector-row">
        <label>淡入</label>
        <input type="number" id="insp-fadein" value="${card.fadeIn || 0}" step="0.1" min="0" max="10" style="width:60px;">
        <span style="font-size:10px;color:#999;">秒</span>
      </div>`,
      `<div class="inspector-row">
        <label>淡出</label>
        <input type="number" id="insp-fadeout" value="${card.fadeOut || 0}" step="0.1" min="0" max="10" style="width:60px;">
        <span style="font-size:10px;color:#999;">秒</span>
      </div>`
    );
  }

  // Transform controls — video cards only
  if (card.type === 'video') {
    rows.push(`<div class="inspector-row" style="font-size:11px;color:#999;margin-top:8px;">变换 (Transform)</div>`);
    rows.push(`<div class="inspector-row">
      <label>缩放</label>
      <input type="range" id="insp-transform-scale" min="10" max="500" value="${Math.round((card.transformScale || 1.0) * 100)}">
      <span style="font-family:var(--font-mono);font-size:10px;color:#999;width:36px;text-align:right;">${Math.round((card.transformScale || 1.0) * 100)}%</span>
    </div>`);
    rows.push(`<div class="inspector-row">
      <label>X偏移</label>
      <input type="number" id="insp-transform-x" value="${(card.transformX || 0).toFixed(0)}" step="1" style="width:60px;">
      <span style="font-size:10px;color:#999;">px</span>
    </div>`);
    rows.push(`<div class="inspector-row">
      <label>Y偏移</label>
      <input type="number" id="insp-transform-y" value="${(card.transformY || 0).toFixed(0)}" step="1" style="width:60px;">
      <span style="font-size:10px;color:#999;">px</span>
    </div>`);
    rows.push(`<div class="inspector-row">
      <button id="insp-transform-reset" style="width:100%;height:26px;border:1px solid #444;border-radius:4px;background:#f0f0f0;color:#e0e0e0;font-size:11px;cursor:pointer;">重置变换</button>
    </div>`);

    // Freeze frame button (only for non-freeze video cards)
    if (!card.isFreezeFrame) {
      const canCapture = playbackVideo._cardId === card.id && playbackVideo.readyState >= 2;
      rows.push(`<div class="inspector-row" style="margin-top:8px;">
        <button id="insp-freeze-frame" style="width:100%;height:30px;border:1px solid #D4FF00;border-radius:4px;background:#f0f0f0;color:#D4FF00;font-size:12px;font-weight:500;cursor:pointer;"${canCapture ? '' : ' disabled'}>定格</button>
      </div>`);
    }
  }

  if (card.markers && card.markers.length > 0) {
    rows.push(`<div class="inspector-row" style="font-size:11px;color:#666;margin-top:8px;">标记点</div>`);
    for (let mi = 0; mi < card.markers.length; mi++) {
      const m = card.markers[mi];
      rows.push(`<div class="inspector-row" style="display:flex;align-items:center;gap:4px;">
        <span style="display:inline-block;width:10px;height:10px;background:${m.color};border-radius:2px;flex-shrink:0;"></span>
        <span class="marker-jump" data-card-id="${card.id}" data-marker-idx="${mi}" style="cursor:pointer;color:#D4FF00;font-size:11px;flex:1;" title="跳转到标记位置">${escHtml(m.label)}</span>
        <span style="font-size:10px;color:#999;white-space:nowrap;">${formatTime(m.time)}</span>
        <span class="marker-delete" data-card-id="${card.id}" data-marker-idx="${mi}" style="cursor:pointer;color:#ccc;font-size:12px;" title="删除标记">x</span>
      </div>`);
    }
  }

  propsContent.innerHTML = rows.join('');
  bindInspectorEvents(null, card);

  // Marker click handlers (after DOM is built)
  setTimeout(() => {
    propsContent.querySelectorAll('.marker-jump').forEach(el => {
      el.addEventListener('click', () => {
        const cid = el.dataset.cardId;
        const mi = parseInt(el.dataset.markerIdx);
        const c = state.cards.find(cc => cc.id === cid);
        if (c && c.markers && c.markers[mi]) {
          const pb = state.playback;
          if (pb.isPlaying) togglePlayback();
          pb.currentCardId = cid;
          pb.pausedCardTime = c.markers[mi].time;
          const dur = c.trimOut - c.trimIn;
          pb.cardProgress = dur > 0 ? (c.markers[mi].time - c.trimIn) / dur : 0;
          pb.pausedAt = computeSequenceTimeForCard(cid, c.markers[mi].time);
          pb.startTime = 0;
          syncPlaybackVideo();
          render();
          updatePreviewPanel();
        }
      });
    });
    propsContent.querySelectorAll('.marker-delete').forEach(el => {
      el.addEventListener('click', () => {
        const cid = el.dataset.cardId;
        const mi = parseInt(el.dataset.markerIdx);
        const c = state.cards.find(cc => cc.id === cid);
        if (c && c.markers) {
          pushUndo();
          c.markers.splice(mi, 1);
          updateInspector();
          render();
        }
      });
    });
  }, 0);
}

function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function computeSequenceTimeForCard(cardId, cardTime) {
  const pb = state.playback;
  const seq = pb.sequence;
  if (!seq || seq.length === 0) return cardTime;
  let elapsed = 0;
  for (let i = 0; i < seq.length; i++) {
    const cid = seq[i];
    const c = state.cards.find(cc => cc.id === cid);
    if (!c) continue;
    const dur = c.trimOut - c.trimIn;
    if (cid === cardId) {
      const localTime = cardTime - c.trimIn;
      return elapsed + Math.max(0, localTime);
    }
    if (i > 0) {
      const prevConn = findConnectionBetween(seq[i - 1], seq[i]);
      if (prevConn && prevConn.transition !== 'cut') elapsed += prevConn.transitionDuration;
    }
    elapsed += dur;
  }
  return elapsed;
}

function bindInspectorEvents(connOrId, card) {
  const conn = (typeof connOrId === 'string') ? state.connections.find(c => c.id === connOrId) : connOrId;
  if (conn) {
    const selType = document.getElementById('insp-transition-type');
    const selDur = document.getElementById('insp-transition-dur');
    const selEasing = document.getElementById('insp-easing');
    if (selType) {
      selType.addEventListener('change', () => {
        pushUndo();
        conn.transition = selType.value;
        render();
      });
    }
    if (selDur) {
      selDur.addEventListener('change', () => {
        const v = parseFloat(selDur.value);
        if (isFinite(v) && v > 0) { pushUndo(); conn.transitionDuration = v; render(); }
      });
    }
    if (selEasing) {
      selEasing.addEventListener('change', () => {
        pushUndo();
        conn.easing = selEasing.value;
        render();
      });
    }
    const kfFromPos = document.getElementById('insp-kf-frompos');
    if (kfFromPos) {
      kfFromPos.addEventListener('input', () => {
        pushUndo();
        conn.fromPosition = parseInt(kfFromPos.value) / 100;
        render();
      });
    }
    // Keyframe property checkboxes
    ['opacity', 'transformScale', 'transformX', 'transformY'].forEach(prop => {
      const cb = document.getElementById('insp-kf-prop-' + prop);
      if (cb) {
        cb.addEventListener('change', () => {
          pushUndo();
          if (!conn.properties) conn.properties = ['opacity', 'transformScale', 'transformX', 'transformY'];
          if (cb.checked) {
            if (!conn.properties.includes(prop)) conn.properties.push(prop);
          } else {
            conn.properties = conn.properties.filter(p => p !== prop);
          }
          // Re-render inspector to update highlight state
          updateInspector();
        });
      }
    });
    // Eb-keyframe duration
    const ebKfDur = document.getElementById('insp-eb-kf-dur');
    if (ebKfDur) {
      ebKfDur.addEventListener('change', () => {
        const v = parseFloat(ebKfDur.value);
        if (isFinite(v) && v > 0) {
          pushUndo();
          conn.transitionDuration = v;
          // Recalculate totalDuration on synthesized-video cards referencing this connection
          for (const c of state.cards) {
            if (c.type !== 'synthesized-video') continue;
            const chain = c.editBoxChain || [];
            if (chain.includes(conn.fromEditBoxId) && chain.includes(conn.toEditBoxId)) {
              c.totalDuration = getEditBoxChainDuration(chain);
            }
          }
          render();
        }
      });
    }
    // Eb-keyframe easing
    const ebKfEasing = document.getElementById('insp-eb-kf-easing');
    if (ebKfEasing) {
      ebKfEasing.addEventListener('change', () => {
        pushUndo();
        conn.easing = ebKfEasing.value;
        render();
      });
    }
  }
  if (card) {
    if (card.type === 'text') {
      const textInput = document.getElementById('insp-text');
      const fontSize = document.getElementById('insp-fontsize');
      const color = document.getElementById('insp-color');
      const textAlign = document.getElementById('insp-textalign');
      const fontWeight = document.getElementById('insp-fontweight');
      if (textInput) textInput.addEventListener('change', () => { card.text = textInput.value; render(); });
      if (fontSize) fontSize.addEventListener('change', () => { card.fontSize = parseInt(fontSize.value) || 24; render(); });
      if (color) color.addEventListener('change', () => { card.color = color.value; render(); });
      if (textAlign) textAlign.addEventListener('change', () => { card.textAlign = textAlign.value; render(); });
      if (fontWeight) fontWeight.addEventListener('change', () => { card.fontWeight = fontWeight.value; render(); });
      return;
    }
    const nameInput = document.getElementById('insp-name');
    const trimIn = document.getElementById('insp-trimin');
    const trimOut = document.getElementById('insp-trimout');
    const volSlider = document.getElementById('insp-volume');

    if (nameInput) {
      nameInput.addEventListener('change', () => {
        card.label = nameInput.value || card.label;
        render();
      });
    }
    if (trimIn) {
      trimIn.addEventListener('change', () => {
        const v = parseFloat(trimIn.value);
        if (isFinite(v) && v >= 0 && v < card.trimOut) { card.trimIn = v; render(); }
      });
    }
    if (trimOut) {
      trimOut.addEventListener('change', () => {
        const v = parseFloat(trimOut.value);
        const maxD = card.totalDuration || card.duration;
        if (isFinite(v) && v > (card.trimIn || 0) && v <= maxD) { card.trimOut = v; render(); }
      });
    }
    // Duration field
    const durInput = document.getElementById('insp-duration');
    if (durInput) {
      durInput.addEventListener('change', () => {
        const v = parseFloat(durInput.value);
        if (isFinite(v) && v > 0) {
          const curDur = card.trimOut - card.trimIn;
          if (v !== curDur) {
            pushUndo();
            card.trimOut = card.trimIn + v;
            durInput.blur();
            render();
          }
        }
      });
    }
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        pushUndo();
        card.volume = parseInt(volSlider.value) / 100;
        render();
      });
    }

    // Locate edit box button (composition cards)
    const locateBtn = document.getElementById('insp-locate-editbox');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        const eb = findEditBoxById(card.editBoxId);
        if (!eb) return;
        const canvasEl = document.getElementById('main-canvas');
        if (canvasEl) {
          const pad = 8;
          const availW = canvasEl.clientWidth - pad * 2;
          const availH = canvasEl.clientHeight - pad * 2;
          const fitZoom = Math.min(availW / eb.width, availH / eb.height);
          state.canvas.zoom = Math.min(1, fitZoom);
          state.canvas.offsetX = -(eb.x + eb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
          state.canvas.offsetY = -(eb.y + eb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
        }
        state.selection.editBoxId = eb.id;
        state.selection.cardIds = [];
        render();
      });
    }

    // Synthesized-video card: FPS change
    const synthFps = document.getElementById('insp-synth-fps');
    if (synthFps) {
      synthFps.addEventListener('change', () => {
        const v = parseInt(synthFps.value);
        if (isFinite(v) && v >= 1 && v <= 60) { pushUndo(); card.fps = v; render(); }
      });
    }

    // Synthesized-video card: locate chain start
    const locateChainBtn = document.getElementById('insp-locate-eb-chain');
    if (locateChainBtn) {
      locateChainBtn.addEventListener('click', () => {
        const chain = card.editBoxChain || [];
        if (chain.length === 0) return;
        const firstEb = findEditBoxById(chain[0]);
        if (!firstEb) return;
        const canvasEl = document.getElementById('main-canvas');
        if (canvasEl) {
          const pad = 8;
          const availW = canvasEl.clientWidth - pad * 2;
          const availH = canvasEl.clientHeight - pad * 2;
          const fitZoom = Math.min(availW / firstEb.width, availH / firstEb.height);
          state.canvas.zoom = Math.min(1, fitZoom);
          state.canvas.offsetX = -(firstEb.x + firstEb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
          state.canvas.offsetY = -(firstEb.y + firstEb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
        }
        state.selection.editBoxId = firstEb.id;
        state.selection.cardIds = [];
        render();
      });
    }

    // Synthesized-video card: chain jump buttons
    setTimeout(() => {
      propsContent.querySelectorAll('.eb-chain-jump').forEach(el => {
        el.addEventListener('click', () => {
          const ebId = el.dataset.ebId;
          const eb = findEditBoxById(ebId);
          if (!eb) return;
          const canvasEl = document.getElementById('main-canvas');
          if (canvasEl) {
            const pad = 8;
            const availW = canvasEl.clientWidth - pad * 2;
            const availH = canvasEl.clientHeight - pad * 2;
            const fitZoom = Math.min(availW / eb.width, availH / eb.height);
            state.canvas.zoom = Math.min(1, fitZoom);
            state.canvas.offsetX = -(eb.x + eb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
            state.canvas.offsetY = -(eb.y + eb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
          }
          state.selection.editBoxId = eb.id;
          state.selection.cardIds = [];
          render();
        });
      });
    }, 0);

    const fadeIn = document.getElementById('insp-fadein');
    const fadeOut = document.getElementById('insp-fadeout');
    if (fadeIn) {
      fadeIn.addEventListener('change', () => {
        const v = parseFloat(fadeIn.value);
        if (isFinite(v) && v >= 0) { pushUndo(); card.fadeIn = v; render(); }
      });
    }
    if (fadeOut) {
      fadeOut.addEventListener('change', () => {
        const v = parseFloat(fadeOut.value);
        if (isFinite(v) && v >= 0) { pushUndo(); card.fadeOut = v; render(); }
      });
    }

    // Transform controls — video cards only
    if (card.type === 'video') {
      const scaleSlider = document.getElementById('insp-transform-scale');
      const xInput = document.getElementById('insp-transform-x');
      const yInput = document.getElementById('insp-transform-y');
      const resetBtn = document.getElementById('insp-transform-reset');
      if (scaleSlider) {
        scaleSlider.addEventListener('input', () => {
          const v = parseInt(scaleSlider.value) / 100;
          if (isFinite(v)) { pushUndo(); card.transformScale = v; render(); renderTransformOverlay(); }
        });
      }
      if (xInput) {
        xInput.addEventListener('change', () => {
          const v = parseInt(xInput.value);
          if (isFinite(v)) { pushUndo(); card.transformX = v; render(); }
        });
      }
      if (yInput) {
        yInput.addEventListener('change', () => {
          const v = parseInt(yInput.value);
          if (isFinite(v)) { pushUndo(); card.transformY = v; render(); }
        });
      }
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          pushUndo();
          card.transformScale = 1.0;
          card.transformX = 0;
          card.transformY = 0;
          render();
        });
      }

      // Freeze frame button
      const freezeBtn = document.getElementById('insp-freeze-frame');
      if (freezeBtn) {
        freezeBtn.addEventListener('click', () => {
          captureFreezeFrame(card.id);
        });
      }

    }
  }

  // Batch connection editing (no conn, no card, but multiple connectionIds selected)
  if (!conn && !card && state.selection.connectionIds.length > 1) {
    const selType = document.getElementById('insp-transition-type');
    const selDur = document.getElementById('insp-transition-dur');
    if (selType) {
      selType.addEventListener('change', () => {
        pushUndo();
        for (const cid of state.selection.connectionIds) {
          const c = state.connections.find(cc => cc.id === cid);
          if (c) c.transition = selType.value;
        }
        render();
      });
    }
    if (selDur) {
      selDur.addEventListener('change', () => {
        const v = parseFloat(selDur.value);
        if (isFinite(v) && v > 0) {
          pushUndo();
          for (const cid of state.selection.connectionIds) {
            const c = state.connections.find(cc => cc.id === cid);
            if (c) c.transitionDuration = v;
          }
          render();
        }
      });
    }
  }
}

function bindMarkerInspectorEvents(marker) {
  const opacitySlider = document.getElementById('insp-mkr-opacity');
  const scaleSlider = document.getElementById('insp-mkr-scale');
  const txInput = document.getElementById('insp-mkr-tx');
  const tyInput = document.getElementById('insp-mkr-ty');
  const deleteBtn = document.getElementById('insp-mkr-delete');

  if (opacitySlider) {
    opacitySlider.addEventListener('input', () => {
      pushUndo();
      marker.properties.opacity = parseInt(opacitySlider.value) / 100;
      render();
    });
  }
  if (scaleSlider) {
    scaleSlider.addEventListener('input', () => {
      pushUndo();
      marker.properties.transformScale = parseInt(scaleSlider.value) / 100;
      render();
    });
  }
  if (txInput) {
    txInput.addEventListener('change', () => {
      const v = parseInt(txInput.value);
      if (isFinite(v)) { pushUndo(); marker.properties.transformX = v; render(); }
    });
  }
  if (tyInput) {
    tyInput.addEventListener('change', () => {
      const v = parseInt(tyInput.value);
      if (isFinite(v)) { pushUndo(); marker.properties.transformY = v; render(); }
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteMarkerCard(marker);
    });
  }
}

