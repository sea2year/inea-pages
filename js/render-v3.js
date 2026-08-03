// ================================================================
// Rendering: Dot pattern background (Figma "画板页")
// ================================================================
console.log('[inea] render-v3.js v=31');
function renderGrid() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  const dotSpacing = 20; // px in world space

  // Visible world rect
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(w, h);

  const startCol = Math.floor(topLeft.x / dotSpacing);
  const endCol = Math.ceil(bottomRight.x / dotSpacing);
  const startRow = Math.floor(topLeft.y / dotSpacing);
  const endRow = Math.ceil(bottomRight.y / dotSpacing);

  const totalCols = endCol - startCol + 1;
  const totalRows = endRow - startRow + 1;
  const totalDots = totalCols * totalRows;

  // When zoomed far out, the dot grid becomes too dense → lag. Skip if > 8000 dots.
  if (totalDots > 8000) return;

  ctx.fillStyle = 'rgba(0,0,0,0.08)';

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const wx = col * dotSpacing;
      const wy = row * dotSpacing;
      const s = worldToScreen(wx, wy);
      const r = Math.max(1, 1 * state.canvas.zoom);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ================================================================
// Rendering: Cards (called within world-space transform)
// ================================================================
function renderCard(card) {
  const cw = getCardWidth(card);
  const ch = card.type === 'image' ? (card.height || CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT) :
             (card.type === 'video' || card.type === 'composition' || card.type === 'synthesized-video') ? CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT :
             card.type === 'audio' ? 41 : CARD_HEIGHT;
  const x = card.x;
  const y = card.y;
  const r = 10; // Figma cornerRadius
  const lw = 1 / state.canvas.zoom;
  const isSelected = state.selection.cardIds.includes(card.id);
  const isHovered = state.hoveredCardId === card.id;
  const showHandles = isSelected;
  const colors = getCardColors(card);
  const contentY = y + CARD_LABEL_HEIGHT; // thumbnail area starts below label (Figma layout)
  const isVideoLike = card.type === 'video' || card.type === 'synthesized-video';
  // Figma: card body (background, border, clip) is just the thumbnail; label floats above
  const bodyY = isVideoLike ? contentY : y;
  const bodyH = isVideoLike ? CARD_THUMB_HEIGHT : ch;

  // --- Image cards: pure image, no frame ---
  if (card.type === 'image') {
    if (card.thumbStrip) {
      try {
        // Draw image with rounded corners
        ctx.save();
        ctx.beginPath();
        roundRectPath(x, y, cw, ch, 4);
        ctx.clip();
        ctx.drawImage(card.thumbStrip, x, y, cw, ch);
        ctx.restore();
      } catch (e) {
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(x, y, cw, ch);
      }
    } else {
      ctx.fillStyle = '#e0e0e0';
      ctx.fillRect(x, y, cw, ch);
    }
    // Selection outline
    if (isSelected) {
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 2 / state.canvas.zoom;
      ctx.beginPath();
      roundRectPath(x, y, cw, ch, 4);
      ctx.stroke();
    }
    return;
  }

  // Card border color per type (from dynamic color system)
  const cardBorderColor = colors.border;

  // Perf: skip shadows & gradients at extreme zoom levels (invisible)
  const zoom = state.canvas.zoom;
  const skipEffects = zoom < 0.2 || zoom > 3;
  const shadowBlur = skipEffects ? 0 : Math.min(12 / zoom, 24);

  // --- Card background ---
  // Figma gradient fill: per-type tint from color system
  const drawGradient = !skipEffects && (card.type === 'video' || card.type === 'audio' || card.type === 'composition' || card.type === 'synthesized-video');
  if (isSelected) {
    ctx.save();
    if (!skipEffects) {
      ctx.shadowColor = colors.shadow;
      ctx.shadowBlur = shadowBlur;
    }
    // Draw background
    ctx.fillStyle = '#ffffff';
    roundRect(x, bodyY, cw, bodyH, r, true, false);
    if (drawGradient) {
      const grad = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
      grad.addColorStop(0, colors.gradientTop);
      grad.addColorStop(1, colors.gradientBot);
      ctx.fillStyle = grad;
      roundRect(x, bodyY, cw, bodyH, r, true, false);
    }
    // Border — type color, thicker
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = 1.5 / state.canvas.zoom;
    roundRect(x, bodyY, cw, bodyH, r, false, true);
    ctx.restore();
  } else if (isHovered) {
    ctx.fillStyle = '#ffffff';
    roundRect(x, bodyY, cw, bodyH, r, true, false);
    if (drawGradient) {
      const grad = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
      grad.addColorStop(0, colors.gradientTop);
      grad.addColorStop(1, colors.gradientBot);
      ctx.fillStyle = grad;
      roundRect(x, bodyY, cw, bodyH, r, true, false);
    }
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = lw;
    roundRect(x, bodyY, cw, bodyH, r, false, true);

    // Subtle shadow on hover
    if (!skipEffects) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = Math.min(8 / zoom, 16);
      ctx.shadowOffsetY = 2 / zoom;
      ctx.fillStyle = '#ffffff';
      roundRect(x, bodyY, cw, bodyH, r, true, false);
      ctx.restore();
    }
  } else {
    ctx.fillStyle = '#ffffff';
    roundRect(x, bodyY, cw, bodyH, r, true, false);
    if (drawGradient) {
      const grad = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
      grad.addColorStop(0, colors.gradientTop);
      grad.addColorStop(1, colors.gradientBot);
      ctx.fillStyle = grad;
      roundRect(x, bodyY, cw, bodyH, r, true, false);
    }
    ctx.strokeStyle = cardBorderColor;
    ctx.lineWidth = lw;
    roundRect(x, bodyY, cw, bodyH, r, false, true);
  }

  // --- Clip to card body for content (Figma: label floats above, outside clip) ---
  ctx.save();
  ctx.beginPath();
  roundRectPath(x, bodyY, cw, bodyH, r);
  ctx.clip();

  if (card.type === 'audio') {
    // ===== AudioCard (Figma BGM: 41px, waveform content + bottom label row) =====
    const audioContentH = 18;

    // BGM badge (Figma: pink pill, top-right, 31x13)
    const badgeW = 31, badgeH = 13;
    const badgeX = x + cw - badgeW - 5;
    const badgeY = y + 3;
    ctx.fillStyle = colors.badgeFill;
    ctx.strokeStyle = colors.badgeStroke;
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 6px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BGM', badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Waveform bars — fill content area with exaggerated peaks
    const wfPad = 4;
    const barGap = 0.5;
    const barW = 1.5;
    const wfContentW = cw - wfPad * 2 - 12;
    if (card.waveform && card.waveform.length > 0) {
      const peaks = card.waveform;
      const barCount = Math.floor(wfContentW / (barW + barGap));
      const maxBarH = audioContentH - 2;
      const barCenterY = y + (ch - 13) / 2; // centered between top border and separator
      const trimStart = card.trimIn / (card.duration || 1);
      const trimEnd = card.trimOut / (card.duration || 1);
      for (let i = 0; i < barCount; i++) {
        const idxFloat = (i / barCount) * (trimEnd - trimStart) + trimStart;
        const idx = Math.floor(idxFloat * peaks.length);
        const peak = peaks[Math.min(idx, peaks.length - 1)];
        const barH = Math.max(1, peak * maxBarH);
        ctx.fillStyle = 'rgba(247, 152, 170, 0.85)';
        ctx.fillRect(x + wfPad + 12 + i * (barW + barGap), barCenterY - barH / 2, barW, barH);
      }
    } else {
      ctx.strokeStyle = '#f0d0d5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const placeLineY = y + (ch - 13) / 2;
      ctx.moveTo(x + 12, placeLineY);
      ctx.lineTo(x + cw - 12, placeLineY);
      ctx.stroke();
    }

    // Separator + label at card bottom (Figma: name x:12, duration x:73, near bottom)
    const sepY = y + ch - 13;
    const labelTextY = y + ch;
    ctx.strokeStyle = colors.border;
    ctx.lineWidth = 0.5 / state.canvas.zoom;
    ctx.beginPath();
    ctx.moveTo(x + 13, sepY);
    ctx.lineTo(x + cw - 13, sepY);
    ctx.stroke();

    ctx.textBaseline = 'bottom';
    ctx.fillStyle = colors.label;
    ctx.font = `700 ${10 / zoom}px "Inter", system-ui, sans-serif`;
    let _label = card.label;
    const _maxLabelW = cw - 90;
    while (ctx.measureText(_label).width > _maxLabelW && _label.length > 3) {
      _label = _label.slice(0, -4) + '...';
    }
    const _labelX = x + 12;
    ctx.fillText(_label, _labelX, labelTextY);

    if (card.duration > 0) {
      const dur = card.trimOut - card.trimIn;
      const _labelW = ctx.measureText(_label).width;
      ctx.fillStyle = colors.duration;
      ctx.font = `400 8px "Inter", system-ui, sans-serif`;
      ctx.fillText(formatTime(dur), _labelX + _labelW + 8, labelTextY);
    }
    ctx.textBaseline = 'alphabetic';

    // Pink handles (Figma: left/right 11px bars)
    const _handleW = 11;
    ctx.fillStyle = colors.border;
    ctx.fillRect(x, y, _handleW, ch);
    ctx.fillRect(x + cw - _handleW, y, _handleW, ch);

    ctx.restore();

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
    ctx.fillStyle = 'rgba(212,255,0,0.1)';
    ctx.strokeStyle = 'rgba(212,255,0,0.3)';
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
    // ===== Composition card (green gradient bg matching video card style) =====

    // Mini shape thumbnails
    const eb = findEditBoxById(card.editBoxId);
    const shapes = eb ? (eb.shapes || []) : [];
    if (shapes.length > 0) {
      ctx.save();
      const miniScale = 0.3;
      if (eb && eb._shapesWorldCoords) {
        ctx.translate(x + 8 - eb.x * miniScale, y + 8 - eb.y * miniScale);
      } else {
        ctx.translate(x + 8, y + 8);
      }
      ctx.scale(miniScale, miniScale);
      for (const s of shapes.slice(0, 10)) {
        if (s.shapeType === 'rect') {
          ctx.fillStyle = s.fill || 'rgba(213,255,0,0.15)';
          ctx.strokeStyle = s.stroke || '#D4FF00';
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
          ctx.fillStyle = s.fill || 'rgba(213,255,0,0.15)';
          ctx.strokeStyle = s.stroke || '#D4FF00';
          ctx.lineWidth = 1;
          ctx.fill();
          ctx.stroke();
          if (s.angle) ctx.restore();
        } else if (s.shapeType === 'line') {
          ctx.strokeStyle = s.stroke || '#D4FF00';
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
      ctx.fillStyle = '#c8ccc8';
      ctx.font = `11px "Inter", system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('空编辑盒', x + 12, y + CARD_THUMB_HEIGHT / 2);
    }

    // Duration + Label (bottom-left, label first, duration after)
    const cLabelY2 = y + CARD_THUMB_HEIGHT;
    const cLabelX = x + 14;
    ctx.fillStyle = '#000000';
    ctx.font = `700 ${12 / zoom}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    const cLabelName = card.label || '合成';
    ctx.fillText(cLabelName, cLabelX, cLabelY2 + CARD_LABEL_HEIGHT);

    const dur = (card.trimOut || card.totalDuration) - (card.trimIn || card.trimStart || 0);
    const durText = formatTime(dur);
    const cLabelW = ctx.measureText(cLabelName).width;
    ctx.fillStyle = '#000000';
    ctx.font = `400 8px "Inter", system-ui, sans-serif`;
    ctx.fillText(durText, cLabelX + cLabelW + 8, cLabelY2 + CARD_LABEL_HEIGHT);
    ctx.textBaseline = 'alphabetic';

    // Left/Right handles — same as video card: 11px wide, full card height, green
    const handleW = 11;
    ctx.fillStyle = '#D4FF00';
    ctx.fillRect(x, y, handleW, ch);
    ctx.fillRect(x + cw - handleW, y, handleW, ch);

    // "合成" badge (top layer — drawn last, fully green)
    const badgeWc = 31, badgeHc = 13;
    const badgeXc = x + cw - badgeWc - 5;
    const badgeYc = y + 3;
    ctx.fillStyle = '#D4FF00';
    ctx.strokeStyle = '#D4FF00';
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(badgeXc, badgeYc, badgeWc, badgeHc, badgeHc / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.font = '400 6px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('合成', badgeXc + badgeWc / 2, badgeYc + badgeHc / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    ctx.restore(); // end clip (composition)

  } else {
    // ===== Video/BGM card content =====

  // --- Thumbnail strip (crop based on trim range) ---
  const thumbInsetX = 13;
  const thumbInsetY = 2;
  const thumbAreaH = CARD_THUMB_HEIGHT;
  const thumbX = x + thumbInsetX;
  const thumbY = contentY + thumbInsetY;
  const thumbW = cw - thumbInsetX * 2;
  const thumbH = thumbAreaH - thumbInsetY * 2;

  // Recreate frameImage from dataURL if lost (e.g., after undo/redo)
  if (card.isFreezeFrame && card.frameImageDataURL && (!card.frameImage || !card.frameImage.src)) {
    card.frameImage = new Image();
    card.frameImage.src = card.frameImageDataURL;
  }

  if (card.isFreezeFrame && card.frameImage) {
    // Freeze frame: draw the captured frame image covering the thumb area
    try {
      ctx.drawImage(card.frameImage, thumbX, thumbY, thumbW, thumbH);
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    }
  } else if (card.thumbStrip && card.duration > 0) {
    try {
      const stripW = card.thumbStrip.width;
      const fracIn = card.trimIn / card.duration;
      const fracOut = card.trimOut / card.duration;
      const srcX = stripW * fracIn;
      const srcW = stripW * (fracOut - fracIn);
      if (srcW > 0) {
        ctx.drawImage(card.thumbStrip, srcX, 0, srcW, card.thumbStrip.height, thumbX, thumbY, thumbW, thumbH);
      } else {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
      }
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    }
  } else if (card.thumbStrip) {
    // fallback: still use cropped if possible, otherwise scale full strip
    try {
      ctx.drawImage(card.thumbStrip, thumbX, thumbY, thumbW, thumbH);
    } catch (e) {
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    }
  } else {
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH);
    ctx.fillStyle = '#999';
    ctx.font = `400 12px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText('生成缩略图...', thumbX + 12, thumbY + thumbH / 2);
  }

  // --- Waveform area (audio/BGM only; video cards match Figma: no waveform) ---
  const wfY = y + CARD_THUMB_HEIGHT;
  const wfH = (card.type === 'video' || card.type === 'composition' || card.type === 'synthesized-video' || card.type === 'image') ? 0 : CARD_WAVEFORM_HEIGHT;

  if (card.type !== 'video' && card.type !== 'composition' && card.type !== 'synthesized-video' && card.type !== 'image') {
    const wfPad = 3;

    // Waveform background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(x, wfY, cw, wfH);

    // Waveform bars (full width, no volume slider)
    if (card.waveform && card.waveform.length > 0) {
      const peaks = card.waveform;
      const barCount = Math.min(peaks.length, Math.floor((cw - wfPad * 2) / 2));
      const barW = (cw - wfPad * 2) / barCount;
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
          x + wfPad + i * barW,
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
          if (mx < x + 2 || mx > x + cw - 2) continue;
          const flagY = contentY + CARD_THUMB_HEIGHT;
          const flagH = 10;
          ctx.fillStyle = marker.color;
          ctx.beginPath();
          ctx.moveTo(mx, flagY);
          ctx.lineTo(mx - 5, flagY - flagH);
          ctx.lineTo(mx + 5, flagY - flagH);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.arc(mx, flagY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // --- Left/Right handles (Figma: inside clip, on top of content) ---
  if (card.type === 'video' || card.type === 'audio' || card.type === 'synthesized-video' || card.type === 'image') {
    const handleW = 11;
    ctx.fillStyle = colors.border;
    ctx.fillRect(x, bodyY, handleW, bodyH);
    ctx.fillRect(x + cw - handleW, bodyY, handleW, bodyH);
  }

  ctx.restore();
  } // end video card content

  // --- Video label (Figma: above card body, outside clip) ---
  if (card.type === 'video' || card.type === 'synthesized-video') {
    const vLabelY = y;
    ctx.fillStyle = colors.label;
    ctx.font = `700 ${12 / zoom}px "Inter", system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';

    const vLabelTextX = x + 14;
    const vLabelTextY = vLabelY + CARD_LABEL_HEIGHT;
    const vMaxLabelW = cw - 12 - (cw > 140 ? 50 : 0);

    let vLabel = card.label;
    while (ctx.measureText(vLabel).width > vMaxLabelW && vLabel.length > 3) {
      vLabel = vLabel.slice(0, -4) + '...';
    }
    ctx.fillText(vLabel, vLabelTextX, vLabelTextY);

    // Duration (positioned after label text to avoid overlap)
    if (cw > 140 && card.duration > 0) {
      const dur = card.trimOut - card.trimIn;
      const vLabelW = ctx.measureText(vLabel).width;
      ctx.fillStyle = colors.duration;
      ctx.font = `400 8px "Inter", system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(formatTime(dur), vLabelTextX + vLabelW + 8, vLabelTextY);
      ctx.textAlign = 'start';
    }

    ctx.textBaseline = 'alphabetic';

    // Video type badge (top-right, same y as label)
    const vBadgeW = 40, vBadgeH = 13;
    const vBadgeX = x + cw - vBadgeW - 5;
    const vBadgeY = vLabelY + 2;
    ctx.fillStyle = colors.badgeFill;
    ctx.strokeStyle = colors.badgeStroke;
    ctx.lineWidth = 1 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(vBadgeX, vBadgeY, vBadgeW, vBadgeH, vBadgeH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '400 6px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Video', vBadgeX + vBadgeW / 2, vBadgeY + vBadgeH / 2);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }


  // --- Trim handles (only for video/audio, outside clip) ---
  if (showHandles && (card.type === 'video' || card.type === 'audio' || card.type === 'bgm' || card.type === 'composition' || card.type === 'synthesized-video' || card.type === 'image')) {
    const handleW = 6 / state.canvas.zoom;
    const handleAlpha = isHovered && !isSelected ? 0.6 : 1;
    // Handle color per card type (dynamic via accentColor)
    const handleColor = colors.handleColor(handleAlpha);

    // Left trim handle
    ctx.fillStyle = handleColor;
    ctx.beginPath();
    ctx.moveTo(x, bodyY + r);
    ctx.lineTo(x + handleW, bodyY + r - 3 / state.canvas.zoom);
    ctx.lineTo(x + handleW, bodyY + r + 3 / state.canvas.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x, bodyY + r, handleW, bodyH - r * 2);

    // Right trim handle
    ctx.beginPath();
    ctx.moveTo(x + cw, bodyY + r);
    ctx.lineTo(x + cw - handleW, bodyY + r - 3 / state.canvas.zoom);
    ctx.lineTo(x + cw - handleW, bodyY + r + 3 / state.canvas.zoom);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x + cw - handleW, bodyY + r, handleW, bodyH - r * 2);
  }


  // Anchor points — only on video/synthesized-video cards.
  // Visibility: hidden by default. Show when card is selected OR in connecting mode.
  if (card.type === 'video' || card.type === 'synthesized-video') {
  const ha = state.hoveredAnchor;
  const isConnecting = state.interaction.mode === 'connecting';
  const isSelected = state.selection.cardIds.includes(card.id);
  const shouldShowAnchors = isSelected || isConnecting;
  const anchorR = ANCHOR_RADIUS / state.canvas.zoom;
  const isConnSource = isConnecting &&
  state.interaction.connectingFrom &&
  state.interaction.connectingFrom.cardId === card.id;

  // Left + right anchors (circles) — only when shouldShowAnchors
  if (shouldShowAnchors) {

  for (const side of ['left', 'right']) {
  const isHoveredAnchor = ha && ha.cardId === card.id && ha.side === side;
  const anchor = getAnchorPos(card, side);
  const r = isHoveredAnchor ? anchorR * 1.4 : anchorR;

  // Outer glow (dynamic accent color for video, side-based for legacy)
  if (isHoveredAnchor || (isConnSource && state.interaction.connectingFrom.side === side)) {
  const glowColor = card.accentColor
    ? `rgba(${card.accentColor.r},${card.accentColor.g},${card.accentColor.b},0.25)`
    : (side === 'right' ? 'rgba(130,110,220,0.25)' : 'rgba(212,255,0,0.25)');
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, r + 4 / state.canvas.zoom, 0, Math.PI * 2);
  ctx.fill();
  }

  // Inner dot (dynamic accent on hover, card border color for default)
  ctx.fillStyle = isHoveredAnchor ? colors.border : '#ffffff';
  ctx.strokeStyle = colors.border;
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
  } // end for (left/right)
  } // end shouldShowAnchors

  // Top anchor — diamond shape that follows the playhead (group mode only).
  const keyframeConnsFrom = state.connections.filter(c => c.type === 'keyframe' && c.fromCardId === card.id);
  const isConnectingMode = state.interaction.mode === 'connecting';
  const pb = state.playback;

  // Determine whether group playback is active on this specific card
  const isPlaybackOnCard = pb && (pb.isPlaying || pb.pausedAt > 0) &&
    pb.playbackMode === 'group' && pb._groupPlaybackGroup &&
    pb._groupPlaybackGroup.cardIds.includes(card.id) &&
    pb._groupPlayheadX != null &&
    pb._groupPlayheadX >= card.x && pb._groupPlayheadX < card.x + getCardWidth(card);

  // Determine default fromPosition: follow playhead if on this card, else center
  let defaultFromPos = 0.5;
  if (isPlaybackOnCard) {
    const cw2 = getCardWidth(card);
    defaultFromPos = cw2 > 0 ? (pb._groupPlayheadX - card.x) / cw2 : 0.5;
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
  ctx.fillStyle = 'rgba(212,255,0,0.25)';
  ctx.beginPath();
  const gr = hw + 4 / state.canvas.zoom;
  ctx.moveTo(anchor.x, anchor.y - gr);
  ctx.lineTo(anchor.x + gr, anchor.y);
  ctx.lineTo(anchor.x, anchor.y + gr);
  ctx.lineTo(anchor.x - gr, anchor.y);
  ctx.closePath();
  ctx.fill();
  }

  // Diamond shape — green for keyframe (Figma: #D4FF00), subtle when permanent non-interactive
  const isHighlighted = isHoveredAnchor || isConnSel;
  ctx.fillStyle = isHighlighted ? '#D4FF00' : 'rgba(212,255,0,0.35)';
  ctx.strokeStyle = isHighlighted ? '#D4FF00' : 'rgba(212,255,0,0.5)';
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
  ctx.strokeStyle = '#D4FF00';
  ctx.lineWidth = 1 / state.canvas.zoom;
  ctx.setLineDash([3 / state.canvas.zoom, 2 / state.canvas.zoom]);
  ctx.beginPath();
  ctx.moveTo(anchor.x, anchor.y - hw);
  ctx.lineTo(anchor.x, thumbY + thumbH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Thumbnail box
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = '#D4FF00';
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
  ctx.fillStyle = '#D4FF00';
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
    const minOff = BEZIER_OFFSET / state.canvas.zoom;
    const offY = Math.max(minOff, Math.abs(p3.y - p0.y) * 0.35);
    const minY = Math.min(p0.y, p3.y);
    const p1 = { x: p0.x, y: minY - offY };
    const p2 = { x: p3.x, y: minY - offY };
    return { p0, p1, p2, p3 };
  }

  const minOff = BEZIER_OFFSET / state.canvas.zoom;
  const offX = Math.max(minOff, Math.abs(p3.x - p0.x) * 0.35);
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
  if (group.collapsed) {
    return { x: group.x, y: group.y, w: group.width, h: group.height, titleH: group.height };
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
  ctx.strokeStyle = highlight ? '#b3d900' : '#D4FF00';
  ctx.lineWidth = highlight ? (1.5 / state.canvas.zoom) : (1 / state.canvas.zoom);
  ctx.setLineDash([4 / state.canvas.zoom, 3 / state.canvas.zoom]);
  ctx.beginPath();
  ctx.moveTo(x, thumbY + thumbH);
  ctx.lineTo(x, cardY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Thumbnail background + border
  ctx.fillStyle = '#1a1a1a';
  ctx.strokeStyle = highlight ? '#b3d900' : '#555';
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
  ctx.fillStyle = highlight ? '#b3d900' : '#D4FF00';
  ctx.strokeStyle = highlight ? '#b3d900' : '#D4FF00';
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
    ctx.shadowColor = 'rgba(212,255,0,0.4)';
    ctx.shadowBlur = 8 / state.canvas.zoom;
    ctx.strokeStyle = '#b3d900';
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

function renderGroup(group) {
  const isHovered = state.hoveredGroupId === group.id;
  const isSelected = state.selection.groupIds.includes(group.id);
  const isDropTarget = state.interaction.dropTargetGroupId === group.id;
  // Drill-down: group is selected but user has clicked into individual cards
  const hasCardSelected = state.selection.cardIds.some(cid => group.cardIds.includes(cid));
  const isDrillDown = isSelected && hasCardSelected;
  if (group.collapsed) {
    const gx = group.x;
    const gy = group.y;
    const gw = group.width || 200;
    const gh = group.height || 60;

    const gAlpha = isDropTarget ? 0.18 : (isDrillDown ? 0.04 : (isSelected ? 0.24 : (isHovered ? 0.10 : 0.06)));
    const gStrokeAlpha = isDropTarget ? 0.75 : (isDrillDown ? 0.2 : (isSelected ? 0.9 : (isHovered ? 0.5 : 0.35)));
    ctx.fillStyle = `rgba(100,100,255,${gAlpha})`;
    ctx.strokeStyle = `rgba(100,100,255,${gStrokeAlpha})`;
    ctx.lineWidth = (isSelected ? 2.5 : (isHovered ? 2 : 1.5)) / state.canvas.zoom;
    roundRect(gx, gy, gw, gh, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.font = '500 12px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(group.name || 'Group', gx + 10, gy + gh / 2 - 4);

    const memberCards = group.cardIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean);
    const totalDur = memberCards.reduce((s, c) => s + (c.trimOut - c.trimIn), 0);
    ctx.fillStyle = '#999';
    ctx.font = '400 10px "Inter", system-ui, sans-serif';
    ctx.fillText(`${memberCards.length}段 · ${Math.round(totalDur)}秒`, gx + 10, gy + gh / 2 + 12);
  } else {
    const frame = getGroupFrame(group);
    if (!frame) return;
    const frameX = frame.x, frameY = frame.y, frameW = frame.w, frameH = frame.h;

    // Background
    const gAlpha2 = isDropTarget ? 0.14 : (isDrillDown ? 0.02 : (isSelected ? 0.16 : (isHovered ? 0.05 : 0.03)));
    const gStrokeAlpha2 = isDropTarget ? 0.7 : (isDrillDown ? 0.15 : (isSelected ? 0.85 : (isHovered ? 0.4 : 0.25)));
    ctx.fillStyle = `rgba(100,100,255,${gAlpha2})`;
    ctx.strokeStyle = `rgba(100,100,255,${gStrokeAlpha2})`;
    ctx.lineWidth = (isSelected || isDropTarget ? 2.5 : (isHovered ? 2 : 1.5)) / state.canvas.zoom;
    ctx.setLineDash([]);
    roundRect(frameX, frameY, frameW, frameH, 10);
    ctx.fill();
    ctx.stroke();

    // Title bar background
    const titleAlpha = isDrillDown ? 0.03 : (isSelected ? 0.18 : (isHovered ? 0.12 : 0.06));
    ctx.fillStyle = `rgba(100,100,255,${titleAlpha})`;
    ctx.beginPath();
    ctx.moveTo(frameX + 10, frameY);
    ctx.lineTo(frameX + frameW - 10, frameY);
    ctx.quadraticCurveTo(frameX + frameW, frameY, frameX + frameW, frameY + 10);
    ctx.lineTo(frameX + frameW, frameY + 22);
    ctx.lineTo(frameX, frameY + 22);
    ctx.lineTo(frameX, frameY + 10);
    ctx.quadraticCurveTo(frameX, frameY, frameX + 10, frameY);
    ctx.closePath();
    ctx.fill();

    // Collapse/expand toggle dot
    ctx.fillStyle = isHovered ? '#4488ff' : '#999';
    ctx.beginPath();
    ctx.arc(frameX + 10, frameY + 11, 4, 0, Math.PI * 2);
    ctx.fill();

    // Title
    ctx.fillStyle = '#555';
    ctx.font = '500 12px "Inter", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(group.name || 'Group', frameX + 22, frameY + 11);
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
    ctx.strokeStyle = 'rgba(212,255,0,0.35)';
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
      ctx.fillStyle = '#D4FF00';
      ctx.beginPath();
      ctx.arc(dotX, tlY, dotR, 0, Math.PI * 2);
      ctx.fill();

      // Selected/highlighted chain dot
      if (chain[i] === state.selection.editBoxId) {
        ctx.strokeStyle = '#D4FF00';
        ctx.lineWidth = 2 / z;
        ctx.beginPath();
        ctx.arc(dotX, tlY, dotR + 3 / z, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Red progress indicator during eb-chain playback
    const pb = state.playback;
    if (pb && pb.playbackMode === 'eb-chain' && pb._ebChain) {
      const chainData = pb._ebChain;
      const progress = pb.isPlaying
        ? (pb._ebChainProgress != null ? pb._ebChainProgress : 0)
        : (chainData._currentInterp != null ? (pb._ebChainProgress || 0) : 0);
      const progX = tlStart + (tlEnd - tlStart) * Math.max(0, Math.min(1, progress));

      // Glow
      ctx.fillStyle = 'rgba(255,51,51,0.25)';
      ctx.beginPath();
      ctx.arc(progX, tlY, 10 / z, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#FF3333';
      ctx.beginPath();
      ctx.arc(progX, tlY, 5 / z, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = '#FF3333';
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      ctx.arc(progX, tlY, 7 / z, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Store timeline bounds for hit testing
    state._ebTimelines = state._ebTimelines || {};
    state._ebTimelines[chain[0]] = { x: tlStart, y: tlY - 8 / z, w: tlEnd - tlStart, h: 16 / z, chain: chain, tlY: tlY, dots: chain.map(id => { const e = findEditBoxById(id); return { editBoxId: id, x: e ? e.x + e.width / 2 : 0, y: tlY, r: 8 / z }; }) };

    // Store progress dot position for hit-testing
    if (pb && pb.playbackMode === 'eb-chain' && pb._ebChain) {
      const chainData = pb._ebChain;
      const progress = pb._ebChainProgress != null ? pb._ebChainProgress : 0;
      const progX = tlStart + (tlEnd - tlStart) * Math.max(0, Math.min(1, progress));
      state._ebTimelines[chain[0]].progDot = { x: progX, y: tlY, r: 12 / z };
    }
  }
}

// ================================================================
// Rendering: Connections (bezier curves + badges)
// ================================================================
function lightenColor(color, amount = 0.3) {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!match) return color;
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return a === 1 ? `rgb(${lr},${lg},${lb})` : `rgba(${lr},${lg},${lb},${a})`;
}

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

  const fromCard = state.cards.find(c => c.id === conn.fromCardId);
  const toCard = state.cards.find(c => c.id === conn.toCardId);

  // Keyframe connection: green dashed (Figma: #D4FF00), vertical bezier
  if (isKeyframe) {
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

    // Midpoint badge
    const mid = bezierPoint(0.5, p0, p1, p2, p3);
    const badgeW = 44;
    const badgeH = 18;
    const badgeR = 9;
    const labelFontSize = 11;

    ctx.fillStyle = highlight ? '#b3d900' : '#ffffff';
    ctx.strokeStyle = highlight ? '#b3d900' : '#D4FF00';
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = highlight ? '#ffffff' : '#808000';
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

  // Tween connection: dashed, gradient from left card to right card, no arrow
  if (isTween) {
    const fromColors = fromCard ? getCardColors(fromCard) : null;
    const toColors = toCard ? getCardColors(toCard) : null;
    const gradFrom = fromColors ? fromColors.border : 'rgb(101,84,203)';
    const gradTo = toColors ? toColors.border : 'rgb(101,84,203)';

    const lw = highlight ? (2.5 / state.canvas.zoom) : (1.5 / state.canvas.zoom);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.setLineDash([8 / state.canvas.zoom, 5 / state.canvas.zoom]);

    const tweenGrad = ctx.createLinearGradient(p0.x, p0.y, p3.x, p3.y);
    tweenGrad.addColorStop(0, highlight ? lightenColor(gradFrom) : gradFrom);
    tweenGrad.addColorStop(1, highlight ? lightenColor(gradTo) : gradTo);
    ctx.strokeStyle = tweenGrad;

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

    const midColor = toColors ? toColors.border : 'rgb(101,84,203)';
    ctx.fillStyle = highlight ? lightenColor(midColor) : '#ffffff';
    ctx.strokeStyle = highlight ? lightenColor(midColor) : midColor;
    ctx.lineWidth = 1.2 / state.canvas.zoom;
    ctx.beginPath();
    roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = highlight ? '#ffffff' : midColor;
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

  // Gradient from left card color to right card color
  const fromColors = fromCard ? getCardColors(fromCard) : null;
  const toColors = toCard ? getCardColors(toCard) : null;
  const gradFrom = fromColors ? fromColors.border : 'rgb(101,84,203)';
  const gradTo = toColors ? toColors.border : 'rgb(101,84,203)';

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
  const lineGrad = ctx.createLinearGradient(p0.x, p0.y, baseX, baseY);
  lineGrad.addColorStop(0, highlight ? lightenColor(gradFrom) : gradFrom);
  lineGrad.addColorStop(1, highlight ? lightenColor(gradTo) : gradTo);
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, baseX, baseY);
  ctx.stroke();

  // Arrowhead triangle (from tip back to base)
  if (alen > 0.01) {
    ctx.fillStyle = highlight ? lightenColor(gradTo) : gradTo;
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
  const badgeR = 2 / state.canvas.zoom;

  // Badge background — use right card color
  const badgeColor = toColors ? toColors.badgeFill : 'rgb(202, 193, 254)';
  const badgeStroke = toColors ? toColors.badgeStroke : 'rgb(101,84,203)';
  ctx.fillStyle = highlight ? lightenColor(badgeStroke) : badgeColor;
  ctx.strokeStyle = highlight ? lightenColor(badgeStroke) : badgeStroke;
  ctx.lineWidth = 1.2 / state.canvas.zoom;
  ctx.beginPath();
  roundRectPath(mid.x - badgeW / 2, mid.y - badgeH / 2, badgeW, badgeH, badgeR);
  ctx.fill();
  ctx.stroke();

  // Badge text
  const label = TRANSITION_LABELS[conn.transition] || '切';
  ctx.fillStyle = highlight ? '#ffffff' : badgeStroke;
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
  let sourceCard = null;

  // Get source position — from card or marker card
  if (cf.cardId) {
    const card = state.cards.find(c => c.id === cf.cardId);
    if (!card) return;
    sourceCard = card;
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
    const minOff = BEZIER_OFFSET / state.canvas.zoom;
    const offY = Math.max(minOff, Math.abs(p3.y - p0.y) * 0.35);
    const minY = Math.min(p0.y, p3.y);
    p1 = { x: p0.x, y: minY - offY };
    p2 = { x: p3.x, y: minY - offY };
  } else {
    const minOff = BEZIER_OFFSET / state.canvas.zoom;
    const offX = Math.max(minOff, Math.abs(p3.x - p0.x) * 0.35);
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

  // Keyframe (top) connections use green; others use source card color
  let previewColor;
  if (isTopSide) {
    previewColor = 'rgba(212,255,0,0.45)';
  } else if (sourceCard) {
    const srcColors = getCardColors(sourceCard);
    const rgb = srcColors.border.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    previewColor = rgb ? `rgba(${rgb[1]},${rgb[2]},${rgb[3]},0.45)` : 'rgba(130,110,220,0.45)';
  } else {
    previewColor = 'rgba(130,110,220,0.45)';
  }
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
    let arrowColor;
    if (sourceCard) {
      const srcColors = getCardColors(sourceCard);
      const rgb = srcColors.border.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      arrowColor = rgb ? `rgba(${rgb[1]},${rgb[2]},${rgb[3]},0.5)` : 'rgba(130,110,220,0.5)';
    } else {
      arrowColor = 'rgba(130,110,220,0.5)';
    }
    ctx.fillStyle = arrowColor;
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
        // Left/right anchor hit test (only when selected or connecting)
        if (state.selection.cardIds.includes(card.id) || state.interaction.mode === 'connecting') {
        for (const side of ['left', 'right']) {
          const anchor = getAnchorPos(card, side);
          const dx = wx - anchor.x;
          const dy = wy - anchor.y;
          if (Math.sqrt(dx * dx + dy * dy) <= anchorHitWorld) {
            return { type: 'anchor', cardId: card.id, side };
          }
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
        // Composition label region (bottom strip)
        if (wy >= card.y + CARD_THUMB_HEIGHT) {
          return { type: 'card-label', cardId: card.id };
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
        // Left/right anchors (only when selected or connecting)
        if (state.selection.cardIds.includes(card.id) || state.interaction.mode === 'connecting') {
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

      // Video label region (below top anchor edge, within CARD_LABEL_HEIGHT strip)
      if ((card.type === 'video' || card.type === 'synthesized-video') &&
          wy >= card.y + 4 / zoom && wy <= card.y + CARD_LABEL_HEIGHT) {
        return { type: 'card-label', cardId: card.id };
      }

      // Playhead hit test (priority over volume and card-body click)
      const pb = state.playback;
      if ((pb.isPlaying || pb.pausedAt > 0) && pb._playheadCardId === card.id && pb._playheadX != null) {
        const phHitW = 10 / state.canvas.zoom;
        if (wx >= pb._playheadX - phHitW && wx <= pb._playheadX + phHitW) {
          return { type: 'playhead', cardId: card.id };
        }
      }

      // Volume slider area (left side, vertical)?
      const wfY = card.type === 'audio' ? card.y + 6 : card.y + CARD_THUMB_HEIGHT;
      const wfH = card.type === 'audio' ? (CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT - 18) : CARD_WAVEFORM_HEIGHT;
      const volAreaW = 22; // width of volume control area on left

      if (wx >= card.x && wx <= card.x + volAreaW && wy >= wfY && wy <= wfY + wfH) {
        // Check if clicking on the percentage text (to edit)
        if (card._volPctBounds) {
          const b = card._volPctBounds;
          if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) {
            return { type: 'volume-text', cardId: card.id };
          }
        }
        return { type: 'volume', cardId: card.id };
      }
      // Audio label region (bottom strip, 13px tall)
      if (card.type === 'audio' && wy >= card.y + ch - 13) {
        return { type: 'card-label', cardId: card.id };
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
    // Left/right anchors (only when selected or connecting)
    if (state.selection.cardIds.includes(card.id) || state.interaction.mode === 'connecting') {
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

  // Check timeline progress dot first (higher priority)
  if (state._ebTimelines) {
    for (const key of Object.keys(state._ebTimelines)) {
      const tl = state._ebTimelines[key];
      if (!tl) continue;
      // Progress dot (red scrubber) — hit-test with larger radius
      if (tl.progDot) {
        const pdx = wx - tl.progDot.x, pdy = wy - tl.progDot.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) <= tl.progDot.r) {
          return { type: 'timeline-progress', timelineKey: key };
        }
      }
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
  const ebR = 10; // Figma cornerRadius
  const isSelected = state.selection.editBoxId === eb.id || (state.selection.editBoxIds || []).includes(eb.id);
  const isHovered = state.hoveredEditBoxId === eb.id;
  const isActive = state.interaction.activeEditBoxId === eb.id;

  // --- White background (Figma: rgb(249, 249, 249)) ---
  ctx.fillStyle = '#f9f9f9';
  roundRect(eb.x, eb.y, eb.width, eb.height, ebR, true, false);

  // --- State glow ---
  if (isActive) {
    // Edit mode — prominent green glow + solid border
    ctx.save();
    ctx.shadowColor = 'rgba(212,255,0,0.35)';
    ctx.shadowBlur = 20 / z;
    roundRect(eb.x, eb.y, eb.width, eb.height, ebR, false, false);
    ctx.fillStyle = 'rgba(212,255,0,0.08)';
    roundRect(eb.x, eb.y, eb.width, eb.height, ebR, true, false);
    ctx.restore();
  } else if (isSelected) {
    // Selected — visible green highlight, draggable
    ctx.save();
    ctx.shadowColor = 'rgba(212,255,0,0.2)';
    ctx.shadowBlur = 14 / z;
    roundRect(eb.x, eb.y, eb.width, eb.height, ebR, false, false);
    ctx.fillStyle = 'rgba(212,255,0,0.05)';
    roundRect(eb.x, eb.y, eb.width, eb.height, ebR, true, false);
    ctx.restore();
  } else if (isHovered) {
    ctx.fillStyle = 'rgba(212,255,0,0.03)';
    roundRect(eb.x, eb.y, eb.width, eb.height, ebR, true, false);
  }

  // --- Border (Figma: #88C405, strokeWeight 3) ---
  ctx.save();
  ctx.strokeStyle = '#88C405';
  ctx.lineWidth = isActive ? 3 / z : (isSelected ? 2.5 / z : 1.5 / z);
  ctx.setLineDash(isActive ? [] : (isSelected ? [6 / z, 3 / z] : [8 / z, 4 / z]));
  roundRect(eb.x, eb.y, eb.width, eb.height, ebR, false, true);
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

      ctx.fillStyle = '#88C405';
      ctx.strokeStyle = '#88C405';
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
        ctx.shadowColor = 'rgba(136,196,5,0.5)';
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

      ctx.fillStyle = `rgba(136,196,5,${alpha})`;
      ctx.strokeStyle = `rgba(136,196,5,${alpha})`;
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
        ctx.shadowColor = 'rgba(136,196,5,0.5)';
        ctx.shadowBlur = 10 / z;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // --- Clip to edit box for shape rendering ---
  ctx.save();
  ctx.beginPath();
  roundRectPath(eb.x, eb.y, eb.width, eb.height, ebR);
  ctx.clip();

  // When active, Fabric handles non-line shape rendering — only render lines on 2D canvas
  if (!isActive) {
    // Shapes are in world coords — draw directly (world transform already applied by render pipeline)
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
        ctx.strokeStyle = s.stroke || '#88C405';
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
  } else {
    // Active: still render line shapes on 2D canvas (Fabric doesn't handle lines)
    // Lines are in world coords — draw directly
    for (const s of (eb.shapes || [])) {
      if (s.shapeType === 'line') {
        ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
        const lcx = (s.x1 + s.x2) / 2;
        const lcy = (s.y1 + s.y2) / 2;
        if (s.angle) { ctx.save(); ctx.translate(lcx, lcy); ctx.rotate(s.angle * Math.PI / 180); ctx.translate(-lcx, -lcy); }
        ctx.strokeStyle = s.stroke || '#88C405';
        ctx.lineWidth = s.strokeWidth || 2;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        if (s.angle) ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore(); // end clip

  // --- Top-left label (Figma: "box 1", Inter Bold 12, black) ---
  const ebName = eb.name || ('box ' + state.editBoxes.indexOf(eb));
  ctx.fillStyle = '#000000';
  ctx.font = `700 12px "Inter", system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(ebName, eb.x + 12, eb.y + 9);
  ctx.textBaseline = 'alphabetic';

  // --- Top-right badge (Figma: green pill, 31x13, "Box") ---
  const eBadgeW = 31, eBadgeH = 13;
  const eBadgeX = eb.x + (eb.width || 499) - eBadgeW - 5;
  const eBadgeY = eb.y + 5;
  ctx.fillStyle = 'rgba(136,196,5,0.23)';
  ctx.strokeStyle = '#88C405';
  ctx.lineWidth = 1 / state.canvas.zoom;
  ctx.beginPath();
  roundRectPath(eBadgeX, eBadgeY, eBadgeW, eBadgeH, eBadgeH / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#000000';
  ctx.font = `400 6px "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Box', eBadgeX + eBadgeW / 2, eBadgeY + eBadgeH / 2);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
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

  // Fill background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  // Migrate any edit box shapes to world coords before rendering
  for (const eb of state.editBoxes) {
    if (!eb._shapesWorldCoords) {
      _migrateEditBoxShapesToWorld(eb);
    }
  }

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
    if (!collapsedCardIds.has(card.id)) renderCard(card);
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
  // empty hint removed

  // Update UI
  updateStatusBar();
  updateZoomBadge();
  renderLayerList();
  updateInspector();
  renderTransformOverlay();
}

function updateStatusBar() {
  if (!statusCards || !statusHint) return;
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
// Card label inline editing (double-click on label area)
// ================================================================
function startCardLabelEdit(cardId) {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  const isVideo = card.type === 'video' || card.type === 'synthesized-video';
  const isAudio = card.type === 'audio';
  const isComp = card.type === 'composition';
  if (!isVideo && !isAudio && !isComp) return;

  const ch = isAudio ? 41 : CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT;

  // Remove any existing editor first
  const prev = document.getElementById('__inea-label-editor');
  if (prev) prev.remove();

  const baseFontSize = isAudio ? 10 : 12;
  const baseHeight = isAudio ? 14 : CARD_LABEL_HEIGHT;

  const el = document.createElement('div');
  el.id = '__inea-label-editor';
  el.contentEditable = 'true';
  el.textContent = card.label || '';
  const textW = Math.max(40, ((el.textContent || '').length || 1) * baseFontSize * 0.6 + 20);
  el.style.cssText = ''
    + 'position:fixed;z-index:200;'
    + 'font-family:"Inter",system-ui,sans-serif;font-weight:700;'
    + 'color:#000;background:#fff;'
    + 'border:1px solid #aaa;outline:none;'
    + 'overflow:hidden;white-space:nowrap;box-sizing:border-box;'
    + 'line-height:' + baseHeight + 'px;'
    + 'font-size:' + baseFontSize + 'px;'
    + 'height:' + baseHeight + 'px;'
    + 'width:' + textW + 'px;'
    + 'padding:2px 4px;border-radius:3px;';
  document.body.appendChild(el);
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const reposition = () => {
    const s = worldToScreen(card.x, card.y);
    let labelScreenY;
    if (isVideo) {
      labelScreenY = s.y;
    } else if (isAudio) {
      labelScreenY = s.y + (ch - 13) * state.canvas.zoom;
    } else {
      labelScreenY = s.y + CARD_THUMB_HEIGHT * state.canvas.zoom;
    }
    el.style.left = (s.x + 14 * state.canvas.zoom) + 'px';
    el.style.top = labelScreenY + 'px';
  };
  reposition();

  let _rafId;
  const _rafLoop = () => {
    reposition();
    _rafId = requestAnimationFrame(_rafLoop);
  };
  _rafId = requestAnimationFrame(_rafLoop);

  const cleanup = () => {
    cancelAnimationFrame(_rafId);
    el.remove();
  };

  const commit = () => {
    const existingCard = state.cards.find(c => c.id === cardId);
    if (existingCard && el.textContent.trim()) {
      pushUndo();
      existingCard.label = el.textContent.trim();
    }
    cleanup();
    render();
  };

  const cancel = () => {
    cleanup();
    render();
  };

  el.addEventListener('blur', commit);
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    ev.stopPropagation();
  });
  el.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    canvasWrap.dispatchEvent(new WheelEvent('wheel', {
      deltaX: ev.deltaX, deltaY: ev.deltaY, deltaMode: ev.deltaMode,
      clientX: ev.clientX, clientY: ev.clientY,
      ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey,
    }));
  }, { passive: false });
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

