// ================================================================
// Rendering: Grid (checkerboard + major lines)
// ================================================================
function renderGrid() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const checkerSize = 40;
  const majorEvery = 4;  // major line every N checkers
  const majorSize = checkerSize * majorEvery;

  // Visible world rect
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(w, h);

  // Align to checker grid in world space
  const startCol = Math.floor(topLeft.x / checkerSize);
  const endCol = Math.ceil(bottomRight.x / checkerSize);
  const startRow = Math.floor(topLeft.y / checkerSize);
  const endRow = Math.ceil(bottomRight.y / checkerSize);

  // Draw checkerboard — batch by color to reduce state changes
  const evenCells = [];
  const oddCells = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const cell = {
        x: col * checkerSize,
        y: row * checkerSize,
        w: checkerSize,
        h: checkerSize
      };
      if ((row + col) % 2 === 0) {
        evenCells.push(cell);
      } else {
        oddCells.push(cell);
      }
    }
  }

  // Draw even cells (canvas color — slightly lighter)
  if (evenCells.length > 0) {
    ctx.fillStyle = '#f5f5f5';
    for (const c of evenCells) {
      const s = worldToScreen(c.x, c.y);
      const sz = checkerSize * state.canvas.zoom;
      ctx.fillRect(s.x, s.y, sz + 1, sz + 1);
    }
  }

  // Draw odd cells (checker color)
  if (oddCells.length > 0) {
    ctx.fillStyle = '#f0f0f0';
    for (const c of oddCells) {
      const s = worldToScreen(c.x, c.y);
      const sz = checkerSize * state.canvas.zoom;
      ctx.fillRect(s.x, s.y, sz + 1, sz + 1);
    }
  }

  // Major grid lines
  const majorStartCol = Math.floor(topLeft.x / majorSize);
  const majorEndCol = Math.ceil(bottomRight.x / majorSize);
  const majorStartRow = Math.floor(topLeft.y / majorSize);
  const majorEndRow = Math.ceil(bottomRight.y / majorSize);

  ctx.strokeStyle = '#ebebeb';
  ctx.lineWidth = 1;

  for (let col = majorStartCol; col <= majorEndCol; col++) {
    const wx = col * majorSize;
    const s = worldToScreen(wx, 0);
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, h);
    ctx.stroke();
  }

  for (let row = majorStartRow; row <= majorEndRow; row++) {
    const wy = row * majorSize;
    const s = worldToScreen(0, wy);
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(w, s.y);
    ctx.stroke();
  }
}

// ================================================================
// Rendering: Cards (called within world-space transform)
// ================================================================
function renderCard(card) {
  const cw = getCardWidth(card);
  const ch = (card.type === 'audio')
    ? CARD_WAVEFORM_HEIGHT
    : CARD_HEIGHT;
  const x = card.x;
  const y = card.y;
  const r = 8;
  const lw = 1 / state.canvas.zoom;
  const isSelected = state.selection.cardIds.includes(card.id);
  const isHovered = state.hoveredCardId === card.id;
  const showHandles = isSelected;
  const colors = getCardColors(card);

  // --- Selection glow ---
  if (isSelected) {
    ctx.save();
    ctx.shadowColor = colors.shadow;
    ctx.shadowBlur = 12 / state.canvas.zoom;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 1.5 / state.canvas.zoom;
    roundRect(x, y, cw, ch, r, true, true);
    ctx.restore();
  } else if (isHovered) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = lw;
    roundRect(x, y, cw, ch, r, true, true);

    // Subtle shadow on hover
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 8 / state.canvas.zoom;
    ctx.shadowOffsetY = 2 / state.canvas.zoom;
    ctx.fillStyle = '#ffffff';
    roundRect(x, y, cw, ch, r, true, false);
    ctx.restore();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e6e6e6';
    ctx.lineWidth = lw;
    roundRect(x, y, cw, ch, r, true, true);
  }

  // --- Clip to card for content ---
  ctx.save();
  ctx.beginPath();
  roundRectPath(x, y, cw, ch, r);
  ctx.clip();

  if (card.type === 'audio') {
    // ===== Audio/BGM Card (Figma design: compact waveform strip) =====
    const accentColor = '#f35d5d'; // Figma: rgb(243, 93, 93)
    const waveformColor = '#f798aa'; // Figma: rgb(247, 152, 170)

    // Card body background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(x, y, cw, ch);

    // Left accent bar
    ctx.fillStyle = accentColor;
    ctx.fillRect(x, y, 3 / state.canvas.zoom, ch);

    // Right accent bar
    ctx.fillStyle = accentColor;
    ctx.fillRect(x + cw - 3 / state.canvas.zoom, y, 3 / state.canvas.zoom, ch);

    // Body bottom border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, y + ch);
    ctx.lineTo(x + cw, y + ch);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // BGM type badge (compact, top-right)
    const badgeW = 22 / state.canvas.zoom;
    const badgeH = 10 / state.canvas.zoom;
    ctx.fillStyle = 'rgba(243,93,93,0.12)';
    ctx.strokeStyle = 'rgba(243,93,93,0.35)';
    ctx.lineWidth = 0.8 / state.canvas.zoom;
    const badgeX = x + cw - badgeW - 4 / state.canvas.zoom;
    const badgeY = y + 2 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = accentColor;
    ctx.font = `500 ${Math.max(7, 9 / state.canvas.zoom)}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BGM', badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Waveform area
    const wfPad = 6 / state.canvas.zoom;
    const wfX = x + wfPad;
    const wfW = cw - wfPad * 2 - 32 / state.canvas.zoom; // leave room for volume on right
    const wfCenterY = y + ch / 2;

    // Waveform bars (pink, Figma style)
    if (card.waveform && card.waveform.length > 0) {
      const peaks = card.waveform;
      const barCount = Math.min(peaks.length, Math.floor(wfW / (1.5 / state.canvas.zoom)));
      const barW = wfW / barCount;
      const maxBarH = ch - wfPad * 2;
      const trimStart = card.trimIn / card.duration;
      const trimEnd = card.trimOut / card.duration;

      for (let i = 0; i < barCount; i++) {
        const idxFloat = (i / barCount) * (trimEnd - trimStart) + trimStart;
        const idx = Math.floor(idxFloat * peaks.length);
        const peak = peaks[Math.min(idx, peaks.length - 1)];
        const barH = Math.max(1 / state.canvas.zoom, peak * maxBarH);
        ctx.fillStyle = waveformColor;
        ctx.fillRect(
          wfX + i * barW,
          wfCenterY - barH / 2,
          Math.max(0.5 / state.canvas.zoom, barW - 0.5 / state.canvas.zoom),
          barH
        );
      }
    } else {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(wfX, wfCenterY - 0.5 / state.canvas.zoom, wfW, 1 / state.canvas.zoom);
    }

    // Volume slider (compact, right side)
    const volW = 16 / state.canvas.zoom;
    const volX = x + cw - volW - 4 / state.canvas.zoom;
    const volTrackH = ch - 6 / state.canvas.zoom;
    const volTrackY = y + 3 / state.canvas.zoom;
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.beginPath();
    ctx.moveTo(volX + volW / 2, volTrackY);
    ctx.lineTo(volX + volW / 2, volTrackY + volTrackH);
    ctx.stroke();
    const knobY = volTrackY + (1 - card.volume) * volTrackH;
    if (card.volume > 0) {
      ctx.strokeStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(volX + volW / 2, knobY);
      ctx.lineTo(volX + volW / 2, volTrackY + volTrackH);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 0.8 / state.canvas.zoom;
    ctx.beginPath();
    ctx.arc(volX + volW / 2, knobY, 2.5 / state.canvas.zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Volume percentage label
    const pctText = Math.round(card.volume * 100) + '%';
    ctx.fillStyle = '#999';
    ctx.font = `400 ${Math.max(6, 8 / state.canvas.zoom)}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(pctText, volX + volW / 2, volTrackY + volTrackH + 1 / state.canvas.zoom);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    card._volPctBounds = { x: volX, y: volTrackY + volTrackH, w: volW, h: 10 / state.canvas.zoom };

    ctx.restore();

    // --- Label (outside card body, below) ---
    const labelY = y + ch;
    const labelPad = 2 / state.canvas.zoom;

    const inGroup = isCardInGroup(card.id);
    ctx.fillStyle = accentColor;
    const labelFontSize = inGroup ? 11 : Math.max(9, 11 / state.canvas.zoom);
    ctx.font = `${isSelected ? '550' : '450'} ${labelFontSize}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    const labelTextY = labelY + labelPad;
    const maxLabelW = cw - 12 / state.canvas.zoom - (cw > 140 ? 40 : 0);
    let label = card.label || '';
    while (ctx.measureText(label).width > maxLabelW && label.length > 3) { label = label.slice(0, -4) + '...'; }
    ctx.fillText(label, x + 6 / state.canvas.zoom, labelTextY);

    if (cw > 140 && card.duration > 0) {
      const dur = card.trimOut - card.trimIn;
      ctx.fillStyle = '#e8a0a0';
      const durFontSize = inGroup ? 9 : Math.max(7, 9 / state.canvas.zoom);
      ctx.font = `400 ${durFontSize}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(formatTime(dur), x + cw - 6 / state.canvas.zoom, labelTextY);
      ctx.textAlign = 'start';
    }
    ctx.textBaseline = 'alphabetic';

  } else if (card.type === 'text') {
    // ===== Text card content =====
    const pad = 12;
    ctx.fillStyle = card.color || '#000000';
    ctx.font = `${card.fontWeight || 'Bold'} ${card.fontSize || 24}px "${card.fontFamily || 'Inter'}", system-ui, sans-serif`;
    ctx.textAlign = card.textAlign || 'left';
    ctx.textBaseline = 'top';
    const lines = (card.text || '输入文字').split('\n');
    let textY = y + pad;
    for (const line of lines) {
      const textX = card.textAlign === 'center' ? x + cw / 2 :
                    card.textAlign === 'right' ? x + cw - pad : x + pad;
      ctx.fillText(line, textX, textY);
      textY += (card.fontSize || 24) * 1.3;
    }
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Type badge (top-right)
    const badgeW2 = 20;
    const badgeH2 = 12;
    ctx.fillStyle = 'rgba(212,255,0,0.15)';
    ctx.strokeStyle = 'rgba(212,255,0,0.4)';
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(x + cw - badgeW2 - 4, y + 3, badgeW2, badgeH2, badgeH2 / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#D4FF00';
    ctx.font = `500 8px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', x + cw - badgeW2 / 2 - 4, y + 3 + badgeH2 / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    ctx.restore();

  } else if (card.type === 'composition') {
    // ===== Composition card content =====
    ctx.fillStyle = '#f5f0ff';
    ctx.fillRect(x, y, cw, CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT);

    // Mini shape thumbnails
    const eb = findEditBoxById(card.editBoxId);
    const shapes = eb ? (eb.shapes || []) : [];
    if (shapes.length > 0) {
      ctx.save();
      const miniScale = 0.3;
      ctx.translate(x + 8, y + 8);
      ctx.scale(miniScale, miniScale);
      for (const s of shapes.slice(0, 10)) {
        if (s.shapeType === 'rect') {
          ctx.fillStyle = s.fill || 'rgba(124,108,231,0.3)';
          ctx.strokeStyle = s.stroke || '#b3d900';
          ctx.lineWidth = 1;
          if (s.angle) { ctx.save(); const cx = s.left + s.width / 2; const cy = s.top + s.height / 2; ctx.translate(cx, cy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
          ctx.fillRect(s.left, s.top, s.width, s.height);
          ctx.strokeRect(s.left, s.top, s.width, s.height);
          if (s.angle) ctx.restore();
        } else if (s.shapeType === 'ellipse') {
          const ecx = s.left + s.width / 2, ecy = s.top + s.height / 2;
          if (s.angle) { ctx.save(); ctx.translate(ecx, ecy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-ecx, -ecy); }
          ctx.beginPath();
          ctx.ellipse(ecx, ecy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = s.fill || 'rgba(124,108,231,0.3)';
          ctx.strokeStyle = s.stroke || '#b3d900';
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          if (s.angle) ctx.restore();
        } else if (s.shapeType === 'line') {
          ctx.strokeStyle = s.stroke || '#b3d900';
          ctx.lineWidth = 1;
          const lcx = (s.x1 + s.x2) / 2, lcy = (s.y1 + s.y2) / 2;
          if (s.angle) { ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-lcx, -lcy); }
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          if (s.angle) ctx.restore();
        }
      }
      ctx.restore();
    } else {
      // Empty placeholder
      ctx.fillStyle = '#d5cce8';
      ctx.font = `11px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('空编辑盒', x + 12, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) / 2);
    }

    // "合成" badge
    const badgeWc = 30;
    const badgeHc = 14;
    ctx.fillStyle = 'rgba(124,108,231,0.15)';
    ctx.strokeStyle = 'rgba(124,108,231,0.4)';
    ctx.lineWidth = 1 / state.canvas.zoom;
    const badgeXc = x + cw - badgeWc - 6;
    const badgeYc = y + 4;
    ctx.beginPath();
    roundRectPath(badgeXc, badgeYc, badgeWc, badgeHc, badgeHc / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b3d900';
    ctx.font = `500 9px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('合成', badgeXc + badgeWc / 2, badgeYc + badgeHc / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Edit box reference
    ctx.fillStyle = '#9b8aef';
    ctx.font = `420 8px "Inter", system-ui, sans-serif`;
    ctx.fillText('→ 编辑盒: ' + (card.editBoxId || '').slice(0, 12), x + 8, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) - 4);

    // Duration badge
    const durBadge = formatTime((card.trimOut || card.totalDuration) - (card.trimIn || card.trimStart || 0));
    ctx.fillStyle = '#999';
    ctx.font = `420 9px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(durBadge, x + cw - 6, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) - 4);
    ctx.textAlign = 'start';

    // Label bar for composition
    const cLabelY = y + CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT;
    ctx.strokeStyle = '#ece8f0';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x + 4, cLabelY);
    ctx.lineTo(x + cw - 4, cLabelY);
    ctx.stroke();
    ctx.fillStyle = isSelected ? '#1a1a1a' : '#1a1a1a';
    ctx.font = `450 11px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(card.label || '合成', x + 6, cLabelY + CARD_LABEL_HEIGHT / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore(); // end clip

  } else if (card.type === 'synthesized-video') {
    // ===== Synthesized video card content =====
    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(x, y, cw, CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT);

    // Mini shape thumbnails from first edit box in chain
    const chain = card.editBoxChain || [];
    const firstEb = chain.length > 0 ? findEditBoxById(chain[0]) : null;
    const shapes = firstEb ? (firstEb.shapes || []) : [];
    if (shapes.length > 0) {
      ctx.save();
      const miniScale = 0.3;
      ctx.translate(x + 8, y + 8);
      ctx.scale(miniScale, miniScale);
      for (const s of shapes.slice(0, 10)) {
        if (s.shapeType === 'rect') {
          ctx.fillStyle = s.fill || 'rgba(255,152,0,0.3)';
          ctx.strokeStyle = s.stroke || '#ff9800';
          ctx.lineWidth = 1;
          if (s.angle) { ctx.save(); const cx = s.left + s.width / 2; const cy = s.top + s.height / 2; ctx.translate(cx, cy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
          ctx.fillRect(s.left, s.top, s.width, s.height);
          ctx.strokeRect(s.left, s.top, s.width, s.height);
          if (s.angle) ctx.restore();
        } else if (s.shapeType === 'ellipse') {
          const ecx = s.left + s.width / 2, ecy = s.top + s.height / 2;
          if (s.angle) { ctx.save(); ctx.translate(ecx, ecy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-ecx, -ecy); }
          ctx.beginPath();
          ctx.ellipse(ecx, ecy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
          ctx.fillStyle = s.fill || 'rgba(255,152,0,0.3)';
          ctx.strokeStyle = s.stroke || '#ff9800';
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          if (s.angle) ctx.restore();
        } else if (s.shapeType === 'line') {
          ctx.strokeStyle = s.stroke || '#ff9800';
          ctx.lineWidth = 1;
          const lcx = (s.x1 + s.x2) / 2, lcy = (s.y1 + s.y2) / 2;
          if (s.angle) { ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-lcx, -lcy); }
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          if (s.angle) ctx.restore();
        }
      }
      ctx.restore();
    } else {
      // Empty placeholder
      ctx.fillStyle = '#e8d5c0';
      ctx.font = `11px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('空编辑盒链', x + 12, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) / 2);
    }

    // "合成动画" badge
    const badgeWc = 44;
    const badgeHc = 14;
    ctx.fillStyle = colors.badgeFill;
    ctx.strokeStyle = colors.badgeStroke;
    ctx.lineWidth = 1 / state.canvas.zoom;
    const badgeXc = x + cw - badgeWc - 6;
    const badgeYc = y + 4;
    ctx.beginPath();
    roundRectPath(badgeXc, badgeYc, badgeWc, badgeHc, badgeHc / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.badgeText;
    ctx.font = `500 9px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('合成动画', badgeXc + badgeWc / 2, badgeYc + badgeHc / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Chain info
    ctx.fillStyle = '#cc8800';
    ctx.font = `420 8px "Inter", system-ui, sans-serif`;
    ctx.fillText('→ ' + chain.length + ' 编辑盒', x + 8, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) - 4);

    // Duration badge
    const durBadge = formatTime(card.totalDuration || 0);
    ctx.fillStyle = '#999';
    ctx.font = `420 9px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(durBadge, x + cw - 6, y + (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT) - 4);
    ctx.textAlign = 'start';

    // Label bar
    const cLabelY2 = y + CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT;
    ctx.strokeStyle = '#ece8f0';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x + 4, cLabelY2);
    ctx.lineTo(x + cw - 4, cLabelY2);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.font = `450 11px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(card.label || '合成动画', x + 6, cLabelY2 + CARD_LABEL_HEIGHT / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.restore(); // end clip

  } else {
    // ===== Video/BGM card content =====

  // --- Thumbnail strip (crop based on trim range) ---
  const thumbAreaH = CARD_THUMB_HEIGHT;

  // Recreate frameImage from dataURL if lost (e.g., after undo/redo)
  if (card.isFreezeFrame && card.frameImageDataURL && (!card.frameImage || !card.frameImage.src)) {
    card.frameImage = new Image();
    card.frameImage.src = card.frameImageDataURL;
  }

  if (card.isFreezeFrame && card.frameImage) {
    // Freeze frame: draw the captured frame image covering the thumb area
    try {
      ctx.drawImage(card.frameImage, x, y, cw, thumbAreaH);
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x, y, cw, thumbAreaH);
    }
  } else if (card.thumbStrip && card.duration > 0) {
    try {
      const stripW = card.thumbStrip.width;
      const fracIn = card.trimIn / card.duration;
      const fracOut = card.trimOut / card.duration;
      const srcX = stripW * fracIn;
      const srcW = stripW * (fracOut - fracIn);
      if (srcW > 0) {
        ctx.drawImage(card.thumbStrip, srcX, 0, srcW, card.thumbStrip.height, x, y, cw, thumbAreaH);
      } else {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(x, y, cw, thumbAreaH);
      }
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x, y, cw, thumbAreaH);
    }
  } else if (card.thumbStrip) {
    // fallback: still use cropped if possible, otherwise scale full strip
    try {
      ctx.drawImage(card.thumbStrip, x, y, cw, thumbAreaH);
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x, y, cw, thumbAreaH);
    }
  } else {
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(x, y, cw, thumbAreaH);
    ctx.fillStyle = '#999';
    ctx.font = `400 12px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('生成缩略图...', x + 12, y + thumbAreaH / 2);
  }

  // --- Waveform area ---
  const wfY = y + CARD_THUMB_HEIGHT;
  const wfH = CARD_WAVEFORM_HEIGHT;
  const wfPad = 3;

  // Waveform background
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(x, wfY, cw, wfH);

  // --- Volume slider (left side of waveform area, vertical) ---
  const volPad = 4;
  const volAreaX = x + volPad;
  const volTrackX = volAreaX + 5;
  const volTrackY = wfY + 5;
  const volTrackH = wfH - 10;
  const volCenterX = volTrackX;

  // Volume track (vertical line)
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(volCenterX, volTrackY);
  ctx.lineTo(volCenterX, volTrackY + volTrackH);
  ctx.stroke();

  // Volume fill (from bottom to knob)
  const knobY = volTrackY + (1 - card.volume) * volTrackH;
  if (card.volume > 0) {
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(volCenterX, knobY);
    ctx.lineTo(volCenterX, volTrackY + volTrackH);
    ctx.stroke();
  }

  // Volume knob (small circle)
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(volCenterX, knobY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Speaker icon above the track
  const iconY = volTrackY - 2;
  ctx.fillStyle = '#bbb';
  ctx.font = `8px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('♪', volCenterX, iconY);
  ctx.textAlign = 'start';

  // Volume percentage text (clickable for input)
  const volPctX = volAreaX + 14;
  const volPctY = wfY + wfH / 2;
  const pctText = Math.round(card.volume * 100) + '%';
  ctx.fillStyle = '#999';
  ctx.font = `450 9px "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(pctText, volPctX, volPctY);
  ctx.textBaseline = 'alphabetic';

  // Store volume text position for hit testing
  card._volPctBounds = {
    x: volPctX,
    y: volPctY - 7,
    w: ctx.measureText(pctText).width,
    h: 14
  };

  // Shift waveform bars right to make room for volume slider
  const wfContentPad = 22; // leave space for volume slider on left
  // Redraw waveform bars shifted right
  if (card.waveform && card.waveform.length > 0) {
    const peaks = card.waveform;
    const barCount = Math.min(peaks.length, Math.floor((cw - wfContentPad) / 2));
    const barW = (cw - wfContentPad - wfPad) / barCount;
    const maxBarH = wfH - wfPad * 4;
    const barCenterY = wfY + wfH / 2;
    const trimStart = card.trimIn / card.duration;
    const trimEnd = card.trimOut / card.duration;

    for (let i = 0; i < barCount; i++) {
      const idxFloat = (i / barCount) * (trimEnd - trimStart) + trimStart;
      const idx = Math.floor(idxFloat * peaks.length);
      const peak = peaks[Math.min(idx, peaks.length - 1)];
      const barH = Math.max(1, peak * maxBarH);

      ctx.fillStyle = (i % 2 === 0) ? '#d0d0d0' : '#c4c4c4';
      ctx.fillRect(
        x + wfContentPad + i * barW,
        barCenterY - barH / 2,
        Math.max(1, barW - 0.5),
        barH
      );
    }
  } else {
    // No waveform yet — subtle placeholder line
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x + 24, wfY + wfH / 2 - 1, cw - 28, 1);
  }

  // --- Markers (triangle flags on thumbnail/waveform area) ---
  if (card.markers && card.markers.length > 0 && card.duration > 0) {
    const trimDur = card.trimOut - card.trimIn;
    if (trimDur > 0) {
      for (const marker of card.markers) {
        const mx = x + cw * ((marker.time - card.trimIn) / trimDur);
        if (mx < x + 2 || mx > x + cw - 2) continue; // off-screen
        const flagY = y + CARD_THUMB_HEIGHT;
        const flagH = 10;
        ctx.fillStyle = marker.color;
        ctx.beginPath();
        ctx.moveTo(mx, flagY);
        ctx.lineTo(mx - 5, flagY - flagH);
        ctx.lineTo(mx + 5, flagY - flagH);
        ctx.closePath();
        ctx.fill();
        // Small dot at tip
        ctx.beginPath();
        ctx.arc(mx, flagY, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // --- Label bar ---
  const labelY = wfY + wfH;
  ctx.strokeStyle = '#f1f1f1';
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x + 4, labelY);
  ctx.lineTo(x + cw - 4, labelY);
  ctx.stroke();

  ctx.fillStyle = isSelected ? '#1a1a1a' : '#1a1a1a';
  ctx.font = `${isSelected ? '550' : '450'} 11px "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const labelTextX = x + 6;
  const labelTextY = labelY + CARD_LABEL_HEIGHT / 2;
  const maxLabelW = cw - 12 - (cw > 140 ? 50 : 0); // leave room for duration

  let label = card.label;
  while (ctx.measureText(label).width > maxLabelW && label.length > 3) {
    label = label.slice(0, -4) + '...';
  }
  ctx.fillText(label, labelTextX, labelTextY);

  // Duration badge (right-aligned in label)
  if (cw > 140 && card.duration > 0) {
    const dur = card.trimOut - card.trimIn;
    const durStr = formatTime(dur) + ' / ' + formatTime(card.duration);
    ctx.fillStyle = '#999';
    ctx.font = `400 10px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(durStr, x + cw - 6, labelTextY);
    ctx.textAlign = 'start';
  }

  ctx.restore();
  } // end video card content

  // --- Trim handles (only for video/audio, outside clip) ---
  if (showHandles && (card.type === 'video' || card.type === 'audio' || card.type === 'bgm' || card.type === 'composition')) {
    const handleW = 6 / state.canvas.zoom;
    const handleAlpha = isHovered && !isSelected ? 0.6 : 1;

    // Left trim handle
    ctx.fillStyle = colors.handleColor(handleAlpha);
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.lineTo(x + handleW, y + r - 3 / state.canvas.zoom);
    ctx.lineTo(x + handleW, y + r + 3 / state.canvas.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x, y + r, handleW, ch - r * 2);

    // Right trim handle
    ctx.beginPath();
    ctx.moveTo(x + cw, y + r);
    ctx.lineTo(x + cw - handleW, y + r - 3 / state.canvas.zoom);
    ctx.lineTo(x + cw - handleW, y + r + 3 / state.canvas.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + cw - handleW, y + r, handleW, ch - r * 2);
  }

  // Anchor points (left + right) — for video cards
  if (card.type === 'video') {
  const anchorR = ANCHOR_RADIUS / state.canvas.zoom;
  const ha = state.hoveredAnchor;
  const isConnSource = state.interaction.mode === 'connecting' &&
  state.interaction.connectingFrom &&
  state.interaction.connectingFrom.cardId === card.id;

  for (const side of ['left', 'right']) {
  const isHoveredAnchor = ha && ha.cardId === card.id && ha.side === side;
  const anchor = getAnchorPos(card, side);
  const r = isHoveredAnchor ? anchorR * 1.4 : anchorR;

  // Outer glow
  if (isHoveredAnchor || (isConnSource && state.interaction.connectingFrom.side === side)) {
  ctx.fillStyle = card.accentColor
    ? `rgba(${card.accentColor.r},${card.accentColor.g},${card.accentColor.b},0.25)`
    : 'rgba(212,255,0,0.25)';
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, r + 4 / state.canvas.zoom, 0, Math.PI * 2);
  ctx.fill();
  }

  // Inner dot
  ctx.fillStyle = isHoveredAnchor ? colors.border : '#ffffff';
  ctx.strokeStyle = isHoveredAnchor ? colors.border : '#aaaaaa';
  ctx.lineWidth = 1.5 / state.canvas.zoom;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Connecting-from indicator arrow
  if (isConnSource && state.interaction.connectingFrom.side === side) {
  ctx.fillStyle = colors.border;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();
  // Arrow hint
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 10px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(side === 'left' ? '←' : '→', anchor.x, anchor.y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  }
  }

  // Top anchor — diamond shape that follows the playhead.
  // Only shown during playback (linear or group), not when a card is merely selected/hovered.
  const keyframeConnsFrom = state.connections.filter(c => c.type === 'keyframe' && c.fromCardId === card.id);
  const isConnectingMode = state.interaction.mode === 'connecting';
  const pb = state.playback;

  // Determine whether playback is active on this specific card
  const isPlaybackOnCard = pb && (pb.isPlaying || pb.pausedAt > 0) && (
  // Linear mode: playhead is on this card
  pb.currentCardId === card.id ||
  // Group mode: card is in the playing group and playhead is over it
  (pb.playbackMode === 'group' && pb._groupPlaybackGroup &&
  pb._groupPlaybackGroup.cardIds.includes(card.id) &&
  pb._groupPlayheadX != null &&
  pb._groupPlayheadX >= card.x && pb._groupPlayheadX < card.x + getCardWidth(card))
  );

  // Determine default fromPosition: follow playhead if on this card, else center
  let defaultFromPos = 0.5;
  if (isPlaybackOnCard) {
  if (pb.playbackMode === 'group' && pb._groupPlayheadX != null) {
  const cw2 = getCardWidth(card);
  defaultFromPos = cw2 > 0 ? (pb._groupPlayheadX - card.x) / cw2 : 0.5;
  } else {
  defaultFromPos = pb.cardProgress;
  }
  }

  // Build list of top anchor positions
  const topAnchors = [];
  const hasDefaultTop = !keyframeConnsFrom.some(c => Math.abs((c.fromPosition || 0) - defaultFromPos) < 0.03);
  if (hasDefaultTop) {
  topAnchors.push({ connData: { fromPosition: defaultFromPos }, kfConnId: null, isDefault: true });
  }
  for (const kfConn of keyframeConnsFrom) {
  topAnchors.push({ connData: kfConn, kfConnId: kfConn.id, isDefault: false });
  }

  for (const ta of topAnchors) {
  const anchor = getAnchorPos(card, 'top', ta.connData);
  const isHoveredAnchor = ha && ha.cardId === card.id && ha.side === 'top' &&
  (ta.isDefault ? (ha._kfConnId == null) : (ha._kfConnId === ta.kfConnId));

  // Permanent existing keyframe anchors are always visible (smaller, subtle)
  const isPermanent = !ta.isDefault;
  const isConnSel = isPermanent && (
  state.selection.connectionId === ta.kfConnId ||
  state.selection.connectionIds.includes(ta.kfConnId)
  );
  const showAnchor = isHoveredAnchor || isConnectingMode || isConnSel ||
  (ta.isDefault && isPlaybackOnCard) || isPermanent;

  if (!showAnchor) continue;

  // Size: smaller for permanent non-hovered, full size for hovered/selected
  const r = isHoveredAnchor ? anchorR * 1.4 : (isPermanent && !isConnSel ? anchorR * 0.5 : anchorR);
  const hw = r * 1.3;  // diamond half-width (slightly wider than tall)

  // Outer glow (diamond) — only for hovered
  if (isHoveredAnchor) {
  ctx.fillStyle = 'rgba(255,152,0,0.25)';
  ctx.beginPath();
  const gr = hw + 4 / state.canvas.zoom;
  ctx.moveTo(anchor.x, anchor.y - gr);
  ctx.lineTo(anchor.x + gr, anchor.y);
  ctx.lineTo(anchor.x, anchor.y + gr);
  ctx.lineTo(anchor.x - gr, anchor.y);
  ctx.closePath();
  ctx.fill();
  }

  // Diamond shape — orange for keyframe, subtle when permanent non-interactive
  const isHighlighted = isHoveredAnchor || isConnSel;
  ctx.fillStyle = isHighlighted ? '#ff9800' : 'rgba(255,152,0,0.35)';
  ctx.strokeStyle = isHighlighted ? '#ff9800' : 'rgba(255,152,0,0.5)';
  ctx.lineWidth = (isHighlighted ? 1.5 : 1) / state.canvas.zoom;
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y - hw);
  ctx.lineTo(anchor.x + hw, anchor.y);
  ctx.lineTo(anchor.x, anchor.y + hw);
  ctx.lineTo(anchor.x - hw, anchor.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hover preview: show a frame thumbnail when hovering on an existing keyframe anchor
  if (isHoveredAnchor && isPermanent) {
  const fromPos = ta.connData.fromPosition || 0;
  const THUMB_FRAME_W = 120;  // each frame in thumbStrip is 120px wide
  const THUMB_FRAME_H = 68;   // CARD_THUMB_HEIGHT
  const thumbW = 72 / state.canvas.zoom;
  const thumbH = Math.round(thumbW * (THUMB_FRAME_H / THUMB_FRAME_W));
  const thumbX = anchor.x - thumbW / 2;
  const thumbY = anchor.y - hw - thumbH - 8 / state.canvas.zoom;

  // Dashed line from thumbnail bottom to diamond top
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 1 / state.canvas.zoom;
  ctx.setLineDash([3 / state.canvas.zoom, 2 / state.canvas.zoom]);
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y - hw);
  ctx.lineTo(anchor.x, thumbY + thumbH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Thumbnail box
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = '#ff9800';
  ctx.lineWidth = 1 / state.canvas.zoom;
  roundRect(thumbX, thumbY, thumbW, thumbH, 3 / state.canvas.zoom);
  ctx.fill();
  ctx.stroke();

  // Draw frame from thumbStrip if available
  if (card.thumbStrip && card.thumbStrip.width > 0) {
  const stripDur = card.totalDuration || card.duration;
  if (stripDur > 0) {
  const frameW = THUMB_FRAME_W;
  const frameCount = Math.max(1, Math.floor(card.thumbStrip.width / frameW));
  const frameTime = card.trimIn + fromPos * ((card.trimOut - card.trimIn) || card.duration);
  const frameIdx = Math.min(frameCount - 1, Math.max(0, Math.floor((frameTime / stripDur) * frameCount)));
  const srcX = frameIdx * frameW;
  ctx.save();
  ctx.beginPath();
  roundRectPath(thumbX, thumbY, thumbW, thumbH, 3 / state.canvas.zoom);
  ctx.clip();
  try {
  ctx.drawImage(card.thumbStrip, srcX, 0, frameW, card.thumbStrip.height, thumbX, thumbY, thumbW, thumbH);
  } catch (e) {
  // Ignore if image source is detached
  }
  ctx.restore();
  }
  }

  }

  // Connecting-from indicator (larger filled diamond)
  if (isConnSource && state.interaction.connectingFrom.side === 'top' &&
  state.interaction.connectingFrom.cardId === card.id) {
  ctx.fillStyle = '#ff9800';
  const cr = hw * 1.4;
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y - cr);
  ctx.lineTo(anchor.x + cr, anchor.y);
  ctx.lineTo(anchor.x, anchor.y + cr);
  ctx.lineTo(anchor.x - cr, anchor.y);
  ctx.closePath();
  ctx.fill();
  // Up arrow inside
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 10px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('↑', anchor.x, anchor.y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  }
  }
  } // end video guard
}

function formatTime(sec) {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function getAnchorPos(card, side, opts) {
  const cw = getCardWidth(card);
  const offset = 10 / state.canvas.zoom; // 10 world px outside card edge
  if (side === 'top') {
    // Accept { fromPosition: N } or a plain number N
    let pos = 0;
    if (typeof opts === 'number') {
      pos = opts;
    } else if (opts && opts.fromPosition != null) {
      pos = opts.fromPosition;
    }
    return { x: card.x + cw * pos, y: card.y - offset };
  }
  return {
    x: side === 'left' ? card.x - offset : card.x + cw + offset,
    y: card.y + CARD_HEIGHT / 2
  };
}

function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return {
    x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
    y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y
  };
}

function getConnectionBezier(conn) {
  let fromCard = state.cards.find(c => c.id === conn.fromCardId);
  let toCard = state.cards.find(c => c.id === conn.toCardId);
  let p0, p3;

  // If fromCardId references a marker card, use its position
  if (!fromCard) {
    const fromMarker = state.markerCards.find(m => m.id === conn.fromCardId);
    if (fromMarker) {
      const parent = state.cards.find(c => c.id === fromMarker.parentCardId);
      if (parent) {
        const cardY = parent.y;
        const thumbW = 80 / state.canvas.zoom;
        const thumbH = Math.round(thumbW * (CARD_HEIGHT / getCardWidth(parent)));
        const anchorY = cardY - thumbH - 12 / state.canvas.zoom;
        p0 = { x: fromMarker.x, y: anchorY };
      }
    }
  }
  if (fromCard && !p0) p0 = getAnchorPos(fromCard, conn.fromSide, conn);

  // If toCardId references a marker card, use its position
  if (!toCard) {
    const toMarker = state.markerCards.find(m => m.id === conn.toCardId);
    if (toMarker) {
      const parent = state.cards.find(c => c.id === toMarker.parentCardId);
      if (parent) {
        const cardY = parent.y;
        const thumbW = 80 / state.canvas.zoom;
        const thumbH = Math.round(thumbW * (CARD_HEIGHT / getCardWidth(parent)));
        const anchorY = cardY - thumbH - 12 / state.canvas.zoom;
        p3 = { x: toMarker.x, y: anchorY };
      }
    }
  }
  if (toCard && !p3) {
    // For top-side connections, toCard anchor is fixed at left edge (position 0),
    // or uses conn.toPosition if explicitly set. fromPosition only applies to the from card.
    const toPos = conn.toSide === 'top' ? (conn.toPosition != null ? conn.toPosition : 0) : conn;
    p3 = getAnchorPos(toCard, conn.toSide, toPos);
  }

  if (!p0 || !p3) return null;

  // Keyframe / top-side connections: vertical bezier (control points go upward)
  if (conn.fromSide === 'top' || conn.toSide === 'top') {
    const offY = Math.max(BEZIER_OFFSET, Math.abs(p3.y - p0.y) * 0.35);
    const minY = Math.min(p0.y, p3.y);
    const p1 = { x: p0.x, y: minY - offY };
    const p2 = { x: p3.x, y: minY - offY };
    return { p0, p1, p2, p3 };
  }

  const offX = Math.max(BEZIER_OFFSET, Math.abs(p3.x - p0.x) * 0.35);
  const p1 = { x: p0.x + offX, y: p0.y };
  const p2 = { x: p3.x - offX, y: p3.y };
  return { p0, p1, p2, p3 };
}

const TRANSITION_LABELS = { cut: '切', dissolve: '叠', fade: '黑' };
const TRANSITION_CYCLE = ['cut', 'dissolve', 'fade'];

// ================================================================
// Rendering: Groups
// ================================================================
function getGroupFrame(group) {
  if (group.collapsed || group.sizingMode === 'fixed') {
    return { x: group.x, y: group.y, w: group.width || 200, h: group.height || 60, titleH: (group.collapsed ? group.height : 22) };
  }
  const memberCards = group.cardIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean);
  if (memberCards.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of memberCards) {
    const cw = getCardWidth(c);
    const ch = (c.type === 'text') ? (c.height || 40) : CARD_HEIGHT;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + cw > maxX) maxX = c.x + cw;
    if (c.y + ch > maxY) maxY = c.y + ch;
  }
  const pad = 20;
  return {
    x: minX - pad,
    y: minY - pad - 22,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2 + 22,
    titleH: 22
  };
}

function renderMarkerCard(marker) {
  const parentCard = state.cards.find(c => c.id === marker.parentCardId);
  if (!parentCard) return;

  const x = marker.x;
  const cardY = parentCard.y;
  const cardH = CARD_HEIGHT;

  const isHovered = state.hoveredAnchor && state.hoveredAnchor.cardId === marker.id;
  const isSelected = state.selection.markerCardId === marker.id || state.selection.markerCardIds.includes(marker.id);
  const highlight = isHovered || isSelected;

  // Thumbnail dimensions (screen-consistent via zoom scaling)
  const thumbW = 80 / state.canvas.zoom;
  const thumbH = Math.round(thumbW * (cardH / getCardWidth(parentCard)));
  const thumbX = x - thumbW / 2;
  const thumbY = cardY - thumbH - 12 / state.canvas.zoom;

  // Dashed line from thumbnail bottom to card top
  ctx.strokeStyle = highlight ? '#ff6600' : '#ff9800';
  ctx.lineWidth = highlight ? (1.5 / state.canvas.zoom) : (1 / state.canvas.zoom);
  ctx.setLineDash([4 / state.canvas.zoom, 3 / state.canvas.zoom]);
  ctx.beginPath();
  ctx.moveTo(x, thumbY + thumbH);
  ctx.lineTo(x, cardY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Thumbnail background + border
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = highlight ? '#ff6600' : '#444';
  ctx.lineWidth = highlight ? (2 / state.canvas.zoom) : (1 / state.canvas.zoom);
  roundRect(thumbX, thumbY, thumbW, thumbH, 3 / state.canvas.zoom);
  ctx.fill();
  ctx.stroke();

  // Draw frame image if available
  if (marker.frameImage) {
    ctx.save();
    // Clip to rounded rect
    ctx.beginPath();
    roundRectPath(thumbX, thumbY, thumbW, thumbH, 3 / state.canvas.zoom);
    ctx.clip();
    try {
      ctx.drawImage(marker.frameImage, thumbX, thumbY, thumbW, thumbH);
    } catch (e) {
      // Ignore if canvas source is detached
    }
    ctx.restore();
  }

  // Diamond anchor at thumbnail top
  const dSize = 6 / state.canvas.zoom;
  const anchorY = thumbY;
  ctx.fillStyle = highlight ? '#ff6600' : '#ff9800';
  ctx.strokeStyle = highlight ? '#ff6600' : '#ff9800';
  ctx.lineWidth = 1.2 / state.canvas.zoom;
  ctx.beginPath();
  ctx.moveTo(x, anchorY - dSize);
  ctx.lineTo(x + dSize, anchorY);
  ctx.lineTo(x, anchorY + dSize);
  ctx.lineTo(x - dSize, anchorY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Highlight glow
  if (highlight) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,152,0,0.4)';
    ctx.shadowBlur = 8 / state.canvas.zoom;
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1.5 / state.canvas.zoom;
    ctx.setLineDash([4 / state.canvas.zoom, 3 / state.canvas.zoom]);
    ctx.beginPath();
    ctx.moveTo(x, thumbY + thumbH);
    ctx.lineTo(x, cardY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Store thumbnail bounds for hit testing
  marker._thumbBounds = { x: thumbX, y: thumbY, w: thumbW, h: thumbH, anchorY: anchorY };
}

function isCardInGroup(cardId) {
  return state.groups.some(g => g.cardIds.includes(cardId));
}

function renderGroup(group) {
  const isHovered = state.hoveredGroupId === group.id;
  const isSelected = state.selection.groupIds.includes(group.id);
  const isDropTarget = state.interaction.dropTargetGroupId === group.id;
  // Drill-down: group is selected but user has clicked into individual cards
  const hasCardSelected = state.selection.cardIds.some(cid => group.cardIds.includes(cid));
  const isDrillDown = isSelected && hasCardSelected;
  const purple = '101,84,203'; // #6554CB
  const titleFontSize = Math.max(10, 12 / state.canvas.zoom);
  if (group.collapsed) {
    const gx = group.x;
    const gy = group.y;
    const gw = group.width || 200;
    const gh = group.height || 60;
    const titleH = 18 / state.canvas.zoom;

    // Rect — no rounded corners, below title
    const rx = gx, ry = gy + titleH, rw = gw, rh = gh - titleH;

    // Title — outside, above the rect (bottom-left anchor)
    ctx.fillStyle = `#6554CB`;
    ctx.font = `bold ${titleFontSize}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(group.name || 'Group', gx, ry);
    const gAlpha = isDropTarget ? 0.08 : (isDrillDown ? 0 : (isSelected ? 0.08 : (isHovered ? 0.04 : 0)));
    const gStrokeAlpha = isDropTarget ? 0.9 : (isDrillDown ? 0.2 : (isSelected ? 0.9 : (isHovered ? 0.6 : 0.35)));
    ctx.fillStyle = `rgba(${purple},${gAlpha})`;
    ctx.strokeStyle = `rgba(${purple},${gStrokeAlpha})`;
    ctx.lineWidth = (isSelected || isDropTarget ? 1.5 : 1) / state.canvas.zoom;
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    if (gAlpha > 0) ctx.fill();
    ctx.stroke();

    const memberCards = group.cardIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean);
    const totalDur = memberCards.reduce((s, c) => s + (c.trimOut - c.trimIn), 0);
    ctx.fillStyle = `rgba(${purple},0.5)`;
    ctx.font = `${Math.max(8, Math.min(14, 10 / state.canvas.zoom))}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${memberCards.length}段 · ${Math.round(totalDur)}秒`, rx + 10, ry + rh / 2);
  } else {
    const frame = getGroupFrame(group);
    if (!frame) return;
    const frameX = frame.x, frameY = frame.y, frameW = frame.w, frameH = frame.h;
    const titleH = frame.titleH || 22;

    // Rect — no rounded corners, cards area only
    const rx = frameX, ry = frameY + titleH, rw = frameW, rh = frameH - titleH;

    // Title — outside, above the rect (bottom-left anchor)
    ctx.fillStyle = `#6554CB`;
    ctx.font = `bold ${titleFontSize}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(group.name || 'Group', frameX, ry);
    const gAlpha2 = isDropTarget ? 0.06 : (isDrillDown ? 0 : (isSelected ? 0.06 : (isHovered ? 0.03 : 0)));
    const gStrokeAlpha2 = isDropTarget ? 0.85 : (isDrillDown ? 0.18 : (isSelected ? 0.85 : (isHovered ? 0.55 : 0.3)));
    ctx.fillStyle = `rgba(${purple},${gAlpha2})`;
    ctx.strokeStyle = `rgba(${purple},${gStrokeAlpha2})`;
    ctx.lineWidth = (isSelected || isDropTarget ? 1.5 : 1) / state.canvas.zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.rect(rx, ry, rw, rh);
    if (gAlpha2 > 0) ctx.fill();
    ctx.stroke();
  }

  // Resize handles for fixed-mode non-collapsed groups
  if (isSelected && !group.collapsed && group.sizingMode === 'fixed') {
    const frame = getGroupFrame(group);
    if (frame) {
      const hw = 6 / state.canvas.zoom; // half-size of handle square
      const handles = [
        { name: 'nw', x: frame.x, y: frame.y },
        { name: 'n',  x: frame.x + frame.w / 2, y: frame.y },
        { name: 'ne', x: frame.x + frame.w, y: frame.y },
        { name: 'e',  x: frame.x + frame.w, y: frame.y + frame.h / 2 },
        { name: 'se', x: frame.x + frame.w, y: frame.y + frame.h },
        { name: 's',  x: frame.x + frame.w / 2, y: frame.y + frame.h },
        { name: 'sw', x: frame.x, y: frame.y + frame.h },
        { name: 'w',  x: frame.x, y: frame.y + frame.h / 2 },
      ];
      for (const h of handles) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#6554CB';
        ctx.lineWidth = 1.5 / state.canvas.zoom;
        ctx.fillRect(h.x - hw, h.y - hw, hw * 2, hw * 2);
        ctx.strokeRect(h.x - hw, h.y - hw, hw * 2, hw * 2);
      }
    }
  }
}

// ================================================================
// Rendering: Edit box keyframe timeline
// ================================================================
const EB_TIMELINE_GAP = 30; // px gap below edit boxes

function renderEditBoxTimelines() {
  const z = state.canvas.zoom;
  const visited = new Set();

  for (const eb of state.editBoxes) {
    if (visited.has(eb.id)) continue;
    const chain = buildEditBoxChain(eb.id);
    if (chain.length < 2) continue;
    for (const id of chain) visited.add(id);

    // Compute timeline Y: below the lowest edit box
    let maxBot = 0;
    for (const id of chain) {
      const e = findEditBoxById(id);
      if (e) maxBot = Math.max(maxBot, e.y + e.height);
    }
    const tlY = maxBot + EB_TIMELINE_GAP / z;

    // Timeline X range
    const firstEb = findEditBoxById(chain[0]);
    const lastEb = findEditBoxById(chain[chain.length - 1]);
    if (!firstEb || !lastEb) continue;
    const tlStart = firstEb.x + firstEb.width / 2;
    const tlEnd = lastEb.x + lastEb.width / 2;

    // Horizontal line
    ctx.strokeStyle = 'rgba(255,152,0,0.35)';
    ctx.lineWidth = 2 / z;
    ctx.beginPath();
    ctx.moveTo(tlStart, tlY);
    ctx.lineTo(tlEnd, tlY);
    ctx.stroke();

    // Dots for each edit box
    for (let i = 0; i < chain.length; i++) {
      const e = findEditBoxById(chain[i]);
      if (!e) continue;
      const dotX = e.x + e.width / 2;
      const dotR = 5 / z;

      // Dot fill
      ctx.fillStyle = '#ff9800';
      ctx.beginPath();
      ctx.arc(dotX, tlY, dotR, 0, Math.PI * 2);
      ctx.fill();

      // Selected/highlighted chain dot
      if (chain[i] === state.selection.editBoxId) {
        ctx.strokeStyle = '#ff9800';
        ctx.lineWidth = 2 / z;
        ctx.beginPath();
        ctx.arc(dotX, tlY, dotR + 3 / z, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Store timeline bounds for hit testing
    state._ebTimelines = state._ebTimelines || {};
    state._ebTimelines[chain[0]] = { x: tlStart, y: tlY - 8 / z, w: tlEnd - tlStart, h: 16 / z, chain: chain, dots: chain.map(id => { const e = findEditBoxById(id); return { editBoxId: id, x: e ? e.x + e.width / 2 : 0, y: tlY, r: 8 / z }; }) };
  }
}

// ================================================================
// Rendering: Connections (bezier curves + badges)
// ================================================================
function renderConnection(conn) {
  const isHovered = state.hoveredConnectionId === conn.id;
  const isSelected = state.selection.connectionId === conn.id || state.selection.connectionIds.includes(conn.id);
  const highlight = isHovered || isSelected;
  const isTween = conn.type === 'tween';
  const isKeyframe = conn.type === 'keyframe';
  const isEbKeyframe = conn.type === 'eb-keyframe';

  // EditBox keyframe connections are now rendered as timelines below edit boxes
  if (isEbKeyframe) return;

  // Card-based connections: compute bezier from card anchors
  const bz = getConnectionBezier(conn);
  if (!bz) return;
  const { p0, p1, p2, p3 } = bz;

  // Keyframe connection: orange dashed, vertical bezier, no arrow
  if (isKeyframe) {
    const lw = highlight ? (2.5 / state.canvas.zoom) : (1.5 / state.canvas.zoom);
    ctx.strokeStyle = highlight ? '#e65100' : '#ff9800';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.setLineDash([8 / state.canvas.zoom, 5 / state.canvas.zoom]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Midpoint badge — world-space sizing (scales with zoom like cards)
    const mid = bezierPoint(0.5, p0, p1, p2, p3);
    const badgeW = 44;
    const badgeH = 18;
    const badgeR = 9;
    const labelFontSize = 11;

    ctx.fillStyle = highlight ? '#e65100' : '#ffffff';
    ctx.strokeStyle = highlight ? '#e65100' : '#ffcc80';
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = highlight ? '#ffffff' : '#e65100';
    ctx.font = `${isHovered ? '550' : '450'} ${labelFontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('关键帧', mid.x, mid.y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Store badge bounds
    conn._badgeBounds = { x: mid.x - badgeW / 2, y: mid.y - badgeH / 2, w: badgeW, h: badgeH };

    // Delete button when hovered
    if (isHovered) {
      const delR = 7;
      const delX = mid.x + badgeW / 2 + 8;
      const delY = mid.y;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e04040';
      ctx.lineWidth = 1.2 / state.canvas.zoom;
      ctx.beginPath();
      ctx.arc(delX, delY, delR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#e04040';
      ctx.lineWidth = 1.2 / state.canvas.zoom;
      const xPad = 2.2;
      ctx.beginPath();
      ctx.moveTo(delX - xPad, delY - xPad);
      ctx.lineTo(delX + xPad, delY + xPad);
      ctx.moveTo(delX + xPad, delY - xPad);
      ctx.lineTo(delX - xPad, delY + xPad);
      ctx.stroke();
      conn._delBounds = { x: delX - delR, y: delY - delR, w: delR * 2, h: delR * 2 };
    } else {
      conn._delBounds = null;
    }
    return;
  }

  // Tween connection: blue dashed, no arrow
  if (isTween) {
    const lw = highlight ? (2.5 / state.canvas.zoom) : (1.5 / state.canvas.zoom);
    ctx.strokeStyle = highlight ? '#b3d900' : '#D4FF00';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.setLineDash([8 / state.canvas.zoom, 5 / state.canvas.zoom]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Midpoint badge — world-space sizing (scales with zoom like cards)
    const mid = bezierPoint(0.5, p0, p1, p2, p3);
    const badgeW = 38;
    const badgeH = 18;
    const badgeR = 9;
    const labelFontSize = 11;

    ctx.fillStyle = highlight ? '#b3d900' : '#ffffff';
    ctx.strokeStyle = highlight ? '#b3d900' : '#e6ff80';
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = highlight ? '#ffffff' : '#b3d900';
    ctx.font = `${isHovered ? '550' : '450'} ${labelFontSize}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('补间', mid.x, mid.y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Store badge bounds
    conn._badgeBounds = { x: mid.x - badgeW / 2, y: mid.y - badgeH / 2, w: badgeW, h: badgeH };

    // Delete button when hovered
    if (isHovered) {
      const delR = 7;
      const delX = mid.x + badgeW / 2 + 8;
      const delY = mid.y;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e04040';
      ctx.lineWidth = 1.2 / state.canvas.zoom;
      ctx.beginPath();
      ctx.arc(delX, delY, delR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#e04040';
      ctx.lineWidth = 1.2 / state.canvas.zoom;
      const xPad = 2.2;
      ctx.beginPath();
      ctx.moveTo(delX - xPad, delY - xPad);
      ctx.lineTo(delX + xPad, delY + xPad);
      ctx.moveTo(delX + xPad, delY - xPad);
      ctx.lineTo(delX - xPad, delY + xPad);
      ctx.stroke();
      conn._delBounds = { x: delX - delR, y: delY - delR, w: delR * 2, h: delR * 2 };
    } else {
      conn._delBounds = null;
    }
    return;
  }

  const lw = highlight ? (2.5 / state.canvas.zoom) : (1.5 / state.canvas.zoom);

  // Arrowhead at p3 (target) — compute base first (bezier ends at base, not tip)
  const ax = p3.x - p2.x;
  const ay = p3.y - p2.y;
  const alen = Math.sqrt(ax * ax + ay * ay);
  let tipX = p3.x, tipY = p3.y, baseX = p3.x, baseY = p3.y;
  let perpX = 0, perpY = 0;
  if (alen > 0.01) {
    const anx = ax / alen;
    const any = ay / alen;
    const arrowLen = 12 / state.canvas.zoom;
    const arrowW = 5 / state.canvas.zoom;
    tipX = p3.x;
    tipY = p3.y;
    baseX = tipX - anx * arrowLen;
    baseY = tipY - any * arrowLen;
    perpX = -any * arrowW;
    perpY = anx * arrowW;
  }

  // Bezier curve (ends at arrow base, not tip)
  ctx.strokeStyle = highlight ? '#D4FF00' : '#666666';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, baseX, baseY);
  ctx.stroke();

  // Arrowhead triangle (from tip back to base)
  if (alen > 0.01) {
    ctx.fillStyle = highlight ? '#D4FF00' : '#666666';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX, baseY + perpY);
    ctx.lineTo(baseX - perpX, baseY - perpY);
    ctx.closePath();
    ctx.fill();
  }

  // Hit-test path (wider invisible curve for easier clicking)
  if (isHovered) {
    conn._hitPath = { p0, p1, p2, p3 };
  }

  // Midpoint for badge
  const mid = bezierPoint(0.5, p0, p1, p2, p3);
  const badgeW = 28 / state.canvas.zoom;
  const badgeH = 18 / state.canvas.zoom;
  const badgeR = 9 / state.canvas.zoom;

  // Badge background
  ctx.fillStyle = highlight ? '#D4FF00' : '#ffffff';
  ctx.strokeStyle = highlight ? '#D4FF00' : '#bbbbbb';
  ctx.lineWidth = 1.2 / state.canvas.zoom;
  ctx.beginPath();
  roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
  ctx.fill();
  ctx.stroke();

  // Badge text
  const label = TRANSITION_LABELS[conn.transition] || '切';
  ctx.fillStyle = highlight ? '#ffffff' : '#333333';
  ctx.font = `${isHovered ? '550' : '450'} 11px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, mid.x, mid.y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  // Store badge bounds for hit testing
  conn._badgeBounds = {
    x: mid.x - badgeW / 2,
    y: mid.y - badgeH / 2,
    w: badgeW,
    h: badgeH
  };

  // Delete button (visible when hovered)
  if (isHovered) {
    const delR = 7 / state.canvas.zoom;
    const delX = mid.x + badgeW / 2 + 8 / state.canvas.zoom;
    const delY = mid.y;

    // Outer circle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#e04040';
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    ctx.beginPath();
    ctx.arc(delX, delY, delR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // X mark
    ctx.strokeStyle = '#e04040';
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    const xPad = 2.2 / state.canvas.zoom;
    ctx.beginPath();
    ctx.moveTo(delX - xPad, delY - xPad);
    ctx.lineTo(delX + xPad, delY + xPad);
    ctx.moveTo(delX + xPad, delY - xPad);
    ctx.lineTo(delX - xPad, delY + xPad);
    ctx.stroke();

    conn._delBounds = {
      x: delX - delR,
      y: delY - delR,
      w: delR * 2,
      h: delR * 2
    };
  } else {
    conn._delBounds = null;
  }
}

function renderConnectionPreview() {
  if (state.interaction.mode !== 'connecting' || !state.interaction.connectingFrom) return;

  const cf = state.interaction.connectingFrom;
  const isTween = state.interaction._isTweenConnection;
  let p0;

  // Get source position — from card or marker card
  if (cf.cardId) {
    const card = state.cards.find(c => c.id === cf.cardId);
    if (!card) return;
    // For top anchors, pass a connection-like object so getAnchorPos uses the correct fromPosition
    let connForAnchor = undefined;
    if (cf.side === 'top') {
      if (cf._kfConnId && cf.fromPosition != null) {
        // Editing existing keyframe: use the dragged position for preview
        connForAnchor = { fromPosition: cf.fromPosition };
      } else if (cf._kfConnId) {
        connForAnchor = state.connections.find(c => c.id === cf._kfConnId);
      } else if (cf.fromPosition != null) {
        connForAnchor = { fromPosition: cf.fromPosition };
      }
    }
    p0 = getAnchorPos(card, cf.side, connForAnchor);
  } else if (cf._isEditBoxAnchor && cf.editBoxId) {
    const eb = findEditBoxById(cf.editBoxId);
    if (!eb) return;
    p0 = { x: eb.x + eb.width / 2, y: eb.y + eb.height + 10 / state.canvas.zoom };
  } else if (cf.markerCardId) {
    const marker = state.markerCards.find(m => m.id === cf.markerCardId);
    if (!marker) return;
    const parent = state.cards.find(c => c.id === marker.parentCardId);
    if (parent) {
      const cardY = parent.y;
      const thumbW = 80 / state.canvas.zoom;
      const thumbH = Math.round(thumbW * (CARD_HEIGHT / getCardWidth(parent)));
      const anchorY = cardY - thumbH - 12 / state.canvas.zoom;
      p0 = { x: marker.x, y: anchorY };
    }
  }
  if (!p0) return;

  const p3 = state.interaction._connectSnapPos || state.interaction.mouseWorldPos;

  const isTopSide = cf.side === 'top';
  const isTweenPreview = state.interaction._isTweenConnection;

  let p1, p2;
  if (isTopSide) {
    // Vertical bezier for top connections
    const offY = Math.max(BEZIER_OFFSET, Math.abs(p3.y - p0.y) * 0.35);
    const minY = Math.min(p0.y, p3.y);
    p1 = { x: p0.x, y: minY - offY };
    p2 = { x: p3.x, y: minY - offY };
  } else {
    const offX = Math.max(BEZIER_OFFSET, Math.abs(p3.x - p0.x) * 0.35);
    const sign = cf.side === 'right' ? 1 : -1;
    p1 = { x: p0.x + offX * sign, y: p0.y };
    p2 = { x: p3.x - offX * sign, y: p3.y };
  }

  // Compute arrowhead base first (bezier ends at base, not tip)
  const ax2 = p3.x - p2.x;
  const ay2 = p3.y - p2.y;
  const alen2 = Math.sqrt(ax2 * ax2 + ay2 * ay2);
  let base2X = p3.x, base2Y = p3.y;
  let tip2X = p3.x, tip2Y = p3.y;
  let perp2X = 0, perp2Y = 0;
  if (alen2 > 0.01) {
    const anx2 = ax2 / alen2;
    const any2 = ay2 / alen2;
    const arrowLen2 = 10 / state.canvas.zoom;
    const arrowW2 = 4 / state.canvas.zoom;
    tip2X = p3.x;
    tip2Y = p3.y;
    base2X = tip2X - anx2 * arrowLen2;
    base2Y = tip2Y - any2 * arrowLen2;
    perp2X = -any2 * arrowW2;
    perp2Y = anx2 * arrowW2;
  }

  // Keyframe (top) connections use orange; others use blue
  const previewColor = isTopSide ? 'rgba(255,152,0,0.45)' : 'rgba(212,255,0,0.45)';
  ctx.strokeStyle = previewColor;
  ctx.lineWidth = 2 / state.canvas.zoom;
  ctx.lineCap = 'round';
  ctx.setLineDash([6 / state.canvas.zoom, 4 / state.canvas.zoom]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, base2X, base2Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead at cursor (skip for keyframe/top connections)
  if (!isTopSide && alen2 > 0.01) {
    ctx.fillStyle = 'rgba(212,255,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(tip2X, tip2Y);
    ctx.lineTo(base2X + perp2X, base2Y + perp2Y);
    ctx.lineTo(base2X - perp2X, base2Y - perp2Y);
    ctx.closePath();
    ctx.fill();
  }
}

function renderRubberBand() {
  if (state.interaction.mode !== 'rubber-band') return;
  const rb = state.interaction._rubberBand;
  if (!rb) return;
  const x = Math.min(rb.startX, rb.currentX);
  const y = Math.min(rb.startY, rb.currentY);
  const w = Math.abs(rb.currentX - rb.startX);
  const h = Math.abs(rb.currentY - rb.startY);
  if (w < 2 && h < 2) return;
  ctx.strokeStyle = '#D4FF00';
  ctx.lineWidth = 1.5 / state.canvas.zoom;
  ctx.setLineDash([8 / state.canvas.zoom, 4 / state.canvas.zoom]);
  ctx.fillStyle = 'rgba(212,255,0,0.06)';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function renderSnapLines() {
  const lines = state.interaction._snapLines;
  if (!lines) return;
  ctx.strokeStyle = '#ff3366';
  ctx.lineWidth = 1 / state.canvas.zoom;
  ctx.setLineDash([4 / state.canvas.zoom, 3 / state.canvas.zoom]);
  // Compute visible world bounds
  const dpr = window.devicePixelRatio || 1;
  const vpW = (canvas.width / dpr) / state.canvas.zoom;
  const vpH = (canvas.height / dpr) / state.canvas.zoom;
  const vpLeft = -state.canvas.offsetX / state.canvas.zoom;
  const vpTop = -state.canvas.offsetY / state.canvas.zoom;
  for (const line of lines) {
    ctx.beginPath();
    if (line.orient === 'v') {
      ctx.moveTo(line.pos, vpTop - 100);
      ctx.lineTo(line.pos, vpTop + vpH + 100);
    } else {
      ctx.moveTo(vpLeft - 100, line.pos);
      ctx.lineTo(vpLeft + vpW + 100, line.pos);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ================================================================
// Hit testing: what's under a screen-space point?
// ================================================================
function hitTest(sx, sy) {
  const world = screenToWorld(sx, sy);
  const wx = world.x;
  const wy = world.y;
  const zoom = state.canvas.zoom;

  // Check group resize handles for fixed-mode selected groups (highest priority)
  {
    const handleHitR = 10 / zoom; // world units
    for (let i = state.groups.length - 1; i >= 0; i--) {
      const group = state.groups[i];
      if (group.collapsed || group.sizingMode !== 'fixed') continue;
      if (!state.selection.groupIds.includes(group.id)) continue;
      const frame = getGroupFrame(group);
      if (!frame) continue;
      const handles = [
        { name: 'nw', x: frame.x, y: frame.y },
        { name: 'n',  x: frame.x + frame.w / 2, y: frame.y },
        { name: 'ne', x: frame.x + frame.w, y: frame.y },
        { name: 'e',  x: frame.x + frame.w, y: frame.y + frame.h / 2 },
        { name: 'se', x: frame.x + frame.w, y: frame.y + frame.h },
        { name: 's',  x: frame.x + frame.w / 2, y: frame.y + frame.h },
        { name: 'sw', x: frame.x, y: frame.y + frame.h },
        { name: 'w',  x: frame.x, y: frame.y + frame.h / 2 },
      ];
      for (const h of handles) {
        if (Math.abs(wx - h.x) <= handleHitR && Math.abs(wy - h.y) <= handleHitR) {
          return { type: 'group-resize', groupId: group.id, handle: h.name };
        }
      }
      // Only check resize handles for the topmost selected fixed group
      break;
    }
  }

  // Check group title bars first — they float above cards for drag (always)
  for (let i = state.groups.length - 1; i >= 0; i--) {
    const group = state.groups[i];
    const frame = getGroupFrame(group);
    if (!frame || group.collapsed) continue;
    if (wx >= frame.x && wx <= frame.x + frame.w && wy >= frame.y && wy <= frame.y + frame.titleH) {
      return { type: 'group-title', groupId: group.id };
    }
  }

  // Check collapsed groups — their cards are hidden, group card takes priority
  for (let i = state.groups.length - 1; i >= 0; i--) {
    const group = state.groups[i];
    if (!group.collapsed) continue;
    const frame = getGroupFrame(group);
    if (frame && wx >= frame.x && wx <= frame.x + frame.w && wy >= frame.y && wy <= frame.y + frame.h) {
      return { type: 'group-title', groupId: group.id };
    }
  }

  // Helper: is playback active on this card?
  const _isCardInPlayback = (card) => {
    const pb = state.playback;
    if (!pb || !(pb.isPlaying || pb.pausedAt > 0)) return false;
    if (pb.currentCardId === card.id) return true;
    if (pb.playbackMode === 'group' && pb._groupPlaybackGroup &&
        pb._groupPlaybackGroup.cardIds.includes(card.id) &&
        pb._groupPlayheadX != null &&
        pb._groupPlayheadX >= card.x && pb._groupPlayheadX < card.x + getCardWidth(card)) return true;
    return false;
  };

  // Build set of cards hidden inside collapsed groups
  const collapsedCardIds = new Set();
  for (const g of state.groups) {
    if (g.collapsed) for (const cid of g.cardIds) collapsedCardIds.add(cid);
  }

  // Group playhead hit test — must be outside the per-card loop
  // because the playhead spans the full group height and may not overlap any card's bbox.
  {
    const pb = state.playback;
    if (pb.playbackMode === 'group' && pb._groupPlaybackGroup && pb._groupPlayheadX != null) {
      const phHitW = 10 / state.canvas.zoom;
      if (wx >= pb._groupPlayheadX - phHitW && wx <= pb._groupPlayheadX + phHitW) {
        const frame = getGroupFrame(pb._groupPlaybackGroup);
        if (frame && wy >= frame.y + frame.titleH && wy <= frame.y + frame.h) {
          return { type: 'playhead', mode: 'group' };
        }
      }
    }
  }

  // Iterate cards in reverse so top card (last drawn) wins
  // Cards inside unselected groups are skipped — the group frame catches them
  for (let i = state.cards.length - 1; i >= 0; i--) {
    const card = state.cards[i];
    if (collapsedCardIds.has(card.id)) continue;
    const cw = getCardWidth(card);
    const ch = CARD_HEIGHT;
    const trimHitWorld = TRIM_HIT / state.canvas.zoom;
    const anchorHitWorld = ANCHOR_HIT_R / state.canvas.zoom;

    // Card bounding box
    if (wx >= card.x && wx <= card.x + cw && wy >= card.y && wy <= card.y + ch) {

      // Text cards: no trim, no volume, no playhead — just card body and anchors
      if (card.type === 'text') {
        // Top anchor hit test only near the very top edge (wy < card.y + 4/zoom),
        // so it doesn't steal clicks from card-body dragging
        const topEdgeMax = card.y + 4 / state.canvas.zoom;
        if (wy <= topEdgeMax) {
          const kfConnsTop1 = state.connections.filter(c => c.type === 'keyframe' && c.fromCardId === card.id);
          for (const kfConn of kfConnsTop1) {
            const anchor = getAnchorPos(card, 'top', kfConn);
            const dx = wx - anchor.x;
            const dy = wy - anchor.y;
            if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
              return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: kfConn.id };
            }
          }
          // Default top anchor — only active when playback is on this card
          if (_isCardInPlayback(card)) {
            const pb2 = state.playback;
            const defFromPos = (pb2.playbackMode === 'group' && pb2._groupPlayheadX != null)
              ? (pb2._groupPlayheadX - card.x) / getCardWidth(card)
              : pb2.cardProgress;
            const defAnchor = getAnchorPos(card, 'top', { fromPosition: defFromPos });
            const dx = wx - defAnchor.x;
            const dy = wy - defAnchor.y;
            if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
              return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: null };
            }
          }
        }
        // Left/right anchor hit test
        for (const side of ['left', 'right']) {
          const anchor = getAnchorPos(card, side);
          const dx = wx - anchor.x;
          const dy = wy - anchor.y;
          if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
            return { type: 'anchor', cardId: card.id, side };
          }
        }
        return { type: 'card-body', cardId: card.id };
      }

      // Composition cards: trim + playhead supported, no volume
      if (card.type === 'composition') {
        // Trim left edge?
        if (wx <= card.x + trimHitWorld) {
          return { type: 'trimming-left', cardId: card.id };
        }
        if (wx >= card.x + cw - trimHitWorld) {
          return { type: 'trimming-right', cardId: card.id };
        }
        // Playhead hit test
        const pb = state.playback;
        if ((pb.isPlaying || pb.pausedAt > 0) && pb.currentCardId === card.id && pb.playbackMode !== 'group') {
          const phWorldX = pb._playheadX;
          if (phWorldX != null && Math.abs(wx - phWorldX) < 10 / state.canvas.zoom) {
            return { type: 'playhead', mode: 'linear', cardId: card.id };
          }
        }
        return { type: 'card-body', cardId: card.id };
      }

      // Trim left edge? (before anchor — trim has priority on the card edge)
      if (wx <= card.x + trimHitWorld) {
        return { type: 'trimming-left', cardId: card.id };
      }
      // Trim right edge?
      if (wx >= card.x + cw - trimHitWorld) {
        return { type: 'trimming-right', cardId: card.id };
      }

      // Anchor hit test — only for video cards (catches clicks near, but not at, the edge)
      if (card.type !== 'audio') {
        // Top anchor hit test only near the very top edge (wy < card.y + 4/zoom),
        // so it doesn't steal clicks from card-body dragging
        const topEdgeMaxV = card.y + 4 / state.canvas.zoom;
        if (wy <= topEdgeMaxV) {
          const kfConnsTop2 = state.connections.filter(c => c.type === 'keyframe' && c.fromCardId === card.id);
          for (const kfConn of kfConnsTop2) {
            const anchor = getAnchorPos(card, 'top', kfConn);
            const dx = wx - anchor.x;
            const dy = wy - anchor.y;
            if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
              return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: kfConn.id };
            }
          }
          // Default top anchor — only active when playback is on this card
          if (_isCardInPlayback(card)) {
            const pb2 = state.playback;
            const defFromPos = (pb2.playbackMode === 'group' && pb2._groupPlayheadX != null)
              ? (pb2._groupPlayheadX - card.x) / getCardWidth(card)
              : pb2.cardProgress;
            const defAnchor = getAnchorPos(card, 'top', { fromPosition: defFromPos });
            const dx = wx - defAnchor.x;
            const dy = wy - defAnchor.y;
            if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
              return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: null };
            }
          }
        }
        // Left/right anchors
        for (const side of ['left', 'right']) {
          const anchor = getAnchorPos(card, side);
          const dx = wx - anchor.x;
          const dy = wy - anchor.y;
          if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
            return { type: 'anchor', cardId: card.id, side };
          }
        }
      }

      // Playhead hit test (priority over volume and card-body click)
      const pb = state.playback;
      if ((pb.isPlaying || pb.pausedAt > 0) && pb._playheadCardId === card.id && pb._playheadX != null) {
        const phHitW = 10 / state.canvas.zoom;
        if (wx >= pb._playheadX - phHitW && wx <= pb._playheadX + phHitW) {
          return { type: 'playhead', cardId: card.id };
        }
      }

      // Volume slider area
      const wfY = card.type === 'audio' ? card.y : card.y + CARD_THUMB_HEIGHT;
      const wfH = CARD_WAVEFORM_HEIGHT;

      let inVolumeArea = false;
      if (card.type === 'audio') {
        // Volume slider on RIGHT side for audio cards
        inVolumeArea = wx >= card.x + cw - 24 / state.canvas.zoom && wx <= card.x + cw && wy >= wfY && wy <= wfY + wfH;
      } else {
        // Volume slider on LEFT side for non-audio cards
        inVolumeArea = wx >= card.x && wx <= card.x + 22 && wy >= wfY && wy <= wfY + wfH;
      }

      if (inVolumeArea) {
        // Check if clicking on the percentage text (to edit)
        if (card._volPctBounds) {
          const b = card._volPctBounds;
          if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
            return { type: 'volume-text', cardId: card.id };
          }
        }
        return { type: 'volume', cardId: card.id };
      }
      // Card body
      return { type: 'card-body', cardId: card.id };
    }

    // Anchor check outside card bbox (for reaching anchors more easily) — connectable cards only
    if (card.type === 'video' || card.type === 'text') {
    // Top anchor hit test (checked FIRST — diamond takes priority over left/right)
    const kfConnsTop3 = state.connections.filter(c => c.type === 'keyframe' && c.fromCardId === card.id);
    for (const kfConn of kfConnsTop3) {
      const anchor = getAnchorPos(card, 'top', kfConn);
      const dx = wx - anchor.x;
      const dy = wy - anchor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
        return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: kfConn.id };
      }
    }
    // Default top anchor — only active when playback is on this card (outside bbox)
    if (_isCardInPlayback(card)) {
      const pb2 = state.playback;
      const defFromPos = (pb2.playbackMode === 'group' && pb2._groupPlayheadX != null)
        ? (pb2._groupPlayheadX - card.x) / getCardWidth(card)
        : pb2.cardProgress;
      const defAnchor = getAnchorPos(card, 'top', { fromPosition: defFromPos });
      const dx = wx - defAnchor.x;
      const dy = wy - defAnchor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
        return { type: 'anchor', cardId: card.id, side: 'top', _kfConnId: null };
      }
    }
    // Left/right anchors
    for (const side of ['left', 'right']) {
      const anchor = getAnchorPos(card, side);
      const dx = wx - anchor.x;
      const dy = wy - anchor.y;
      if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
        return { type: 'anchor', cardId: card.id, side };
      }
    }
    }
  }

  // Check marker cards (after cards, before connections)
  for (let i = state.markerCards.length - 1; i >= 0; i--) {
    const marker = state.markerCards[i];
    const parentCard = state.cards.find(c => c.id === marker.parentCardId);
    if (!parentCard || collapsedCardIds.has(parentCard.id)) continue;

    const tb = marker._thumbBounds;
    if (tb) {
      // Hit the thumbnail rectangle
      if (wx >= tb.x && wx <= tb.x + tb.w && wy >= tb.y && wy <= tb.y + tb.h) {
        return { type: 'marker-card', markerCardId: marker.id };
      }
      // Hit the diamond anchor
      const dSize = 6 / state.canvas.zoom;
      const anchorHitR = ANCHOR_HIT_R / state.canvas.zoom;
      const anchorDx = wx - marker.x;
      const anchorDy = wy - tb.anchorY;
      if (Math.sqrt(anchorDx * anchorDx + anchorDy * anchorDy) <= anchorHitR + dSize) {
        return { type: 'marker-anchor', markerCardId: marker.id };
      }
    }
  }

  // Check connections (delete button first, then badge)
  const connHitWorld = CONN_HIT_R / state.canvas.zoom;
  for (let i = state.connections.length - 1; i >= 0; i--) {
    const conn = state.connections[i];
    if (conn._delBounds) {
      const db = conn._delBounds;
      const ddx = wx - (db.x + db.w / 2);
      const ddy = wy - (db.y + db.h / 2);
      if (Math.sqrt(ddx * ddx + ddy * ddy) <= connHitWorld + db.w / 2) {
        return { type: 'connection-delete', connectionId: conn.id };
      }
    }
    if (conn._badgeBounds) {
      const bb = conn._badgeBounds;
      if (wx >= bb.x - connHitWorld && wx <= bb.x + bb.w + connHitWorld &&
          wy >= bb.y - connHitWorld && wy <= bb.y + bb.h + connHitWorld) {
        return { type: 'connection-badge', connectionId: conn.id };
      }
    }
  }

  // Check line shapes (pure 2D canvas, not Fabric)
  const lineEndpointHitR = 12 / zoom;
  const lineBodyHitR = 8 / zoom;
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    if (s.shapeType !== 'line') continue;
    const x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
    // Endpoint 1
    const d1 = Math.sqrt((wx - x1) ** 2 + (wy - y1) ** 2);
    if (d1 <= lineEndpointHitR) return { type: 'line-endpoint', shapeId: s.id, endpoint: 0 };
    // Endpoint 2
    const d2 = Math.sqrt((wx - x2) ** 2 + (wy - y2) ** 2);
    if (d2 <= lineEndpointHitR) return { type: 'line-endpoint', shapeId: s.id, endpoint: 1 };
    // Line body — point-to-segment distance
    const ldx = x2 - x1, ldy = y2 - y1;
    const lenSq = ldx * ldx + ldy * ldy;
    if (lenSq > 0) {
      let t = ((wx - x1) * ldx + (wy - y1) * ldy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + t * ldx;
      const py = y1 + t * ldy;
      const dist = Math.sqrt((wx - px) ** 2 + (wy - py) ** 2);
      if (dist <= lineBodyHitR) return { type: 'line-body', shapeId: s.id };
    }
  }

  // Check expanded group body (empty area inside frame, below title)
  for (let i = state.groups.length - 1; i >= 0; i--) {
    const group = state.groups[i];
    if (group.collapsed) continue;
    const frame = getGroupFrame(group);
    if (frame && wx >= frame.x && wx <= frame.x + frame.w && wy > frame.y + frame.titleH && wy <= frame.y + frame.h) {
      return { type: 'group-body', groupId: group.id };
    }
  }

  // Check edit boxes (above groups, below cards)
  // Also check edit box bottom anchors
  const anchorHitWorldEB = ANCHOR_HIT_R / zoom;
  for (let i = state.editBoxes.length - 1; i >= 0; i--) {
    const eb = state.editBoxes[i];
    // Bottom anchor (centered below edit box)
    const ebBotAX = eb.x + eb.width / 2;
    const ebBotAY = eb.y + eb.height + 10 / zoom;
    const ebBotDx = wx - ebBotAX;
    const ebBotDy = wy - ebBotAY;
    if (Math.sqrt(ebBotDx * ebBotDx + ebBotDy * ebBotDy) <= anchorHitWorldEB) {
      const ebKeyConns = state.connections.filter(c => c.type === 'eb-keyframe' && c.fromEditBoxId === eb.id);
      if (ebKeyConns.length > 0) {
        return { type: 'editbox-anchor', editBoxId: eb.id, side: 'bottom', _kfConnId: ebKeyConns[0].id };
      }
      const incomingConns = state.connections.filter(c => c.type === 'eb-keyframe' && c.toEditBoxId === eb.id);
      if (incomingConns.length > 0) {
        return { type: 'editbox-anchor', editBoxId: eb.id, side: 'bottom', _kfConnId: incomingConns[0].id };
      }
      return { type: 'editbox-anchor', editBoxId: eb.id, side: 'bottom', _kfConnId: null };
    }

    if (wx >= eb.x && wx <= eb.x + eb.width && wy >= eb.y && wy <= eb.y + eb.height) {
      const ebLabelH = 20 / zoom;
      // Title bar (top 20px in world units)
      if (wy <= eb.y + ebLabelH) {
        return { type: 'editbox-title', editBoxId: eb.id };
      }
      return { type: 'editbox-body', editBoxId: eb.id };
    }
  }

  // Check timeline dots (eb-keyframe timeline)
  if (state._ebTimelines) {
    for (const key of Object.keys(state._ebTimelines)) {
      const tl = state._ebTimelines[key];
      if (!tl || !tl.dots) continue;
      for (const dot of tl.dots) {
        const dx = wx - dot.x, dy = wy - dot.y;
        if (Math.sqrt(dx * dx + dy * dy) <= dot.r) {
          return { type: 'timeline-dot', editBoxId: dot.editBoxId, timelineKey: key };
        }
      }
    }
  }

  return { type: 'canvas' };
}

function roundRect(x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  roundRectPath(x, y, w, h, r);
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function roundRectPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ================================================================
// Rendering: Empty state hint
// ================================================================
function renderEmptyHint() {
  if (state.cards.length > 0) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const cx = w / 2;
  const cy = h / 2;

  ctx.fillStyle = '#999999';
  ctx.font = `450 18px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('拖入视频文件开始创作', cx, cy - 10);

  ctx.font = `420 13px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = '#bbbbbb';
  ctx.fillText('或点击顶部 "导入视频/音频" 按钮', cx, cy + 16);
  ctx.textAlign = 'start';
}

// ================================================================
// Rendering: Shape selection highlights (2D canvas, for mixed selection)
// ================================================================
function renderShapeSelectionHighlights() {
  // Only render when shapes are tracked in state (not managed by Fabric ActiveSelection)
  if (state.selection.shapeIds.length === 0) return;
  if (fabricCanvas && fabricCanvas.getActiveObject()) return; // Fabric renders its own selection

  var z = state.canvas.zoom;
  ctx.save();
  ctx.strokeStyle = '#D4FF00';
  ctx.lineWidth = 1.5 / z;
  ctx.setLineDash([]);

  fabricCanvas.getObjects().forEach(function(obj) {
    if (!obj._shapeId || obj._isEditBoxShape) return;
    if (state.selection.shapeIds.indexOf(obj._shapeId) < 0) return;

    var l = obj.left || 0;
    var t = obj.top || 0;
    var w = (obj.width || 0) * (obj.scaleX || 1);
    var h = (obj.height || 0) * (obj.scaleY || 1);

    ctx.strokeRect(l, t, w, h);

    // Corner handles
    var hs = 6 / z;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#D4FF00';
    ctx.lineWidth = 1.5 / z;

    var corners = [
      { x: l, y: t },
      { x: l + w, y: t },
      { x: l, y: t + h },
      { x: l + w, y: t + h }
    ];
    corners.forEach(function(c) {
      ctx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
      ctx.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
    });
  });

  ctx.restore();
}

// ================================================================
// Rendering: Edit boxes
// ================================================================
function renderEditBox(eb) {
  const z = state.canvas.zoom;
  const lw = 1 / z;
  const isSelected = state.selection.editBoxId === eb.id || (state.selection.editBoxIds || []).includes(eb.id);
  const isHovered = state.hoveredEditBoxId === eb.id;
  const isActive = state.interaction.activeEditBoxId === eb.id;

  // --- State glow ---
  if (isActive) {
    // Edit mode — prominent blue glow + solid border
    ctx.save();
    ctx.shadowColor = 'rgba(212,255,0,0.35)';
    ctx.shadowBlur = 20 / z;
    roundRect(eb.x, eb.y, eb.width, eb.height, 6, false, false);
    ctx.fillStyle = 'rgba(212,255,0,0.08)';
    roundRect(eb.x, eb.y, eb.width, eb.height, 6, true, false);
    ctx.restore();
  } else if (isSelected) {
    // Selected — visible blue highlight, draggable
    ctx.save();
    ctx.shadowColor = 'rgba(212,255,0,0.2)';
    ctx.shadowBlur = 14 / z;
    roundRect(eb.x, eb.y, eb.width, eb.height, 6, false, false);
    ctx.fillStyle = 'rgba(212,255,0,0.05)';
    roundRect(eb.x, eb.y, eb.width, eb.height, 6, true, false);
    ctx.restore();
  } else if (isHovered) {
    ctx.fillStyle = 'rgba(212,255,0,0.03)';
    roundRect(eb.x, eb.y, eb.width, eb.height, 6, true, false);
  }

  // --- Border ---
  ctx.save();
  ctx.strokeStyle = isActive ? '#D4FF00' : (isSelected ? '#c5e800' : (isHovered ? '#b3d900' : '#b3d900'));
  ctx.lineWidth = isActive ? 2.5 / z : (isSelected ? 2 / z : 1.5 / z);
  ctx.setLineDash(isActive ? [] : (isSelected ? [6 / z, 3 / z] : [8 / z, 4 / z]));
  roundRect(eb.x, eb.y, eb.width, eb.height, 6, false, true);
  ctx.setLineDash([]);
  ctx.restore();

  // --- Bottom anchor for eb-keyframe connections ---
  {
    const ebKeyConns = state.connections.filter(c => c.type === 'eb-keyframe' && c.fromEditBoxId === eb.id);
    const incomingConns = state.connections.filter(c => c.type === 'eb-keyframe' && c.toEditBoxId === eb.id);
    const allConns = [...ebKeyConns, ...incomingConns];
    const ha = state.hoveredAnchor;
    const r = ANCHOR_RADIUS / z;
    const diamondHW = r * 1.3;
    const diamondHH = r;

    // Bottom anchor position
    const botAX = eb.x + eb.width / 2;
    const botAY = eb.y + eb.height + 10 / z;

    // Render diamond for existing connections
    if (allConns.length > 0) {
      const conn = allConns[0];
      const isHovAnchor = ha && ha.editBoxId === eb.id;
      const isSelConn = allConns.some(c => c.id === state.selection.connectionId);
      const scale = (isHovAnchor || isSelConn) ? 1 : 0.7;

      ctx.fillStyle = isHovAnchor ? '#e65100' : '#ff9800';
      ctx.strokeStyle = isHovAnchor ? '#e65100' : '#ff9800';
      ctx.lineWidth = 1.5 / z;
      ctx.globalAlpha = isHovAnchor || isSelConn ? 1 : 0.75;
      ctx.beginPath();
      ctx.moveTo(botAX, botAY + diamondHW * scale);
      ctx.lineTo(botAX - diamondHW * scale, botAY);
      ctx.lineTo(botAX, botAY - diamondHW * scale);
      ctx.lineTo(botAX + diamondHW * scale, botAY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (isHovAnchor) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,152,0,0.5)';
        ctx.shadowBlur = 10 / z;
        ctx.fill();
        ctx.restore();
      }
    }

    // Default anchor for creating new connections (unless in edit mode)
    if (!isActive) {
      const isHovDefAnchor = ha && ha.editBoxId === eb.id && !ha._kfConnId;
      const scale = isHovDefAnchor ? 1 : 0.7;
      const alpha = allConns.length > 0 ? 0.6 : (isHovDefAnchor ? 0.95 : 0.6);

      ctx.fillStyle = `rgba(255,152,0,${alpha})`;
      ctx.strokeStyle = `rgba(255,152,0,${alpha})`;
      ctx.lineWidth = 1.5 / z;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(botAX, botAY + diamondHW * scale);
      ctx.lineTo(botAX - diamondHW * scale, botAY);
      ctx.lineTo(botAX, botAY - diamondHW * scale);
      ctx.lineTo(botAX + diamondHW * scale, botAY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (isHovDefAnchor) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,152,0,0.5)';
        ctx.shadowBlur = 10 / z;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // --- Clip to edit box for shape rendering ---
  ctx.save();
  ctx.beginPath();
  roundRectPath(eb.x, eb.y, eb.width, eb.height, 6);
  ctx.clip();

  // When active, Fabric handles non-line shape rendering — only render lines on 2D canvas
  if (!isActive) {
    // --- Render shapes inside edit box with its camera ---
    const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
    ctx.save();
    ctx.translate(eb.x + cam.offsetX, eb.y + cam.offsetY);
    ctx.scale(cam.zoom, cam.zoom);

    for (const s of (eb.shapes || [])) {
      if (s.shapeType === 'rect') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        if (s.angle) { ctx.save(); const cx = s.left + s.width / 2; const cy = s.top + s.height / 2; ctx.translate(cx, cy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
        if (s.fill) {
          ctx.fillStyle = s.fill;
          ctx.fillRect(s.left, s.top, s.width, s.height);
        }
        if (s.stroke) {
          ctx.strokeStyle = s.stroke;
          ctx.lineWidth = s.strokeWidth || 2;
          ctx.strokeRect(s.left, s.top, s.width, s.height);
        }
        if (s.angle) ctx.restore();
      } else if (s.shapeType === 'ellipse') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        ctx.beginPath();
        const cx = s.left + s.width / 2;
        const cy = s.top + s.height / 2;
        if (s.angle) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
        ctx.ellipse(cx, cy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
        if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
        if (s.stroke) { ctx.strokeStyle = s.stroke; ctx.lineWidth = s.strokeWidth || 2; ctx.stroke(); }
        if (s.angle) ctx.restore();
      } else if (s.shapeType === 'line') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        const lcx = (s.x1 + s.x2) / 2;
        const lcy = (s.y1 + s.y2) / 2;
        if (s.angle) { ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-lcx, -lcy); }
        ctx.strokeStyle = s.stroke || '#D4FF00';
        ctx.lineWidth = s.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        if (s.angle) ctx.restore();
      } else if (s.shapeType === 'text') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        if (s.angle) { ctx.save(); const cx = s.left + (s.width || 100) / 2; const cy = s.top + (s.height || 24) / 2; ctx.translate(cx, cy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-cx, -cy); }
        ctx.fillStyle = s.fill || '#000000';
        ctx.font = `${s.fontWeight || 'Bold'} ${s.fontSize || 24}px "${s.fontFamily || 'Inter'}", system-ui, sans-serif`;
        ctx.textAlign = s.textAlign || 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(s.text || '', s.left, s.top);
        ctx.textAlign = 'start';
        if (s.angle) ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  } else {
    // Active: still render line shapes on 2D canvas (Fabric doesn't handle lines)
    const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
    ctx.save();
    ctx.translate(eb.x + cam.offsetX, eb.y + cam.offsetY);
    ctx.scale(cam.zoom, cam.zoom);
    for (const s of (eb.shapes || [])) {
      if (s.shapeType === 'line') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        const lcx = (s.x1 + s.x2) / 2;
        const lcy = (s.y1 + s.y2) / 2;
        if (s.angle) { ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-lcx, -lcy); }
        ctx.strokeStyle = s.stroke || '#D4FF00';
        ctx.lineWidth = s.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        if (s.angle) ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  ctx.restore(); // end clip

  // --- Top-left label ---
  const labelH = 20;
  ctx.fillStyle = 'rgba(124,108,231,0.18)';
  ctx.fillRect(eb.x, eb.y, 70, labelH);
  ctx.fillStyle = '#6b5ab8';
  ctx.font = `450 11px "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('编辑盒', eb.x + 6, eb.y + labelH / 2);
  ctx.textBaseline = 'alphabetic';

  // Shape count badge
  const shapeCount = (eb.shapes || []).length;
  if (shapeCount > 0) {
    const badgeW = 18;
    const badgeX = eb.x + 62;
    const badgeY = eb.y + 2;
    ctx.fillStyle = '#b3d900';
    ctx.beginPath();
    ctx.arc(badgeX + badgeW, badgeY + badgeW / 2, badgeW / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `500 9px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shapeCount, badgeX + badgeW, badgeY + badgeW / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

// ================================================================
// Main render
// ================================================================
function render() {
  const dpr = window.devicePixelRatio || 1;

  syncFabricSizeAndTransform();

  // Clear everything (identity transform — clear physical pixels)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Grid — screen space (DPR only, no world transform)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderGrid();

  // 2. Cards — world space, single pass in array order
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(state.canvas.offsetX, state.canvas.offsetY);
  ctx.scale(state.canvas.zoom, state.canvas.zoom);

  const editingEbId = state.interaction.activeEditBoxId;

  // Render groups (behind cards) — dimmed when editing an edit box
  ctx.save();
  if (editingEbId) ctx.globalAlpha = 0.25;
  for (const group of state.groups) {
    renderGroup(group);
  }
  ctx.restore();

  // Render edit boxes — active one at full opacity, others dimmed
  for (const eb of state.editBoxes) {
    ctx.save();
    if (editingEbId && eb.id !== editingEbId) ctx.globalAlpha = 0.25;
    renderEditBox(eb);
    ctx.restore();
  }

  // Collect card IDs in collapsed groups to hide them
  const collapsedCardIds = new Set();
  for (const g of state.groups) {
    if (g.collapsed) {
      for (const cid of g.cardIds) collapsedCardIds.add(cid);
    }
  }

  ctx.save();
  if (editingEbId) ctx.globalAlpha = 0.25;
  for (const card of state.cards) {
    if (collapsedCardIds.has(card.id)) continue;
    // Clip for fixed-mode group: hide card parts outside the group frame
    const isSelected = state.selection.cardIds.includes(card.id);
    const parentFixedGroup = !isSelected ? state.groups.find(g => !g.collapsed && g.sizingMode === 'fixed' && g.cardIds.includes(card.id)) : null;
    if (parentFixedGroup) {
      ctx.save();
      const f = getGroupFrame(parentFixedGroup);
      ctx.beginPath();
      ctx.rect(f.x, f.y + f.titleH, f.w, f.h - f.titleH);
      ctx.clip();
    }
    renderCard(card);
    if (parentFixedGroup) ctx.restore();
  }
  ctx.restore();

  // 2.5 Marker cards — orange dashed vertical lines at keyframe positions
  for (const marker of state.markerCards) {
    const parentCard = state.cards.find(c => c.id === marker.parentCardId);
    if (!parentCard || !collapsedCardIds.has(parentCard.id)) {
      renderMarkerCard(marker);
    }
  }

  // 3. Connections — same world space (above cards), dimmed when editing
  ctx.save();
  if (editingEbId) ctx.globalAlpha = 0.25;
  for (const conn of state.connections) {
    renderConnection(conn);
  }
  // 4. Connection preview (while dragging from anchor)
  renderConnectionPreview();
  // 4.5. Edit box keyframe timelines (below edit boxes)
  renderEditBoxTimelines();
  // 5. Line shapes (pure 2D canvas)
  renderLines();
  renderLineEndpointHandles();
  renderShapeSelectionHighlights();
  ctx.restore();
  // 6. Rubber-band selection rectangle (always full opacity)
  renderRubberBand();
  // 7. Snap alignment guides (always full opacity)
  renderSnapLines();
  // 8. Line drawing preview (always full opacity during line-tool drag)
  renderLinePreview();

  // 5. Playhead — world space (red line sweeping across card or group)
  if (state.playback.playbackMode === 'group' && state.playback._groupPlaybackGroup) {
    renderGroupPlayhead(state.playback._groupPlaybackGroup, state.playback._groupPlayheadX);
  } else {
    renderPlayhead();
  }

  // 6. Transition effect overlay — may switch to screen space internally
  renderTransitionOverlay();

  // 7. Empty state hint — screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderEmptyHint();

  // Update UI
  updateStatusBar();
  updateZoomBadge();
  renderLayerList();
  updateInspector();
  renderTransformOverlay();
}

function updateStatusBar() {
  const count = state.cards.length;
  const connCount = state.connections.length;
  const selCount = state.selection.cardIds.length;
  const pb = state.playback;

  const isGroupMode = pb.playbackMode === 'group';

  if (pb.isPlaying) {
    const elapsed = pb.pausedAt + (performance.now() - pb.startTime) / 1000;
    if (isGroupMode && pb.groupPlayback.groupId) {
      const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
      const gname = group ? (group.name || 'Group') : '';
      statusCards.textContent = `组播放  ·  卡片 ${count}  ·  连线 ${connCount}`;
      statusHint.textContent = `${gname}  |  ${formatTime(elapsed)} / ${formatTime(pb.totalDuration)}  |  空格暂停  ·  Esc 停止`;
    } else {
      const card = state.cards.find(c => c.id === pb.currentCardId);
      const label = card ? card.label : '';
      statusCards.textContent = `播放中  ·  卡片 ${count}  ·  连线 ${connCount}`;
      statusHint.textContent = `${label}  |  ${formatTime(elapsed)} / ${formatTime(pb.totalDuration)}  |  空格暂停  ·  Esc 停止`;
    }
  } else if (pb.pausedAt > 0 && (pb.sequence.length > 0 || isGroupMode)) {
    if (isGroupMode && pb.groupPlayback.groupId) {
      const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
      const gname = group ? (group.name || 'Group') : '';
      statusCards.textContent = `已暂停  ·  卡片 ${count}  ·  连线 ${connCount}`;
      statusHint.textContent = `${gname}  |  ${formatTime(pb.pausedAt)} / ${formatTime(pb.totalDuration)}  |  空格继续  ·  Esc 停止`;
    } else {
      const card = state.cards.find(c => c.id === pb.currentCardId);
      const label = card ? card.label : '';
      statusCards.textContent = `已暂停  ·  卡片 ${count}  ·  连线 ${connCount}`;
      statusHint.textContent = `${label}  |  ${formatTime(pb.pausedAt)} / ${formatTime(pb.totalDuration)}  |  空格继续  ·  Esc 停止`;
    }
  } else if (count === 0) {
    statusCards.textContent = '卡片 0';
    statusHint.textContent = '拖入视频文件开始';
  } else if (state.interaction.mode === 'connecting') {
    statusCards.textContent = `卡片 ${count}  ·  连线 ${connCount}`;
    statusHint.textContent = '拖拽至另一张卡片边缘锚点创建连线  ·  Esc 取消';
  } else if (selCount > 0) {
    statusCards.textContent = `卡片 ${count}  ·  选中 ${selCount}  ·  连线 ${connCount}`;
    statusHint.textContent = '空格播放  ·  拖拽移动  ·  拖拽边缘裁剪  ·  拖拽锚点连线';
  } else {
    statusCards.textContent = `卡片 ${count}  ·  连线 ${connCount}`;
    statusHint.textContent = '点击选中卡片  ·  Shift+点击多选  ·  拖拽锚点连线  ·  空格+拖拽平移';
  }
}

function updateZoomBadge() {
  const pct = Math.round(state.canvas.zoom * 100);
  zoomBadge.textContent = pct + '%';
}

// ================================================================
// Text card inline editing
// ================================================================
function startTextCardEdit(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card || card.type !== 'text') return;

  // Find card position on screen
  const s = worldToScreen(card.x, card.y);
  const cw = getCardWidth(card);
  const ch = card.height || 40;

  // Create a temporary textarea overlay
  const ta = document.createElement('textarea');
  ta.value = card.text || '';
  ta.style.cssText = `
    position: fixed;
    left: ${s.x}px;
    top: ${s.y}px;
    width: ${cw * state.canvas.zoom}px;
    min-height: ${ch * state.canvas.zoom}px;
    z-index: 200;
    font-family: "${card.fontFamily || 'Inter'}", system-ui, sans-serif;
    font-size: ${(card.fontSize || 24) * state.canvas.zoom}px;
    font-weight: ${card.fontWeight || 'Bold'};
    color: ${card.color || '#000000'};
    text-align: ${card.textAlign || 'left'};
    background: rgba(255,255,255,0.95);
    border: 1.5px solid #D4FF00;
    border-radius: 4px;
    padding: 8px 12px;
    outline: none;
    resize: both;
    line-height: 1.3;
    overflow: hidden;
  `;
  ta.id = '__inea-text-editor';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();

  const commit = () => {
    pushUndo();
    const existingCard = state.cards.find(c => c.id === cardId);
    if (existingCard) {
      existingCard.text = ta.value || ' ';
      // Auto-resize height based on content
      const lineCount = (ta.value.match(/\n/g) || []).length + 1;
      existingCard.height = Math.max(30, lineCount * (existingCard.fontSize || 24) * 1.3 + 20);
      // Update width if resized
      existingCard.width = ta.offsetWidth / state.canvas.zoom;
    }
    ta.remove();
    render();
  };

  const cancel = () => {
    ta.remove();
    render();
  };

  ta.addEventListener('blur', commit);
  ta.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    ev.stopPropagation();
  });
}

// ================================================================
// Volume input overlay
// ================================================================
function showVolumeInput(card, clientX, clientY) {
  const pct = Math.round(card.volume * 100);
  volumeInput.value = pct;
  volumeInput.style.display = 'block';
  volumeInput.style.left = (clientX - 24) + 'px';
  volumeInput.style.top = (clientY - 10) + 'px';
  volumeInput._cardId = card.id;
  volumeInput.focus();
  volumeInput.select();
}

function hideVolumeInput(commit) {
  if (commit && volumeInput._cardId) {
    const card = state.cards.find(c => c.id === volumeInput._cardId);
    if (card) {
      let val = parseInt(volumeInput.value, 10);
      if (isNaN(val)) val = Math.round(card.volume * 100);
      card.volume = Math.max(0, Math.min(100, val)) / 100;
    }
  }
  volumeInput.style.display = 'none';
  volumeInput._cardId = null;
  render();
}

volumeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    hideVolumeInput(true);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideVolumeInput(false);
  }
  e.stopPropagation();
});

volumeInput.addEventListener('blur', () => {
  hideVolumeInput(true);
});

