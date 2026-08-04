// ================================================================
// Playback Engine
// ================================================================

// ---- Sequence building ----

const MIN_TRANSITION_GAP = 25; // px, minimum gap between connected cards (0.5s)
const MAX_TRANSITION_GAP = 250; // px, maximum gap between connected cards (5s)

function _recalcTransitionDurations(movedCardIds) {
  for (const conn of state.connections) {
    if (conn.type === 'keyframe') continue;
    if (conn.transition === 'cut') continue;
    const fromCard = state.cards.find(c => c.id === conn.fromCardId);
    const toCard = state.cards.find(c => c.id === conn.toCardId);
    if (!fromCard || !toCard) continue;
    const fromMoved = movedCardIds.has(conn.fromCardId);
    const toMoved = movedCardIds.has(conn.toCardId);
    if (!fromMoved && !toMoved) continue;

    let gap;
    if (conn.fromSide === 'right') {
      gap = toCard.x - (fromCard.x + getCardWidth(fromCard));
      if (fromMoved !== toMoved) {
        if (gap < MIN_TRANSITION_GAP) {
          if (toMoved) {
            toCard.x = fromCard.x + getCardWidth(fromCard) + MIN_TRANSITION_GAP;
          } else {
            fromCard.x = toCard.x - getCardWidth(fromCard) - MIN_TRANSITION_GAP;
          }
          gap = MIN_TRANSITION_GAP;
        } else if (gap > MAX_TRANSITION_GAP) {
          if (toMoved) {
            toCard.x = fromCard.x + getCardWidth(fromCard) + MAX_TRANSITION_GAP;
          } else {
            fromCard.x = toCard.x - getCardWidth(fromCard) - MAX_TRANSITION_GAP;
          }
          gap = MAX_TRANSITION_GAP;
        }
      }
    } else {
      gap = fromCard.x - (toCard.x + getCardWidth(toCard));
      if (fromMoved !== toMoved) {
        if (gap < MIN_TRANSITION_GAP) {
          if (toMoved) {
            toCard.x = fromCard.x - getCardWidth(toCard) - MIN_TRANSITION_GAP;
          } else {
            fromCard.x = toCard.x + getCardWidth(toCard) + MIN_TRANSITION_GAP;
          }
          gap = MIN_TRANSITION_GAP;
        } else if (gap > MAX_TRANSITION_GAP) {
          if (toMoved) {
            toCard.x = fromCard.x - getCardWidth(toCard) - MAX_TRANSITION_GAP;
          } else {
            fromCard.x = toCard.x + getCardWidth(toCard) + MAX_TRANSITION_GAP;
          }
          gap = MAX_TRANSITION_GAP;
        }
      }
    }
    conn.transitionDuration = Math.round(Math.max(0.5, Math.min(5, Math.max(0, gap) / PIXELS_PER_SECOND)) * 10) / 10;
  }
}

function findConnectionBetween(cardIdA, cardIdB) {
  return state.connections.find(c =>
    (c.fromCardId === cardIdA && c.toCardId === cardIdB) ||
    (c.fromCardId === cardIdB && c.toCardId === cardIdA)
  );
}

// Capture a freeze frame from the current playback video state
// Splits the source card at the playhead: [A before freeze] [定格] [B after freeze]
function captureFreezeFrame(sourceCardId) {
  const sourceCard = state.cards.find(c => c.id === sourceCardId);
  if (!sourceCard || !playbackVideo || playbackVideo.readyState < 2 || playbackVideo.videoWidth <= 0) return;

  const pb = state.playback;
  // Determine the split point within the source card
  const splitTime = sourceCard.trimIn + pb.cardProgress * (sourceCard.trimOut - sourceCard.trimIn);
  if (splitTime <= sourceCard.trimIn || splitTime >= sourceCard.trimOut) return; // must be inside the card

  // Capture current frame from playbackVideo
  const capCanvas = document.createElement('canvas');
  capCanvas.width = playbackVideo.videoWidth;
  capCanvas.height = playbackVideo.videoHeight;
  const cctx = capCanvas.getContext('2d');
  cctx.drawImage(playbackVideo, 0, 0, capCanvas.width, capCanvas.height);
  const dataURL = capCanvas.toDataURL('image/jpeg', 0.9);
  const frameImage = new Image();
  frameImage.src = dataURL;

  pushUndo();

  // Remember original trimOut before modifying sourceCard
  const originalTrimOut = sourceCard.trimOut;

  // ---- 1. Source card becomes segment A (trimIn → splitTime) ----
  sourceCard.trimOut = splitTime;

  // ---- 2. Create freeze frame card ----
  const freezeDuration = 5;
  const freezeId = 'freeze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  const freezeCard = {
    type: 'video',
    id: freezeId,
    isFreezeFrame: true,
    x: 0, // will be calculated below
    y: sourceCard.y,
    label: '定格 5.0s',
    frameImage: frameImage,
    frameImageDataURL: dataURL,
    duration: freezeDuration,
    trimIn: 0,
    trimOut: freezeDuration,
    fileURL: '',
    file: null,
    thumbStrip: null,
    waveform: null,
    volume: 1,
    transformScale: 1.0,
    transformX: 0,
    transformY: 0,
    fadeIn: 0,
    fadeOut: 0,
    markers: [],
    height: CARD_HEIGHT,
  };

  // ---- 3. Create segment B (splitTime → originalTrimOut) ----
  const segmentBId = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const segmentB = {
    type: sourceCard.type,
    id: segmentBId,
    x: 0, // will be calculated below
    y: sourceCard.y,
    label: sourceCard.label,
    file: sourceCard.file,
    fileURL: sourceCard.fileURL,
    trimIn: splitTime,
    trimOut: originalTrimOut,
    duration: sourceCard.duration,
    volume: sourceCard.volume,
    thumbStrip: sourceCard.thumbStrip,
    waveform: sourceCard.waveform,
    fadeIn: 0,
    fadeOut: sourceCard.fadeOut || 0,
    transformScale: sourceCard.transformScale || 1.0,
    transformX: sourceCard.transformX || 0,
    transformY: sourceCard.transformY || 0,
    markers: (sourceCard.markers || []).map(m => ({ ...m })),
    height: CARD_HEIGHT,
  };

  // ---- Calculate positions ----
  const gap = 40;
  const aWidth = getCardWidth(sourceCard);
  const freezeWidth = getCardWidth(freezeCard);
  freezeCard.x = sourceCard.x + aWidth + gap;
  segmentB.x = freezeCard.x + freezeWidth + gap;

  // ---- Insert into state ----
  state.cards.push(freezeCard);
  state.cards.push(segmentB);

  // If source is in a group, add freeze + segmentB to same group after source
  for (const group of state.groups) {
    const srcIdx = group.cardIds.indexOf(sourceCardId);
    if (srcIdx !== -1) {
      group.cardIds.splice(srcIdx + 1, 0, freezeId, segmentBId);
      break;
    }
  }

  state.selection.cardIds = [freezeId];
  state.selection.groupIds = [];

  render();
  // Delay to ensure frameImage is loaded if needed
  setTimeout(() => {
    if (freezeCard.frameImage && !freezeCard.frameImage.complete) {
      freezeCard.frameImage.onload = () => render();
    }
  }, 100);
}

function buildPlaybackSequence(startCardId) {
  const sequence = [startCardId];
  let currentId = startCardId;

  while (true) {
    const conn = state.connections.find(c =>
      c.fromCardId === currentId && c.fromSide === 'right' && c.toSide === 'left'
      && c.type !== 'tween' && c.type !== 'keyframe'
    );
    if (!conn) break;
    if (sequence.includes(conn.toCardId)) break;
    sequence.push(conn.toCardId);
    currentId = conn.toCardId;
  }

  return sequence;
}

function calculateSequenceDuration(sequence) {
  let total = 0;
  for (let i = 0; i < sequence.length; i++) {
    const card = state.cards.find(c => c.id === sequence[i]);
    if (!card) continue;

    total += card.trimOut - card.trimIn;

    if (i < sequence.length - 1) {
      const conn = findConnectionBetween(sequence[i], sequence[i + 1]);
      if (conn && conn.transition !== 'cut') {
        total += conn.transitionDuration;
      }
    }
  }
  return total;
}

// ---- Playback control ----

function resolveCardTime(sequence, totalElapsed) {
  let timeAccum = 0;
  for (let i = 0; i < sequence.length; i++) {
    const cardId = sequence[i];
    const card = state.cards.find(c => c.id === cardId);
    if (!card) continue;

    const cardDuration = card.trimOut - card.trimIn;
    const cardTime = totalElapsed - timeAccum;

    if (cardTime < cardDuration) {
      return {
        cardIdx: i,
        cardId: cardId,
        cardProgress: cardDuration > 0 ? cardTime / cardDuration : 0,
        inTransition: false,
        transitionConn: null,
        transitionProgress: 0
      };
    }

    timeAccum += cardDuration;

    // Check transition after this card
    if (i < sequence.length - 1) {
      const conn = findConnectionBetween(sequence[i], sequence[i + 1]);
      if (conn && conn.type !== 'cut') {
        const transDur = conn.transitionDuration;
        if (totalElapsed < timeAccum + transDur) {
          return {
            cardIdx: i,
            cardId: cardId,
            cardProgress: 1,
            inTransition: true,
            transitionConn: conn,
            transitionProgress: transDur > 0 ? (totalElapsed - timeAccum) / transDur : 0
          };
        }
        timeAccum += transDur;
      }
    }
  }

  // Past the end — return last card
  const lastIdx = sequence.length - 1;
  return {
    cardIdx: lastIdx,
    cardId: sequence[lastIdx],
    cardProgress: 1,
    inTransition: false,
    transitionConn: null,
    transitionProgress: 0
  };
}

function calcTotalElapsedAtCard(card, progress) {
  const pb = state.playback;
  const seq = pb.sequence;
  if (!seq || seq.length === 0) return 0;
  let timeAccum = 0;
  for (let i = 0; i < seq.length; i++) {
    const cid = seq[i];
    const c = state.cards.find(c => c.id === cid);
    if (!c) continue;
    if (cid === card.id) {
      timeAccum += (c.trimOut - c.trimIn) * progress;
      return timeAccum;
    }
    timeAccum += c.trimOut - c.trimIn;
    if (i < seq.length - 1) {
      const conn = findConnectionBetween(seq[i], seq[i + 1]);
      if (conn && conn.transition !== 'cut') {
        timeAccum += conn.transitionDuration;
      }
    }
  }
  return timeAccum;
}

function seekToTime(time) {
  const pb = state.playback;
  const seq = pb.sequence;
  if (!seq || seq.length === 0) return;
  let elapsed = 0;
  for (let i = 0; i < seq.length; i++) {
    const cid = seq[i];
    const c = state.cards.find(ca => ca.id === cid);
    if (!c) continue;
    const dur = c.trimOut - c.trimIn;
    // Check if time falls in transition before this card
    if (i > 0) {
      const prevConn = findConnectionBetween(seq[i - 1], seq[i]);
      if (prevConn && prevConn.transition !== 'cut') {
        if (time >= elapsed && time < elapsed + prevConn.transitionDuration) {
          // In transition — snap to card start
          pb.currentCardId = cid;
          pb.currentSeqIndex = i;
          pb.cardProgress = 0;
          pb.pausedCardTime = c.trimIn;
          pb.pausedAt = elapsed + prevConn.transitionDuration;
          pb.startTime = 0;
          syncPlaybackVideo();
          render();
          updatePreviewPanel();
          return;
        }
        elapsed += prevConn.transitionDuration;
      }
    }
    if (time >= elapsed && time < elapsed + dur) {
      const progress = (time - elapsed) / dur;
      pb.currentCardId = cid;
      pb.currentSeqIndex = i;
      pb.cardProgress = progress;
      pb.pausedCardTime = c.trimIn + progress * dur;
      pb.pausedAt = time;
      pb.startTime = 0;
      syncPlaybackVideo();
      render();
      updatePreviewPanel();
      return;
    }
    elapsed += dur;
  }
  // Past end — snap to last frame
  const last = seq[seq.length - 1];
  const lastCard = state.cards.find(ca => ca.id === last);
  if (lastCard) {
    pb.currentCardId = last;
    pb.currentSeqIndex = seq.length - 1;
    pb.cardProgress = 1;
    pb.pausedCardTime = lastCard.trimOut;
    pb.pausedAt = pb.totalDuration;
    pb.startTime = 0;
    syncPlaybackVideo();
    render();
    updatePreviewPanel();
  }
}

function syncPlaybackVideo() {
  const pb = state.playback;
  const cardId = pb.currentCardId;
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;
  if (card.type !== 'video') return;

  // Freeze frame: no video source to sync, just pause playbackVideo
  if (card.isFreezeFrame) {
    playbackVideo.pause();
    playbackVideo.style.display = 'none';
    return;
  }

  // Apply fade in/out opacity
  const dur = card.trimOut - card.trimIn;
  const fadeIn = card.fadeIn || 0;
  const fadeOut = card.fadeOut || 0;
  let opacity = 1;
  if (fadeIn > 0 && pb.cardProgress < fadeIn / dur) {
    opacity = pb.cardProgress / (fadeIn / dur);
  } else if (fadeOut > 0 && pb.cardProgress > 1 - fadeOut / dur) {
    opacity = (1 - pb.cardProgress) / (fadeOut / dur);
  }
  opacity = Math.max(0, Math.min(1, opacity));
  playbackVideo.style.opacity = opacity;

  const targetTime = card.trimIn + pb.cardProgress * (card.trimOut - card.trimIn);

  // Check if we need to load a different card's video
  if (playbackVideo._cardId !== card.id) {
    playbackVideo.src = card.fileURL;
    playbackVideo._cardId = card.id;
    playbackVideo.currentTime = targetTime;
    const playPromise = playbackVideo.play();
    if (playPromise) playPromise.catch(() => {}); // ignore autoplay errors
    return;
  }

  // Same card — gentle time sync (only if drifted significantly)
  const drift = Math.abs(playbackVideo.currentTime - targetTime);
  if (drift > 0.15) {
    playbackVideo.currentTime = targetTime;
  }

  // Ensure it's playing
  if (playbackVideo.paused) {
    const playPromise = playbackVideo.play();
    if (playPromise) playPromise.catch(() => {});
  }
}

function startPlayback(startCardId) {
  const pb = state.playback;

  // Stop any existing playback to ensure clean state (same as startGroupPlayback)
  if (pb.isPlaying || pb.pausedAt > 0) {
    stopPlayback();
  }

  // Build sequence
  const startCard = state.cards.find(c => c.id === startCardId);
  if (!startCard) return;

  // If there are connections from this card, build the full sequence
  const seq = buildPlaybackSequence(startCardId);
  const totalDuration = calculateSequenceDuration(seq);

  if (totalDuration <= 0) return;

  pb.playbackMode = 'linear';
  pb.sequence = seq;
  pb.totalDuration = totalDuration;
  pb.currentSeqIndex = 0;
  pb.currentCardId = seq[0];
  pb.cardProgress = 0;
  const _fc = state.cards.find(c => c.id === seq[0]);
  pb.pausedCardTime = _fc ? _fc.trimIn : 0;
  pb.startTime = performance.now();
  pb.pausedAt = 0;
  pb.inTransition = false;
  pb.transitionConn = null;
  pb._dissolveOverlayCanvas = null;
  pb.isPlaying = true;

  // Init playback video for the first card
  const firstCard = state.cards.find(c => c.id === seq[0]);
  if (firstCard && firstCard.isFreezeFrame) {
    playbackVideo.pause();
    playbackVideo.style.display = 'none';
  } else if (firstCard && firstCard.type === 'video') {
    playbackVideo._cardId = null; // force reload
    playbackVideo.src = firstCard.fileURL;
    playbackVideo._cardId = firstCard.id;
    playbackVideo.currentTime = firstCard.trimIn;
    const playPromise = playbackVideo.play();
    if (playPromise) playPromise.catch(() => {});
  } else if (firstCard && firstCard.type === 'composition') {
    // Composition: no video source, render shapes on preview canvas
    playbackVideo.pause();
    playbackVideo.style.display = 'none';
  }

  // Init BGM state before first tick
  stopAllBGM();
  state.bgmPrevTimestamp = performance.now();

  // Start rAF loop
  pb.rafId = requestAnimationFrame(playbackTick);
  render();
  updatePreviewPanel();
}

function stopPlayback() {
  const pb = state.playback;
  pb.isPlaying = false;
  pb.currentCardId = null;
  pb.sequence = [];
  pb.currentSeqIndex = 0;
  pb.cardProgress = 0;
  pb.pausedCardTime = 0;
  pb.pausedAt = 0;
  pb.totalDuration = 0;
  pb.inTransition = false;
  pb.transitionConn = null;
  pb.transitionProgress = 0;
  pb._dissolveOverlayCanvas = null;

  if (pb.rafId) {
    cancelAnimationFrame(pb.rafId);
    pb.rafId = null;
  }

  delete pb._effectiveProps;

  playbackVideo.pause();
  playbackVideo._cardId = null;
  playbackVideo.src = '';

  // Stop all BGM audio
  stopAllBGM();

  // Stop group video entries
  stopAllGroupVideoEntries();

  // Reset group playback state
  pb.playbackMode = 'linear';
  pb.groupPlayback = {
    groupId: null,
    groupStartX: 0,
    groupEndX: 0,
    totalPixels: 0,
    timelineCards: []
  };
  delete pb._groupPlayheadX;
  delete pb._groupPlaybackGroup;

  // Clean eb-chain state
  pb._ebChain = null;
  pb._ebChainProgress = 0;
  pb._frameEditActive = false;

  // Auto-restore edit mode if we temporarily switched out for eb-chain playback
  if (pb._preEditBoxId) {
    const restoreEb = findEditBoxById(pb._preEditBoxId);
    pb._preEditBoxId = null;
    if (restoreEb && !state.interaction.activeEditBoxId) {
      // Re-enter edit box on fabric after a brief delay to let render settle
      requestAnimationFrame(() => {
        _enterEditBoxOnFabric(restoreEb);
        state.interaction.activeEditBoxId = restoreEb.id;
        render();
      });
    }
  }

  render();
  updatePreviewPanel();
}

function togglePlayback() {
  if (state.playback.isPlaying) {
    // Pause
    const pb = state.playback;
    const elapsed = (performance.now() - pb.startTime) / 1000;
    pb.pausedAt += elapsed;
    pb.isPlaying = false;

    // Snapshot absolute time for playhead stability during edits
    if (pb.playbackMode === 'linear') {
      const pauseCard = state.cards.find(c => c.id === pb.currentCardId);
      if (pauseCard) {
        pb.pausedCardTime = pauseCard.trimIn + pb.cardProgress * (pauseCard.trimOut - pauseCard.trimIn);
      }
    }

    // eb-chain: store current interp for frame edit
    if (pb.playbackMode === 'eb-chain' && pb._ebChain) {
      pb._ebChainProgress = pb.totalDuration > 0 ? pb.pausedAt / pb.totalDuration : 0;
    }

    if (pb.rafId) {
      cancelAnimationFrame(pb.rafId);
      pb.rafId = null;
    }

    playbackVideo.pause();
    stopAllBGM();
    pauseAllGroupVideoEntries();   // keep entries alive so transform can read video dimensions
    // Preload video entries for ALL cards in the group so calculateVideoRect
    // gets real video dimensions regardless of which card is at the playhead.
    if (pb.playbackMode === 'group' && pb.groupPlayback.groupId) {
      const pauseGroup = state.groups.find(g => g.id === pb.groupPlayback.groupId);
      preloadGroupVideoEntries(pauseGroup);
    }
    // Skip render during auto-pause — caller will render after processing the interaction
    if (!state.interaction._autoPaused) {
      render();
      updatePreviewPanel();
      renderTransformOverlay();
    } else {
      console.log('[DEBUG] togglePlayback: autoPause, skipping internal render');
    }
  } else if (state.playback.pausedAt > 0) {
    // Resume from pause
    const pb = state.playback;

    if (pb.playbackMode === 'eb-chain') {
      // Resume eb-chain playback
      const chainData = pb._ebChain;
      if (!chainData || !chainData.chain || chainData.chain.length < 2) { stopPlayback(); return; }

      const chain = buildEditBoxChain(chainData.firstEbId);
      const duration = getEditBoxChainDuration(chain);
      if (duration <= 0 || pb.pausedAt >= duration) { stopPlayback(); return; }

      chainData.chain = chain;
      chainData.duration = duration;
      pb.totalDuration = duration;

      stopAllBGM();
      state.bgmPrevTimestamp = performance.now();
      pb.startTime = performance.now();
      pb.isPlaying = true;
      pb.rafId = requestAnimationFrame(ebChainPlaybackTick);
      render();
      updatePreviewPanel();
      return;
    }

    if (pb.playbackMode === 'group') {
      // Resume group playback
      const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
      if (!group || group.collapsed) { stopPlayback(); return; }

      const timeline = buildGroupTimeline(group);
      if (!timeline || pb.pausedAt >= timeline.totalDuration) { stopPlayback(); return; }

      pb.groupPlayback.timelineCards = timeline.cards;
      pb.groupPlayback.groupStartX = timeline.startX;
      pb.groupPlayback.groupEndX = timeline.endX;
      pb.groupPlayback.totalPixels = timeline.totalPixels;
      pb.totalDuration = timeline.totalDuration;

      // Re-init video entries
      stopAllGroupVideoEntries();
      for (const tc of timeline.cards) {
        if (tc.card.type === 'video') {
          ensureGroupVideoEntry(tc.card);
        }
      }

      stopAllBGM();
      state.bgmPrevTimestamp = performance.now();
      pb.startTime = performance.now();
      pb.isPlaying = true;
      pb.rafId = requestAnimationFrame(groupPlaybackTick);
      render();
      updatePreviewPanel();
      return;
    }

    // Linear resume
    const oldHead = pb.sequence[0];
    if (!oldHead) { stopPlayback(); return; }

    // Rebuild sequence from the original head card
    const newSeq = buildPlaybackSequence(oldHead);
    const newDur = calculateSequenceDuration(newSeq);

    if (newDur <= 0) { stopPlayback(); return; }

    pb.sequence = newSeq;
    pb.totalDuration = newDur;
    // Clamp pausedAt in case the new sequence is shorter
    if (pb.pausedAt >= newDur) { stopPlayback(); return; }

    // Resolve current position in the new sequence
    const pos = resolveCardTime(newSeq, pb.pausedAt);
    pb.currentSeqIndex = pos.cardIdx;
    pb.currentCardId = pos.cardId;
    pb.cardProgress = pos.cardProgress;
    const _rc = state.cards.find(c => c.id === pos.cardId);
    pb.pausedCardTime = _rc ? _rc.trimIn + pos.cardProgress * (_rc.trimOut - _rc.trimIn) : 0;
    pb.inTransition = pos.inTransition;
    pb.transitionConn = pos.transitionConn;
    pb.transitionProgress = pos.transitionProgress;
    pb._dissolveOverlayCanvas = null;

    pb.startTime = performance.now();
    pb.isPlaying = true;

    // Re-sync video to the resolved position
    // Only reload source when card changed — avoids decode delay on resume
    const card = state.cards.find(c => c.id === pb.currentCardId);
    if (card && card.type === 'video') {
      if (playbackVideo._cardId !== card.id) {
        playbackVideo._cardId = null;
        playbackVideo.src = card.fileURL;
        playbackVideo._cardId = card.id;
      }
      const targetTime = card.trimIn + pb.cardProgress * (card.trimOut - card.trimIn);
      playbackVideo.currentTime = targetTime;
      const playPromise = playbackVideo.play();
      if (playPromise) playPromise.catch(() => {});
    }

    rebuildBGMFromSequence(pb.sequence, pb.pausedAt);
    state.bgmPrevTimestamp = performance.now();
    pb.rafId = requestAnimationFrame(playbackTick);
    render();
    updatePreviewPanel();
  } else {
    // Start fresh — determine what to play
    const selCards = state.selection.cardIds;
    const selGroups = state.selection.groupIds;

    // Group selected → group multi-track playback
    if (selGroups.length > 0) {
      startGroupPlayback(selGroups[0]);
      return;
    }

    // Edit box selected (no cards/groups) → eb-chain playback
    if (selCards.length === 0 && selGroups.length === 0 && state.selection.editBoxId) {
      const started = startEditBoxPlayback(state.selection.editBoxId);
      if (started) return;
    }

    // Card(s) selected → linear playback (even if card is inside a group)
    if (selCards.length === 0) return;

    if (selCards.length === 1) {
      startPlayback(selCards[0]);
    } else {
      // Multiple selected: try to find the head of the sequence
      let heads = selCards.filter(cid => {
        const hasIncoming = state.connections.some(c => c.toCardId === cid);
        const hasOutgoing = state.connections.some(c => c.fromCardId === cid);
        return hasOutgoing && !hasIncoming;
      });

      if (heads.length === 0) {
        heads = selCards.filter(cid =>
          state.connections.some(c => c.fromCardId === cid)
        );
      }

      const startId = heads.length > 0 ? heads[0] : selCards[0];
      startPlayback(startId);
    }
  }
}

// ---- Synthesized video helper ----
function getSynthVideoFrame(card, progress) {
  // Given a synthesized-video card and progress (0..1), compute the current frame's shapes.
  // Uses segment-specific viewport so shapes maintain proportional size relative to output.
  const chain = card.editBoxChain || [];
  if (chain.length === 0) return { shapes: [] };

  const totalDuration = card.totalDuration || getEditBoxChainDuration(chain);
  if (totalDuration <= 0) return { shapes: [] };

  const elapsedTime = progress * totalDuration;

  // Find which interval in the chain the elapsed time falls into
  for (let i = 0; i < chain.length; i++) {
    const ebId = chain[i];
    const eb = findEditBoxById(ebId);
    if (!eb) continue;

    if (i === chain.length - 1) {
      // Last edit box - return its shapes, viewport = just this eb
      return { shapes: eb.shapes || [], viewport: eb };
    }

    const nextEb = findEditBoxById(chain[i + 1]);
    if (!nextEb) return { shapes: eb.shapes || [], viewport: eb };

    const ebTime = getEditBoxTimeInChain(chain, ebId);
    const nextEbTime = getEditBoxTimeInChain(chain, chain[i + 1]);
    const intervalDur = nextEbTime - ebTime;

    if (elapsedTime >= ebTime && elapsedTime < ebTime + intervalDur) {
      // In the interval between eb and nextEb
      const localT = intervalDur > 0 ? (elapsedTime - ebTime) / intervalDur : 0;
      const conn = state.connections.find(c =>
        c.type === 'eb-keyframe' &&
        ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
         (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
      );
      const easing = conn ? (conn.easing || 'linear') : 'linear';
      const interp = interpolateShapes(eb.shapes || [], nextEb.shapes || [], localT, easing);
      return {
        shapes: interp,
        viewport: {
          x: eb.x + (nextEb.x - eb.x) * localT,
          y: eb.y + (nextEb.y - eb.y) * localT,
          width: eb.width + (nextEb.width - eb.width) * localT,
          height: eb.height + (nextEb.height - eb.height) * localT
        }
      };
    }
  }

  // Past the end - return last edit box's shapes
  const lastEb = findEditBoxById(chain[chain.length - 1]);
  return { shapes: lastEb ? (lastEb.shapes || []) : [], viewport: lastEb };
}

function renderSynthFrameToCanvas(targetCanvas, shapes, refBox, outW, outH, alpha) {
  // Render a set of shapes to a canvas.
  // refBox can be an edit box (has .id, .x, .y) or a viewport {x, y, width, height}.
  if (!targetCanvas || !shapes || shapes.length === 0) return;
  const cc = targetCanvas.getContext ? targetCanvas.getContext('2d') : targetCanvas;
  outW = outW || targetCanvas.width || 320;
  outH = outH || targetCanvas.height || 180;

  cc.save();
  if (alpha != null) cc.globalAlpha = alpha;

  if (refBox) {
    // refBox: {x, y, width, height} in world coords (edit box or interpolated viewport).
    // Map the viewport to the full output canvas 1:1 so shapes maintain
    // the same proportional size relative to output as in their edit box.
    const scaleX = outW / refBox.width;
    const scaleY = outH / refBox.height;
    cc.translate(-refBox.x * scaleX, -refBox.y * scaleY);
    cc.scale(scaleX, scaleY);
  }

  for (const s of shapes) {
    cc.globalAlpha = s.opacity != null ? s.opacity : 1;
    if (s.shapeType === 'rect') {
      if (s.angle) { cc.save(); const cx = s.left + s.width / 2; const cy = s.top + s.height / 2; cc.translate(cx, cy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-cx, -cy); }
      if (s.fill) { cc.fillStyle = s.fill; cc.fillRect(s.left, s.top, s.width, s.height); }
      if (s.stroke) { cc.strokeStyle = s.stroke; cc.lineWidth = s.strokeWidth || 2; cc.strokeRect(s.left, s.top, s.width, s.height); }
      if (s.angle) cc.restore();
    } else if (s.shapeType === 'ellipse') {
      const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
      if (s.angle) { cc.save(); cc.translate(cx, cy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-cx, -cy); }
      cc.beginPath();
      cc.ellipse(cx, cy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
      if (s.fill) { cc.fillStyle = s.fill; cc.fill(); }
      if (s.stroke) { cc.strokeStyle = s.stroke; cc.lineWidth = s.strokeWidth || 2; cc.stroke(); }
      if (s.angle) cc.restore();
    } else if (s.shapeType === 'line') {
      const lcx = (s.x1 + s.x2) / 2, lcy = (s.y1 + s.y2) / 2;
      if (s.angle) { cc.save(); cc.translate(lcx, lcy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-lcx, -lcy); }
      cc.strokeStyle = s.stroke || '#88C405';
      cc.lineWidth = s.strokeWidth || 2;
      cc.beginPath(); cc.moveTo(s.x1, s.y1); cc.lineTo(s.x2, s.y2); cc.stroke();
      if (s.angle) cc.restore();
    } else if (s.shapeType === 'text') {
      if (s.angle) { cc.save(); const cx = s.left + (s.width || 100) / 2; const cy = s.top + (s.height || 24) / 2; cc.translate(cx, cy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-cx, -cy); }
      cc.fillStyle = s.fill || '#000000';
      cc.font = `${s.fontWeight || 'Bold'} ${s.fontSize || 24}px "${s.fontFamily || 'Inter'}", system-ui, sans-serif`;
      cc.textAlign = s.textAlign || 'left';
      cc.textBaseline = 'top';
      cc.fillText(s.text || '', s.left, s.top);
      if (s.angle) cc.restore();
    }
  }
  cc.globalAlpha = 1;
  cc.restore();
}

// Compute the bounding box of all edit boxes in a chain (world coords union).
function computeChainViewport(chain) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ebId of chain) {
    const eb = findEditBoxById(ebId);
    if (!eb) continue;
    minX = Math.min(minX, eb.x);
    minY = Math.min(minY, eb.y);
    maxX = Math.max(maxX, eb.x + eb.width);
    maxY = Math.max(maxY, eb.y + eb.height);
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// Compute the interpolated shapes for a synthesized-video card at a given progress (0-1).
// Returns { shapes, viewport } where viewport is the segment-specific bounding box
// (union of only the two edit boxes being interpolated between) so shapes maintain
// proportional size relative to the output frame.
function computeSynthFrame(card, progress) {
  const chain = card.editBoxChain || [];
  if (chain.length === 0) return null;

  if (chain.length === 1) {
    const eb = findEditBoxById(chain[0]);
    return { shapes: eb ? [...(eb.shapes || [])] : [], viewport: eb };
  }

  const totalDuration = card.totalDuration || getEditBoxChainDuration(chain);
  if (totalDuration <= 0) return null;

  const totalElapsed = progress * totalDuration;

  let timeAccum = 0;
  let foundInterp = null;
  let foundViewport = null;

  for (let i = 0; i < chain.length - 1; i++) {
    const eb = findEditBoxById(chain[i]);
    const nextEb = findEditBoxById(chain[i + 1]);
    if (!eb || !nextEb) continue;

    const conn = state.connections.find(c =>
      c.type === 'eb-keyframe' &&
      ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
       (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
    );

    let segDuration;
    if (conn && conn.transitionDuration > 0) {
      segDuration = conn.transitionDuration;
    } else {
      segDuration = Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
    }

    if (totalElapsed >= timeAccum && totalElapsed < timeAccum + segDuration) {
      const localT = segDuration > 0 ? (totalElapsed - timeAccum) / segDuration : 0;
      const easing = conn ? (conn.easing || 'linear') : 'linear';
      foundInterp = interpolateShapes(eb.shapes || [], nextEb.shapes || [], localT, easing);
      foundViewport = {
        x: eb.x + (nextEb.x - eb.x) * localT,
        y: eb.y + (nextEb.y - eb.y) * localT,
        width: eb.width + (nextEb.width - eb.width) * localT,
        height: eb.height + (nextEb.height - eb.height) * localT
      };
      break;
    }
    timeAccum += segDuration;
  }

  // Past end — use last edit box's shapes and viewport
  if (!foundInterp) {
    const lastEb = findEditBoxById(chain[chain.length - 1]);
    if (lastEb) {
      foundInterp = JSON.parse(JSON.stringify(lastEb.shapes || []));
      foundViewport = lastEb;
    }
  }

  return { shapes: foundInterp || [], viewport: foundViewport || findEditBoxById(chain[0]) };
}

// Generate a thumbnail strip for a synthesized-video card by rendering
// frames at evenly-spaced intervals through the edit-box chain animation.
async function generateSynthThumbnails(card) {
  const chain = card.editBoxChain || [];
  if (chain.length === 0) return null;

  const totalDuration = card.totalDuration || getEditBoxChainDuration(chain);
  if (totalDuration <= 0) return null;

  const count = Math.min(THUMBNAIL_COUNT || 8, Math.max(3, Math.floor(totalDuration / 2)));
  const frameW = 120;
  const frameH = 68;

  const stripCanvas = document.createElement('canvas');
  stripCanvas.width = frameW * count;
  stripCanvas.height = frameH;
  const stripCtx = stripCanvas.getContext('2d');

  const frameCanvas = document.createElement('canvas');
  frameCanvas.width = frameW;
  frameCanvas.height = frameH;

  for (let i = 0; i < count; i++) {
    const progress = count > 1 ? i / (count - 1) : 0.5;
    const frame = computeSynthFrame(card, progress);
    const shapes = frame ? (frame.shapes || []) : [];
    const viewport = frame ? frame.viewport : null;

    const fc = frameCanvas.getContext('2d');
    fc.clearRect(0, 0, frameW, frameH);

    if (shapes.length > 0 && viewport) {
      renderSynthFrameToCanvas(fc, shapes, viewport, frameW, frameH);
    }

    stripCtx.drawImage(frameCanvas, i * frameW, 0);
  }

  return stripCanvas;
}

function playbackTick(timestamp) {
  const pb = state.playback;
  if (!pb.isPlaying) return;

  // eb-chain playback has its own tick loop
  if (pb.playbackMode === 'eb-chain') return;

  const elapsed = (timestamp - pb.startTime) / 1000; // seconds since last start/resume
  const totalElapsed = pb.pausedAt + elapsed;

  // Check end
  if (totalElapsed >= pb.totalDuration) {
    stopPlayback();
    return;
  }

  // Resolve current position
  const pos = resolveCardTime(pb.sequence, totalElapsed);

  const prevCardId = pb.currentCardId;
  pb.currentSeqIndex = pos.cardIdx;
  pb.currentCardId = pos.cardId;
  pb.cardProgress = pos.cardProgress;
  const curCard = state.cards.find(c => c.id === pos.cardId);
  pb.pausedCardTime = curCard ? curCard.trimIn + pos.cardProgress * (curCard.trimOut - curCard.trimIn) : 0;
  pb.inTransition = pos.inTransition;
  pb.transitionConn = pos.transitionConn;
  pb.transitionProgress = pos.transitionProgress;

  // Dissolve crossfade: capture last frame of outgoing card, then switch playbackVideo
  // to the incoming card. pb._dissolveOverlayCanvas holds the outgoing frame for compositing.
  if (pos.inTransition && pos.transitionConn && pos.transitionConn.transition === 'dissolve') {
    if (!pb._dissolveOverlayCanvas && playbackVideo.readyState >= 2) {
      try {
        // Capture outgoing card's last frame
        const c = document.createElement('canvas');
        c.width = playbackVideo.videoWidth || 320;
        c.height = playbackVideo.videoHeight || 180;
        const cx = c.getContext('2d');
        cx.drawImage(playbackVideo, 0, 0, c.width, c.height);
        pb._dissolveOverlayCanvas = c;
        // Switch playbackVideo to the incoming card
        const incomingId = pos.transitionConn.toCardId;
        const incoming = state.cards.find(c => c.id === incomingId);
        if (incoming && incoming.type === 'video') {
          playbackVideo.src = incoming.fileURL;
          playbackVideo._cardId = incoming.id;
          playbackVideo.currentTime = incoming.trimIn;
          const playPromise = playbackVideo.play();
          if (playPromise) playPromise.catch(() => {});
        }
      } catch (e) { pb._dissolveOverlayCanvas = null; }
    }
  } else {
    pb._dissolveOverlayCanvas = null;
  }

  // Synthesized-video card: compute current frame shapes
  pb._synthProps = null;
  if (curCard && curCard.type === 'synthesized-video') {
    const frame = getSynthVideoFrame(curCard, pb.cardProgress);
    pb._synthProps = { shapes: frame.shapes, viewport: frame.viewport };
  }

  // Switch video if card changed (skip during dissolve — handled above, and synthesized-video)
  if (pos.cardId !== prevCardId && !pb._dissolveOverlayCanvas && curCard && curCard.type !== 'synthesized-video') {
    syncPlaybackVideo();
  }

  // BGM blanket — update every frame with dt
  const dt = (timestamp - state.bgmPrevTimestamp) / 1000;
  if (dt > 0 && dt < 0.5) { // guard against huge dt (e.g. tab switch)
    updateBGMTick(pos.cardId, dt);
  }
  state.bgmPrevTimestamp = timestamp;

  // Compute effective properties from marker card interpolation
  if (curCard) {
    const playheadX = curCard.x + getCardWidth(curCard) * pb.cardProgress;
    pb._effectiveProps = getCardEffectiveProperties(curCard, playheadX);
  } else {
    pb._effectiveProps = null;
  }

  render();
  updatePreviewPanel();
  pb.rafId = requestAnimationFrame(playbackTick);
}

// ---- BGM Blanket ----

function isCardOverlapped(videoCard, audioCard) {
  const vw = getCardWidth(videoCard);
  const vh = CARD_HEIGHT;
  const aw = getCardWidth(audioCard);
  const ah = CARD_HEIGHT;

  // Rectangle overlap test
  return !(
    videoCard.x + vw < audioCard.x ||
    audioCard.x + aw < videoCard.x ||
    videoCard.y + vh < audioCard.y ||
    audioCard.y + ah < videoCard.y
  );
}

// Called every playback tick to manage all BGM audio state
// dt = seconds since last tick (~0.016 at 60fps)
// ---- compute the spatial overlap time-window for a BGM on a video card ----
function getBGMOverlapOnCard(bgm, videoCard) {
  const vw = getCardWidth(videoCard);
  const bw = getCardWidth(bgm);
  const overlapLeft = Math.max(videoCard.x, bgm.x);
  const overlapRight = Math.min(videoCard.x + vw, bgm.x + bw);
  if (overlapLeft >= overlapRight) return null;

  // map spatial overlap to video-card-local times
  const vidStart = videoCard.trimIn + (overlapLeft - videoCard.x) / PIXELS_PER_SECOND;
  const vidEnd   = videoCard.trimIn + (overlapRight - videoCard.x) / PIXELS_PER_SECOND;
  // map to bgm-file-local times
  const bgmStart = bgm.trimIn + (overlapLeft - bgm.x) / PIXELS_PER_SECOND;
  return { vidStart, vidEnd, bgmStart, overlapLeft, overlapRight };
}

function pauseBGMEntry(bgmId) {
  const entry = state.bgmEntries.find(e => e.cardId === bgmId);
  if (entry && entry.active) {
    entry.audio.pause();
    entry.active = false;
  }
}

// Called every playback tick — playhead-driven
function updateBGMTick(currentCardId, dt) {
  const pb = state.playback;
  const currentCard = state.cards.find(c => c.id === currentCardId);
  if (!currentCard) return;

  const cw = getCardWidth(currentCard);
  const playheadX = currentCard.x + cw * pb.cardProgress;

  const allBGMs = state.cards.filter(c => c.type === 'audio');

  for (const bgm of allBGMs) {
    if (!isCardOverlapped(currentCard, bgm)) {
      pauseBGMEntry(bgm.id);
      continue;
    }

    const ov = getBGMOverlapOnCard(bgm, currentCard);
    if (!ov) { pauseBGMEntry(bgm.id); continue; }

    const currentVideoTime = currentCard.trimIn + pb.cardProgress * (currentCard.trimOut - currentCard.trimIn);

    // Is the playhead within the overlap time window?
    if (currentVideoTime >= ov.vidStart && currentVideoTime < ov.vidEnd) {
      let entry = state.bgmEntries.find(e => e.cardId === bgm.id);

      if (!entry) {
        // First entry — set coverElapsed from playhead's spatial position on the BGM card
        const initialCover = (playheadX - bgm.x) / PIXELS_PER_SECOND;
        const maxCover = bgm.trimOut - bgm.trimIn;
        const coverElapsed = Math.max(0, Math.min(maxCover, initialCover));
        if (coverElapsed >= maxCover) continue;

        const audio = new Audio(bgm.fileURL);
        audio.volume = bgm.volume;
        audio.currentTime = bgm.trimIn + coverElapsed;
        const playPromise = audio.play();
        if (playPromise) playPromise.catch(() => {});
        entry = { cardId: bgm.id, audio, coverElapsed, active: true };
        state.bgmEntries.push(entry);
      } else if (!entry.active) {
        // Re-entering overlap after gap
        entry.active = true;
        const targetTime = bgm.trimIn + entry.coverElapsed;
        if (targetTime >= bgm.trimOut) { entry.active = false; continue; }
        entry.audio.currentTime = targetTime;
        const playPromise = entry.audio.play();
        if (playPromise) playPromise.catch(() => {});
      }

      if (entry.active) {
        entry.coverElapsed += dt;
        if (bgm.trimIn + entry.coverElapsed >= bgm.trimOut) {
          entry.audio.pause();
          entry.active = false;
        }
      }
    } else {
      // Playhead outside the overlap time window
      pauseBGMEntry(bgm.id);
    }
  }
}

// Rebuild BGM state from scratch (on resume after pause + edits)
function rebuildBGMFromSequence(sequence, pausedAt) {
  stopAllBGM();

  const allBGMs = state.cards.filter(c => c.type === 'audio');
  if (allBGMs.length === 0) return;

  // For each BGM, compute coverElapsed by walking the sequence
  const posNow = resolveCardTime(sequence, pausedAt);
  const curCard = state.cards.find(c => c.id === posNow.cardId);

  for (const bgm of allBGMs) {
    let coverElapsed = -1; // -1 = playhead hasn't entered overlap yet
    let timeAccum = 0;

    for (const cardId of sequence) {
      const card = state.cards.find(c => c.id === cardId);
      if (!card) continue;
      const cardDur = card.trimOut - card.trimIn;
      const cardEnd = timeAccum + cardDur;

      if (!isCardOverlapped(card, bgm)) {
        timeAccum = cardEnd;
        if (timeAccum >= pausedAt) break;
        continue;
      }

      const ov = getBGMOverlapOnCard(bgm, card);
      if (!ov) { timeAccum = cardEnd; if (timeAccum >= pausedAt) break; continue; }

      // The playhead covered this card from timeAccum to min(cardEnd, pausedAt)
      const scanEnd = Math.min(cardEnd, pausedAt);
      if (timeAccum < scanEnd) {
        // Start time within card that playhead went through
        const t0 = Math.max(timeAccum, ov.vidStart);
        const t1 = Math.min(scanEnd, ov.vidEnd);
        if (t0 < t1) {
          if (coverElapsed < 0) {
            // First overlap — compute initial offset from spatial position
            const playheadAtEntry = card.x + ((t0 - card.trimIn) / cardDur) * getCardWidth(card);
            const initalCover = (playheadAtEntry - bgm.x) / PIXELS_PER_SECOND;
            coverElapsed = Math.max(0, initalCover);
          }
          coverElapsed += (t1 - t0);
        }
      }

      timeAccum = cardEnd;
      if (timeAccum >= pausedAt) break;
    }

    if (coverElapsed <= 0) continue;
    if (bgm.trimIn + coverElapsed >= bgm.trimOut) continue;

    // Determine if BGM should be active right now
    let activeNow = false;
    if (curCard && isCardOverlapped(curCard, bgm)) {
      const ov = getBGMOverlapOnCard(bgm, curCard);
      if (ov) {
        const curTime = curCard.trimIn + posNow.cardProgress * (curCard.trimOut - curCard.trimIn);
        activeNow = curTime >= ov.vidStart && curTime < ov.vidEnd;
      }
    }

    const audio = new Audio(bgm.fileURL);
    audio.volume = bgm.volume;
    audio.currentTime = bgm.trimIn + coverElapsed;
    if (activeNow) {
      const playPromise = audio.play();
      if (playPromise) playPromise.catch(() => {});
    }
    state.bgmEntries.push({ cardId: bgm.id, audio, coverElapsed, active: activeNow });
  }
}

// BGM overlay for group playback — spatial playhead check
function updateGroupBGMTick(playheadX, dt) {
  const gp = state.playback.groupPlayback;
  const group = state.groups.find(g => g.id === gp.groupId);
  if (!group) return;

  // Only process audio cards in the playing group
  const groupBGMs = state.cards.filter(c => c.type === 'audio' && group.cardIds.includes(c.id));
  const chains = buildGroupChains(group);

  // Build a set of audio card IDs that are "active" per chain logic
  const activeAudioIds = new Set();
  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];
      const card = seg.card;
      if (!card || card.type !== 'audio') continue;
      const cw = getCardWidth(card);
      if (playheadX < card.x || playheadX >= card.x + cw) continue;
      // Check sequential suppression (same as video chain logic)
      if (i > 0) {
        const prevCard = chain[i - 1].card;
        const prevConn = chain[i - 1].nextConn;
        if (prevCard) {
          const prevCw = getCardWidth(prevCard);
          const transDur = (prevConn && prevConn.transitionDuration) || 0.5;
          const transPx = transDur * PIXELS_PER_SECOND;
          if (playheadX < prevCard.x + prevCw - transPx) continue;
        }
      }
      activeAudioIds.add(card.id);
      break;
    }
  }

  for (const bgm of groupBGMs) {
    const bw = getCardWidth(bgm);
    const bgmRight = bgm.x + bw;

    // Check if playhead is within this audio card's spatial range AND chain permits it
    if (playheadX < bgm.x || playheadX >= bgmRight || !activeAudioIds.has(bgm.id)) {
      pauseBGMEntry(bgm.id);
      continue;
    }

    const bgmLocalTime = bgm.trimIn + (playheadX - bgm.x) / PIXELS_PER_SECOND;
    if (bgmLocalTime >= bgm.trimOut || bgmLocalTime < bgm.trimIn) {
      pauseBGMEntry(bgm.id);
      continue;
    }

    let entry = state.bgmEntries.find(e => e.cardId === bgm.id);

    if (!entry) {
      const coverElapsed = Math.max(0, Math.min(bgm.trimOut - bgm.trimIn, bgmLocalTime - bgm.trimIn));
      if (coverElapsed >= bgm.trimOut - bgm.trimIn) continue;

      const audio = new Audio(bgm.fileURL);
      audio.volume = bgm.volume;
      audio.currentTime = bgm.trimIn + coverElapsed;
      const playPromise = audio.play();
      if (playPromise) playPromise.catch(() => {});
      entry = { cardId: bgm.id, audio, coverElapsed, active: true };
      state.bgmEntries.push(entry);
    } else if (!entry.active) {
      const coverElapsed = Math.max(0, Math.min(bgm.trimOut - bgm.trimIn, bgmLocalTime - bgm.trimIn));
      if (coverElapsed >= bgm.trimOut - bgm.trimIn) { entry.active = false; continue; }
      entry.active = true;
      entry.audio.currentTime = bgm.trimIn + coverElapsed;
      entry.coverElapsed = coverElapsed;
      const playPromise = entry.audio.play();
      if (playPromise) playPromise.catch(() => {});
    }

    if (entry.active) {
      entry.coverElapsed += dt;
      if (bgm.trimIn + entry.coverElapsed >= bgm.trimOut) {
        entry.audio.pause();
        entry.active = false;
      }
    }
  }
}

function stopAllBGM() {
  for (const entry of state.bgmEntries) {
    try {
      entry.audio.pause();
      entry.audio.src = '';
    } catch (e) { /* ignore */ }
  }
  state.bgmEntries = [];
}

// ---- Group video entry management (multi-track) ----

function stopAllGroupVideoEntries() {
  for (const entry of state.groupVideoEntries) {
    try {
      entry.video.pause();
      entry.video.src = '';
    } catch (e) { /* ignore */ }
  }
  state.groupVideoEntries = [];
}

// Pause but keep video src + entries alive — used when pausing playback
// so transform recalc can still read video dimensions.
function pauseAllGroupVideoEntries() {
  for (const entry of state.groupVideoEntries) {
    try { entry.video.pause(); } catch (e) { /* ignore */ }
    entry.active = false;
  }
}

// Ensure all video cards in a group have their video entries loaded,
// so calculateVideoRect can use real dimensions instead of 16:9 fallback.
function preloadGroupVideoEntries(group) {
  if (!group) return;
  for (const cardId of group.cardIds) {
    const card = state.cards.find(c => c.id === cardId);
    if (card && card.type === 'video') {
      ensureGroupVideoEntry(card);
    }
  }
}

function ensureGroupVideoEntry(card) {
  let entry = state.groupVideoEntries.find(e => e.cardId === card.id);
  if (!entry) {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = card.fileURL;
    video.load(); // explicitly trigger loading
    video._cardId = card.id;
    entry = { cardId: card.id, video, active: false };
    state.groupVideoEntries.push(entry);
  }
  return entry;
}

// ---- Playhead & Transition rendering (called from main render, world-space) ----

function renderPlayhead() {
  const pb = state.playback;
  if (!pb.isPlaying && pb.pausedAt === 0) return;
  if (!pb.currentCardId) return;

  const card = state.cards.find(c => c.id === pb.currentCardId);
  if (!card) return;

  // Use absolute pausedCardTime if available (survives trim changes)
  let progress;
  if (pb.pausedCardTime > 0 || !pb.isPlaying) {
    const dur = card.trimOut - card.trimIn;
    progress = dur > 0 ? (pb.pausedCardTime - card.trimIn) / dur : 0;
  } else {
    progress = pb.cardProgress;
  }
  progress = Math.max(0, Math.min(1, progress));

  const cw = getCardWidth(card);
  const px = card.x + cw * progress;

  // Store for hit testing
  pb._playheadX = px;
  pb._playheadCardId = card.id;

  // Red playhead line
  const isVid = card.type === 'video' || card.type === 'synthesized-video';
  const ch = card.type === 'image' ? (card.height || CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT) :
             isVid ? CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT :
             card.type === 'composition' ? CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT :
             card.type === 'audio' ? CARD_WAVEFORM_HEIGHT + CARD_LABEL_HEIGHT + 4 :
             CARD_HEIGHT;
  const topY = card.y;
  const botY = card.y + ch;
  ctx.strokeStyle = '#FF3333';
  ctx.lineWidth = 2 / state.canvas.zoom;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(px, topY);
  ctx.lineTo(px, botY);
  ctx.stroke();

  // Triangle head at top
  const triH = 8 / state.canvas.zoom;
  const triW = 5 / state.canvas.zoom;
  ctx.fillStyle = '#FF3333';
  ctx.beginPath();
  ctx.moveTo(px, topY);
  ctx.lineTo(px - triW, topY - triH);
  ctx.lineTo(px + triW, topY - triH);
  ctx.closePath();
  ctx.fill();

  // Glow
  ctx.save();
  ctx.shadowColor = 'rgba(255,51,51,0.45)';
  ctx.shadowBlur = 6 / state.canvas.zoom;
  ctx.strokeStyle = '#FF3333';
  ctx.lineWidth = 1.5 / state.canvas.zoom;
  ctx.beginPath();
  ctx.moveTo(px, topY);
  ctx.lineTo(px, botY);
  ctx.stroke();
  ctx.restore();
}

function renderTransitionOverlay() {
  const pb = state.playback;
  if (!pb.isPlaying) return;
  if (!pb.inTransition || !pb.transitionConn) return;

  const conn = pb.transitionConn;
  const progress = pb.transitionProgress;

  // Fade to black transition
  if (conn.transition === 'fade') {
    // Fade in black, then fade out: progress 0→1
    // 0–0.5: fade to black, 0.5–1: fade from black
    let alpha;
    if (progress < 0.5) {
      alpha = progress * 2; // 0 → 1
    } else {
      alpha = (1 - progress) * 2; // 1 → 0
    }
    alpha = Math.max(0, Math.min(1, alpha));

    // Full canvas overlay (screen space — need special handling)
    // Save the world-space state, render to screen
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.8})`;
    ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    // Restore world transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(state.canvas.offsetX, state.canvas.offsetY);
    ctx.scale(state.canvas.zoom, state.canvas.zoom);
  }
}

// ---- Group multi-track playback ----

// Offscreen canvas reused across ticks to avoid GC
let _compositeCanvas = null;

function compositeGroupFrame(group, timelineCards, playheadX, outW, outH) {
  const pb = state.playback;
  const memberCards = group.cardIds.map(id => state.cards.find(c => c.id === id)).filter(Boolean);
  if (memberCards.length === 0) return null;

  // Default 16:9 output size, can be overridden for high-res fullscreen
  outW = outW || 320;
  outH = outH || 180;

  if (!_compositeCanvas) {
    _compositeCanvas = document.createElement('canvas');
  }
  _compositeCanvas.width = outW;
  _compositeCanvas.height = outH;
  const cc = _compositeCanvas.getContext('2d');

  cc.fillStyle = '#000';
  cc.fillRect(0, 0, outW, outH);

  const MAX_ACTIVE = 8;

  // Build chains from connections
  const chains = buildGroupChains(group);

  // For each chain, determine which card(s) are active at playheadX.
  // Within a chain, only sequential cards are active (with transition blending).
  // Across chains, all chains play simultaneously (multi-track compositing).
  const drawList = []; // { card, video, alpha, sortY }

  for (const chain of chains) {
    // Find active segment in this chain
    for (let i = 0; i < chain.length; i++) {
      const seg = chain[i];
      const card = seg.card;
      if (!card || card.type !== 'video') continue;

      // Freeze frame: draw static frame image directly (no video loading)
      if (card.isFreezeFrame && card.frameImage) {
        const cw = getCardWidth(card);
        if (playheadX < card.x || playheadX >= card.x + cw) continue;
        // Sequential check (same as video)
        if (i > 0) {
          const prevSeg = chain[i - 1];
          const prevCard = prevSeg.card;
          if (prevCard) {
            const prevCw = getCardWidth(prevCard);
            const transDur = (prevSeg.nextConn && prevSeg.nextConn.transitionDuration) || 0.5;
            const transPx = transDur * PIXELS_PER_SECOND;
            const transStart = prevCard.x + prevCw - transPx;
            if (playheadX < transStart) continue;
          }
        }
        let alpha = 1;
        // Transitions for freeze frame
        const segNextConn = seg.nextConn;
        if (segNextConn && segNextConn.transition !== 'cut') {
          const transDur = segNextConn.transitionDuration || 0.5;
          const transPx = transDur * PIXELS_PER_SECOND;
          const endX = card.x + cw;
          if (playheadX >= endX - transPx) {
            const transProgress = (playheadX - (endX - transPx)) / transPx;
            alpha = segNextConn.transition === 'fade'
              ? (transProgress < 0.5 ? (1 - transProgress * 2) : 0)
              : 1 - transProgress;
            alpha = Math.max(0, Math.min(1, alpha));
          }
        }
        if (i > 0) {
          const prevSeg = chain[i - 1];
          const prevConn = prevSeg.nextConn;
          if (prevConn && prevConn.transition !== 'cut') {
            const transDur = prevConn.transitionDuration || 0.5;
            const transPx = transDur * PIXELS_PER_SECOND;
            const startX = card.x;
            if (playheadX <= startX + transPx) {
              const transProgress = (playheadX - (startX - transPx)) / transPx;
              if (transProgress > 0) {
                alpha = prevConn.transition === 'fade'
                  ? (transProgress > 0.5 ? ((transProgress - 0.5) * 2) : 0)
                  : transProgress;
                alpha = Math.max(0, Math.min(1, alpha));
              }
            }
          }
        }
        if (alpha > 0) drawList.push({ card, video: null, alpha, sortY: card.y, isFreezeFrame: true });

        // Pre-warm next card's video
        if (i < chain.length - 1) {
          const nextSeg2 = chain[i + 1];
          const nextCard2 = nextSeg2.card;
          if (nextCard2 && nextCard2.type === 'video' && !nextCard2.isFreezeFrame) {
            const nextEntry2 = ensureGroupVideoEntry(nextCard2);
            if (nextEntry2.video.readyState >= 2) {
              if (Math.abs(nextEntry2.video.currentTime - nextCard2.trimIn) > 0.05) {
                nextEntry2.video.currentTime = nextCard2.trimIn;
              }
            }
          }
        }

        break;
      }

      const cw = getCardWidth(card);

      // Is playhead in this card's spatial range?
      if (playheadX < card.x || playheadX >= card.x + cw) continue;

      // If this card is connected FROM a previous card in the chain,
      // it should only activate when playhead reaches it (sequential).
      // Cards at the start of a chain (i === 0) always activate.
      if (i > 0) {
        const prevSeg = chain[i - 1];
        const prevCard = prevSeg.card;
        const prevConn = prevSeg.nextConn;
        if (prevCard) {
          const prevCw = getCardWidth(prevCard);
          const transDur = (prevConn && prevConn.transitionDuration) || 0.5;
          const transPx = transDur * PIXELS_PER_SECOND;
          // Only activate if playhead has passed the previous card
          // (allow transition overlap at the boundary)
          const transStart = prevCard.x + prevCw - transPx;
          if (playheadX < transStart) continue;
        }
      }

      // Load and seek video
      const entry = ensureGroupVideoEntry(card);
      const video = entry.video;
      if (video.readyState < 2) continue;
      entry.active = true;

      const targetTime = card.trimIn + (playheadX - card.x) / PIXELS_PER_SECOND;
      const clampedTime = Math.max(card.trimIn, Math.min(card.trimOut - 0.001, targetTime));
      const seekDist = Math.abs(video.currentTime - clampedTime);
      if (seekDist > 0.1) {
        video.currentTime = clampedTime;
        // If jumping from far away (e.g. time 0 → trimIn), skip this frame
        // so the decoder has time to catch up and we don't draw frame 0.
        if (seekDist > 0.5) continue;
      }
      if (video.paused) {
        const playPromise = video.play();
        if (playPromise) playPromise.catch(() => {});
      }

      // Calculate alpha for transitions
      let alpha = 1;

      // Outgoing transition (dissolve/fade to next card in chain)
      const segNextConn = seg.nextConn;
      if (segNextConn && segNextConn.transition !== 'cut') {
        const transDur = segNextConn.transitionDuration || 0.5;
        const transPx = transDur * PIXELS_PER_SECOND;
        const endX = card.x + cw;
        if (playheadX >= endX - transPx) {
          const transProgress = (playheadX - (endX - transPx)) / transPx;
          if (segNextConn.transition === 'fade') {
            alpha = transProgress < 0.5 ? (1 - transProgress * 2) : 0;
          } else {
            alpha = 1 - transProgress; // dissolve
          }
          alpha = Math.max(0, Math.min(1, alpha));
        }
      }

      // Incoming transition (from previous card in chain)
      if (i > 0) {
        const prevSeg = chain[i - 1];
        const prevConn = prevSeg.nextConn;
        if (prevConn && prevConn.transition !== 'cut') {
          const transDur = prevConn.transitionDuration || 0.5;
          const transPx = transDur * PIXELS_PER_SECOND;
          const startX = card.x;
          if (playheadX <= startX + transPx) {
            const transProgress = (playheadX - (startX - transPx)) / transPx;
            if (transProgress > 0) {
              if (prevConn.transition === 'fade') {
                alpha = transProgress > 0.5 ? ((transProgress - 0.5) * 2) : 0;
              } else {
                alpha = transProgress; // dissolve
              }
              alpha = Math.max(0, Math.min(1, alpha));
            }
          }
        }
      }

      if (alpha <= 0) continue;

      drawList.push({ card, video, alpha, sortY: card.y });

      // Pre-warm next card's video so it doesn't flash frame 0 when activated
      if (i < chain.length - 1) {
        const nextSeg = chain[i + 1];
        const nextCard = nextSeg.card;
        if (nextCard && nextCard.type === 'video' && !nextCard.isFreezeFrame) {
          const nextEntry = ensureGroupVideoEntry(nextCard);
          if (nextEntry.video.readyState >= 2) {
            if (Math.abs(nextEntry.video.currentTime - nextCard.trimIn) > 0.05) {
              nextEntry.video.currentTime = nextCard.trimIn;
            }
          }
        }
      }

      break; // Only one card active per chain (stop scanning)
    }
  }

  // Keyframe connections: overlay A with interpolated properties when playhead is in the gap
  const allKeyframeConns = state.connections.filter(c =>
    c.type === 'keyframe' && group.cardIds.includes(c.fromCardId) && group.cardIds.includes(c.toCardId)
  );
  for (const kfConn of allKeyframeConns) {
    const fromC = state.cards.find(c => c.id === kfConn.fromCardId);
    const toC = state.cards.find(c => c.id === kfConn.toCardId);
    if (!fromC || !toC || fromC.type !== 'video') continue;
    const fromCw = getCardWidth(fromC);
    const anchorX = fromC.x + fromCw * (kfConn.fromPosition || 0);
    const gapEndX = toC.x;
    if (playheadX >= anchorX && playheadX < gapEndX) {
      // Load and seek A's video
      const entry = ensureGroupVideoEntry(fromC);
      const video = entry.video;
      if (video.readyState >= 2) {
        entry.active = true;
        const targetTime = fromC.trimIn + (playheadX - fromC.x) / PIXELS_PER_SECOND;
        const clampedTime = Math.max(fromC.trimIn, Math.min(fromC.trimOut - 0.001, targetTime));
        const seekDistKF = Math.abs(video.currentTime - clampedTime);
        if (seekDistKF > 0.1) {
          video.currentTime = clampedTime;
          if (seekDistKF > 0.5) continue;
        }
        if (video.paused) {
          const playPromise = video.play();
          if (playPromise) playPromise.catch(() => {});
        }
        // Calculate eased progress
        let t = (playheadX - anchorX) / (gapEndX - anchorX);
        t = Math.max(0, Math.min(1, t));
        t = applyEasing(t, kfConn.easing || 'ease-in-out');
        // Build interpolated effective props for A (only selected properties)
        const activeProps = kfConn.properties || ['opacity', 'transformScale', 'transformX', 'transformY'];
        const fromOpacity = fromC.opacity != null ? fromC.opacity : 1;
        const fromScale = fromC.transformScale || 1;
        const fromTX = fromC.transformX || 0;
        const fromTY = fromC.transformY || 0;
        const toOpacity = toC.opacity != null ? toC.opacity : 1;
        const toScale = toC.transformScale || 1;
        const toTX = toC.transformX || 0;
        const toTY = toC.transformY || 0;
        const lerpedProps = {
          opacity: activeProps.includes('opacity') ? lerp(fromOpacity, toOpacity, t) : fromOpacity,
          transformScale: activeProps.includes('transformScale') ? lerp(fromScale, toScale, t) : fromScale,
          transformX: activeProps.includes('transformX') ? lerp(fromTX, toTX, t) : fromTX,
          transformY: activeProps.includes('transformY') ? lerp(fromTY, toTY, t) : fromTY
        };
        // Store so the drawing loop picks them up
        if (!pb._effectiveProps) pb._effectiveProps = {};
        pb._effectiveProps[fromC.id] = {
          ...(pb._effectiveProps[fromC.id] || {}),
          ...lerpedProps
        };
        // Ensure A is in drawList (if not already added by chain)
        if (!drawList.find(d => d.card.id === fromC.id)) {
          drawList.push({ card: fromC, video, alpha: lerpedProps.opacity, sortY: fromC.y });
        }
      }
    }
  }

  // Pre-warm video for nearest upcoming card (cross-chain) so it
  // doesn't flash frame 0 when first activated.
  let nearestUpcoming = null;
  let nearestUpcomingDist = Infinity;
  for (const card of memberCards) {
    if (card.type !== 'video' || card.isFreezeFrame) continue;
    if (card.x <= playheadX) continue;
    const dist = card.x - playheadX;
    if (dist < nearestUpcomingDist) { nearestUpcomingDist = dist; nearestUpcoming = card; }
  }
  if (nearestUpcoming) {
    const upcomingEntry = ensureGroupVideoEntry(nearestUpcoming);
    if (upcomingEntry.video.readyState >= 2 &&
        Math.abs(upcomingEntry.video.currentTime - nearestUpcoming.trimIn) > 0.05) {
      upcomingEntry.video.currentTime = nearestUpcoming.trimIn;
    }
  }

  if (drawList.length === 0) {
    // Pause all inactive videos
    for (const entry of state.groupVideoEntries) {
      if (entry.active) { entry.video.pause(); entry.active = false; }
    }
    return _compositeCanvas;
  }

  // Limit active entries
  if (drawList.length > MAX_ACTIVE) {
    drawList.length = MAX_ACTIVE;
  }

  // Sort by Y for Z-order: higher Y first (bottom), lower Y last (top)
  drawList.sort((a, b) => b.sortY - a.sortY);

  // Draw
  for (const d of drawList) {
    if (d.video && d.video.videoWidth > 0 && d.video.videoHeight > 0) {
      try {
        // Use interpolated properties when tween playback is active
        const eff = (pb._effectiveProps && pb._effectiveProps[d.card.id]) || {};
        const cardOpacity = eff.opacity != null ? eff.opacity : 1;
        cc.globalAlpha = d.alpha * cardOpacity;
        const vw = d.video.videoWidth;
        const vh = d.video.videoHeight;
        const baseScale = Math.min(outW / vw, outH / vh);
        const ts = eff.transformScale != null ? eff.transformScale : (d.card.transformScale || 1.0);
        const tx = eff.transformX != null ? eff.transformX : (d.card.transformX || 0);
        const ty = eff.transformY != null ? eff.transformY : (d.card.transformY || 0);
        const scale = baseScale * ts;
        const dw = vw * scale;
        const dh = vh * scale;
        const sx = (outW - vw * baseScale) / 2 + tx;
        const sy = (outH - vh * baseScale) / 2 + ty;
        cc.drawImage(d.video, sx, sy, dw, dh);
      } catch (e) { /* ignore */ }
    } else if (d.isFreezeFrame) {
      // Recreate frameImage from dataURL if lost
      if (d.card.frameImageDataURL && (!d.card.frameImage || !d.card.frameImage.src)) {
        d.card.frameImage = new Image();
        d.card.frameImage.src = d.card.frameImageDataURL;
      }
      if (d.card.frameImage && d.card.frameImage.complete) {
      try {
        const eff = (pb._effectiveProps && pb._effectiveProps[d.card.id]) || {};
        const cardOpacity = eff.opacity != null ? eff.opacity : 1;
        cc.globalAlpha = d.alpha * cardOpacity;
        const img = d.card.frameImage;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const baseScale = Math.min(outW / iw, outH / ih);
        const ts = eff.transformScale != null ? eff.transformScale : (d.card.transformScale || 1.0);
        const tx = eff.transformX != null ? eff.transformX : (d.card.transformX || 0);
        const ty = eff.transformY != null ? eff.transformY : (d.card.transformY || 0);
        const scale = baseScale * ts;
        const dw = iw * scale, dh = ih * scale;
        const sx = (outW - iw * baseScale) / 2 + tx;
        const sy = (outH - ih * baseScale) / 2 + ty;
        cc.drawImage(img, sx, sy, dw, dh);
      } catch (e) { /* ignore */ }
      }
    }
  }
  cc.globalAlpha = 1;

  // ---- Shape overlay pass: draw composition card shapes ----
  for (const tcard of timelineCards) {
    const card = tcard.card;
    if (card.type !== 'composition') continue;
    // Check if playhead is over this composition card
    if (playheadX < tcard.x || playheadX > tcard.x + tcard.width) continue;
    const eb = findEditBoxById(card.editBoxId);
    if (!eb || !(eb.shapes || []).length) continue;
    // Get effective shape overrides from tween interpolation
    const effCard = (pb._effectiveProps && pb._effectiveProps[card.id]) || {};
    const effOverrides = effCard.shapeOverrides || {};
    for (const s of eb.shapes) {
      const overrides = effOverrides[s.id] || {};
      const merged = { ...s, ...overrides };
      _drawShapeToComposite(cc, merged, outW, outH, eb);
    }
  }

  // ---- Synthesized video overlay pass ----
  for (const tcard of timelineCards) {
    const card = tcard.card;
    if (card.type !== 'synthesized-video') continue;
    if (playheadX < tcard.x || playheadX > tcard.x + tcard.width) continue;
    if ((card.editBoxChain || []).length === 0) continue;
    const cardProgress = tcard.width > 0 ? (playheadX - tcard.x) / tcard.width : 0;
    const frame = getSynthVideoFrame(card, cardProgress);
    if (frame.shapes.length > 0) {
      renderSynthFrameToCanvas(cc, frame.shapes, frame.viewport, outW, outH);
    }
  }

  // Pause videos not in the active draw list
  const activeIds = new Set(drawList.map(d => d.card.id));
  for (const entry of state.groupVideoEntries) {
    if (!entry.active) continue;
    if (!activeIds.has(entry.cardId)) {
      entry.video.pause();
      entry.active = false;
    }
  }

  return _compositeCanvas;
}

function _drawShapeToComposite(cc, s, outW, outH, eb) {
  // Compute scale: shapes are in world coords, composite canvas is in output coords
  const scaleX = outW / eb.width;
  const scaleY = outH / eb.height;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (outW - eb.width * scale) / 2 - eb.x * scale;
  const offsetY = (outH - eb.height * scale) / 2 - eb.y * scale;

  cc.save();
  cc.translate(offsetX, offsetY);
  cc.scale(scale, scale);
  cc.globalAlpha = s.opacity != null ? s.opacity : 1;

  if (s.shapeType === 'rect') {
    if (s.angle) { cc.save(); const rcx = s.left + s.width / 2; const rcy = s.top + s.height / 2; cc.translate(rcx, rcy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-rcx, -rcy); }
    if (s.fill) { cc.fillStyle = s.fill; cc.fillRect(s.left, s.top, s.width, s.height); }
    if (s.stroke) { cc.strokeStyle = s.stroke; cc.lineWidth = s.strokeWidth || 2; cc.strokeRect(s.left, s.top, s.width, s.height); }
    if (s.angle) cc.restore();
  } else if (s.shapeType === 'ellipse') {
    const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
    if (s.angle) { cc.save(); cc.translate(cx, cy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-cx, -cy); }
    cc.beginPath();
    cc.ellipse(cx, cy, s.width / 2, s.height / 2, 0, 0, Math.PI * 2);
    if (s.fill) { cc.fillStyle = s.fill; cc.fill(); }
    if (s.stroke) { cc.strokeStyle = s.stroke; cc.lineWidth = s.strokeWidth || 2; cc.stroke(); }
    if (s.angle) cc.restore();
  } else if (s.shapeType === 'line') {
    const lcx = (s.x1 + s.x2) / 2, lcy = (s.y1 + s.y2) / 2;
    if (s.angle) { cc.save(); cc.translate(lcx, lcy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-lcx, -lcy); }
    cc.strokeStyle = s.stroke || '#88C405';
    cc.lineWidth = s.strokeWidth || 2;
    cc.beginPath(); cc.moveTo(s.x1, s.y1); cc.lineTo(s.x2, s.y2); cc.stroke();
    if (s.angle) cc.restore();
  } else if (s.shapeType === 'text') {
    if (s.angle) { cc.save(); const cx = s.left + (s.width || 100) / 2; const cy = s.top + (s.height || 24) / 2; cc.translate(cx, cy); cc.rotate(s.angle * Math.PI / 180); cc.translate(-cx, -cy); }
    cc.fillStyle = s.fill || '#000';
    cc.font = `${s.fontWeight || 'Bold'} ${s.fontSize || 24}px "${s.fontFamily || 'Inter'}", system-ui, sans-serif`;
    cc.textAlign = s.textAlign || 'left';
    cc.textBaseline = 'top';
    cc.fillText(s.text || '', s.left, s.top);
    if (s.angle) cc.restore();
  }

  cc.restore();
}

function renderGroupPlayhead(group, playheadX) {
  const frame = getGroupFrame(group);
  if (!frame) return;

  const topY = frame.y + frame.titleH;
  const bottomY = frame.y + frame.h;

  ctx.strokeStyle = '#FF3333';
  ctx.lineWidth = 2 / state.canvas.zoom;
  ctx.lineCap = 'round';
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(playheadX, topY);
  ctx.lineTo(playheadX, bottomY);
  ctx.stroke();

  // Triangle head at top
  const triH = 8 / state.canvas.zoom;
  const triW = 5 / state.canvas.zoom;
  ctx.fillStyle = '#FF3333';
  ctx.beginPath();
  ctx.moveTo(playheadX, topY);
  ctx.lineTo(playheadX - triW, topY - triH);
  ctx.lineTo(playheadX + triW, topY - triH);
  ctx.closePath();
  ctx.fill();

  // Glow
  ctx.save();
  ctx.shadowColor = 'rgba(255,51,51,0.45)';
  ctx.shadowBlur = 6 / state.canvas.zoom;
  ctx.strokeStyle = '#FF3333';
  ctx.lineWidth = 1.5 / state.canvas.zoom;
  ctx.beginPath();
  ctx.moveTo(playheadX, topY);
  ctx.lineTo(playheadX, bottomY);
  ctx.stroke();
  ctx.restore();
}

// ---- Edit-box chain playback ----

function startEditBoxPlayback(ebId) {
  const chain = buildEditBoxChain(ebId);
  if (!chain || chain.length < 2) return false;

  const duration = getEditBoxChainDuration(chain);
  if (duration <= 0) return false;

  const pb = state.playback;

  // If editing, save fabric state and record edit box to restore after playback
  if (state.interaction.activeEditBoxId) {
    const editingEb = findEditBoxById(state.interaction.activeEditBoxId);
    if (editingEb) _saveFabricToEditBox(editingEb);
    pb._preEditBoxId = state.interaction.activeEditBoxId;
  }

  // Stop existing playback
  if (pb.isPlaying || pb.pausedAt > 0) {
    stopPlayback();
  }

  pb.playbackMode = 'eb-chain';
  pb.sequence = [];
  pb.currentCardId = null;
  pb.currentSeqIndex = 0;
  pb.cardProgress = 0;
  pb.pausedCardTime = 0;
  pb.totalDuration = duration;
  pb.startTime = performance.now();
  pb.pausedAt = 0;
  pb.inTransition = false;
  pb.transitionConn = null;
  pb.transitionProgress = 0;
  pb._dissolveOverlayCanvas = null;
  pb._ebChain = { chain, firstEbId: chain[0], duration, _currentInterp: null };
  pb._ebChainProgress = 0;
  pb._frameEditActive = false;

  pb.isPlaying = true;

  // Init BGM
  stopAllBGM();
  state.bgmPrevTimestamp = performance.now();

  pb.rafId = requestAnimationFrame(ebChainPlaybackTick);
  render();
  updatePreviewPanel();
  return true;
}

function ebChainPlaybackTick(timestamp) {
  const pb = state.playback;
  if (!pb.isPlaying || pb.playbackMode !== 'eb-chain') return;

  const chainData = pb._ebChain;
  if (!chainData || !chainData.chain || chainData.chain.length < 2) {
    stopPlayback();
    return;
  }

  const elapsed = (timestamp - pb.startTime) / 1000;
  const totalElapsed = pb.pausedAt + elapsed;

  if (totalElapsed >= chainData.duration) {
    stopPlayback();
    return;
  }

  pb._ebChainProgress = totalElapsed / Math.max(0.001, chainData.duration);

  // Find current segment in the chain
  const chain = chainData.chain;
  let timeAccum = 0;
  let foundInterp = null;
  let foundViewport = null;

  for (let i = 0; i < chain.length - 1; i++) {
    const eb = findEditBoxById(chain[i]);
    const nextEb = findEditBoxById(chain[i + 1]);
    if (!eb || !nextEb) continue;

    const conn = state.connections.find(c =>
      c.type === 'eb-keyframe' &&
      ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
       (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
    );

    let segDuration;
    if (conn && conn.transitionDuration > 0) {
      segDuration = conn.transitionDuration;
    } else {
      segDuration = Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
    }

    if (totalElapsed >= timeAccum && totalElapsed < timeAccum + segDuration) {
      const localT = segDuration > 0 ? (totalElapsed - timeAccum) / segDuration : 0;
      const easing = conn ? (conn.easing || 'linear') : 'linear';
      foundInterp = interpolateShapes(eb.shapes || [], nextEb.shapes || [], localT, easing);
      foundViewport = {
        x: eb.x + (nextEb.x - eb.x) * localT,
        y: eb.y + (nextEb.y - eb.y) * localT,
        width: eb.width + (nextEb.width - eb.width) * localT,
        height: eb.height + (nextEb.height - eb.height) * localT
      };
      chainData._currentInterp = foundInterp;
      chainData._currentViewport = foundViewport;
      break;
    }
    timeAccum += segDuration;
  }

  // Past end fallback — use last edit box's shapes
  if (!foundInterp) {
    const lastEb = findEditBoxById(chain[chain.length - 1]);
    if (lastEb) {
      foundInterp = JSON.parse(JSON.stringify(lastEb.shapes || []));
      foundViewport = lastEb;
      chainData._currentInterp = foundInterp;
      chainData._currentViewport = foundViewport;
    }
  }

  // Render to preview canvas
  if (foundInterp) {
    const refBox = foundViewport || findEditBoxById(chainData.firstEbId);
    const vpW = refBox ? refBox.width : 800;
    const vpH = refBox ? refBox.height : 600;
    const previewW = 247, previewH = 137;
    const scale = Math.min(previewW / vpW, previewH / vpH, 1);
    const cw = Math.floor(vpW * scale);
    const ch = Math.floor(vpH * scale);

    groupPreviewCanvas.width = cw;
    groupPreviewCanvas.height = ch;
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
    const pc = groupPreviewCanvas.getContext('2d');
    pc.clearRect(0, 0, cw, ch);
    renderSynthFrameToCanvas(groupPreviewCanvas, foundInterp, refBox, cw, ch);
  }

  render();
  updatePreviewPanel();
  pb.rafId = requestAnimationFrame(ebChainPlaybackTick);
}

function groupPlaybackTick(timestamp) {
  const pb = state.playback;
  if (!pb.isPlaying || pb.playbackMode !== 'group') return;

  const gp = pb.groupPlayback;
  const elapsed = (timestamp - pb.startTime) / 1000;
  const totalElapsed = pb.pausedAt + elapsed;
  const totalDuration = gp.totalPixels / PIXELS_PER_SECOND;

  if (totalElapsed >= totalDuration) {
    stopPlayback();
    return;
  }

  const playheadX = gp.groupStartX + totalElapsed * PIXELS_PER_SECOND;
  pb.totalDuration = totalDuration;

  // Composite frame
  const group = state.groups.find(g => g.id === gp.groupId);
  if (!group) { stopPlayback(); return; }

  const compositeResult = compositeGroupFrame(group, gp.timelineCards, playheadX);
  if (compositeResult) {
    const cw = compositeResult.width;
    const ch = compositeResult.height;
    groupPreviewCanvas.width = cw;
    groupPreviewCanvas.height = ch;
    // Match CSS display size to preview wrapper
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
    const pc = groupPreviewCanvas.getContext('2d');
    pc.drawImage(compositeResult, 0, 0);
  }

  // Store for rendering
  pb._groupPlayheadX = playheadX;
  pb._groupPlaybackGroup = group;

  // Compute effective properties for group cards with marker interpolation
  pb._effectiveProps = {};
  for (const tc of gp.timelineCards) {
    if (tc.card) {
      pb._effectiveProps[tc.card.id] = getCardEffectiveProperties(tc.card, playheadX);
    }
  }

  // BGM — dt guard
  const dt = (timestamp - state.bgmPrevTimestamp) / 1000;
  if (dt > 0 && dt < 0.5) {
    updateGroupBGMTick(playheadX, dt);
  }
  state.bgmPrevTimestamp = timestamp;

  render();
  updatePreviewPanel();
  pb.rafId = requestAnimationFrame(groupPlaybackTick);
}

function startGroupPlayback(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group || group.collapsed) return;

  const timeline = buildGroupTimeline(group);
  if (!timeline || timeline.totalDuration <= 0) return;

  const pb = state.playback;

  // Stop existing playback
  if (pb.isPlaying || pb.pausedAt > 0) {
    stopPlayback();
  }

  pb.playbackMode = 'group';
  pb.sequence = [];
  pb.currentCardId = null;
  pb.currentSeqIndex = 0;
  pb.cardProgress = 0;
  pb.pausedCardTime = 0;
  pb.totalDuration = timeline.totalDuration;
  pb.startTime = performance.now();
  pb.pausedAt = 0;
  pb.inTransition = false;
  pb.transitionConn = null;
  pb.transitionProgress = 0;
  pb._dissolveOverlayCanvas = null;
  pb._groupPlayheadX = timeline.startX;

  pb.groupPlayback = {
    groupId: group.id,
    groupStartX: timeline.startX,
    groupEndX: timeline.endX,
    totalPixels: timeline.totalPixels,
    timelineCards: timeline.cards
  };

  pb.isPlaying = true;

  // Initialize video entries for all video cards in the group
  stopAllGroupVideoEntries();
  for (const tc of timeline.cards) {
    if (tc.card.type === 'video') {
      ensureGroupVideoEntry(tc.card);
    }
  }

  // Init BGM
  stopAllBGM();
  state.bgmPrevTimestamp = performance.now();

  pb.rafId = requestAnimationFrame(groupPlaybackTick);
  render();
  updatePreviewPanel();
}

function _renderCompositionPreview(card) {
  const eb = findEditBoxById(card.editBoxId);
  if (!eb) return;

  const ebW = eb.width || 800;
  const ebH = eb.height || 600;
  const previewW = 247, previewH = 137;
  const scale = Math.min(previewW / ebW, previewH / ebH, 1);
  const cw = Math.floor(ebW * scale);
  const ch = Math.floor(ebH * scale);

  groupPreviewCanvas.width = cw;
  groupPreviewCanvas.height = ch;
  groupPreviewCanvas.style.width = '100%';
  groupPreviewCanvas.style.height = '100%';

  const pc = groupPreviewCanvas.getContext('2d');
  pc.fillStyle = '#000000';
  pc.fillRect(0, 0, cw, ch);

  if (!eb.shapes || !eb.shapes.length) return;

  // Get shape overrides from marker keyframes (matching group playback path)
  var overridesMap = {};
  var pb = state.playback;
  if (pb && pb._effectiveProps && pb._effectiveProps[card.id]) {
    overridesMap = pb._effectiveProps[card.id].shapeOverrides || {};
  }

  pc.save();
  // Offset by edit box position only if shapes are in world coords.
  // If shapes haven't been migrated yet (still local to edit box), skip the offset.
  if (eb._shapesWorldCoords) {
    pc.translate(-eb.x * scale, -eb.y * scale);
  }
  pc.scale(scale, scale);

  for (const base of eb.shapes) {
    // Merge base shape with marker overrides
    const overrides = overridesMap[base.id] || {};
    const s = { ...base, ...overrides };

    // Opacity (not handled before)
    const alpha = s.opacity != null ? s.opacity : 1;
    if (alpha <= 0) continue;
    if (alpha < 1) { pc.save(); pc.globalAlpha = alpha; }

    if (s.shapeType === 'rect') {
      if (s.angle) { pc.save(); const rcx = (s.left || 0) + (s.width || 100) / 2; const rcy = (s.top || 0) + (s.height || 100) / 2; pc.translate(rcx, rcy); pc.rotate(s.angle * Math.PI / 180); pc.translate(-rcx, -rcy); }
      pc.fillStyle = s.fill || 'rgba(136,196,5,0.15)';
      pc.strokeStyle = s.stroke || '#88C405';
      pc.lineWidth = s.strokeWidth || 2;
      pc.fillRect(s.left || 0, s.top || 0, s.width || 100, s.height || 100);
      pc.strokeRect(s.left || 0, s.top || 0, s.width || 100, s.height || 100);
      if (s.angle) pc.restore();
    } else if (s.shapeType === 'ellipse') {
      const cx = (s.left || 0) + (s.width || 100) / 2;
      const cy = (s.top || 0) + (s.height || 100) / 2;
      if (s.angle) { pc.save(); pc.translate(cx, cy); pc.rotate(s.angle * Math.PI / 180); pc.translate(-cx, -cy); }
      pc.beginPath();
      pc.ellipse(cx, cy, (s.width || 100) / 2, (s.height || 100) / 2, 0, 0, Math.PI * 2);
      pc.fillStyle = s.fill || 'rgba(136,196,5,0.15)';
      pc.strokeStyle = s.stroke || '#88C405';
      pc.lineWidth = s.strokeWidth || 2;
      pc.fill();
      pc.stroke();
      if (s.angle) pc.restore();
    } else if (s.shapeType === 'text') {
      if (s.angle) { pc.save(); const cx = (s.left || 0) + (s.width || 100) / 2; const cy = (s.top || 0) + (s.height || 24) / 2; pc.translate(cx, cy); pc.rotate(s.angle * Math.PI / 180); pc.translate(-cx, -cy); }
      pc.fillStyle = s.fill || '#000000';
      pc.font = `${s.fontWeight || 'bold'} ${s.fontSize || 24}px ${s.fontFamily || 'Inter, system-ui, sans-serif'}`;
      pc.textAlign = s.textAlign || 'left';
      pc.textBaseline = 'top';
      pc.fillText(s.text || '', s.left || 0, s.top || 0);
      if (s.angle) pc.restore();
    } else if (s.shapeType === 'line') {
      const lcx = ((s.x1 || 0) + (s.x2 || 100)) / 2, lcy = ((s.y1 || 0) + (s.y2 || 100)) / 2;
      if (s.angle) { pc.save(); pc.translate(lcx, lcy); pc.rotate(s.angle * Math.PI / 180); pc.translate(-lcx, -lcy); }
      pc.strokeStyle = s.stroke || '#88C405';
      pc.lineWidth = s.strokeWidth || 2;
      pc.beginPath();
      pc.moveTo(s.x1 || 0, s.y1 || 0);
      pc.lineTo(s.x2 || 100, s.y2 || 100);
      pc.stroke();
      if (s.angle) pc.restore();
    }

    if (alpha < 1) pc.restore();
  }

  pc.restore();
}

// ---- Easing functions ----

const EASING = {
  linear: t => t,
  easeIn: t => t * t,
  easeOut: t => t * (2 - t),
  easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function applyEasing(t, easingName) {
  const fn = EASING[easingName] || EASING.linear;
  return fn(t);
}

function deleteMarkerCard(marker) {
  pushUndo();
  const idx = state.markerCards.findIndex(m => m.id === marker.id);
  if (idx >= 0) state.markerCards.splice(idx, 1);
  state.connections = state.connections.filter(c =>
    c.fromCardId !== marker.id && c.toCardId !== marker.id
  );
  state.selection.markerCardId = null;
  state.selection.markerCardIds = [];
  render();
}

// ---- Property interpolation between marker keyframes ----

function getCardEffectiveProperties(card, playheadX) {
  // ---- Marker card interpolation ----
  // Gather marker cards for this card, sorted by x position
  const markers = state.markerCards
    .filter(m => m.parentCardId === card.id)
    .sort((a, b) => a.x - b.x);

  if (markers.length === 0) {
    // No markers — use card's own properties
    return {
      opacity: card.opacity != null ? card.opacity : 1,
      transformScale: card.transformScale != null ? card.transformScale : 1,
      transformX: card.transformX != null ? card.transformX : 0,
      transformY: card.transformY != null ? card.transformY : 0,
      shapeOverrides: null
    };
  }

  // Build keyframe list: [card start, ...markers sorted by x]
  const keyframes = [
    {
      x: card.x,
      opacity: card.opacity != null ? card.opacity : 1,
      transformScale: card.transformScale != null ? card.transformScale : 1,
      transformX: card.transformX != null ? card.transformX : 0,
      transformY: card.transformY != null ? card.transformY : 0,
      shapeOverrides: null,
      easing: 'linear'
    },
    ...markers.map(m => {
      // Find tween connection targeting this marker to get its easing
      const tweenConn = state.connections.find(c =>
        c.type === 'tween' && c.toCardId === m.id
      );
      return {
        x: m.x,
        opacity: m.properties.opacity,
        transformScale: m.properties.transformScale,
        transformX: m.properties.transformX,
        transformY: m.properties.transformY,
        shapeOverrides: m.shapeOverrides || null,
        easing: (tweenConn && tweenConn.easing) || 'linear'
      };
    })
  ];

  // Find the interval playheadX falls in
  if (playheadX <= keyframes[0].x) {
    const k = keyframes[0];
    return { opacity: k.opacity, transformScale: k.transformScale, transformX: k.transformX, transformY: k.transformY, shapeOverrides: k.shapeOverrides };
  }
  const last = keyframes[keyframes.length - 1];
  if (playheadX >= last.x) {
    return { opacity: last.opacity, transformScale: last.transformScale, transformX: last.transformX, transformY: last.transformY, shapeOverrides: last.shapeOverrides };
  }

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (playheadX >= a.x && playheadX < b.x) {
      const range = b.x - a.x;
      const rawT = range > 0 ? (playheadX - a.x) / range : 0;
      const easingFn = EASING[b.easing] || EASING.linear;
      const t = easingFn(rawT);
      return {
        opacity: lerp(a.opacity, b.opacity, t),
        transformScale: lerp(a.transformScale, b.transformScale, t),
        transformX: lerp(a.transformX, b.transformX, t),
        transformY: lerp(a.transformY, b.transformY, t),
        shapeOverrides: b.shapeOverrides
      };
    }
  }

  // Fallback
  const k = keyframes[0];
  return { opacity: k.opacity, transformScale: k.transformScale, transformX: k.transformX, transformY: k.transformY, shapeOverrides: k.shapeOverrides };
}

// ---- Marker card edit mode ----

function enterMarkerEditMode(marker) {
  const parentCard = state.cards.find(c => c.id === marker.parentCardId);
  if (!parentCard || parentCard.type !== 'composition') return;

  const eb = findEditBoxById(parentCard.editBoxId);
  if (!eb) return;

  // Jump playhead to marker time position and pause
  const pb = state.playback;
  if (pb.isPlaying) {
    togglePlayback();
  }

  // Build playback sequence from parent card
  const seq = buildPlaybackSequence(parentCard.id);
  const dur = calculateSequenceDuration(seq);
  if (dur > 0) {
    // Calculate time at marker position (relative to parent card)
    const markerTime = (marker.x - parentCard.x) / PIXELS_PER_SECOND;
    const cardLocalTime = parentCard.trimIn + Math.max(0, markerTime);
    // Seek using card-time approach
    pb.sequence = seq;
    pb.totalDuration = dur;
    pb.currentSeqIndex = 0;
    pb.currentCardId = parentCard.id;
    const cardDur = parentCard.trimOut - parentCard.trimIn;
    const clampedTime = Math.max(parentCard.trimIn, Math.min(parentCard.trimOut, cardLocalTime));
    pb.cardProgress = cardDur > 0 ? (clampedTime - parentCard.trimIn) / cardDur : 0;
    pb.pausedCardTime = clampedTime;
    pb.pausedAt = calcTotalElapsedAtCard(parentCard, pb.cardProgress);
    pb.isPlaying = false;
    pb.inTransition = false;
    pb.transitionConn = null;
    pb.transitionProgress = 0;
    pb._dissolveOverlayCanvas = null;
    pb.startTime = 0;
    if (pb.rafId) { cancelAnimationFrame(pb.rafId); pb.rafId = null; }
  }

  // Track editing marker
  state.interaction._editingMarkerId = marker.id;

  // Enter edit box on Fabric first (loads shapes)
  _enterEditBoxOnFabric(eb);
  state.interaction.activeEditBoxId = eb.id;

  // Apply shape overrides AFTER shapes are loaded
  if (marker.shapeOverrides && Object.keys(marker.shapeOverrides).length > 0) {
    _applyShapeOverridesToFabric(eb, marker.shapeOverrides);
  }

  render();
  updatePreviewPanel();
}

function updatePreviewPanel() {
  const pb = state.playback;
  const hasPlayback = pb.isPlaying || pb.pausedAt > 0;

  if (!hasPlayback) {
    playbackVideo.style.display = 'none';
    groupPreviewCanvas.style.display = 'none';
    document.getElementById('preview-status').style.display = 'none';
    pb._lastVisMode = null;
    return;
  }

  const isGroupMode = pb.playbackMode === 'group';
  const isEbChain = pb.playbackMode === 'eb-chain' && pb._ebChain;
  // Resolve current card once — avoid redundant state.cards.find() calls below
  const currentCard = pb.currentCardId ? state.cards.find(c => c.id === pb.currentCardId) : null;
  const isComposition = !isGroupMode && !isEbChain && currentCard && currentCard.type === 'composition';
  const isFreezeFrame = !isGroupMode && !isEbChain && currentCard && currentCard.isFreezeFrame;
  const isSynthVideo = !isGroupMode && !isEbChain && currentCard && currentCard.type === 'synthesized-video';
  const isDissolve = !isGroupMode && !isEbChain && pb.inTransition && pb._dissolveOverlayCanvas;
  const isStandaloneVideo = !isGroupMode && !isEbChain && !isComposition && !isFreezeFrame
    && !isSynthVideo && !isDissolve
    && currentCard && currentCard.type === 'video' && !currentCard.groupId;

  // Toggle visibility based on mode (skip if unchanged to avoid DOM writes)
  const visMode = isStandaloneVideo ? 'standalone' : isGroupMode ? 'group' : isDissolve ? 'dissolve'
    : isComposition ? 'comp' : isFreezeFrame ? 'freeze' : isSynthVideo ? 'synth'
    : isEbChain ? 'eb' : 'video';
  if (pb._lastVisMode !== visMode) {
    pb._lastVisMode = visMode;
    if (visMode === 'video') {
      playbackVideo.style.display = 'block';
      groupPreviewCanvas.style.display = 'none';
    } else {
      playbackVideo.style.display = 'none';
      groupPreviewCanvas.style.display = 'block';
    }
  }
  if (visMode === 'video') {
    playbackVideo.style.opacity = '';
    if (currentCard && currentCard.type === 'video' && !currentCard.groupId) {
      const ts = currentCard.transformScale || 1.0;
      const tx = currentCard.transformX || 0;
      const ty = currentCard.transformY || 0;
      playbackVideo.style.transform = `scale(${ts}) translate(${tx}px, ${ty}px)`;
    } else {
      playbackVideo.style.transform = '';
    }
  }

  // Dissolve crossfade: composite outgoing frame + incoming video
  if (isDissolve) {
    const cw = 320, ch = 180;
    groupPreviewCanvas.width = cw;
    groupPreviewCanvas.height = ch;
    const pc = groupPreviewCanvas.getContext('2d');
    pc.fillStyle = '#000';
    pc.fillRect(0, 0, cw, ch);

    // Draw incoming frame (video)
    if (playbackVideo.readyState >= 2 && playbackVideo.videoWidth > 0) {
      try {
        const vw = playbackVideo.videoWidth, vh = playbackVideo.videoHeight;
        const scale = Math.min(cw / vw, ch / vh);
        const dw = vw * scale, dh = vh * scale;
        pc.drawImage(playbackVideo, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      } catch(e) {}
    }

    // Draw outgoing frame (overlay) with decreasing alpha
    const fadeAlpha = 1 - pb.transitionProgress;
    if (pb._dissolveOverlayCanvas) {
      try {
        pc.globalAlpha = fadeAlpha;
        const lw = pb._dissolveOverlayCanvas.width, lh = pb._dissolveOverlayCanvas.height;
        const scale = Math.min(cw / lw, ch / lh);
        const dw = lw * scale, dh = lh * scale;
        pc.drawImage(pb._dissolveOverlayCanvas, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        pc.globalAlpha = 1;
      } catch(e) {}
    }

    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
  }

  // Standalone video: render frame on canvas for transform overlay
  if (isStandaloneVideo) {
    const cw = 320, ch = 180;
    if (groupPreviewCanvas.width !== cw || groupPreviewCanvas.height !== ch) {
      groupPreviewCanvas.width = cw;
      groupPreviewCanvas.height = ch;
    }
    const pc = groupPreviewCanvas.getContext('2d');
    pc.clearRect(0, 0, cw, ch);
    pc.fillStyle = '#000';
    pc.fillRect(0, 0, cw, ch);
    if (playbackVideo.readyState >= 2 && playbackVideo.videoWidth > 0) {
      try {
        // Use card transform properties (override via marker interpolation)
        const eff = (pb._effectiveProps && pb._effectiveProps[currentCard.id]) || {};
        const opacity = eff.opacity != null ? eff.opacity : (currentCard.opacity != null ? currentCard.opacity : 1);
        const ts = eff.transformScale != null ? eff.transformScale : (currentCard.transformScale || 1.0);
        const tx = eff.transformX != null ? eff.transformX : (currentCard.transformX || 0);
        const ty = eff.transformY != null ? eff.transformY : (currentCard.transformY || 0);
        const vw = playbackVideo.videoWidth, vh = playbackVideo.videoHeight;
        const baseScale = Math.min(cw / vw, ch / vh);
        const scale = baseScale * ts;
        const dw = vw * scale, dh = vh * scale;
        const sx = (cw - vw * baseScale) / 2 + tx;
        const sy = (ch - vh * baseScale) / 2 + ty;
        pc.globalAlpha = opacity;
        pc.drawImage(playbackVideo, sx, sy, dw, dh);
        pc.globalAlpha = 1;
      } catch(e) {}
    }
    // Canvas fills preview-wrapper via CSS width:100%;height:100%
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
  }

  // Composition card: render edit box shapes on preview canvas
  if (isComposition) {
    if (currentCard) _renderCompositionPreview(currentCard);
  }

  // Synthesized video: render interpolated shapes on preview canvas
  if (isSynthVideo && pb._synthProps) {
    const cw = 320, ch = 180;
    groupPreviewCanvas.width = cw;
    groupPreviewCanvas.height = ch;
    const pc = groupPreviewCanvas.getContext('2d');
    pc.clearRect(0, 0, cw, ch);
    renderSynthFrameToCanvas(groupPreviewCanvas, pb._synthProps.shapes, pb._synthProps.viewport, cw, ch);
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
  }

  // eb-chain: render paused frame (tick handles live rendering during playback)
  if (isEbChain && !pb.isPlaying && pb._ebChain._currentInterp) {
    const chainData = pb._ebChain;
    const refBox = chainData._currentViewport || findEditBoxById(chainData.firstEbId);
    const vpW = refBox ? refBox.width : 800;
    const vpH = refBox ? refBox.height : 600;
    const previewW = 247, previewH = 137;
    const scale = Math.min(previewW / vpW, previewH / vpH, 1);
    const cw = Math.floor(vpW * scale);
    const ch = Math.floor(vpH * scale);
    groupPreviewCanvas.width = cw;
    groupPreviewCanvas.height = ch;
    groupPreviewCanvas.style.width = '100%';
    groupPreviewCanvas.style.height = '100%';
    const pc = groupPreviewCanvas.getContext('2d');
    pc.clearRect(0, 0, cw, ch);
    renderSynthFrameToCanvas(groupPreviewCanvas, chainData._currentInterp, refBox, cw, ch);
  }

  // Freeze frame: render captured frame image on preview canvas
  if (isFreezeFrame) {
    const card = state.cards.find(c => c.id === pb.currentCardId);
    // Recreate frameImage from dataURL if lost (e.g., after undo/redo)
    if (card && card.frameImageDataURL && (!card.frameImage || !card.frameImage.src)) {
      card.frameImage = new Image();
      card.frameImage.src = card.frameImageDataURL;
    }
    if (card && card.frameImage && card.frameImage.complete) {
      const cw = 320, ch = 180;
      groupPreviewCanvas.width = cw;
      groupPreviewCanvas.height = ch;
      const pc = groupPreviewCanvas.getContext('2d');
      pc.fillStyle = '#000';
      pc.fillRect(0, 0, cw, ch);
      try {
        const iw = card.frameImage.naturalWidth || card.frameImage.width;
        const ih = card.frameImage.naturalHeight || card.frameImage.height;
        const baseScale = Math.min(cw / iw, ch / ih);
        const ts = card.transformScale || 1.0;
        const tx = card.transformX || 0;
        const ty = card.transformY || 0;
        const scale = baseScale * ts;
        const dw = iw * scale, dh = ih * scale;
        const sx = (cw - iw * baseScale) / 2 + tx;
        const sy = (ch - ih * baseScale) / 2 + ty;
        pc.drawImage(card.frameImage, sx, sy, dw, dh);
      } catch(e) {}

      groupPreviewCanvas.style.width = '100%';
      groupPreviewCanvas.style.height = '100%';
    }
  }

  document.getElementById('preview-status').style.display = 'flex';

  // Play state indicator
  previewDot.className = pb.isPlaying ? 'playing' : 'paused';

  const elapsed = pb.pausedAt + (pb.isPlaying ? (performance.now() - pb.startTime) / 1000 : 0);
  previewTime.textContent = formatTime(elapsed) + ' / ' + formatTime(pb.totalDuration);

  if (isGroupMode) {
    const group = state.groups.find(g => g.id === pb.groupPlayback.groupId);
    previewName.textContent = group ? (group.name || 'Group') : '';
  } else if (isEbChain) {
    const firstEb = pb._ebChain ? findEditBoxById(pb._ebChain.firstEbId) : null;
    previewName.textContent = firstEb ? ('编辑盒链 · ' + pb._ebChain.chain.length + ' 帧') : '编辑盒链';
  } else if (pb.currentCardId) {
    const card = state.cards.find(c => c.id === pb.currentCardId);
    previewName.textContent = card ? card.label : '';
  } else {
    previewName.textContent = '';
  }

  // Show/hide frame edit button for eb-chain paused state
  if (isEbChain && !pb.isPlaying && !pb._frameEditActive && pb._ebChain._currentInterp) {
    _showEbFrameEditButtons();
  } else if (!pb._frameEditActive) {
    _hideEbFrameEditButtons();
  }
}

// ================================================================
// eb-chain frame edit (per-frame keyframe insertion)
// ================================================================

let _ebFrameEditFabric = null;

function _showEbFrameEditButtons() {
  let container = document.getElementById('eb-frame-edit-bar');
  if (!container) {
    container = document.createElement('div');
    container.id = 'eb-frame-edit-bar';
    container.style.cssText = 'display:flex;gap:8px;padding:8px 0;align-items:center;';
    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewWrapper) previewWrapper.parentNode.insertBefore(container, previewWrapper.nextSibling);
  }
  container.innerHTML = '<button id="eb-frame-edit-btn" class="inspector-action-btn" style="flex:1;">编辑此帧</button>';
}

function _hideEbFrameEditButtons() {
  const container = document.getElementById('eb-frame-edit-bar');
  if (container) container.remove();
}

function _showEbFrameEditToolbar() {
  let container = document.getElementById('eb-frame-edit-bar');
  if (!container) {
    container = document.createElement('div');
    container.id = 'eb-frame-edit-bar';
    container.style.cssText = 'display:flex;gap:8px;padding:8px 0;align-items:center;';
    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewWrapper) previewWrapper.parentNode.insertBefore(container, previewWrapper.nextSibling);
  }
  container.innerHTML = '<button id="eb-frame-commit-btn" class="inspector-action-btn" style="flex:1;background:#4caf50;color:#fff;">插入关键帧</button>' +
    '<button id="eb-frame-cancel-btn" class="inspector-action-btn" style="flex:1;">取消</button>';
}

function _getEbChainScreenTransform(viewport) {
  // viewport: {x, y, width, height} in world coords
  const previewW = 247;
  const vpW = viewport ? viewport.width : 800;
  const vpH = viewport ? viewport.height : 600;
  const scale = Math.min(previewW / vpW, 1);
  const cw = Math.floor(vpW * scale);
  const ch = Math.floor(vpH * scale);
  return { scale, cw, ch, vpX: viewport ? viewport.x : 0, vpY: viewport ? viewport.y : 0, vpW, vpH };
}

function _ebWorldToScreen(viewport, shape) {
  const t = _getEbChainScreenTransform(viewport);
  return {
    left: ((shape.left || 0) - t.vpX) * t.scale,
    top: ((shape.top || 0) - t.vpY) * t.scale,
    width: (shape.width || 100) * t.scale,
    height: (shape.height || 100) * t.scale,
    fontSize: (shape.fontSize || 24) * t.scale,
    strokeWidth: (shape.strokeWidth || 2) * t.scale,
  };
}

function _ebScreenToWorld(viewport, screenShape) {
  const t = _getEbChainScreenTransform(viewport);
  return {
    left: (screenShape.left || 0) / t.scale + t.vpX,
    top: (screenShape.top || 0) / t.scale + t.vpY,
    width: (screenShape.width || 100) / t.scale,
    height: (screenShape.height || 100) / t.scale,
    fontSize: (screenShape.fontSize || 24) / t.scale,
    strokeWidth: (screenShape.strokeWidth || 2) / t.scale,
  };
}

function enterEbFrameEdit() {
  const pb = state.playback;
  if (pb.playbackMode !== 'eb-chain' || !pb._ebChain || pb._ebChainProgress == null) return;
  if (pb.isPlaying) return;
  if (!pb._ebChain._currentInterp) return;

  const chainData = pb._ebChain;
  const viewport = chainData._currentViewport || findEditBoxById(chainData.firstEbId);
  if (!viewport) return;

  pb._frameEditActive = true;

  const transform = _getEbChainScreenTransform(viewport);
  const previewWrapper = document.getElementById('preview-wrapper');
  if (!previewWrapper) return;

  groupPreviewCanvas.style.display = 'block';
  groupPreviewCanvas.width = transform.cw;
  groupPreviewCanvas.height = transform.ch;

  let overlayEl = document.getElementById('eb-frame-edit-canvas');
  if (!overlayEl) {
    overlayEl = document.createElement('canvas');
    overlayEl.id = 'eb-frame-edit-canvas';
    overlayEl.style.cssText = 'position:absolute;top:0;left:0;border-radius:6px;';
    previewWrapper.style.position = 'relative';
    previewWrapper.appendChild(overlayEl);
  }
  overlayEl.width = transform.cw;
  overlayEl.height = transform.ch;
  overlayEl.style.width = transform.cw + 'px';
  overlayEl.style.height = transform.ch + 'px';

  if (_ebFrameEditFabric) _ebFrameEditFabric.dispose();
  _ebFrameEditFabric = new fabric.Canvas(overlayEl, {
    selection: true,
    preserveObjectStacking: true,
  });

  const shapes = chainData._currentInterp;
  for (const s of shapes) {
    const screen = _ebWorldToScreen(viewport, s);
    let obj;
    if (s.shapeType === 'text') {
      obj = new fabric.IText(s.text || '', {
        left: screen.left, top: screen.top, fontSize: screen.fontSize,
        fontFamily: s.fontFamily || 'Inter', fontWeight: s.fontWeight || 'Bold',
        fill: s.fill || '#000000', textAlign: s.textAlign || 'left',
        opacity: s.opacity != null ? s.opacity : 1, angle: s.angle || 0,
        _shapeId: s.id, _shapeType: 'text',
      });
    } else if (s.shapeType === 'ellipse') {
      obj = new fabric.Ellipse({
        left: screen.left + screen.width / 2, top: screen.top + screen.height / 2,
        rx: screen.width / 2, ry: screen.height / 2,
        fill: s.fill || 'rgba(136,196,5,0.15)', stroke: s.stroke || '#88C405',
        strokeWidth: screen.strokeWidth, opacity: s.opacity != null ? s.opacity : 1,
        angle: s.angle || 0, _shapeId: s.id, _shapeType: 'ellipse',
        originX: 'center', originY: 'center',
      });
    } else if (s.shapeType === 'line') {
      const cx = ((s.x1 || 0) + (s.x2 || 100)) / 2;
      const cy = ((s.y1 || 0) + (s.y2 || 100)) / 2;
      const dx = (s.x2 || 100) - (s.x1 || 0);
      const dy = (s.y2 || 100) - (s.y1 || 0);
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      const ls = _ebWorldToScreen(viewport, { left: cx - len / 2, top: cy - (s.strokeWidth || 2) / 2, width: len, height: s.strokeWidth || 2 });
      obj = new fabric.Rect({
        left: ls.left, top: ls.top, width: ls.width, height: Math.max(2, ls.height),
        fill: s.stroke || '#88C405', opacity: s.opacity != null ? s.opacity : 1,
        angle: ang, _shapeId: s.id, _shapeType: 'line',
      });
    } else {
      obj = new fabric.Rect({
        left: screen.left, top: screen.top, width: screen.width, height: screen.height,
        fill: s.fill || 'rgba(136,196,5,0.15)', stroke: s.stroke || '#88C405',
        strokeWidth: screen.strokeWidth, opacity: s.opacity != null ? s.opacity : 1,
        angle: s.angle || 0, _shapeId: s.id, _shapeType: s.shapeType || 'rect',
      });
    }
    if (obj) _ebFrameEditFabric.add(obj);
  }
  _ebFrameEditFabric.requestRenderAll();
  _showEbFrameEditToolbar();
}

function commitEbFrameEdit() {
  const pb = state.playback;
  if (!pb._frameEditActive || !_ebFrameEditFabric || !pb._ebChain) return cancelEbFrameEdit();

  const chainData = pb._ebChain;
  const viewport = chainData._currentViewport || findEditBoxById(chainData.firstEbId);
  if (!viewport) return cancelEbFrameEdit();

  const editedShapes = [];
  _ebFrameEditFabric.getObjects().forEach(obj => {
    const sid = obj._shapeId || generateId();
    const shapeType = obj._shapeType || 'rect';
    const entry = { id: sid, shapeType };

    if (shapeType === 'text') {
      const aabb = obj.aCoords;
      entry.text = obj.text || '';
      entry.left = aabb.tl.x; entry.top = aabb.tl.y;
      entry.fontSize = obj.fontSize || 24;
      entry.fontFamily = obj.fontFamily || 'Inter';
      entry.fontWeight = obj.fontWeight || 'Bold';
      entry.fill = obj.fill;
      entry.textAlign = obj.textAlign || 'left';
      entry.width = aabb.width; entry.height = aabb.height;
      entry.angle = obj.angle || 0;
      entry.opacity = obj.opacity != null ? obj.opacity : 1;
    } else if (shapeType === 'ellipse') {
      entry.left = obj.left - obj.rx * obj.scaleX;
      entry.top = obj.top - obj.ry * obj.scaleY;
      entry.width = obj.rx * 2 * obj.scaleX;
      entry.height = obj.ry * 2 * obj.scaleY;
      entry.fill = obj.fill; entry.stroke = obj.stroke;
      entry.strokeWidth = obj.strokeWidth || 2;
      entry.angle = obj.angle || 0;
      entry.opacity = obj.opacity != null ? obj.opacity : 1;
    } else if (shapeType === 'line') {
      const aabb = obj.aCoords;
      const cx = aabb.tl.x + aabb.width / 2;
      const cy = aabb.tl.y + aabb.height / 2;
      const angRad = (obj.angle || 0) * Math.PI / 180;
      const halfW = aabb.width / 2;
      entry.x1 = cx - Math.cos(angRad) * halfW;
      entry.y1 = cy - Math.sin(angRad) * halfW;
      entry.x2 = cx + Math.cos(angRad) * halfW;
      entry.y2 = cy + Math.sin(angRad) * halfW;
      entry.stroke = obj.fill || '#88C405';
      entry.strokeWidth = obj.height || 2;
      entry.angle = obj.angle || 0;
      entry.opacity = obj.opacity != null ? obj.opacity : 1;
    } else {
      // Use object's own dimensions (not aabb which includes stroke & rotation distortion)
      entry.left = obj.left;
      entry.top = obj.top;
      entry.width = obj.width * (obj.scaleX || 1);
      entry.height = obj.height * (obj.scaleY || 1);
      entry.fill = obj.fill; entry.stroke = obj.stroke;
      entry.strokeWidth = obj.strokeWidth || 2;
      entry.angle = obj.angle || 0;
      entry.opacity = obj.opacity != null ? obj.opacity : 1;
    }
    const world = _ebScreenToWorld(viewport, entry);
    Object.assign(entry, world);
    editedShapes.push(entry);
  });

  const elapsed = pb.pausedAt;
  const chain = chainData.chain;
  let timeAccum = 0;
  let fromIdx = -1;
  let localT = 0;

  for (let i = 0; i < chain.length - 1; i++) {
    const eb = findEditBoxById(chain[i]);
    const nextEb = findEditBoxById(chain[i + 1]);
    if (!eb || !nextEb) continue;
    const conn = state.connections.find(c =>
      c.type === 'eb-keyframe' &&
      ((c.fromEditBoxId === chain[i] && c.toEditBoxId === chain[i + 1]) ||
       (c.fromEditBoxId === chain[i + 1] && c.toEditBoxId === chain[i]))
    );
    let segDuration;
    if (conn && conn.transitionDuration > 0) {
      segDuration = conn.transitionDuration;
    } else {
      segDuration = Math.abs(nextEb.x - eb.x) / PIXELS_PER_SECOND;
    }
    if (elapsed >= timeAccum && elapsed < timeAccum + segDuration) {
      fromIdx = i;
      localT = segDuration > 0 ? (elapsed - timeAccum) / segDuration : 0;
      break;
    }
    timeAccum += segDuration;
  }

  if (fromIdx < 0) fromIdx = chain.length - 2;

  const fromEb = findEditBoxById(chain[fromIdx]);
  const toEb = findEditBoxById(chain[fromIdx + 1]);
  if (!fromEb || !toEb) return cancelEbFrameEdit();

  const oldConn = state.connections.find(c =>
    c.type === 'eb-keyframe' &&
    ((c.fromEditBoxId === chain[fromIdx] && c.toEditBoxId === chain[fromIdx + 1]) ||
     (c.fromEditBoxId === chain[fromIdx + 1] && c.toEditBoxId === chain[fromIdx]))
  );

  pushUndo();
  const firstEb = findEditBoxById(chainData.firstEbId);
  const newEbId = generateId();
  const newEb = {
    id: newEbId,
    x: fromEb.x + (toEb.x - fromEb.x) * localT,
    y: fromEb.y + (toEb.y - fromEb.y) * localT,
    width: (firstEb && firstEb.width) || 800,
    height: (firstEb && firstEb.height) || 600,
    shapes: editedShapes,
    _shapesWorldCoords: true,
    camera: JSON.parse(JSON.stringify((firstEb && firstEb.camera) || { zoom: 1, offsetX: 0, offsetY: 0 })),
  };
  state.editBoxes.push(newEb);

  if (oldConn) {
    state.connections = state.connections.filter(c => c.id !== oldConn.id);
  }

  const conn1Id = generateId();
  const conn2Id = generateId();
  const easing = oldConn ? (oldConn.easing || 'linear') : 'linear';
  const transDur = oldConn ? oldConn.transitionDuration : 0;

  state.connections.push({
    id: conn1Id, type: 'eb-keyframe',
    fromEditBoxId: chain[fromIdx], toEditBoxId: newEbId,
    easing, transitionDuration: transDur > 0 ? transDur * localT : 0,
  });
  state.connections.push({
    id: conn2Id, type: 'eb-keyframe',
    fromEditBoxId: newEbId, toEditBoxId: chain[fromIdx + 1],
    easing, transitionDuration: transDur > 0 ? transDur * (1 - localT) : 0,
  });

  state.selection.editBoxId = newEbId;
  state.selection.editBoxIds = [newEbId];
  state.selection.cardIds = [];
  state.selection.groupIds = [];
  state.selection.connectionId = null;
  state.selection.connectionIds = [];
  if (state.interaction.activeEditBoxId) {
    state.interaction.activeEditBoxId = null;
    _clearEditBoxFabricObjects();
    fabricCanvas.getObjects().forEach(o => {
      if (o._preEditSelectable !== undefined) {
        o.set({ selectable: o._preEditSelectable, evented: o._preEditEvented, opacity: 1 });
        delete o._preEditSelectable;
        delete o._preEditEvented;
      }
    });
    fabricCanvas.requestRenderAll();
  }

  const newChain = buildEditBoxChain(chainData.firstEbId);
  const newDuration = getEditBoxChainDuration(newChain);
  chainData.chain = newChain;
  chainData.duration = newDuration;
  pb.totalDuration = newDuration;

  cleanupEbFrameEdit();
  render();
  updatePreviewPanel();
}

function cancelEbFrameEdit() {
  cleanupEbFrameEdit();
  updatePreviewPanel();
}

function cleanupEbFrameEdit() {
  const pb = state.playback;
  pb._frameEditActive = false;
  _hideEbFrameEditButtons();
  if (_ebFrameEditFabric) {
    _ebFrameEditFabric.dispose();
    _ebFrameEditFabric = null;
  }
  const overlayEl = document.getElementById('eb-frame-edit-canvas');
  if (overlayEl) overlayEl.remove();
}

