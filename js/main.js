// ================================================================
// Init
// ================================================================
resizeCanvas();
initFabricCanvas();
console.log('[INIT] fabricCanvas:', !!fabricCanvas, 'wrapperEl:', !!fabricCanvas?.wrapperEl);
render();

// ================================================================
// Debug: Fabric selection tracing
// ================================================================
// In browser console, type: debugFabricSelection() to start, debugFabricOff() to stop
window._fabricDebug = { enabled: false, events: [], _origHandlers: [] };

window.debugFabricSelection = function() {
  if (window._fabricDebug.enabled) { console.log('[DEBUG] Already enabled'); return; }
  window._fabricDebug.enabled = true;
  window._fabricDebug.events = [];
  console.log('%c[DEBUG] Fabric selection tracing ENABLED', 'color:#00aa00;font-weight:bold');
  console.log('  Click shapes → when bug occurs, check console for %c[ROOT-CAUSE]%c messages',
    'color:red;font-weight:bold', '');

  // ---- PATCH _shouldClearSelection to log WHY ----
  const origShouldClear = fabric.Canvas.prototype._shouldClearSelection;
  fabric.Canvas.prototype._shouldClearSelection = function(e) {
    var target = this.findTarget(e);
    var active = this._activeObject;
    var targetId = (target && target._shapeId) || (target && target.type) || null;
    var activeId = (active && active._shapeId) || (active && active.type) || null;
    var result;
    if (!active || !target || (active && target && active === target)) {
      result = false;
    } else {
      result = true;
    }
    if (window._fabricDebug.enabled && result) {
      console.log(`%c[ROOT-CAUSE] _shouldClearSelection → TRUE %c| active:${activeId} target:${targetId} sameRef:${active === target}`,
        'color:red;font-weight:bold', 'color:#333');
    }
    return result;
  };

  // ---- PATCH _onMouseDown to trace full flow ----
  const origOnMouseDown = fabric.Canvas.prototype._onMouseDown;
  fabric.Canvas.prototype._onMouseDown = function(e) {
    if (!window._fabricDebug.enabled) return origOnMouseDown.call(this, e);
    var activeBefore = this._activeObject;
    var activeIdBefore = (activeBefore && activeBefore._shapeId) || (activeBefore && activeBefore.type) || null;
    var t0 = performance.now();

    // Call findTarget early to see what Fabric would find
    var earlyTarget = this.findTarget(e);
    var earlyTargetId = (earlyTarget && earlyTarget._shapeId) || (earlyTarget && earlyTarget.type) || null;

    var result = origOnMouseDown.call(this, e);

    var activeAfter = this._activeObject;
    var activeIdAfter = (activeAfter && activeAfter._shapeId) || (activeAfter && activeAfter.type) || null;
    var dt = (performance.now() - t0).toFixed(1);

    if (activeIdBefore !== activeIdAfter) {
      console.log(`%c[TRACE] _onMouseDown ${dt}ms %c| before:${activeIdBefore} → after:${activeIdAfter} %c| earlyTarget:${earlyTargetId}`,
        'color:#0066cc;font-weight:bold', 'color:#0066cc', 'color:#666');
    }
    return result;
  };

  // ---- Hook into discardActiveObject to see call stack ----
  var origDiscard = fabric.Canvas.prototype.discardActiveObject;
  fabric.Canvas.prototype.discardActiveObject = function(e) {
    if (window._fabricDebug.enabled && this._activeObject) {
      var activeId = this._activeObject._shapeId || this._activeObject.type;
      console.log(`%c[DISCARD] discardActiveObject() called — losing: ${activeId}`,
        'color:#cc6600;font-weight:bold');
      console.log('  Stack:', new Error().stack.split('\n').slice(2, 6).join('\n       '));
    }
    return origDiscard.call(this, e);
  };

  // Simple event summary
  ['mouse:down', 'selection:created', 'selection:cleared'].forEach(function(ev) {
    var h = function(e2) {
      if (!window._fabricDebug.enabled) return;
      var ao = fabricCanvas && fabricCanvas.getActiveObject();
      var aoid = ao ? (ao._shapeId || ao.type) : 'none';
      var tgt = (e2 && e2.target) ? (e2.target._shapeId || e2.target.type) : '-';
      console.log(`  [${ev}] active:${aoid} target:${tgt}`);
    };
    fabricCanvas.on(ev, h);
    window._fabricDebug._origHandlers.push({ event: ev, handler: h });
  });
};

window.debugFabricOff = function() {
  window._fabricDebug.enabled = false;
  window._fabricDebug._origHandlers.forEach(({ event, handler }) => {
    fabricCanvas.off(event, handler);
  });
  window._fabricDebug._origHandlers = [];
  // Note: Fabric prototype patches (discardActiveObject, _shouldClearSelection, _onMouseDown)
  // are left in place — they're lightweight wrappers. Refresh page to fully remove.
  console.log('%c[DEBUG] Fabric selection tracing DISABLED (refresh page to fully restore)', 'color:#cc0000;font-weight:bold');
};

window.showDebugTrace = function() {
  // Look for root-cause messages in the console (they're printed in real-time)
  // This function is kept as a convenience placeholder
  console.log('%cLook for %c[ROOT-CAUSE]%c and %c[DISCARD]%c messages above in the console log',
    '', 'color:red;font-weight:bold', '', 'color:#cc6600;font-weight:bold', '');
  console.log('They show exactly why Fabric cleared the selection.');
};

console.log('%c🛠 Debug tools ready: %cdebugFabricSelection() %cto start, %cshowDebugTrace() %cto view, %cdebugFabricOff() %cto stop',
  '', 'color:#00aa00;font-weight:bold', '', 'color:#0066cc;font-weight:bold', '', 'color:#cc0000;font-weight:bold');

// ================================================================
// LINE-DISAPPEAR DEBUGGER
// ================================================================
window.debugLineDisappear = function() {
  var seq = 0;
  var log = function(tag, msg) {
    seq++;
    var ts = performance.now().toFixed(0);
    console.log('%c#' + seq + ' %c[' + tag + ']%c ' + msg + ' %c@' + ts + 'ms',
      'color:#888', 'color:#0066ff;font-weight:bold', '', 'color:#999');
  };

  // 1. Monitor Fabric canvas container visibility & dimensions
  var container = document.querySelector('.canvas-container');
  if (container) {
    var obs = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.type === 'attributes') {
          var cls = container.className;
          log('CONTAINER', 'class changed → "' + cls + '" (has drawing-active: ' + cls.includes('drawing-active') + ')');
          var cs = getComputedStyle(container);
          log('CONTAINER', 'display:' + cs.display + ' visibility:' + cs.visibility + ' opacity:' + cs.opacity + ' zIndex:' + cs.zIndex + ' pointerEvents:' + cs.pointerEvents);
        }
      });
    });
    obs.observe(container, { attributes: true, attributeFilter: ['class'] });
    var cs = getComputedStyle(container);
    log('CONTAINER', 'INITIAL — display:' + cs.display + ' visibility:' + cs.visibility + ' opacity:' + cs.opacity + ' zIndex:' + cs.zIndex);
  }

  // 2. Monitor Fabric object add/remove
  if (fabricCanvas) {
    fabricCanvas.on('object:added', function(e) {
      var o = e.target;
      log('FABRIC', 'object:added — type:' + (o.type || '?') + ' shapeType:' + (o._shapeType || '-') + ' id:' + (o._shapeId || '-') + ' total:' + fabricCanvas.getObjects().length);
      log('FABRIC', '  left:' + o.left + ' top:' + o.top + ' w:' + o.width + ' h:' + o.height + ' visible:' + o.visible + ' opacity:' + o.opacity);
    });
    fabricCanvas.on('object:removed', function(e) {
      var o = e.target;
      log('FABRIC', 'object:removed — type:' + (o.type || '?') + ' shapeType:' + (o._shapeType || '-') + ' id:' + (o._shapeId || '-') + ' REMAINING:' + fabricCanvas.getObjects().length);
    });
  }

  // 3. Hook render() calls
  var origRender = window.render || render;
  render = function() {
    var fcObjs = fabricCanvas ? fabricCanvas.getObjects().length : 0;
    var fcActive = fabricCanvas ? (fabricCanvas.getActiveObject() ? fabricCanvas.getActiveObject()._shapeId || fabricCanvas.getActiveObject().type : 'none') : 'N/A';
    log('RENDER', 'called — fabricObjects:' + fcObjs + ' activeObj:' + fcActive + ' drawingTool:' + state.drawingTool);
    return origRender.apply(this, arguments);
  };
  window._origRender = origRender;

  // 4. Hook _fcSyncContainerState
  var origSync = _fcSyncContainerState;
  _fcSyncContainerState = function() {
    var fcObjs = fabricCanvas ? fabricCanvas.getObjects().length : 0;
    var dt = state.drawingTool;
    log('SYNC', 'before — fabricObjects:' + fcObjs + ' drawingTool:' + dt + ' willAddClass:' + (fcObjs > 0 || dt !== 'select'));
    origSync();
    var cls = container ? container.className : '?';
    log('SYNC', 'after — class="' + cls + '"');
  };
  window._origSync = origSync;

  // 5. Monitor fabric canvas dimensions
  var origSetWidth = fabricCanvas.setWidth;
  var origSetHeight = fabricCanvas.setHeight;
  fabricCanvas.setWidth = function(w) {
    log('FABRIC', 'setWidth(' + w + ') — was ' + fabricCanvas.width);
    return origSetWidth.call(this, w);
  };
  fabricCanvas.setHeight = function(h) {
    log('FABRIC', 'setHeight(' + h + ') — was ' + fabricCanvas.height);
    return origSetHeight.call(this, h);
  };

  // 6. Catch errors in requestRenderAll
  var origRenderAll = fabricCanvas.renderAll;
  fabricCanvas.renderAll = function() {
    try {
      var objs = this.getObjects().length;
      log('FABRIC', 'renderAll — ' + objs + ' objects');
      return origRenderAll.call(this);
    } catch(e) {
      log('FABRIC', 'RENDER ERROR: ' + e.message);
      console.error(e);
      return this;
    }
  };
  window._origRenderAll = origRenderAll;

  // 7. Track setDrawingTool
  var origSetTool = setDrawingTool;
  setDrawingTool = function(tool) {
    log('TOOL', 'setDrawingTool → "' + tool + '"');
    return origSetTool(tool);
  };
  window._origSetTool = origSetTool;

  // 8. Monitor canvasWrap mousedown on empty space
  var canvasWrapEl = document.getElementById('canvas-wrap');
  canvasWrapEl.addEventListener('mousedown', function(e) {
    if (fabricCanvas) {
      var isFabricEl = e.target === fabricCanvas.upperCanvasEl || e.target === fabricCanvas.lowerCanvasEl || e.target === fabricCanvas.wrapperEl;
      var activeObj = fabricCanvas.getActiveObject();
      var activeId = activeObj ? (activeObj._shapeId || activeObj.type) : 'none';
      log('MOUSE', 'mousedown — target:' + (e.target.id || e.target.className || e.target.tagName) + ' isFabricEl:' + isFabricEl + ' activeObj:' + activeId);
    }
  }, true); // capture phase to run BEFORE the main handler

  log('INIT', 'Line-disappear debugger ACTIVE — draw a line, then click elsewhere, check sequence above');
  log('INIT', 'Look for the last # where the line was present vs when it disappeared');
  console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color:#0066ff');
};

// ================================================================
// Automated test: Composition card playback diagnostic
// Run from console: testCompositionPlayback()
// ================================================================
window.testCompositionPlayback = function() {
  var report = [];
  function log(msg) { report.push(msg); console.log('%c[TEST] ' + msg, 'color:#D4FF00'); }
  function err(msg) { report.push('ERROR: ' + msg); console.error('[TEST] ' + msg); }

  log('========== Composition Playback Diagnostic ==========');

  // 1. Enumerate all cards and find composition-like types
  log('--- Step 1: Card inventory ---');
  if (!state || !state.cards) { err('state.cards is missing!'); return report.join('\n'); }
  log('Total cards: ' + state.cards.length);

  var compCards = [];
  var synthCards = [];
  for (var i = 0; i < state.cards.length; i++) {
    var c = state.cards[i];
    log('Card[' + i + ']: id=' + c.id + ' type=' + c.type + ' editBoxId=' + c.editBoxId +
      ' trimIn=' + c.trimIn + ' trimOut=' + c.trimOut + ' duration=' + c.duration);
    if (c.type === 'composition') compCards.push(c);
    if (c.type === 'synthesized-video') synthCards.push(c);
  }
  log('Composition cards: ' + compCards.length);
  log('Synthesized-video cards: ' + synthCards.length);

  // 2. Check edit boxes
  log('--- Step 2: Edit box inventory ---');
  if (!state.editBoxes) { err('state.editBoxes is missing!'); return report.join('\n'); }
  log('Total edit boxes: ' + state.editBoxes.length);
  for (var j = 0; j < state.editBoxes.length; j++) {
    var eb = state.editBoxes[j];
    var shapeCount = (eb.shapes || []).length;
    var lineCount = 0;
    var nonLineCount = 0;
    (eb.shapes || []).forEach(function(s) {
      if (s.shapeType === 'line') lineCount++;
      else nonLineCount++;
    });
    log('EditBox[' + j + ']: id=' + eb.id + ' x=' + eb.x + ' y=' + eb.y +
      ' w=' + eb.width + ' h=' + eb.height +
      ' shapes=' + shapeCount + ' (lines=' + lineCount + ' non-lines=' + nonLineCount + ')' +
      ' _shapesWorldCoords=' + eb._shapesWorldCoords);

    // Print first 3 non-line shapes for inspection
    var printed = 0;
    (eb.shapes || []).forEach(function(s) {
      if (s.shapeType !== 'line' && printed < 3) {
        log('  Shape: id=' + s.id + ' type=' + s.shapeType +
          ' left=' + s.left + ' top=' + s.top +
          ' w=' + s.width + ' h=' + s.height +
          ' fill=' + s.fill + ' stroke=' + s.stroke + ' angle=' + (s.angle || 0));
        printed++;
      }
    });
  }

  // 3. Match composition cards to edit boxes
  log('--- Step 3: Card ↔ EditBox matching ---');
  var allTargets = compCards.concat(synthCards);
  if (allTargets.length === 0) {
    err('No composition or synthesized-video cards found!');
    err('Available card types: ' + state.cards.map(function(c) { return c.type; }).join(', '));
    return report.join('\n');
  }

  for (var k = 0; k < allTargets.length; k++) {
    var card = allTargets[k];
    var eb = findEditBoxById(card.editBoxId);
    if (!eb) {
      err('Card ' + card.id + ' (type=' + card.type + ') has editBoxId=' + card.editBoxId + ' but NO matching edit box found!');
    } else {
      var ns = (eb.shapes || []).filter(function(s) { return s.shapeType !== 'line'; }).length;
      log('Card ' + card.id + ' (' + card.type + ') → EditBox ' + eb.id +
        ': shapes=' + (eb.shapes || []).length + ' non-lines=' + ns +
        ' worldCoords=' + eb._shapesWorldCoords);
    }
  }

  // 4. Check playback state
  log('--- Step 4: Playback state ---');
  var pb = state.playback;
  log('isPlaying=' + pb.isPlaying + ' pausedAt=' + pb.pausedAt +
    ' playbackMode=' + pb.playbackMode + ' currentCardId=' + pb.currentCardId);
  log('sequence length=' + ((pb.sequence || []).length));

  // 5. Check groupPreviewCanvas
  log('--- Step 5: Preview canvas ---');
  var gpc = groupPreviewCanvas;
  log('Canvas element: ' + (gpc ? 'EXISTS' : 'MISSING'));
  if (gpc) {
    log('  width=' + gpc.width + ' height=' + gpc.height +
      ' style.display=' + gpc.style.display +
      ' cssWidth=' + gpc.getBoundingClientRect().width +
      ' cssHeight=' + gpc.getBoundingClientRect().height);
  }

  // 6. Try programmatic playback for the first composition card
  log('--- Step 6: Programmatic playback test ---');
  if (allTargets.length > 0 && !pb.isPlaying) {
    var targetCard = allTargets[0];
    log('Starting playback for card: ' + targetCard.id + ' (' + targetCard.type + ')');

    // Stop any residual playback first
    if (typeof stopPlayback === 'function') {
      stopPlayback();
      log('Called stopPlayback() to reset state');
    }

    // Force migration if needed
    var targetEb = findEditBoxById(targetCard.editBoxId);
    if (targetEb && !targetEb._shapesWorldCoords) {
      log('Forcing shape migration for edit box ' + targetEb.id);
      _migrateEditBoxShapesToWorld(targetEb);
    }

    // Show the preview panel
    var previewPanel = document.getElementById('preview-panel');
    if (previewPanel) {
      previewPanel.style.display = 'block';
      log('Preview panel shown');
    }

    // Start playback
    startPlayback(targetCard.id);

    // Check state after start
    setTimeout(function() {
      log('--- After 500ms delay ---');
      log('isPlaying=' + pb.isPlaying + ' pausedAt=' + pb.pausedAt +
        ' playbackMode=' + pb.playbackMode + ' currentCardId=' + pb.currentCardId);
      log('sequence: ' + JSON.stringify(pb.sequence ? pb.sequence.map(function(s) { return s.id; }) : []));

      // Check preview canvas
      if (gpc) {
        log('Canvas: w=' + gpc.width + ' h=' + gpc.height +
          ' display=' + gpc.style.display + ' cssW=' + gpc.getBoundingClientRect().width);
        try {
          var ctx = gpc.getContext('2d');
          var imgData = ctx.getImageData(0, 0, Math.min(gpc.width, 100), Math.min(gpc.height, 100));
          var nonWhite = 0;
          for (var p = 0; p < imgData.data.length; p += 4) {
            var r = imgData.data[p], g = imgData.data[p + 1], b = imgData.data[p + 2];
            if (r !== 255 || g !== 255 || b !== 255) nonWhite++;
          }
          var total = imgData.data.length / 4;
          log('Pixel check: ' + nonWhite + '/' + total + ' non-white pixels (' +
            (nonWhite / total * 100).toFixed(1) + '%)');
        } catch(ex) {
          err('Canvas pixel read failed: ' + ex.message);
        }
      }

      // Stop playback
      stopPlayback();
      log('Playback stopped.');
      log('========== Diagnostic complete ==========');
    }, 500);

    log('Waiting 500ms for playback to start...');
  } else if (pb.isPlaying) {
    log('Playback already running — stopping first');
    stopPlayback();
    log('Run test again to try programmatic playback');
  } else {
    log('No composition/synth cards to test');
  }

  return report.join('\n');
};

// Simpler smoke test — just checks data integrity without starting playback
window.smokeTestComposition = function() {
  var issues = [];
  function ok(msg) { console.log('%c[SMOKE] OK: ' + msg, 'color:#4CAF50'); }
  function fail(msg) { issues.push(msg); console.error('[SMOKE] FAIL: ' + msg); }

  console.log('%c===== Smoke Test: Composition Cards =====', 'color:#D4FF00;font-size:16px');

  // Check 1: state exists
  if (!state) { fail('state is undefined'); return issues; }
  ok('state exists');
  if (!state.cards) { fail('state.cards is undefined'); return issues; }
  ok('state.cards exists (' + state.cards.length + ' cards)');
  if (!state.editBoxes) { fail('state.editBoxes is undefined'); return issues; }
  ok('state.editBoxes exists (' + state.editBoxes.length + ' boxes)');

  // Check 2: Every composition card has a valid editBoxId
  state.cards.forEach(function(c) {
    if (c.type === 'composition') {
      if (!c.editBoxId) {
        fail('Card ' + c.id + ' (composition) has no editBoxId');
        return;
      }
      var eb = findEditBoxById(c.editBoxId);
      if (!eb) {
        fail('Card ' + c.id + ' editBoxId=' + c.editBoxId + ' — edit box NOT FOUND');
        return;
      }
      var shapes = eb.shapes || [];
    var nonLines = shapes.filter(function(s) { return s.shapeType !== 'line'; });
    if (nonLines.length === 0) {
      fail('Card ' + c.id + ' editBox ' + eb.id + ' has 0 non-line shapes');
      return;
    }
    ok('Card ' + c.id + ' (' + c.type + ') → editBox ' + eb.id +
      ' with ' + shapes.length + ' shapes (' + nonLines.length + ' drawable)');
    } else if (c.type === 'synthesized-video') {
      const chain = c.editBoxChain || [];
      if (chain.length === 0) {
        fail('Card ' + c.id + ' (synthesized-video) has empty editBoxChain');
      } else {
        ok('Card ' + c.id + ' (synthesized-video) with ' + chain.length + ' edit boxes');
      }
    }
  });

  // Check 3: groupPreviewCanvas exists
  if (!groupPreviewCanvas) {
    fail('groupPreviewCanvas is null');
  } else {
    ok('groupPreviewCanvas exists');
  }

  // Check 4: Key functions available
  ['findEditBoxById', 'startPlayback', 'stopPlayback', 'togglePlayback',
   '_renderCompositionPreview', 'playbackTick', 'updatePreviewPanel'].forEach(function(fn) {
    if (typeof window[fn] === 'function' || typeof eval(fn) === 'function') {
      ok('Function ' + fn + ' available');
    } else {
      fail('Function ' + fn + ' is NOT available');
    }
  });

  console.log('%c===== Smoke Test: ' + issues.length + ' issue(s) found =====', 'color:#D4FF00;font-size:16px');
  return issues;
};

