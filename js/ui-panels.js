// ================================================================
// Transform Overlay — video transform controls on preview panel
// ================================================================
state.transform = { dragMode: null }; // null | 'body' | 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'

function calculateVideoRect(card) {
  const outW = 320, outH = 180;
  if (card.type !== 'video') return null;
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
  // Show overlay when paused (group mode, card-in-group, or standalone video)
  if (state.playback.isPlaying) {
    return false;
  }
  if (state.playback.pausedAt <= 0) return false;
  if (state.playback.playbackMode === 'group') return true;
  // Also accept linear mode if the selected card belongs to a group
  // (the card-body handler auto-switches to group mode, but this covers edge cases)
  if (state.selection.cardIds.length === 1) {
    const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
    if (!card) return false;
    if (state.groups.some(g => g.cardIds.includes(card.id))) return true;
    // Standalone video card (not in any group) — enable transform overlay
    if (card.type === 'video') return true;
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
  // Guard: only works in group playback mode and needs a valid card
  if (state.playback.playbackMode !== 'group') return;
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

function _hitTestStandaloneVideo(mx, my) {
  const cssW = groupPreviewCanvas.getBoundingClientRect().width;
  const cssH = groupPreviewCanvas.getBoundingClientRect().height;
  if (cssW <= 0 || cssH <= 0) return null;
  const sx = cssW / 320, sy = cssH / 180;
  const selCard = state.selection.cardIds.length === 1 ? state.cards.find(c => c.id === state.selection.cardIds[0]) : null;
  if (!selCard || selCard.type !== 'video') return null;
  const rect = calculateVideoRect(selCard);
  if (!rect) return null;
  const rx = rect.x * sx, ry = rect.y * sy, rw = rect.w * sx, rh = rect.h * sy;
  if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return selCard.id;
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

  // Standalone video card (not in a group) — draw video with transform directly
  if (pb.playbackMode !== 'group') {
    const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
    if (!card || card.type !== 'video') return null;
    const outW = 320, outH = 180;
    if (groupPreviewCanvas.width !== outW || groupPreviewCanvas.height !== outH) {
      groupPreviewCanvas.width = outW;
      groupPreviewCanvas.height = outH;
    }
    const pc = groupPreviewCanvas.getContext('2d');
    pc.clearRect(0, 0, outW, outH);
    pc.fillStyle = '#000';
    pc.fillRect(0, 0, outW, outH);
    if (card.isFreezeFrame && card.frameImage && card.frameImage.complete) {
      // Freeze frame: draw frameImage with transforms
      try {
        const iw = card.frameImage.naturalWidth || card.frameImage.width;
        const ih = card.frameImage.naturalHeight || card.frameImage.height;
        const baseScale = Math.min(outW / iw, outH / ih);
        const ts = card.transformScale || 1.0;
        const tx = card.transformX || 0;
        const ty = card.transformY || 0;
        const scale = baseScale * ts;
        const dw = iw * scale, dh = ih * scale;
        const sx = (outW - iw * baseScale) / 2 + tx;
        const sy = (outH - ih * baseScale) / 2 + ty;
        pc.drawImage(card.frameImage, sx, sy, dw, dh);
      } catch(e) {}
    } else if (playbackVideo.readyState >= 2 && playbackVideo.videoWidth > 0) {
      try {
        const vw = playbackVideo.videoWidth, vh = playbackVideo.videoHeight;
        const baseScale = Math.min(outW / vw, outH / vh);
        const ts = card.transformScale || 1.0;
        const tx = card.transformX || 0;
        const ty = card.transformY || 0;
        const scale = baseScale * ts;
        const dw = vw * scale, dh = vh * scale;
        const sx = (outW - vw * baseScale) / 2 + tx;
        const sy = (outH - vh * baseScale) / 2 + ty;
        pc.drawImage(playbackVideo, sx, sy, dw, dh);
      } catch(e) {}
    }
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
    if (groupPreviewCanvas.style.display !== 'block') groupPreviewCanvas.style.display = 'block';
    if (playbackVideo.style.display !== 'none') playbackVideo.style.display = 'none';
    return groupPreviewCanvas;
  }

  // Group mode (existing code)
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
      groupPreviewCanvas.style.width = '100%';
      groupPreviewCanvas.style.height = '100%';
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
  const fw = parseInt(fullscreenCanvas.style.width);
  const fh = parseInt(fullscreenCanvas.style.height);
  if (fw <= 0 || fh <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  const fc = fullscreenCanvas.getContext('2d');
  fc.setTransform(dpr, 0, 0, dpr, 0, 0);
  fc.fillStyle = '#000';
  fc.fillRect(0, 0, fw, fh);

  // Standalone video card (not in a group)
  if (pb.playbackMode !== 'group') {
    const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
    if (card && card.type === 'video') {
      if (card.isFreezeFrame && card.frameImage && card.frameImage.complete) {
        // Freeze frame: draw frameImage with transforms (fullscreen)
        try {
          const iw = card.frameImage.naturalWidth || card.frameImage.width;
          const ih = card.frameImage.naturalHeight || card.frameImage.height;
          const baseScale = Math.min(fw / iw, fh / ih);
          const ts = card.transformScale || 1.0;
          const tx = card.transformX || 0;
          const ty = card.transformY || 0;
          const scale = baseScale * ts;
          const dw = iw * scale, dh = ih * scale;
          const sx = (fw - iw * baseScale) / 2 + tx * (fw / 320);
          const sy = (fh - ih * baseScale) / 2 + ty * (fh / 180);
          fc.drawImage(card.frameImage, sx, sy, dw, dh);
        } catch(e) {}
      } else if (playbackVideo.readyState >= 2 && playbackVideo.videoWidth > 0) {
        try {
          const vw = playbackVideo.videoWidth, vh = playbackVideo.videoHeight;
          const baseScale = Math.min(fw / vw, fh / vh);
          const ts = card.transformScale || 1.0;
          const tx = card.transformX || 0;
          const ty = card.transformY || 0;
          const scale = baseScale * ts;
          const dw = vw * scale, dh = vh * scale;
          const sx = (fw - vw * baseScale) / 2 + tx * (fw / 320);
          const sy = (fh - vh * baseScale) / 2 + ty * (fh / 180);
          fc.drawImage(playbackVideo, sx, sy, dw, dh);
        } catch(e) {}
      }
      if (shouldShowHandles()) {
        drawFullscreenHandles(fc, fw, fh);
      }
    }
    return;
  }

  // Group mode (existing code)
  if (!_ensureGroupPlaybackMode()) return;
  const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
  if (group && !group.collapsed) {
    const playheadX = pb.groupPlayback.groupStartX + (pb.pausedAt * PIXELS_PER_SECOND);
    const resultCanvas = compositeGroupFrame(group, pb.groupPlayback.timelineCards || [], playheadX, Math.round(fw), Math.round(fh));
    if (resultCanvas) {
      fc.drawImage(resultCanvas, 0, 0);
    } else if (groupPreviewCanvas.width > 0 && groupPreviewCanvas.height > 0) {
      fc.drawImage(groupPreviewCanvas, 0, 0, fw, fh);
    }
    if (shouldShowHandles()) {
      drawFullscreenHandles(fc, fw, fh);
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
  const hitCardId = hitTestVideoInGroup(mx, my) || _hitTestStandaloneVideo(mx, my);
  if (hitCardId) {
    state.selection.cardIds = [hitCardId];
    state.selection.groupIds = [];
    if (_ensureGroupPlaybackMode()) {
      seekPlayheadToCard(hitCardId);
      _recompositePreviewForTransform();
      renderTransformOverlay();
    } else {
      // Standalone video card
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
        const hitId = hitTestVideoInGroup(mx, my) || _hitTestStandaloneVideo(mx, my);
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

  // For group mode, validate the group is available
  if (state.playback.playbackMode === 'group') {
    const group = state.groups.find(g => g.id === state.playback.groupPlayback.groupId);
    if (!group || group.collapsed) return;
  }

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

  // Delegate rendering to _recompositeFullscreenForTransform (handles both group + standalone)
  _recompositeFullscreenForTransform();
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
  fc.translate(-eb.width / 2 - eb.x, -eb.height / 2 - eb.y);
  // Camera zoom/pan for immersive preview navigation
  fc.translate(cam.offsetX, cam.offsetY);
  fc.scale(cam.zoom, cam.zoom);

  // Draw shapes (world coords)
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
      fc.strokeStyle = s.stroke || '#88C405';
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
  // Convert screen coords to world coords (accounts for camera zoom/pan)
  const worldX = ((sx - fw / 2) / scale - cam.offsetX) / cam.zoom + eb.width / 2 + eb.x;
  const worldY = ((sy - fh / 2) / scale - cam.offsetY) / cam.zoom + eb.height / 2 + eb.y;

  const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  if (_immersiveTool === 'rect') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'rect', left: worldX, top: worldY, width: 0, height: 0, fill: 'rgba(136,196,5,0.15)', stroke: '#88C405', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: worldX, y: worldY };
  } else if (_immersiveTool === 'ellipse') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'ellipse', left: worldX, top: worldY, width: 0, height: 0, fill: 'rgba(136,196,5,0.15)', stroke: '#88C405', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: worldX, y: worldY };
  } else if (_immersiveTool === 'line') {
    eb.shapes = eb.shapes || [];
    eb.shapes.push({ id, shapeType: 'line', x1: worldX, y1: worldY, x2: worldX, y2: worldY, stroke: '#88C405', strokeWidth: 2, opacity: 1 });
    eb._drawingIdx = eb.shapes.length - 1;
    eb._drawStart = { x: worldX, y: worldY };
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
  // Convert screen coords to world coords (accounts for camera zoom/pan)
  const worldX = ((sx - fw / 2) / scale - cam.offsetX) / cam.zoom + eb.width / 2 + eb.x;
  const worldY = ((sy - fh / 2) / scale - cam.offsetY) / cam.zoom + eb.height / 2 + eb.y;

  const s = (eb.shapes || [])[eb._drawingIdx];
  if (!s) return;
  if (eb._lineDrawing) {
    s.x2 = worldX;
    s.y2 = worldY;
  } else {
    s.left = Math.min(eb._drawStart.x, worldX);
    s.top = Math.min(eb._drawStart.y, worldY);
    s.width = Math.abs(worldX - eb._drawStart.x);
    s.height = Math.abs(worldY - eb._drawStart.y);
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

    // Name only (Figma: text + type icon, no thumbnail)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    if (card.type === 'text') {
      nameSpan.textContent = (card.text || '文字').slice(0, 12);
    } else {
      nameSpan.textContent = card.label;
    }
    item.appendChild(nameSpan);

    // Type indicator icon (Figma: right-aligned letter badge or shape outline)
    const typeIcon = document.createElement('span');
    typeIcon.className = 'layer-type-icon';
    if (card.type === 'video' || card.type === 'synthesized-video') {
      typeIcon.classList.add('type-video');
      typeIcon.textContent = 'V';
    } else if (card.type === 'audio' || card.type === 'bgm') {
      typeIcon.classList.add('type-bgm');
      typeIcon.textContent = 'B';
    } else if (card.type === 'text') {
      typeIcon.classList.add('type-editbox');
      typeIcon.textContent = 'T';
    } else if (card.type === 'composition') {
      typeIcon.classList.add('type-editbox');
      typeIcon.textContent = 'E';
    } else if (card.type === 'image') {
      typeIcon.classList.add('type-square');
      typeIcon.textContent = 'I';
    } else {
      // Shape types: circle/square outline
      typeIcon.classList.add('type-square');
    }
    item.appendChild(typeIcon);

    // Click to select (deferred so dblclick can fire first)
    item.addEventListener('click', (e) => {
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
// Right-panel inspector — dynamic content (Figma dark theme design)
// ================================================================

/* ---- tiny HTML helpers ---- */
function _secDivider() {
  return '<div class="section-divider"></div>';
}

function _sec(title, bodyHtml, collapsed) {
  const toggleSymbol = collapsed ? '+' : '\u2212';
  const bodyClass = collapsed ? 'section-body collapsed' : 'section-body';
  return `<div class="panel-section">
    <div class="section-header" data-sec-toggle>
      <span>${escHtml(title)}</span>
      <span class="section-toggle">${toggleSymbol}</span>
    </div>
    <div class="${bodyClass}">${bodyHtml}</div>
  </div>`;
}

// Non-collapsible section — just title, no +/- toggle
function _secStatic(title, bodyHtml) {
  return `<div class="panel-section">
    <div class="section-header section-header-static">
      <span>${escHtml(title)}</span>
    </div>
    <div class="section-body">${bodyHtml}</div>
  </div>`;
}

// Full-width row — no label, child elements fill space with justify
function _rowFull(innerHtml) {
  return `<div class="inspector-row inspector-row-full">${innerHtml}</div>`;
}

function _row(labelHtml, innerHtml, wideLabel) {
  const labelClass = wideLabel ? 'label-wide' : '';
  return `<div class="inspector-row"><label class="${labelClass}">${labelHtml}</label>${innerHtml}</div>`;
}

function _pair(aLabel, aId, aVal, bLabel, bId, bVal) {
  return `<div class="inspector-pair" style="display:flex;gap:5px;margin-bottom:6px;">
    <div class="input-box" style="box-sizing:border-box;width:101px;flex:none;display:flex;align-items:center;height:22px;padding:0 6px;gap:4px;border:1px solid transparent;border-radius:5px;background:#f2f2f2;"><span class="box-label" style="font-size:8px;color:#6c6c6c;font-weight:400;flex-shrink:0;">${aLabel}</span><input type="number" id="${aId}" value="${aVal}" step="1" style="flex:1;min-width:0;border:none;background:transparent;font-size:8px;color:#6c6c6c;outline:none;padding:0;font-family:inherit;"></div>
    <div class="input-box" style="box-sizing:border-box;width:101px;flex:none;display:flex;align-items:center;height:22px;padding:0 6px;gap:4px;border:1px solid transparent;border-radius:5px;background:#f2f2f2;"><span class="box-label" style="font-size:8px;color:#6c6c6c;font-weight:400;flex-shrink:0;">${bLabel}</span><input type="number" id="${bId}" value="${bVal}" step="1" style="flex:1;min-width:0;border:none;background:transparent;font-size:8px;color:#6c6c6c;outline:none;padding:0;font-family:inherit;"></div>
  </div>`;
}

function _slider(id, val, min, max, suffix) {
  return `<input type="range" id="${id}" min="${min}" max="${max}" value="${val}">
    <span style="font-family:var(--font-mono);font-size:10px;color:#999;width:36px;text-align:right;flex-shrink:0;">${val}${suffix || ''}</span>`;
}

function _easingSelect(id, currentVal) {
  const opts = [
    ['linear', '线性 (Linear)'],
    ['easeIn', '缓入 (Ease In)'],
    ['easeOut', '缓出 (Ease Out)'],
    ['easeInOut', '缓入缓出 (Ease In-Out)']
  ];
  let s = `<select id="${id}">`;
  for (const [v, label] of opts) {
    s += `<option value="${v}" ${currentVal === v ? 'selected' : ''}>${label}</option>`;
  }
  s += '</select>';
  return s;
}

function updateInspector() {
  if (document.activeElement && document.activeElement.closest('#props-content')) return;

  // Line shape (2D canvas)
  if (state.selection.shapeId) {
    const shape = state.shapes.find(s => s.id === state.selection.shapeId);
    if (shape && shape.shapeType === 'line') { updateLineInspector(shape); return; }
  }

  // Fabric shapes (rectangle, ellipse, path, text)
  const activeObj = fabricCanvas && fabricCanvas.getActiveObject();
  if (activeObj && activeObj._shapeId) { updateInspectorForFabricSelection(); return; }

  // ================================================================
  // eb-chain playback: always show insert keyframe button (gray when playing)
  // ================================================================
  if (state.playback.playbackMode === 'eb-chain') {
    const chainData = state.playback._ebChain;
    if (chainData && chainData.chain && chainData.chain.length >= 2) {
      const isPaused = state.playback.pausedAt > 0 && !state.playback.isPlaying;
      propsContent.innerHTML = `<div style="margin-top:16px;text-align:center;">
        <button id="insp-eb-insert-kf" class="inspector-btn${isPaused ? ' accent' : ''}" style="width:160px;padding:4px 16px;${isPaused ? '' : 'opacity:0.4;pointer-events:none;'}">插入关键帧</button>
      </div>`;
      if (isPaused) {
        const btn = document.getElementById('insp-eb-insert-kf');
        if (btn) {
          btn.addEventListener('click', () => {
          const chain = chainData.chain;
          const duration = chainData.duration || 1;
          const totalElapsed = state.playback.pausedAt;
          const chainProgress = Math.min(1, totalElapsed / Math.max(0.001, duration));

          // Find the segment and position within the chain
          let timeAccum = 0;
          let foundSegIdx = -1;
          let foundLocalT = 0;
          let foundFromEb = null;
          let foundToEb = null;
          let foundConn = null;

          for (let i = 0; i < chain.length - 1; i++) {
            const eb = findEditBoxById(chain[i]);
            const nextEb = findEditBoxById(chain[i + 1]);
            if (!eb || !nextEb) continue;

            const conn = state.connections.find(c =>
              c.type === 'eb-keyframe' &&
              ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
               (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
            );

            let segDur;
            if (conn && conn.transitionDuration > 0) {
              segDur = conn.transitionDuration;
            } else {
              segDur = Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
            }

            if (totalElapsed >= timeAccum && totalElapsed < timeAccum + segDur) {
              foundSegIdx = i;
              foundLocalT = segDur > 0 ? (totalElapsed - timeAccum) / segDur : 0;
              foundFromEb = eb;
              foundToEb = nextEb;
              foundConn = conn;
              break;
            }
            timeAccum += segDur;
          }

          if (foundSegIdx < 0 || !foundFromEb || !foundToEb) return;

          pushUndo();
          const easing = foundConn ? (foundConn.easing || 'linear') : 'linear';
          const interpShapes = interpolateShapes(foundFromEb.shapes || [], foundToEb.shapes || [], foundLocalT, easing);
          const fromSide = foundConn ? foundConn.fromSide : 'right';
          const toSide = foundConn ? foundConn.toSide : 'left';

          const newEb = {
            id: 'ebox_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            x: foundFromEb.x + (foundToEb.x - foundFromEb.x) * foundLocalT,
            y: foundFromEb.y + (foundToEb.y - foundFromEb.y) * foundLocalT,
            width: foundFromEb.width + (foundToEb.width - foundFromEb.width) * foundLocalT,
            height: foundFromEb.height + (foundToEb.height - foundFromEb.height) * foundLocalT,
            shapes: interpShapes,
            _shapesWorldCoords: !!(foundFromEb._shapesWorldCoords || foundToEb._shapesWorldCoords),
            camera: { zoom: (foundFromEb.camera ? foundFromEb.camera.zoom : 1), offsetX: 0, offsetY: 0 }
          };
          state.editBoxes.push(newEb);

          // Remove old connection, create two new ones
          if (foundConn) {
            state.connections = state.connections.filter(c => c.id !== foundConn.id);
          }
          const connDur = foundConn ? (foundConn.transitionDuration || 1) : 1;
          state.connections.push({
            id: 'conn_' + Date.now() + '_a',
            type: 'eb-keyframe',
            fromEditBoxId: foundFromEb.id,
            toEditBoxId: newEb.id,
            fromSide: fromSide,
            toSide: 'left',
            transitionDuration: connDur * foundLocalT,
            easing: easing
          });
          state.connections.push({
            id: 'conn_' + (Date.now() + 1) + '_b',
            type: 'eb-keyframe',
            fromEditBoxId: newEb.id,
            toEditBoxId: foundToEb.id,
            fromSide: 'right',
            toSide: toSide,
            transitionDuration: connDur * (1 - foundLocalT),
            easing: easing
          });

          state.selection.editBoxId = newEb.id;
          state.selection.cardIds = [];
          state.selection.groupIds = [];
          state.selection.connectionId = null;
          state.selection.connectionIds = [];
          render();
        });
      }
      }
      return;
    }
  }

  const selCount = state.selection.cardIds.length;
  const selConn = state.selection.connectionId;
  const selConns = state.selection.connectionIds;
  let html = '';

  // ================================================================
  // State: Multiple connections — batch edit
  // ================================================================
  if (selConns.length > 1 && selCount === 0) {
    const firstConn = state.connections.find(c => c.id === selConns[0]);
    const firstType = firstConn ? firstConn.transition : 'cut';
    const firstDur = firstConn ? firstConn.transitionDuration : 0.5;
    html = `<div class="inspector-row" style="font-weight:550;color:#fff;">已选 ${selConns.length} 条连线</div>
      ${_row('类型', `<select id="insp-transition-type">
        <option value="cut" ${firstType === 'cut' ? 'selected' : ''}>切</option>
        <option value="dissolve" ${firstType === 'dissolve' ? 'selected' : ''}>叠</option>
        <option value="fade" ${firstType === 'fade' ? 'selected' : ''}>黑</option>
      </select>`)}
      ${_row('时长', `<input type="number" id="insp-transition-dur" value="${firstDur}" step="0.1" min="0.1" max="5">`)}`;
    propsContent.innerHTML = html;
    bindInspectorEvents(null, null);
    return;
  }

  // ================================================================
  // State: Single connection
  // ================================================================
  if (selConn && selCount === 0) {
    const conn = state.connections.find(c => c.id === selConn);
    if (!conn) { propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>'; return; }

    if (conn.type === 'eb-keyframe') {
      const fromEb = findEditBoxById(conn.fromEditBoxId);
      const toEb = findEditBoxById(conn.toEditBoxId);
      const effDur = conn.transitionDuration > 0 ? conn.transitionDuration : (fromEb && toEb ? Math.abs(toEb.x - fromEb.x) / PIXELS_PER_SECOND : 1);
      const effEasing = conn.easing || 'linear';

      html = _secStatic('编辑盒关键帧',
        _row('时长', `<input type="number" id="insp-eb-kf-dur" value="${effDur.toFixed(1)}" step="0.1" min="0.1" max="30">`)
      ) + _secDivider() + _sec('缓动曲线', _row('缓动', _easingSelect('insp-eb-kf-easing', effEasing)), true);
    } else if (conn.type === 'keyframe') {
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
      const activeProps = conn.properties || ['opacity', 'transformScale', 'transformX', 'transformY'];
      const hasProp = (n) => activeProps.includes(n);
      const fmtVal = (a, b, diff) => diff ? `<span style="color:#ff9800;">${a} → ${b}</span>` : a;

      const propRow = (id, label, aVal, bVal, diff) => {
        const checked = hasProp(id) ? 'checked' : '';
        const highlight = diff ? ' diff-highlight' : '';
        return `<label class="kf-prop-row${highlight}">
          <input type="checkbox" id="insp-kf-prop-${id}" ${checked}>
          <span>${label}</span>
          <span style="font-size:10px;font-family:var(--font-mono);margin-left:auto;">${fmtVal(aVal, bVal, diff)}</span>
        </label>`;
      };

      const infoHtml = `${_row('锚点', _slider('insp-kf-frompos', Math.round((conn.fromPosition || 0) * 100), 0, 100, '%'))}
        <div style="font-size:11px;color:#aaa;margin-top:6px;margin-bottom:4px;">控制属性</div>
        <div style="display:flex;flex-direction:column;gap:2px;">
          ${propRow('opacity', '透明度', aOpacity, bOpacity, _diff(aOpacity, bOpacity))}
          ${propRow('transformScale', '缩放', aScale.toFixed(2), bScale.toFixed(2), _diff(aScale, bScale))}
          ${propRow('transformX', '位移 X', Math.round(aX), Math.round(bX), _diff(aX, bX))}
          ${propRow('transformY', '位移 Y', Math.round(aY), Math.round(bY), _diff(aY, bY))}
        </div>
        <style>
          .kf-prop-row { display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:4px;font-size:11px;cursor:pointer; }
          .kf-prop-row.diff-highlight { background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3); }
        </style>`;
      const easingHtml = _row('缓动', _easingSelect('insp-easing', conn.easing || 'linear'));

      html = _sec('关键帧连线', infoHtml, false) + _secDivider() + _sec('缓动曲线', easingHtml, true);
    } else if (conn.type === 'tween') {
      const infoHtml = `<div class="inspector-row" style="margin-bottom:4px;"><span style="color:#D4FF00;font-weight:500;">补间连线</span></div>`;
      const easingHtml = _row('缓动', _easingSelect('insp-easing', conn.easing || 'linear'));
      html = _sec('补间', infoHtml, false) + _secDivider() + _sec('缓动曲线', easingHtml, true);
    } else {
      // cut / dissolve / fade transitions
      html = _sec('转场',
        _row('时长', `<input type="number" id="insp-transition-dur" value="${conn.transitionDuration}" step="0.1" min="0.1" max="5">`) +
        _row('类型', `<select id="insp-transition-type">
          <option value="cut" ${conn.transition === 'cut' ? 'selected' : ''}>切</option>
          <option value="dissolve" ${conn.transition === 'dissolve' ? 'selected' : ''}>叠</option>
          <option value="fade" ${conn.transition === 'fade' ? 'selected' : ''}>黑</option>
        </select>`),
        false
      );
    }
    propsContent.innerHTML = html;
    _bindSectionToggles();
    bindInspectorEvents(selConn, null);
    return;
  }

  // ================================================================
  // State: No cards / no connections
  // ================================================================
  if (selCount === 0 && selConns.length === 0) {
    // Marker card
    if (state.selection.markerCardId) {
      const marker = state.markerCards.find(m => m.id === state.selection.markerCardId);
      if (marker) {
        const parentCard = state.cards.find(c => c.id === marker.parentCardId);
        const parentLabel = parentCard ? (parentCard.label || '(未命名)') : '(未知卡片)';
        html = _sec('标记卡',
          _row('来源', `<span style="font-size:11px;">${escHtml(parentLabel)}</span>`) +
          _row('帧时间', `<span style="font-size:11px;font-family:var(--font-mono);">${(marker.frameTime || 0).toFixed(2)} 秒</span>`) +
          _row('透明度', _slider('insp-mkr-opacity', Math.round((marker.properties.opacity || 1) * 100), 0, 100, '%')) +
          _row('缩放', _slider('insp-mkr-scale', Math.round((marker.properties.transformScale || 1) * 100), 10, 500, '%')) +
          _pair('X', 'insp-mkr-tx', (marker.properties.transformX || 0).toFixed(0), 'Y', 'insp-mkr-ty', (marker.properties.transformY || 0).toFixed(0)) +
          `<div class="inspector-row"><button id="insp-mkr-delete" class="inspector-btn" style="width:100%;color:#e04040;">删除标记卡</button></div>`,
          false
        );
        propsContent.innerHTML = html;
        _bindSectionToggles();
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
        const infoHtml = _row('名称', `<input type="text" id="insp-group-name" value="${escAttr(group.name || '')}">`) +
          _row('成员', `<span style="font-size:11px;color:#888;">${memberCount} 张卡片</span>`);
        const modeHtml = _row('模式', `<div style="display:flex;gap:4px;">
            <button id="insp-group-fit" style="flex:1;height:24px;border:1px solid #6554CB;border-radius:4px;background:${mode === 'fit' ? '#6554CB' : '#fff'};color:${mode === 'fit' ? '#fff' : '#6554CB'};font-size:11px;cursor:pointer;">适应</button>
            <button id="insp-group-fixed" style="flex:1;height:24px;border:1px solid #6554CB;border-radius:4px;background:${mode === 'fixed' ? '#6554CB' : '#fff'};color:${mode === 'fixed' ? '#fff' : '#6554CB'};font-size:11px;cursor:pointer;">固定</button>
          </div>`);
        let groupHtml = _secStatic('编辑组', infoHtml) + _secDivider() +
          _secStatic('模式', modeHtml);
        if (mode === 'fixed') {
          groupHtml += _secDivider() + _secStatic('尺寸',
            _pair('宽', 'insp-group-width', Math.round(group.width || 200), '高', 'insp-group-height', Math.round(group.height || 60)));
        }
        propsContent.innerHTML = groupHtml;
        _bindSectionToggles();
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
    // Audio mixer
    const audioCards = state.cards.filter(c => c.type === 'audio');
    if (audioCards.length > 0) {
      let mixerHtml = '';
      for (const ac of audioCards) {
        const isActive = state.bgmEntries && state.bgmEntries.some(e => e.cardId === ac.id && e.active);
        mixerHtml += `<div class="inspector-row" style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(ac.label)}</span>
          <span style="font-size:8px;color:${isActive ? '#4CAF50' : '#999'};min-width:20px;">${isActive ? 'ON' : 'off'}</span>
          <input type="range" class="mixer-vol" data-card-id="${ac.id}" min="0" max="100" value="${Math.round(ac.volume * 100)}" style="width:60px;">
          <span style="font-size:10px;color:#999;width:28px;">${Math.round(ac.volume * 100)}%</span>
        </div>`;
      }
      html = _sec('音频混音器', mixerHtml, false);
      propsContent.innerHTML = html;
      _bindSectionToggles();
      setTimeout(() => {
        propsContent.querySelectorAll('.mixer-vol').forEach(slider => {
          slider.addEventListener('input', () => {
            const cid = slider.dataset.cardId;
            const c = state.cards.find(cc => cc.id === cid);
            if (c) {
              c.volume = parseInt(slider.value) / 100;
              const entry = state.bgmEntries && state.bgmEntries.find(e => e.cardId === cid && e.active);
              if (entry && entry.audio) entry.audio.volume = c.volume;
              render();
            }
          });
        });
      }, 0);
    } else {
      propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>';
    }
    return;
  }

  // ================================================================
  // State: Edit box chain (no cards, no connection, editBoxId set)
  // ================================================================
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
        let chainRows = _row('当前', `<span style="font-size:11px;">编辑盒 ${(state.selection.editBoxId || '').slice(0, 8)} (${(selEb.shapes || []).length} 图形)</span>`) +
          _row('链长度', `<span style="font-size:11px;">${chain.length} 个编辑盒 / ${chainDuration.toFixed(1)}s</span>`);
        chainRows += '<div class="inspector-row"><label>链</label></div>';
        for (let i = 0; i < chain.length; i++) {
          const ebId = chain[i];
          const eb = findEditBoxById(ebId);
          const isCurrent = ebId === state.selection.editBoxId;
          const label = eb ? ('编辑盒 ' + (ebId || '').slice(0, 8)) : ('未知 ' + (ebId || '').slice(0, 8));
          chainRows += `<div class="inspector-row" style="display:flex;align-items:center;gap:4px;${isCurrent ? 'background:rgba(255,152,0,0.1);border-radius:4px;padding:2px 4px;' : ''}">
            <span style="font-size:10px;color:#888;min-width:14px;">${i + 1}.</span>
            <span class="eb-chain-nav" data-eb-id="${escAttr(ebId)}" style="cursor:pointer;color:${isCurrent ? '#ff9800' : '#c4b5fd'};font-size:11px;flex:1;">${escHtml(label)}${isCurrent ? ' (当前)' : ''}</span>
            <span style="font-size:9px;color:#666;">${eb ? (eb.shapes || []).length : 0} 图形</span>
          </div>`;
        }
        html = _sec('关键帧链', chainRows, false) + _secDivider() +
          _sec('时长', _row('总时长', `<input type="number" id="insp-chain-duration" value="${chainDuration.toFixed(1)}" step="0.1" min="0.1" max="300">`), false);
        propsContent.innerHTML = html;
        _bindSectionToggles();
        // Chain navigation
        setTimeout(() => {
          propsContent.querySelectorAll('.eb-chain-nav').forEach(el => {
            el.addEventListener('click', () => {
              const ebId = el.dataset.ebId;
              const eb = findEditBoxById(ebId);
              if (!eb) return;
              const canvasEl = document.getElementById('main-canvas');
              if (canvasEl) {
                const pad = 8;
                const fitZoom = Math.min((canvasEl.clientWidth - pad * 2) / eb.width, (canvasEl.clientHeight - pad * 2) / eb.height);
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
    // Single edit box, no connections — blank
    propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>';
    return;
  }

  // ================================================================
  // State: Cards selected
  // ================================================================
  const card = state.cards.find(c => c.id === state.selection.cardIds[0]);
  if (!card) { propsContent.innerHTML = '<div class="inspector-hint">选中卡片以编辑属性</div>'; return; }

  if (selCount > 1) {
    propsContent.innerHTML = `<div class="inspector-hint">已选 ${selCount} 张卡片</div>`;
    return;
  }

  // ---- TEXT card ----
  if (card.type === 'text') {
    const fontSize = card.fontSize || 24;
    const fontW = card.fontWeight || 'Regular';
    html = _secStatic('字体',
      _row('字号', `<input type="number" id="insp-fontsize" value="${fontSize}" min="8" max="200">`) +
      _row('粗细', `<select id="insp-fontweight">
        <option value="Regular" ${fontW === 'Regular' ? 'selected' : ''}>常规</option>
        <option value="Bold" ${fontW === 'Bold' ? 'selected' : ''}>粗体</option>
        <option value="Light" ${fontW === 'Light' ? 'selected' : ''}>细体</option>
      </select>`)
    ) + _secDivider() +
    _secStatic('对齐',
      _row('水平', `<select id="insp-textalign">
        <option value="left" ${card.textAlign === 'left' ? 'selected' : ''}>左对齐</option>
        <option value="center" ${card.textAlign === 'center' ? 'selected' : ''}>居中</option>
        <option value="right" ${card.textAlign === 'right' ? 'selected' : ''}>右对齐</option>
      </select>`)
    ) + _secDivider() +
    _secStatic('颜色',
      `<div class="inspector-color-bar">
        <span class="color-swatch" style="background:${card.color || '#000000'};"></span>
        <span>${(card.color || '#000000').toUpperCase()}</span>
        <input type="color" id="insp-color" value="${card.color || '#000000'}">
        <span class="opacity-val">${Math.round((card.opacity != null ? card.opacity : 1) * 100)}%</span>
      </div>`
    );
    propsContent.innerHTML = html;
    _bindSectionToggles();
    bindInspectorEvents(null, card);
    return;
  }

  // ---- VIDEO / SYNTHESIZED-VIDEO / COMPOSITION / AUDIO cards ----
  const dur = card.trimOut - card.trimIn;
  const maxDuration = card.totalDuration || card.duration;
  const isVideoLike = card.type === 'video' || card.type === 'synthesized-video' || card.type === 'image';
  const isComposition = card.type === 'composition';

  // 1. Info section (static, no +/-)
  const isImage = card.type === 'image';
  const durReadonly = isImage ? '' : 'readonly';
  const durStyle = isImage ? '' : 'style="color:#888;"';
  let infoHtml = _row('名称', `<input type="text" id="insp-name" value="${escAttr(card.label || '')}">`) +
    _row('时长', `<input type="number" id="insp-duration" value="${maxDuration.toFixed(1)}" step="0.5" min="0.5" max="300" ${durReadonly} ${durStyle}>`);
  html = _secStatic('信息', infoHtml) + _secDivider();

  // Synthesized-video extra info (collapsible)
  if (card.type === 'synthesized-video') {
    const chain = card.editBoxChain || [];
    const chainDuration = card.totalDuration || 0;
    let chainRows = _row('类型', '<span style="color:rgb(101,84,203);font-weight:500;">合成视频</span>') +
      _row('链', `<span style="font-size:11px;">${chain.length} 个编辑盒 / ${chainDuration.toFixed(1)}s</span>`);
    for (let i = 0; i < chain.length; i++) {
      const ebId = chain[i];
      const eb = findEditBoxById(ebId);
      const label = eb ? ('编辑盒 ' + (ebId || '').slice(0, 8)) : ('未知 ' + (ebId || '').slice(0, 8));
      const shapeCount = eb ? (eb.shapes || []).length : 0;
      chainRows += `<div class="inspector-row" style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:10px;color:#888;min-width:14px;">${i + 1}.</span>
        <span class="eb-chain-jump" data-eb-id="${escAttr(ebId)}" style="cursor:pointer;color:#c4b5fd;font-size:11px;flex:1;">${escHtml(label)}</span>
        <span style="font-size:9px;color:#666;">${shapeCount} 图形</span>
      </div>`;
    }
    html += _sec('编辑盒链', chainRows, true) + _secDivider();
  }

  // Composition: locate edit box button
  if (isComposition) {
    html += _secStatic('编辑盒',
      `<div class="inspector-row"><button id="insp-locate-editbox" class="inspector-btn" style="width:100%;">定位编辑盒</button></div>`
    ) + _secDivider();
  }

  // 2. Position (static, no +/-) — for video/synthesized-video
  //    x/y pair → scale slider below, no reset button
  if (isVideoLike) {
    const tx = (card.transformX || 0).toFixed(0);
    const ty = (card.transformY || 0).toFixed(0);
    const scale = Math.round((card.transformScale || 1.0) * 100);
    const posHtml = _pair('X', 'insp-transform-x', tx, 'Y', 'insp-transform-y', ty) +
      _row('缩放', _slider('insp-transform-scale', scale, 10, 500, '%'));
    html += _secStatic('位置', posHtml) + _secDivider();
  }

  // 3. Volume (static, no +/-) — non-composition; slider fills full width
  if (!isComposition) {
    html += _secStatic('音量',
      _rowFull(_slider('insp-volume', Math.round((card.volume || 1) * 100), 0, 100, '%'))
    ) + _secDivider();
  }

  // 4. Animation (collapsible, +/- toggle) — at the bottom
  if (!isComposition) {
    const animHtml = _row('淡入', `<input type="number" id="insp-fadein" value="${card.fadeIn || 0}" step="0.1" min="0" max="10"><span style="font-size:10px;color:#999;">秒</span>`) +
      _row('淡出', `<input type="number" id="insp-fadeout" value="${card.fadeOut || 0}" step="0.1" min="0" max="10"><span style="font-size:10px;color:#999;">秒</span>`);
    html += _sec('动画', animHtml, true);
  }

  propsContent.innerHTML = html;
  _bindSectionToggles();
  bindInspectorEvents(null, card);

  // eb-chain jump buttons (synthesized-video)
  setTimeout(() => {
    propsContent.querySelectorAll('.eb-chain-jump').forEach(el => {
      el.addEventListener('click', () => {
        const ebId = el.dataset.ebId;
        const eb = findEditBoxById(ebId);
        if (!eb) return;
        const canvasEl = document.getElementById('main-canvas');
        if (canvasEl) {
          const pad = 8;
          const fitZoom = Math.min((canvasEl.clientWidth - pad * 2) / eb.width, (canvasEl.clientHeight - pad * 2) / eb.height);
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
}

function _bindSectionToggles() {
  propsContent.querySelectorAll('[data-sec-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      const body = header.nextElementSibling;
      const toggle = header.querySelector('.section-toggle');
      if (!body || !toggle) return;
      if (body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        toggle.textContent = '\u2212';
      } else {
        body.classList.add('collapsed');
        toggle.textContent = '+';
      }
    });
  });
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

  // ---- Connection events ----
  if (conn) {
    // Transition type (cut/dissolve/fade connections)
    const selType = document.getElementById('insp-transition-type');
    if (selType) {
      selType.addEventListener('change', () => {
        pushUndo(); conn.transition = selType.value; render();
      });
    }
    // Transition duration
    const selDur = document.getElementById('insp-transition-dur');
    if (selDur) {
      selDur.addEventListener('change', () => {
        const v = parseFloat(selDur.value);
        if (isFinite(v) && v > 0) { pushUndo(); conn.transitionDuration = v; render(); }
      });
    }
    // Easing (keyframe / tween / eb-keyframe)
    const selEasing = document.getElementById('insp-easing');
    if (selEasing) {
      selEasing.addEventListener('change', () => {
        pushUndo(); conn.easing = selEasing.value; render();
      });
    }
    // Keyframe anchor position
    const kfFromPos = document.getElementById('insp-kf-frompos');
    if (kfFromPos) {
      kfFromPos.addEventListener('input', () => {
        pushUndo(); conn.fromPosition = parseInt(kfFromPos.value) / 100; render();
      });
    }
    // Keyframe property checkboxes
    ['opacity', 'transformScale', 'transformX', 'transformY'].forEach(prop => {
      const cb = document.getElementById('insp-kf-prop-' + prop);
      if (cb) {
        cb.addEventListener('change', () => {
          pushUndo();
          if (!conn.properties) conn.properties = ['opacity', 'transformScale', 'transformX', 'transformY'];
          if (cb.checked) { if (!conn.properties.includes(prop)) conn.properties.push(prop); }
          else { conn.properties = conn.properties.filter(p => p !== prop); }
          updateInspector();
        });
      }
    });
    // EB-keyframe duration
    const ebKfDur = document.getElementById('insp-eb-kf-dur');
    if (ebKfDur) {
      ebKfDur.addEventListener('change', () => {
        const v = parseFloat(ebKfDur.value);
        if (isFinite(v) && v > 0) {
          pushUndo(); conn.transitionDuration = v;
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
    // EB-keyframe easing
    const ebKfEasing = document.getElementById('insp-eb-kf-easing');
    if (ebKfEasing) {
      ebKfEasing.addEventListener('change', () => {
        pushUndo(); conn.easing = ebKfEasing.value; render();
      });
    }
  }

  // ---- Card events ----
  if (card) {
    // Text card
    if (card.type === 'text') {
      const fontSize = document.getElementById('insp-fontsize');
      const fontWeight = document.getElementById('insp-fontweight');
      const color = document.getElementById('insp-color');
      const textAlign = document.getElementById('insp-textalign');
      if (fontSize) fontSize.addEventListener('change', () => { card.fontSize = parseInt(fontSize.value) || 24; render(); });
      if (fontWeight) fontWeight.addEventListener('change', () => { card.fontWeight = fontWeight.value; render(); });
      if (color) color.addEventListener('change', () => { card.color = color.value; render(); });
      if (textAlign) textAlign.addEventListener('change', () => { card.textAlign = textAlign.value; render(); });
      return;
    }

    // Non-text cards
    const nameInput = document.getElementById('insp-name');
    if (nameInput) nameInput.addEventListener('change', () => { card.label = nameInput.value || card.label; render(); });

    // Image card: editable duration
    if (card.type === 'image') {
      const durInput = document.getElementById('insp-duration');
      if (durInput) durInput.addEventListener('change', () => {
        const v = parseFloat(durInput.value);
        if (isFinite(v) && v >= 0.5 && v <= 300) {
          pushUndo();
          card.duration = v;
          card.trimOut = v;
          card.width = v * PIXELS_PER_SECOND;
          render();
        }
      });
    }

    // Volume
    const volSlider = document.getElementById('insp-volume');
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        pushUndo(); card.volume = parseInt(volSlider.value) / 100; render();
      });
    }

    // Fade in/out
    const fadeIn = document.getElementById('insp-fadein');
    const fadeOut = document.getElementById('insp-fadeout');
    if (fadeIn) fadeIn.addEventListener('change', () => { const v = parseFloat(fadeIn.value); if (isFinite(v) && v >= 0) { pushUndo(); card.fadeIn = v; render(); } });
    if (fadeOut) fadeOut.addEventListener('change', () => { const v = parseFloat(fadeOut.value); if (isFinite(v) && v >= 0) { pushUndo(); card.fadeOut = v; render(); } });

    // Locate edit box (composition)
    const locateBtn = document.getElementById('insp-locate-editbox');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        const eb = findEditBoxById(card.editBoxId);
        if (!eb) return;
        const canvasEl = document.getElementById('main-canvas');
        if (canvasEl) {
          const pad = 8;
          const fitZoom = Math.min((canvasEl.clientWidth - pad * 2) / eb.width, (canvasEl.clientHeight - pad * 2) / eb.height);
          state.canvas.zoom = Math.min(1, fitZoom);
          state.canvas.offsetX = -(eb.x + eb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
          state.canvas.offsetY = -(eb.y + eb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
        }
        state.selection.editBoxId = eb.id;
        state.selection.cardIds = [];
        render();
      });
    }

    // Synthesized-video: locate chain start
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
          const fitZoom = Math.min((canvasEl.clientWidth - pad * 2) / firstEb.width, (canvasEl.clientHeight - pad * 2) / firstEb.height);
          state.canvas.zoom = Math.min(1, fitZoom);
          state.canvas.offsetX = -(firstEb.x + firstEb.width / 2) * state.canvas.zoom + canvasEl.clientWidth / 2;
          state.canvas.offsetY = -(firstEb.y + firstEb.height / 2) * state.canvas.zoom + canvasEl.clientHeight / 2;
        }
        state.selection.editBoxId = firstEb.id;
        state.selection.cardIds = [];
        render();
      });
    }

    // Synthesized-video FPS
    const synthFps = document.getElementById('insp-synth-fps');
    if (synthFps) synthFps.addEventListener('change', () => { const v = parseInt(synthFps.value); if (isFinite(v) && v >= 1 && v <= 60) { pushUndo(); card.fps = v; render(); } });

    // Transform (video / synthesized-video / image)
    if (card.type === 'video' || card.type === 'synthesized-video' || card.type === 'image') {
      const scaleSlider = document.getElementById('insp-transform-scale');
      const xInput = document.getElementById('insp-transform-x');
      const yInput = document.getElementById('insp-transform-y');
      const resetBtn = document.getElementById('insp-transform-reset');
      if (scaleSlider) scaleSlider.addEventListener('input', () => { const v = parseInt(scaleSlider.value) / 100; if (isFinite(v)) { pushUndo(); card.transformScale = v; render(); renderTransformOverlay(); } });
      if (xInput) xInput.addEventListener('change', () => { const v = parseInt(xInput.value); if (isFinite(v)) { pushUndo(); card.transformX = v; render(); } });
      if (yInput) yInput.addEventListener('change', () => { const v = parseInt(yInput.value); if (isFinite(v)) { pushUndo(); card.transformY = v; render(); } });
      if (resetBtn) resetBtn.addEventListener('click', () => { pushUndo(); card.transformScale = 1.0; card.transformX = 0; card.transformY = 0; render(); });
    }
  }

  // Batch connection editing
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

// Event delegation for group panel mode toggle buttons.
// Using a single delegated handler avoids the setTimeout race condition
// where multiple updateInspector() calls stack duplicate bindings on the same buttons.
(function initGroupPanelDelegation() {
  if (!propsContent) return;
  propsContent.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const gid = state.selection.groupIds[0];
    if (!gid) return;
    const group = state.groups.find(g => g.id === gid);
    if (!group) return;

    if (btn.id === 'insp-group-fit') {
      if (group.sizingMode === 'fit') return;
      e.stopPropagation();
      pushUndo();
      group.sizingMode = 'fit';
      group.x = undefined; group.y = undefined; group.width = undefined; group.height = undefined;
      document.activeElement?.blur();
      render();
    } else if (btn.id === 'insp-group-fixed') {
      if (group.sizingMode === 'fixed') return;
      e.stopPropagation();
      pushUndo();
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
      document.activeElement?.blur();
      render();
    }
  });
})();

