// ================================================================
// Helper: set cursor on all canvas layers (Fabric canvases override parent)
// ================================================================
function _setCanvasCursor(cursor) {
  canvas.style.cursor = cursor;
  if (fabricCanvas) {
    fabricCanvas.lowerCanvasEl.style.cursor = cursor;
    fabricCanvas.upperCanvasEl.style.cursor = cursor;
  }
}

// ================================================================
// Input: Scroll — Figma-style (wheel=pan, cmd+wheel=zoom)
// ================================================================
canvasWrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state.interaction.mode !== 'idle') return;

  const rect = canvasWrap.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Allow zoom/pan via scroll wheel even in edit mode
  const isZoom = e.metaKey || e.ctrlKey;

  if (isZoom) {
    // Cmd/Ctrl + scroll = zoom (anchor at cursor)
    const worldPos = screenToWorld(mouseX, mouseY);
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, state.canvas.zoom * factor));
    if (newZoom === state.canvas.zoom) return;

    state.canvas.zoom = newZoom;
    state.canvas.offsetX = mouseX - worldPos.x * state.canvas.zoom;
    state.canvas.offsetY = mouseY - worldPos.y * state.canvas.zoom;
  } else {
    // Plain scroll = pan (vertical); shift+scroll = pan horizontal
    // Use deltaX for trackpad precision; deltaY for mouse wheel
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
    const dy = e.shiftKey ? 0 : e.deltaY;

    state.canvas.offsetX -= dx;
    state.canvas.offsetY -= dy;
  }

  render();
}, { passive: false });

// ================================================================
// Input: Mouse down
// ================================================================
canvasWrap.addEventListener('mousedown', (e) => {
  // Ignore clicks on UI elements (toolbar, panels, etc.)
  if (e.target.closest('#float-bar, #right-panel, #timeline-panel, .modal, .context-menu')) return;

  // Skip reentrant calls triggered by our own Fabric event forwarding
  if (typeof _isForwarding !== 'undefined' && _isForwarding) return;

  // Drawing tool active → handle on main canvas (card-based drawing)
  if (state.drawingTool !== 'select' && state.drawingTool !== 'pan') {
    if (e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Check if click is on an active edit box — create Fabric shape in world coords
    const drawHit = hitTest(sx, sy);
    const isEditBoxDraw = drawHit.editBoxId && state.interaction.activeEditBoxId === drawHit.editBoxId;
    const drawEB = isEditBoxDraw ? findEditBoxById(drawHit.editBoxId) : null;

    const world = screenToWorld(sx, sy);

    if (state.drawingTool === 'text') {
      // Create Fabric.IText — Figma-style direct editing
      const textObj = new fabric.IText('', {
        left: world.x / state.canvas.zoom,
        top: world.y / state.canvas.zoom,
        fontSize: 24,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 'Bold',
        fill: '#000000',
        textAlign: 'left',
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        centeredRotation: true,
        editingBorderColor: '#88C405',
        cursorColor: '#88C405',
        cursorWidth: 1.5,
        selectionColor: 'rgba(136,196,5,0.25)'
      });
      fabricCanvas.add(textObj);

      const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      textObj._shapeId = id;
      textObj._shapeType = 'text';
      textObj._committed = false; // not committed until editing exits with content

      // If inside an active edit box, mark as edit box shape
      if (drawEB) {
        textObj._isEditBoxShape = true;
        textObj._editBoxId = drawEB.id;
      }

      setDrawingTool('select');
      fabricCanvas.setActiveObject(textObj);
      fabricCanvas.requestRenderAll();
      textObj.enterEditing();
      // Focus the hidden textarea that Fabric creates
      setTimeout(() => {
        const hta = textObj.hiddenTextarea;
        if (hta) hta.focus();
      }, 30);
      return;
    }

    // Shape drawing tools (rect / ellipse)
    if (state.drawingTool === 'rect' || state.drawingTool === 'ellipse') {
      const obj = createFabricShape(state.drawingTool, world.x, world.y);
      if (!obj) return;
      // If inside an active edit box, mark as edit box shape
      if (drawEB) {
        obj._isEditBoxShape = true;
        obj._editBoxId = drawEB.id;
      }
      fabricCanvas.add(obj);
      fabricCanvas.requestRenderAll();
      state._drawing = {
        shapeType: state.drawingTool,
        obj: obj,
        startX: world.x,
        startY: world.y,
        editBoxId: drawEB ? drawEB.id : null
      };
      state.interaction.mode = 'drawing-shape';
      return;
    }

    // Line tool — two-click drawing with 2D preview
    if (state.drawingTool === 'line') {
      if (state.interaction.mode === 'drawing-line' && state._drawing) {
        // Second click — complete the line
        const d = state._drawing;
        const dx = d.currentX - d.startX;
        const dy = d.currentY - d.startY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const lineEBId = d.editBoxId;
        state._drawing = null;
        state.interaction.mode = 'idle';
        if (len >= 4) {
          const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          let shapeEntry = {
            id, shapeType: 'line',
            x1: d.startX, y1: d.startY,
            x2: d.currentX, y2: d.currentY,
            stroke: '#88C405', strokeWidth: 2, opacity: 1
          };
          pushUndo();
          if (lineEBId) {
            // Lines stored in world coords
            const eb = findEditBoxById(lineEBId);
            if (eb) {
              eb.shapes = eb.shapes || [];
              eb.shapes.push(shapeEntry);
            }
          } else {
            state.shapes.push(shapeEntry);
            state.selection.shapeId = id;
          }
          state.selection.cardIds = [];
          state.selection.groupIds = [];
          state.selection.editBoxIds = [];
          state.selection.shapeIds = [];
          state.selection.connectionId = null;
          state.selection.connectionIds = [];
        }
        setDrawingTool('select');
        render();
        return;
      }
      // First click — start drawing
      state._drawing = {
        shapeType: 'line',
        startX: world.x,
        startY: world.y,
        currentX: world.x,
        currentY: world.y,
        editBoxId: drawEB ? drawEB.id : null
      };
      state.interaction.mode = 'drawing-line';
      render();
      return;
    }

    // Path tool — multi-point drawing on fabric canvas
    if (state.drawingTool === 'path') {
      const pathDraw = state._pathDraw;
      if (!pathDraw) {
        // First point — create fabric Path
        const path = new fabric.Path(`M ${world.x} ${world.y}`, {
          stroke: '#88C405', strokeWidth: 2 / state.canvas.zoom,
          strokeUniform: true, fill: '',
          selectable: false, evented: false
        });
        fabricCanvas.add(path);
        fabricCanvas.requestRenderAll();
        state._pathDraw = { obj: path, points: [{ x: world.x, y: world.y }], _lastClickTime: Date.now() };
        return;
      }

      // Double-click detection — finish path (open)
      const now = Date.now();
      const lastClickTime = pathDraw._lastClickTime || 0;
      const samePoint = pathDraw._lastClickPos &&
        Math.abs(world.x - pathDraw._lastClickPos.x) < 5 &&
        Math.abs(world.y - pathDraw._lastClickPos.y) < 5;
      if (samePoint && (now - lastClickTime) < 400) {
        // Double-click — remove the last duplicate point and commit
        if (pathDraw.points.length > 1) {
          pathDraw.obj.path.pop(); // remove duplicate 'L' cmd
          pathDraw.points.pop();
        }
        _commitPathDraw();
        return;
      }

      pathDraw._lastClickTime = now;
      pathDraw._lastClickPos = { x: world.x, y: world.y };

      // Add new line segment (may become a curve if dragged)
      const pp = pathDraw.points;
      const last = pp[pp.length - 1];
      const dx = world.x - last.x;
      const dy = world.y - last.y;
      if (Math.abs(dx) + Math.abs(dy) < 3) return; // too close, ignore
      // Snap to first point if within 10px → close path
      const first = pp[0];
      if (pp.length > 1 && Math.abs(world.x - first.x) < 10 && Math.abs(world.y - first.y) < 10) {
        _commitPathDraw();
        return;
      }
      pathDraw.obj.path.push(['L', world.x, world.y]);
      pp.push({ x: world.x, y: world.y });
      pathDraw._anchorPt = { x: world.x, y: world.y };
      pathDraw._justAdded = true;
      _recalcPathBounds(pathDraw.obj);
      fabricCanvas.requestRenderAll();
      return;
    }

    // Empty group tool — drag to create on main canvas
    if (state.drawingTool === 'empty-group') {
      if (state.interaction._autoPaused) { render(); return; }
      state.interaction.mode = 'drawing-empty-group';
      state.interaction._emptyGroupStart = { x: world.x, y: world.y };
      state.interaction._emptyGroupCurrent = { x: world.x, y: world.y };
      render();
      return;
    }

    return;
  }

  // Pan tool
  if (state.drawingTool === 'pan' && e.button === 0) {
    e.preventDefault();
    state.interaction.mode = 'pan';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragOffset = { x: state.canvas.offsetX, y: state.canvas.offsetY };
    canvasWrap.classList.add('panning');
    return;
  }

  // Middle mouse button = pan
  if (e.button === 1) {
    e.preventDefault();
    state.interaction.mode = 'pan';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragOffset = { x: state.canvas.offsetX, y: state.canvas.offsetY };
    canvasWrap.classList.add('panning');
    return;
  }

  if (e.button !== 0) return;

  // Auto-pause on any canvas/card interaction during playback
  if (state.playback.isPlaying) {
    state.interaction._autoPaused = true; // suppress drag on this click; set before togglePlayback so it skips redundant render
    togglePlayback();
  }

  // Space + drag = pan
  if (state.interaction.spaceDown) {
    state.interaction.mode = 'pan';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragOffset = { x: state.canvas.offsetX, y: state.canvas.offsetY };
    canvasWrap.classList.add('panning');
    canvasWrap.classList.remove('space-held');
    e.preventDefault();
    return;
  }

  // Hit test for card interactions
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // Event routing: Fabric has permanent pointer-events:none.
  // Determine whether cursor is over a Fabric shape for programmatic forwarding.
  const overFabric = _isOverFabricShape(e.clientX, e.clientY);
  const hit = hitTest(sx, sy);

  // Edit box active: click within the active edit box → forward ALL events to Fabric
  // until mouseup. Don't rely on _isOverFabricShape (it has center-coord issues).
  if (state.interaction.activeEditBoxId) {
    const inActiveEditBox = hit.editBoxId === state.interaction.activeEditBoxId;
    if (overFabric || inActiveEditBox) {
      state.interaction._fabricForwarding = true;
      _forwardToFabric('mousedown', e);
      return;
    }
  }
  const hasFabricSel = state.selection.shapeIds.length > 0;
  const hasCardSel = state.selection.cardIds.length > 0 || state.selection.groupIds.length > 0;
  const hasEditBoxSel = state.selection.editBoxIds.length > 0;
  const mixedSel = hasFabricSel || hasEditBoxSel; // cross-layer selection

  // ---- Cross-layer unified drag ----
  // Mixed selection (shapes/editboxes + cards) + no modifier.
  if (mixedSel && hasCardSel && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    // Truly empty canvas (no 2D hit, no Fabric shape) → deselect all
    if (hit.type === 'canvas' && !overFabric) {
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.editBoxId = null;
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.shapeId = null;
      state.selection.shapeIds = [];
      if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
      updateInspector();
      render();
      return;
    }
    // Card body, group, edit box, or Fabric shape → unified drag (all move together)
    const uHitTypes = ['card-body', 'group-title', 'group-body', 'editbox-title', 'editbox-body'];
    if (uHitTypes.includes(hit.type) || overFabric) {
      pushUndo();
      state.interaction.mode = 'dragging-unified';
      state.interaction.dragStart = { x: e.clientX, y: e.clientY };
      state.interaction.dragStartWorld = screenToWorld(sx, sy);
      _lockFabricShapesForDrag();
      state.interaction._fabricStartPos = _recordFabricShapeStartPos();
      state.interaction.cardStartPos = new Map();
      for (const cid of state.selection.cardIds) {
        const c = state.cards.find(c => c.id === cid);
        if (c) state.interaction.cardStartPos.set(cid, { x: c.x, y: c.y });
      }
      for (const gid of state.selection.groupIds) {
        const group = state.groups.find(g => g.id === gid);
        if (group) {
          for (const cid of group.cardIds) {
            if (!state.interaction.cardStartPos.has(cid)) {
              const c = state.cards.find(c => c.id === cid);
              if (c) state.interaction.cardStartPos.set(cid, { x: c.x, y: c.y });
            }
          }
          if (group.collapsed) {
            if (!state.interaction._groupStartPosForUnified) state.interaction._groupStartPosForUnified = {};
            state.interaction._groupStartPosForUnified[gid] = { x: group.x, y: group.y, width: group.width, height: group.height };
          }
        }
      }
      state.interaction.editBoxStartPos = new Map();
      for (const ebid of state.selection.editBoxIds) {
        const eb = state.editBoxes.find(e => e.id === ebid);
        if (eb) state.interaction.editBoxStartPos.set(ebid, { x: eb.x, y: eb.y });
      }
      // Snapshot shape coords for real-time update during drag
      state.interaction._eboxShapeSnap = {};
      for (const ebid of state.selection.editBoxIds) {
        const eb = state.editBoxes.find(e => e.id === ebid);
        if (eb) state.interaction._eboxShapeSnap[ebid] = JSON.parse(JSON.stringify(eb.shapes || []));
      }
      render();
      return;
    }
    // Other hit types (trim, anchor, connection, playhead, etc.) fall through
    // to their normal handlers below.
  }

  // ---- Cross-layer unified drag: edit boxes + Fabric shapes (no cards) ----
  if (hasEditBoxSel && hasFabricSel && !hasCardSel && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    // Click on edit box itself or Fabric shape → start unified drag (both move together)
    if (hit.type === 'editbox-title' || hit.type === 'editbox-body' || overFabric) {
      pushUndo();
      state.interaction.mode = 'dragging-unified';
      state.interaction.dragStart = { x: e.clientX, y: e.clientY };
      state.interaction.dragStartWorld = screenToWorld(sx, sy);
      _lockFabricShapesForDrag();
      state.interaction._fabricStartPos = _recordFabricShapeStartPos();
      state.interaction.editBoxStartPos = new Map();
      for (const ebid of state.selection.editBoxIds) {
        const eb = state.editBoxes.find(e => e.id === ebid);
        if (eb) state.interaction.editBoxStartPos.set(ebid, { x: eb.x, y: eb.y });
      }
      // Snapshot shape coords for real-time update during drag
      state.interaction._eboxShapeSnap = {};
      for (const ebid of state.selection.editBoxIds) {
        const eb = state.editBoxes.find(e => e.id === ebid);
        if (eb) state.interaction._eboxShapeSnap[ebid] = JSON.parse(JSON.stringify(eb.shapes || []));
      }
      render();
      return;
    }
    if (hit.type === 'canvas') {
      // Empty space → deselect all
      state.selection.editBoxIds = [];
      state.selection.editBoxId = null;
      if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
      updateInspector();
      render();
      return;
    }
  }

  // Only Fabric shapes selected, no cards → always forward to Fabric.
  // Fabric handles its own selection, deselection, and rubber-band selection.
  if (hasFabricSel && !hasCardSel && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    _forwardToFabric('mousedown', e);
    return;
  }

  // Shift+click with Fabric shapes selected: cross-layer multi-select
  if (hasFabricSel && (e.shiftKey || e.metaKey || e.ctrlKey)) {
    if (hit.type === 'card-body') {
      // Adding card to shape selection → destroy Fabric ActiveSelection
      _destroyFabricShapeSelection();
      const idx = state.selection.cardIds.indexOf(hit.cardId);
      if (idx >= 0) state.selection.cardIds.splice(idx, 1);
      else state.selection.cardIds.push(hit.cardId);
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.shapeId = null;
      // If all cards removed, restore pure shape selection
      if (state.selection.cardIds.length === 0 && state.selection.shapeIds.length > 0) {
        _restoreFabricShapeSelection();
      }
      updateInspector(); render();
      return;
    }
    // Shift+click on another Fabric shape → forward for native multi-select
    if (overFabric) { _forwardToFabric('mousedown', e); return; }
    // Other hits fall through to normal handlers
  }

  // ---- Normal 2D handling below ----
  // (All Fabric select-tool interactions were handled above; remaining
  //  cases here are cards, groups, editboxes, connections, etc.)

  // Edit box interactions
  if (hit.type === 'editbox-title' || hit.type === 'editbox-body') {
    if (state.interaction._autoPaused) { render(); return; }
    const eb = findEditBoxById(hit.editBoxId);
    if (!eb) return;

    const isSelected = state.selection.editBoxId === hit.editBoxId;
    const isEditing = state.interaction.activeEditBoxId === hit.editBoxId;

    // Helper: set up drag state
    const _startEBoxDrag = () => {
      state.interaction.dragStart = { x: e.clientX, y: e.clientY };
      state.interaction.dragStartWorld = screenToWorld(sx, sy);
      state.interaction._eboxDragStartX = eb.x;
      state.interaction._eboxDragStartY = eb.y;
      state.interaction.dragEditBoxId = hit.editBoxId;
      // Snapshot Fabric shape positions for delta-based drag (if in edit mode)
      state.interaction._eboxShapeStartPos = [];
      if (fabricCanvas) {
        fabricCanvas.getObjects().forEach(obj => {
          if (obj._isEditBoxShape && obj._editBoxId === eb.id) {
            state.interaction._eboxShapeStartPos.push({ obj, left: obj.left, top: obj.top });
          }
        });
      }
      // Snapshot shape data for updating eb.shapes after drag
      state.interaction._eboxShapeDataSnap = JSON.parse(JSON.stringify(eb.shapes || []));
      // Find all edit boxes connected via eb-keyframe connections (for group move)
      state.interaction._eboxGroupDrag = null;
      const connectedEbIds = findConnectedEditBoxes(hit.editBoxId);
      if (connectedEbIds.length > 1) {
        const groupPositions = {};
        for (const cid of connectedEbIds) {
          const ceb = findEditBoxById(cid);
          if (ceb) {
            groupPositions[cid] = { x: ceb.x, y: ceb.y, shapesSnap: JSON.parse(JSON.stringify(ceb.shapes || [])) };
          }
        }
        state.interaction._eboxGroupDrag = { ids: connectedEbIds, starts: groupPositions };
      }
    };

    // Title click: always start immediate drag
    if (hit.type === 'editbox-title') {
      if (!isSelected) {
        if (state.interaction.activeEditBoxId) {
          const prevEB = findEditBoxById(state.interaction.activeEditBoxId);
          if (prevEB) _exitEditBoxOnFabric(prevEB);
        }
        state.interaction.activeEditBoxId = null;
        state.selection.editBoxId = hit.editBoxId;
        state.selection.cardIds = [];
        state.selection.groupIds = [];
      state.selection.editBoxIds = [];
        state.selection.connectionId = null;
        state.selection.connectionIds = [];
        _fcSyncContainerState();
      }
      state.interaction.mode = 'dragging-editbox';
      _startEBoxDrag();
      e.preventDefault();
      return;
    }

    // editbox-body
    // Double-click detection (only for selected, non-editing box)
    if (isSelected && !isEditing) {
      const now = Date.now();
      const lastClickTime = state.interaction._eboxLastClickTime || 0;
      const lastClickId = state.interaction._eboxLastClickId;

      if (lastClickId === hit.editBoxId && (now - lastClickTime) < 400) {
        // Double-click → enter edit mode
        state.interaction._eboxLastClickTime = 0;
        state.interaction._eboxLastClickId = null;
        // Save and exit any previously active edit box before entering
        if (state.interaction.activeEditBoxId) {
          const prevEB = findEditBoxById(state.interaction.activeEditBoxId);
          if (prevEB) _exitEditBoxOnFabric(prevEB);
        }
        state.interaction.activeEditBoxId = hit.editBoxId;
        _enterEditBoxOnFabric(eb);
        setDrawingTool('select');
        _fcSyncContainerState();
        render();
        return;
      }
    }

    // Record click timestamp for double-click detection
    state.interaction._eboxLastClickTime = Date.now();
    state.interaction._eboxLastClickId = hit.editBoxId;

    // Select + enter drag-pending (like cards, drag directly without pre-selection)
    if (!isSelected) {
      if (state.interaction.activeEditBoxId) {
        const prevEB = findEditBoxById(state.interaction.activeEditBoxId);
        if (prevEB) _exitEditBoxOnFabric(prevEB);
      }
      state.interaction.activeEditBoxId = null;
      state.selection.editBoxId = hit.editBoxId;
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      eb._selectedShapeIdx = null;
    }

    state.interaction.mode = 'editbox-drag-pending';
    _startEBoxDrag();
    _fcSyncContainerState();
    e.preventDefault();
    return;

    state.hoveredEditBoxId = hit.editBoxId;
    render();
    return;
  }

  // Timeline dot drag — adjust edit box horizontal position
  if (hit.type === 'timeline-dot') {
    if (state.interaction._autoPaused) { render(); return; }
    const eb = findEditBoxById(hit.editBoxId);
    if (!eb) return;
    pushUndo();
    state.interaction.mode = 'timeline-dot-drag';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction._dotDragEbId = hit.editBoxId;
    state.interaction._dotDragStartX = eb.x;
    state.selection.editBoxId = hit.editBoxId;
    state.selection.editBoxIds = [hit.editBoxId];
    state.selection.cardIds = [];
    state.selection.connectionIds = [];
    state.selection.connectionId = null;
    render();
    return;
  }

  // Timeline progress dot scrub — drag to scrub through eb-chain playback
  if (hit.type === 'timeline-progress') {
    const pb = state.playback;
    if (!pb || pb.isPlaying || pb.playbackMode !== 'eb-chain') return;
    const tl = state._ebTimelines && state._ebTimelines[hit.timelineKey];
    if (!tl) return;
    state.interaction.mode = 'timeline-progress-drag';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction._progressDragTl = tl;
    state.interaction._progressDragStartProgress = pb._ebChainProgress || 0;
    render();
    return;
  }

  // Click outside edit box — exit edit mode and/or deselect
  if (!hit.editBoxId) {
    state.interaction._eboxLastClickTime = 0;
    state.interaction._eboxLastClickId = null;
    if (state.interaction.activeEditBoxId) {
      const prevEBox = findEditBoxById(state.interaction.activeEditBoxId);
      if (prevEBox) {
        prevEBox._selectedShapeIdx = null;
        _exitEditBoxOnFabric(prevEBox);
      }
      state.interaction.activeEditBoxId = null;
    }
    if (state.selection.editBoxId) {
      state.selection.editBoxId = null;
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
    }
    _fcSyncContainerState();
    render();
  }

  if (hit.type === 'anchor') {
    if (state.interaction._autoPaused) { render(); return; }
    // Click on existing keyframe diamond → select the connection
    if (hit.side === 'top' && hit._kfConnId) {
      state.selection.connectionId = hit._kfConnId;
      state.selection.connectionIds = [hit._kfConnId];
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      render();
      return;
    }
    // Start connecting from this anchor
    pushUndo();
    state.interaction.mode = 'connecting';
    state.interaction.mouseWorldPos = screenToWorld(sx, sy);
    const _fromCard = state.cards.find(c => c.id === hit.cardId);
    const _fromPos = (hit.side === 'top' && _fromCard)
      ? (hit._kfConnId == null
          ? (state.playback.cardProgress != null ? state.playback.cardProgress : 0.5)
          : (() => {
              const existingConn = state.connections.find(c => c.id === hit._kfConnId);
              return existingConn ? (existingConn.fromPosition || 0.5) : 0.5;
            })())
      : undefined;
    state.interaction.connectingFrom = { cardId: hit.cardId, side: hit.side, _kfConnId: hit._kfConnId || null, fromPosition: _fromPos };
    state.interaction._isTweenConnection = e.altKey;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.selection.cardIds = [hit.cardId];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.shapeId = null;
    canvasWrap.classList.add('connecting');
    render();
  } else if (hit.type === 'editbox-anchor') {
    if (state.interaction._autoPaused) { render(); return; }
    // If the anchor has an existing keyframe connection, start drag-pending
    // (drag = horizontal move; click = select connection)
    if (hit._kfConnId) {
      const eb = findEditBoxById(hit.editBoxId);
      if (!eb) return;
      pushUndo();
      // Reuse the same drag setup as editbox-body drag, but force solo (no group movement)
      state.interaction.mode = 'editbox-drag-pending';
      state.interaction.dragStart = { x: e.clientX, y: e.clientY };
      state.interaction.dragStartWorld = screenToWorld(sx, sy);
      state.interaction._eboxDragStartX = eb.x;
      state.interaction._eboxDragStartY = eb.y;
      state.interaction.dragEditBoxId = hit.editBoxId;
      state.interaction._eboxShapeStartPos = [];
      if (fabricCanvas) {
        fabricCanvas.getObjects().forEach(obj => {
          if (obj._isEditBoxShape && obj._editBoxId === eb.id) {
            state.interaction._eboxShapeStartPos.push({ obj, left: obj.left, top: obj.top });
          }
        });
      }
      state.interaction._eboxShapeDataSnap = JSON.parse(JSON.stringify(eb.shapes || []));
      state.interaction._eboxGroupDrag = null; // Force solo drag — no group movement
      state.interaction._anchorKfConnId = hit._kfConnId;
      state.selection.editBoxId = hit.editBoxId;
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      render();
      return;
    }
    // Start connecting from this edit box anchor
    pushUndo();
    state.interaction.mode = 'connecting';
    state.interaction.mouseWorldPos = screenToWorld(sx, sy);
    state.interaction.connectingFrom = {
      editBoxId: hit.editBoxId,
      side: hit.side,
      _isEditBoxAnchor: true,
      _kfConnId: hit._kfConnId || null
    };
    state.interaction._isTweenConnection = false;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.selection.editBoxId = hit.editBoxId;
    state.selection.editBoxIds = [hit.editBoxId];
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.shapeId = null;
    canvasWrap.classList.add('connecting');
    render();
  } else if (hit.type === 'marker-anchor') {
    if (state.interaction._autoPaused) { render(); return; }
    // Start connecting from this marker anchor — always tween
    pushUndo();
    state.interaction.mode = 'connecting';
    state.interaction.connectingFrom = { markerCardId: hit.markerCardId, side: 'right' };
    state.interaction._isTweenConnection = true;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.mouseWorldPos = screenToWorld(sx, sy);
    state.selection.markerCardId = hit.markerCardId;
    state.selection.markerCardIds = [hit.markerCardId];
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.shapeId = null;
    canvasWrap.classList.add('connecting');
    render();
  } else if (hit.type === 'marker-card') {
    // Double-click detection for marker card → enter edit mode
    const now = Date.now();
    const prevClick = state.interaction._prevMarkerClick || 0;
    const prevClickId = state.interaction._prevMarkerClickId;
    state.interaction._prevMarkerClick = now;
    state.interaction._prevMarkerClickId = hit.markerCardId;

    if (now - prevClick < 350 && prevClickId === hit.markerCardId) {
      // Double-click on marker card → enter edit mode
      const marker = state.markerCards.find(m => m.id === hit.markerCardId);
      if (marker) {
        enterMarkerEditMode(marker);
        return;
      }
    }

    // Single click — select marker card, Shift+click for multi-select
    if (e.shiftKey) {
      const idx = state.selection.markerCardIds.indexOf(hit.markerCardId);
      if (idx >= 0) {
        state.selection.markerCardIds.splice(idx, 1);
      } else {
        state.selection.markerCardIds.push(hit.markerCardId);
      }
      state.selection.markerCardId = state.selection.markerCardIds.length === 1 ? state.selection.markerCardIds[0] : null;
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.editBoxIds = [];
    } else {
      state.selection.markerCardId = hit.markerCardId;
      state.selection.markerCardIds = [hit.markerCardId];
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.editBoxIds = [];
      state.selection.shapeIds = [];
    }
    // Start drag for marker card
    const marker = state.markerCards.find(m => m.id === hit.markerCardId);
    if (marker) {
      state.interaction.mode = 'dragging-card';
      state.interaction.dragMarkerCardId = marker.id;
      state.interaction._markerDragStartX = marker.x;
      state.interaction.dragStart = { x: e.clientX, y: e.clientY };
      state.interaction.dragStartWorld = screenToWorld(sx, sy);
      state.interaction.cardStartPos = new Map([[marker.id, { x: marker.x, y: marker.y }]]);
    }
    render();
  } else if (hit.type === 'connection-badge') {
    // Select connection — Shift+click for multi-select
    if (e.shiftKey) {
      const idx = state.selection.connectionIds.indexOf(hit.connectionId);
      if (idx >= 0) {
        state.selection.connectionIds.splice(idx, 1);
      } else {
        state.selection.connectionIds.push(hit.connectionId);
      }
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = state.selection.connectionIds.length === 1 ? state.selection.connectionIds[0] : null;
    } else {
      const prevConn = state.selection.connectionId;
      state.selection.connectionId = hit.connectionId;
      state.selection.connectionIds = [hit.connectionId];
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      const conn = state.connections.find(c => c.id === hit.connectionId);
      if (conn && prevConn === hit.connectionId) {
        // Second click on same badge → cycle transition
        pushUndo();
        const idx = TRANSITION_CYCLE.indexOf(conn.transition);
        conn.transition = TRANSITION_CYCLE[(idx + 1) % TRANSITION_CYCLE.length];
      }
    }
    render();
  } else if (hit.type === 'connection-delete') {
    pushUndo();
    // Delete all selected connections or just this one
    const idsToDelete = state.selection.connectionIds.length > 1 && state.selection.connectionIds.includes(hit.connectionId)
      ? [...state.selection.connectionIds]
      : [hit.connectionId];
    for (const cid of idsToDelete) {
      const idx = state.connections.findIndex(c => c.id === cid);
      if (idx >= 0) state.connections.splice(idx, 1);
    }
    state.hoveredConnectionId = null;
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    render();
  } else if (hit.type === 'trimming-left' || hit.type === 'trimming-right') {
    if (state.interaction._autoPaused) { render(); return; }
    const card = state.cards.find(c => c.id === hit.cardId);
    if (!card) return;
    pushUndo();
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    state.selection.shapeId = null;
    // Deselect Fabric shape
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    state.interaction.mode = hit.type;
    state.interaction.targetCardId = hit.cardId;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.trimStartVal = hit.type === 'trimming-left' ? card.trimIn : card.trimOut;
    state.interaction.trimStartX = card.x;
    state.interaction.trimStartWidth = getCardWidth(card);
    // Capture ripple cards: connected downstream + group siblings
    const parentGroup = state.groups.find(g => g.cardIds.includes(hit.cardId));
    const rippleCards = new Map();
    if (hit.type === 'trimming-right') {
      // Connected downstream cards
      const downstream = getDownstreamCardIds(hit.cardId);
      for (const cid of downstream) {
        const dc = state.cards.find(c => c.id === cid);
        if (dc) rippleCards.set(cid, { x: dc.x, y: dc.y });
      }
      // Group members to the right (not already included)
      if (parentGroup) {
        for (const cid of parentGroup.cardIds) {
          if (cid === hit.cardId || rippleCards.has(cid)) continue;
          const gc = state.cards.find(c => c.id === cid);
          if (gc && gc.x >= card.x) {
            rippleCards.set(cid, { x: gc.x, y: gc.y });
          }
        }
      }
      state.interaction._rippleCards = {
        originalRightEdge: card.x + state.interaction.trimStartWidth,
        cards: rippleCards
      };
    } else {
      // Trim-left: ripple group members to the left to maintain spacing
      if (parentGroup) {
        for (const cid of parentGroup.cardIds) {
          if (cid === hit.cardId) continue;
          const gc = state.cards.find(c => c.id === cid);
          if (gc && gc.x < card.x) {
            rippleCards.set(cid, { x: gc.x, y: gc.y });
          }
        }
      }
      state.interaction._rippleCards = rippleCards.size > 0 ? {
        originalLeftEdge: card.x,
        cards: rippleCards
      } : null;
    }
  } else if (hit.type === 'volume-text') {
    // Click on percentage → show numeric input, select this card
    const card = state.cards.find(c => c.id === hit.cardId);
    if (!card) return;
    state.selection.cardIds = [hit.cardId];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    state.selection.shapeId = null;
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    showVolumeInput(card, e.clientX, e.clientY);
  } else if (hit.type === 'volume') {
    if (state.interaction._autoPaused) { render(); return; }
    const card = state.cards.find(c => c.id === hit.cardId);
    if (!card) return;
    pushUndo();
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    state.selection.shapeId = null;
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    state.interaction.mode = 'adjusting-volume';
    state.interaction.targetCardId = hit.cardId;
    state.interaction.volStartVal = card.volume;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    // Apply initial volume from click position (vertical slider)
    const world = screenToWorld(sx, sy);
    const _isAudio = card.type === 'audio';
    const _wfY = _isAudio ? card.y : card.y + CARD_THUMB_HEIGHT;
    const _wfH = CARD_WAVEFORM_HEIGHT;
    const _volTrackY = _wfY + 8;
    const _volTrackH = _wfH - 16;
    const frac = 1 - (world.y - _volTrackY) / _volTrackH;
    card.volume = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
    render();
  } else if (hit.type === 'card-label') {
    state.selection.connectionId = null;
    state.selection.groupIds = [];
    state.selection.shapeId = null;
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    state.selection.cardIds = [hit.cardId];
    // Double-click detection for label editing
    const labelNow = Date.now();
    const labelPrev = state.interaction._lastLabelClick || 0;
    const labelPrevId = state.interaction._lastLabelClickId;
    state.interaction._lastLabelClick = labelNow;
    state.interaction._lastLabelClickId = hit.cardId;
    if (labelNow - labelPrev < 400 && labelPrevId === hit.cardId) {
      render();
      setTimeout(() => startCardLabelEdit(hit.cardId), 60);
      return;
    }
    render();
    return;
  } else if (hit.type === 'card-body') {
    state.selection.connectionId = null;
    state.selection.groupIds = [];
    state.selection.shapeId = null;
    // Deselect Fabric shape
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    // Selection logic
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // Toggle selection (Shift or Cmd/Ctrl)
      const idx = state.selection.cardIds.indexOf(hit.cardId);
      if (idx >= 0) {
        state.selection.cardIds.splice(idx, 1);
      } else {
        state.selection.cardIds.push(hit.cardId);
      }
    } else {
      if (!state.selection.cardIds.includes(hit.cardId)) {
        state.selection.cardIds = [hit.cardId];
      }
    }
    // If selecting a single video card while paused, show transform handles.
    if (state.selection.cardIds.length === 1 && state.playback.pausedAt > 0) {
      if (_ensureGroupPlaybackMode()) {
        seekPlayheadToCard(state.selection.cardIds[0]);
        _recompositePreviewForTransform();
        renderTransformOverlay();
      } else {
        // Standalone video card (not in any group)
        const selCard = state.cards.find(c => c.id === state.selection.cardIds[0]);
        if (selCard && selCard.type === 'video' && !selCard.groupId) {
          _recompositePreviewForTransform();
          renderTransformOverlay();
        }
      }
    }
    // Look up the card once for double-click + drag logic
    const card = state.cards.find(c => c.id === hit.cardId);
    // Double-click text card to edit
    if (card && card.type === 'text') {
      const now = Date.now();
      const prev = state.interaction._lastTextClick || 0;
      if (now - prev < 400 && state.selection.cardIds.length === 1 && state.selection.cardIds[0] === card.id) {
        // Double click on text card
        render(); // update selection highlight first
        setTimeout(() => startTextCardEdit(card.id), 60);
        return;
      }
      state.interaction._lastTextClick = now;
    }
    // If auto-paused, just select without dragging
    if (state.interaction._autoPaused) {
      render();
      return;
    }
    // Start drag
    if (!card) return;
    pushUndo();
    state.interaction.mode = 'dragging-card';
    state.interaction.targetCardId = hit.cardId;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragStartWorld = screenToWorld(
      e.clientX - rect.left,
      e.clientY - rect.top
    );
    // Store all selected cards' start positions
    state.interaction.cardStartPos = new Map();
    for (const cid of state.selection.cardIds) {
      const c = state.cards.find(c => c.id === cid);
      if (c) state.interaction.cardStartPos.set(cid, { x: c.x, y: c.y });
    }
    // If clicked card not in selection, store it alone
    if (!state.interaction.cardStartPos.has(hit.cardId)) {
      state.interaction.cardStartPos.set(hit.cardId, { x: card.x, y: card.y });
    }
    render();
  } else if (hit.type === 'playhead') {
    // Scrub playhead (linear or group)
    if (state.playback.isPlaying) {
      togglePlayback(); // pause first
    }
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    state.selection.shapeId = null;
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    state.interaction.mode = 'scrubbing';
    state.interaction.targetCardId = hit.cardId || null;
    state.interaction._scrubGroup = hit.mode === 'group';
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragStartWorld = screenToWorld(sx, sy);
    if (hit.mode === 'group') {
      state.interaction._scrubGroupStartPausedAt = state.playback.pausedAt;
    }
    render();
  } else if (hit.type === 'group-resize') {
    if (state.interaction._autoPaused) { render(); return; }
    const grp = state.groups.find(g => g.id === hit.groupId);
    if (!grp) return;
    pushUndo();
    state.interaction.mode = 'dragging-group-resize';
    state.interaction.targetGroupId = hit.groupId;
    state.interaction._resizeHandle = hit.handle;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragStartWorld = screenToWorld(sx, sy);
    state.interaction._resizeStartFrame = getGroupFrame(grp);
    render();
  } else if (hit.type === 'group-title') {
    if (state.interaction._autoPaused) { render(); return; }
    const group = state.groups.find(g => g.id === hit.groupId);
    if (!group) return;
    // Clear handles on single click
    state.interaction._showGroupHandles.clear();
    // Double-click to rename
    const groupNow = Date.now();
    const groupPrev = state.interaction._lastGroupClick || 0;
    if (groupNow - groupPrev < 400 && state.interaction._lastGroupClickId === group.id) {
      startCardLabelEdit(group.id);
      return;
    }
    state.interaction._lastGroupClick = groupNow;
    state.interaction._lastGroupClickId = group.id;
    // Drag group (and all its member cards)
    pushUndo();
    state.interaction.mode = 'dragging-group';
    state.interaction.targetGroupId = hit.groupId;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragStartWorld = screenToWorld(sx, sy);
    state.interaction._prevDragDx = 0;
    state.interaction.cardStartPos = new Map();
    for (const cid of group.cardIds) {
      const c = state.cards.find(ca => ca.id === cid);
      if (c) state.interaction.cardStartPos.set(cid, { x: c.x, y: c.y });
    }
    // Also store group position for collapsed groups
    state.interaction._groupStartPos = { x: group.x, y: group.y, width: group.width, height: group.height };
    state.selection.cardIds = [];
    state.selection.groupIds = [hit.groupId];
    state.selection.connectionIds = [];
    state.selection.connectionId = null;
    render();
  } else if (hit.type === 'group-body') {
    if (state.interaction._autoPaused) { render(); return; }
    const group2 = state.groups.find(g => g.id === hit.groupId);
    if (!group2) return;
    // Double-click → toggle handles
    const bodyNow = Date.now();
    const bodyPrev = state.interaction._lastGroupBodyClick || 0;
    if (bodyNow - bodyPrev < 400 && state.interaction._lastGroupBodyClickId === group2.id) {
      state.interaction._showGroupHandles.add(group2.id);
      if (!state.selection.groupIds.includes(hit.groupId)) {
        state.selection.groupIds = [hit.groupId];
        state.selection.cardIds = [];
        state.selection.connectionIds = [];
        state.selection.connectionId = null;
      }
      render();
      return;
    }
    state.interaction._lastGroupBodyClick = bodyNow;
    state.interaction._lastGroupBodyClickId = group2.id;
    // Single click: clear handles, select, drag
    state.interaction._showGroupHandles.clear();
    if (!state.selection.groupIds.includes(hit.groupId)) {
      state.selection.groupIds = [hit.groupId];
      state.selection.cardIds = [];
      state.selection.connectionIds = [];
      state.selection.connectionId = null;
    }
    pushUndo();
    state.interaction.mode = 'dragging-group';
    state.interaction.targetGroupId = hit.groupId;
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction.dragStartWorld = screenToWorld(sx, sy);
    state.interaction._prevDragDx = 0;
    state.interaction.cardStartPos = new Map();
    for (const cid of group2.cardIds) {
      const c = state.cards.find(ca => ca.id === cid);
      if (c) state.interaction.cardStartPos.set(cid, { x: c.x, y: c.y });
    }
    state.interaction._groupStartPos = { x: group2.x, y: group2.y, width: group2.width, height: group2.height };
    render();
  } else if (hit.type === 'line-endpoint') {
    // Start dragging a line endpoint
    const shape = state.shapes.find(s => s.id === hit.shapeId);
    if (!shape) return;
    pushUndo();
    state.interaction.mode = 'dragging-line-endpoint';
    state.interaction.targetShapeId = hit.shapeId;
    state.interaction._lineEndpointIdx = hit.endpoint;
    state.interaction._lineDragStartX1 = shape.x1;
    state.interaction._lineDragStartY1 = shape.y1;
    state.interaction._lineDragStartX2 = shape.x2;
    state.interaction._lineDragStartY2 = shape.y2;
    state.selection.shapeId = hit.shapeId;
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    // Deselect any Fabric object
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    render();
  } else if (hit.type === 'line-body') {
    // Select line and start dragging the body
    const shape = state.shapes.find(s => s.id === hit.shapeId);
    if (!shape) return;
    pushUndo();
    state.interaction.mode = 'dragging-line-body';
    state.interaction.targetShapeId = hit.shapeId;
    state.interaction.dragStartWorld = screenToWorld(sx, sy);
    state.interaction._lineDragStartX1 = shape.x1;
    state.interaction._lineDragStartY1 = shape.y1;
    state.interaction._lineDragStartX2 = shape.x2;
    state.interaction._lineDragStartY2 = shape.y2;
    state.selection.shapeId = hit.shapeId;
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    // Deselect any Fabric object
    if (fabricCanvas) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
    render();
  } else {
    // Click on empty canvas
    if (state.interaction._autoPaused) { render(); return; }
    state.interaction._showGroupHandles.clear();
    // If cards are selected without modifier, deselect them
    if (state.selection.cardIds.length > 0 && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.shapeId = null;
      updateInspector();
      render();
      // Fall through to forward to Fabric (handles its own deselection)
    }
    // If over a Fabric shape, forward to Fabric for click-to-select or drag; don't start
    // 2D rubber-band (Fabric handles its own rubber-band/selection natively).
    if (overFabric) {
      _forwardToFabric('mousedown', e);
      return;
    }
    // Deselect Fabric active object on empty canvas only when NOT over a shape
    if (!overFabric && fabricCanvas && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    }
    state.selection.groupIds = [];
    state.selection.editBoxIds = [];
    state.selection.connectionId = null;
    state.selection.shapeId = null;
    const world = screenToWorld(sx, sy);
    state.interaction.mode = 'rubber-band';
    state.interaction._rubberBand = { startX: world.x, startY: world.y, currentX: world.x, currentY: world.y };
    state.interaction.dragStart = { x: e.clientX, y: e.clientY };
    state.interaction._rbOverFabric = overFabric;
  }
});

// ================================================================
// Input: Mouse move
// ================================================================
window.addEventListener('mousemove', (e) => {
  // Skip reentrant calls triggered by our own Fabric event forwarding
  if (typeof _isForwarding !== 'undefined' && _isForwarding) return;

  // If Fabric is mid-transform, mid rubber-band selection, or we're in
  // edit-box forwarding mode → forward event to Fabric.
  if (_isFabricBusy() || state.interaction._fabricForwarding) {
    _forwardToFabric('mousemove', e);
    // Fall through to 2D rubber-band update if active
  }

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  // Line preview — 2D canvas
  if (state.interaction.mode === 'drawing-line' && state._drawing) {
    const world = screenToWorld(sx, sy);
    let nx = world.x, ny = world.y;
    if (e.shiftKey) {
      const dx = nx - state._drawing.startX;
      const dy = ny - state._drawing.startY;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.round(Math.atan2(dy, dx) * (180 / Math.PI) / 15) * 15;
      nx = state._drawing.startX + r * Math.cos(angle * Math.PI / 180);
      ny = state._drawing.startY + r * Math.sin(angle * Math.PI / 180);
    }
    state._drawing.currentX = nx;
    state._drawing.currentY = ny;
    render();
    return;
  }

  // Dragging line endpoint
  if (state.interaction.mode === 'dragging-line-endpoint') {
    const world = screenToWorld(sx, sy);
    const shape = state.shapes.find(s => s.id === state.interaction.targetShapeId);
    if (shape) {
      if (state.interaction._lineEndpointIdx === 0) {
        shape.x1 = world.x; shape.y1 = world.y;
      } else {
        shape.x2 = world.x; shape.y2 = world.y;
      }
    }
    render();
    return;
  }

  // Dragging line body
  if (state.interaction.mode === 'dragging-line-body') {
    const world = screenToWorld(sx, sy);
    const dx = world.x - state.interaction.dragStartWorld.x;
    const dy = world.y - state.interaction.dragStartWorld.y;
    const shape = state.shapes.find(s => s.id === state.interaction.targetShapeId);
    if (shape) {
      shape.x1 = state.interaction._lineDragStartX1 + dx;
      shape.y1 = state.interaction._lineDragStartY1 + dy;
      shape.x2 = state.interaction._lineDragStartX2 + dx;
      shape.y2 = state.interaction._lineDragStartY2 + dy;
    }
    render();
    return;
  }

  // Path curve preview — if just added a point and dragging, convert L to Q
  if (state.drawingTool === 'path' && state._pathDraw && state._pathDraw._justAdded) {
    const world = screenToWorld(sx, sy);
    const pp = state._pathDraw.points;
    const anchor = state._pathDraw._anchorPt;
    const dist = Math.abs(world.x - anchor.x) + Math.abs(world.y - anchor.y);
    if (dist < 5) return; // not enough drag
    state._pathDraw._justAdded = false;
    // Replace the last L command with a Q curve
    const pathData = state._pathDraw.obj.path;
    pathData.pop(); // remove the L we just added
    const cpX = anchor.x + (anchor.x - world.x);
    const cpY = anchor.y + (anchor.y - world.y);
    pathData.push(['Q', cpX, cpY, anchor.x, anchor.y]);
    _recalcPathBounds(state._pathDraw.obj);
    fabricCanvas.requestRenderAll();
    return;
  }

  // Path Q curve live update
  if (state.drawingTool === 'path' && state._pathDraw && !state._pathDraw._justAdded) {
    // Check if last segment is a Q — if so, update its control point
    const pathData = state._pathDraw.obj.path;
    const lastCmd = pathData[pathData.length - 1];
    if (lastCmd && lastCmd[0] === 'Q' && (e.buttons & 1)) {
      const world = screenToWorld(sx, sy);
      const anchor = state._pathDraw._anchorPt;
      const cpX = anchor.x + (anchor.x - world.x);
      const cpY = anchor.y + (anchor.y - world.y);
      lastCmd[1] = cpX;
      lastCmd[2] = cpY;
      _recalcPathBounds(state._pathDraw.obj);
      fabricCanvas.requestRenderAll();
    }
    return;
  }

  // Drawing shape — live preview (rect/ellipse via Fabric)
  if (state.interaction.mode === 'drawing-shape' && state._drawing) {
    const world = screenToWorld(sx, sy);
    updateFabricShape(state._drawing, world.x, world.y);
    fabricCanvas.requestRenderAll();
    return;
  }

  // Edit box drag-pending → only start actual drag after mouse moves past threshold

  if (state.interaction.mode === 'editbox-drag-pending') {
    const worldNow = screenToWorld(sx, sy);
    const dx = Math.abs(worldNow.x - state.interaction.dragStartWorld.x);
    const dy = Math.abs(worldNow.y - state.interaction.dragStartWorld.y);
    if (dx > 3 || dy > 3) {
      state.interaction.mode = 'dragging-editbox';
      // Flow through to the dragging-editbox handler below
    } else {
      return; // Not enough movement yet — don't consume the event
    }
  }

  // Dragging edit box — move the box + its connected boxes + shapes
  if (state.interaction.mode === 'dragging-editbox') {
    const worldNow = screenToWorld(sx, sy);
    let dx = worldNow.x - state.interaction.dragStartWorld.x;
    let dy = worldNow.y - state.interaction.dragStartWorld.y;
    // Anchor drag: horizontal only, lock Y
    if (state.interaction._anchorKfConnId) dy = 0;
    const group = state.interaction._eboxGroupDrag;
    if (group) {
      // Move all connected edit boxes together
      for (const [cid, start] of Object.entries(group.starts)) {
        const ceb = findEditBoxById(cid);
        if (ceb) {
          ceb.x = start.x + dx;
          ceb.y = start.y + dy;
          // Update shapes from snapshot
          ceb.shapes = start.shapesSnap.map(s => {
            const c = { ...s };
            if (c.shapeType === 'line') {
              if (c.x1 != null) c.x1 += dx;
              if (c.x2 != null) c.x2 += dx;
              if (c.y1 != null) c.y1 += dy;
              if (c.y2 != null) c.y2 += dy;
            } else {
              if (c.left != null) c.left += dx;
              if (c.top != null) c.top += dy;
            }
            return c;
          });
        }
      }
      // Also move Fabric shapes for the actively edited box
      const shapeStarts = state.interaction._eboxShapeStartPos || [];
      for (const s of shapeStarts) {
        s.obj.set({ left: s.left + dx, top: s.top + dy });
        s.obj.setCoords();
      }
    } else {
      const eb = findEditBoxById(state.interaction.dragEditBoxId);
      if (eb) {
        eb.x = state.interaction._eboxDragStartX + dx;
        eb.y = state.interaction._eboxDragStartY + dy;
        // Move Fabric shapes from their start positions
        const shapeStarts = state.interaction._eboxShapeStartPos || [];
        for (const s of shapeStarts) {
          s.obj.set({ left: s.left + dx, top: s.top + dy });
          s.obj.setCoords();
        }
        // Real-time update eb.shapes from snapshot + delta
        const snap = state.interaction._eboxShapeDataSnap;
        if (snap) {
          eb.shapes = snap.map(s => {
            const c = { ...s };
            if (c.shapeType === 'line') {
              if (c.x1 != null) c.x1 += dx;
              if (c.x2 != null) c.x2 += dx;
              if (c.y1 != null) c.y1 += dy;
              if (c.y2 != null) c.y2 += dy;
            } else {
              if (c.left != null) c.left += dx;
              if (c.top != null) c.top += dy;
            }
            return c;
          });
        }
      }
    }
    render();
    return;
  }

  // Dragging timeline dot — move edit box horizontally only
  if (state.interaction.mode === 'timeline-dot-drag') {
    const worldNow = screenToWorld(sx, sy);
    const dx = worldNow.x - state.interaction.dragStartWorld.x;
    const eb = findEditBoxById(state.interaction._dotDragEbId);
    if (eb) {
      eb.x = Math.max(0, state.interaction._dotDragStartX + dx);
    }
    render();
    return;
  }

  // Timeline progress scrub
  if (state.interaction.mode === 'timeline-progress-drag') {
    const tl = state.interaction._progressDragTl;
    const pb = state.playback;
    if (!tl || !pb || !pb._ebChain) return;
    const worldNow = screenToWorld(sx, sy);
    const progress = Math.max(0, Math.min(1, (worldNow.x - tl.x) / Math.max(1, tl.w)));
    pb._ebChainProgress = progress;
    pb.pausedAt = progress * pb.totalDuration;
    // Recompute interpolated shapes at new progress
    const chainData = pb._ebChain;
    const card = { editBoxChain: chainData.chain, totalDuration: pb.totalDuration };
    const frame = computeSynthFrame(card, progress);
    if (frame) {
      chainData._currentInterp = frame.shapes;
      chainData._currentViewport = frame.viewport;
    }
    render();
    return;
  }

  // If a drawing tool is active, no hover updates on main canvas
  // (empty-group drawing needs mousemove to update its drag rect)
  if (state.drawingTool !== 'select' && state.drawingTool !== 'empty-group') return;

  if (state.interaction.mode === 'pan') {
    const dx = e.clientX - state.interaction.dragStart.x;
    const dy = e.clientY - state.interaction.dragStart.y;
    state.canvas.offsetX = state.interaction.dragOffset.x + dx;
    state.canvas.offsetY = state.interaction.dragOffset.y + dy;
    // During playback, skip redundant render — playbackTick's rAF will handle it
    if (!state.playback.isPlaying && state.playback.pausedAt === 0) {
      render();
    }
    return;
  }

  if (state.interaction.mode === 'dragging-card' && state.interaction.dragMarkerCardId) {
    // Dragging a marker card — constrain to parent card's x range
    const worldNow = screenToWorld(sx, sy);
    const marker = state.markerCards.find(m => m.id === state.interaction.dragMarkerCardId);
    if (marker) {
      const parentCard = state.cards.find(c => c.id === marker.parentCardId);
      const dx = worldNow.x - state.interaction.dragStartWorld.x;
      const newX = state.interaction._markerDragStartX + dx;
      if (parentCard) {
        const minX = parentCard.x;
        const maxX = parentCard.x + getCardWidth(parentCard);
        marker.x = Math.max(minX, Math.min(maxX, newX));
      } else {
        marker.x = newX; // fallback: free movement
      }
    }
    render();
    return;
  }

  if (state.interaction.mode === 'dragging-card' || state.interaction.mode === 'dragging-group' || state.interaction.mode === 'dragging-unified') {
    const worldNow = screenToWorld(sx, sy);
    let dx = worldNow.x - state.interaction.dragStartWorld.x;
    let dy = worldNow.y - state.interaction.dragStartWorld.y;
    // Apply dx,dy first
    for (const [cid, startPos] of state.interaction.cardStartPos) {
      const card = state.cards.find(c => c.id === cid);
      if (card) {
        card.x = startPos.x + dx;
        card.y = startPos.y + dy;
      }
    }
    // Also update collapsed/fixed group position
    if (state.interaction.mode === 'dragging-group' && state.interaction._groupStartPos) {
      const group = state.groups.find(g => g.id === state.interaction.targetGroupId);
      if (group && (group.collapsed || group.sizingMode === 'fixed')) {
        group.x = state.interaction._groupStartPos.x + dx;
        group.y = state.interaction._groupStartPos.y + dy;
      }
      // Real-time group playhead update during drag (incremental, not absolute)
      const pb2 = state.playback;
      if (pb2.playbackMode === 'group' && pb2.groupPlayback.groupId === state.interaction.targetGroupId) {
        const prevDx = state.interaction._prevDragDx || 0;
        const ddx = dx - prevDx;
        state.interaction._prevDragDx = dx;
        pb2.groupPlayback.groupStartX += ddx;
        pb2.groupPlayback.groupEndX += ddx;
        if (pb2._groupPlayheadX != null) pb2._groupPlayheadX += ddx;
      }
    }
    // Snap alignment — only left/right edges (horizontal) and bottom edge (vertical)
    const SNAP = 6 / state.canvas.zoom; // world units
    const CROSS_AXIS_X = 300; // max horizontal distance for bottom snap
    const CROSS_AXIS_Y = 200; // max vertical distance for left/right snap
    const dragIds = new Set(state.interaction.cardStartPos.keys());
    const snapLines = [];
    let snapDx = 0, snapDy = 0;
    for (const [cid, startPos] of state.interaction.cardStartPos) {
      const c = state.cards.find(ca => ca.id === cid);
      if (!c) continue;
      const cw = getCardWidth(c);
      const ch = (c.type === 'text') ? (c.height || 40) : CARD_HEIGHT;
      const cLeft = c.x, cRight = c.x + cw, cBottom = c.y + ch;
      let bestDx = 0, bestDy = 0, bestTargetX = 0, bestTargetY = 0, bestDistX = SNAP, bestDistY = SNAP;
      for (const other of state.cards) {
        if (dragIds.has(other.id)) continue;
        const ow = getCardWidth(other);
        const oh = (other.type === 'text') ? (other.height || 40) : CARD_HEIGHT;
        const oLeft = other.x, oRight = other.x + ow, oBottom = other.y + oh;
        // Left/right snap — only if cards are vertically close
        if (Math.abs(c.y - other.y) < CROSS_AXIS_Y) {
          for (const ev of [cLeft, cRight]) {
            for (const oev of [oLeft, oRight]) {
              const dist = Math.abs(ev - oev);
              if (dist < bestDistX) { bestDistX = dist; bestDx = oev - ev; bestTargetX = oev; }
            }
          }
        }
        // Bottom snap — only if cards overlap or are close horizontally
        const hGap = Math.max(0, cLeft - oRight, oLeft - cRight);
        if (hGap < CROSS_AXIS_X) {
          const dist = Math.abs(cBottom - oBottom);
          if (dist < bestDistY) { bestDistY = dist; bestDy = oBottom - cBottom; bestTargetY = oBottom; }
        }
      }
      if (bestDistX < SNAP) { snapDx = bestDx; snapLines.push({ orient: 'v', pos: bestTargetX }); }
      if (bestDistY < SNAP) { snapDy = bestDy; snapLines.push({ orient: 'h', pos: bestTargetY }); }
    }
    // Apply snap
    if (snapDx !== 0 || snapDy !== 0) {
      for (const [cid, startPos] of state.interaction.cardStartPos) {
        const card = state.cards.find(ca => ca.id === cid);
        if (card) {
          card.x = startPos.x + dx + snapDx;
          card.y = startPos.y + dy + snapDy;
        }
      }
    }
    state.interaction._snapLines = snapLines.length > 0 ? snapLines : null;
    // Move Fabric shapes alongside cards during unified drag
    if (state.interaction.mode === 'dragging-unified' && state.interaction._fabricStartPos) {
      const effectiveDx = dx + (snapDx || 0);
      const effectiveDy = dy + (snapDy || 0);
      _moveFabricShapesDelta(state.interaction._fabricStartPos, effectiveDx, effectiveDy);
    }
    // Move edit boxes alongside cards during unified drag
    if (state.interaction.mode === 'dragging-unified' && state.interaction.editBoxStartPos) {
      const effectiveDx = dx + (snapDx || 0);
      const effectiveDy = dy + (snapDy || 0);
      for (const [ebid, startPos] of state.interaction.editBoxStartPos) {
        const eb = state.editBoxes.find(e => e.id === ebid);
        if (eb) { eb.x = startPos.x + effectiveDx; eb.y = startPos.y + effectiveDy; }
      }
      // Real-time update eb.shapes[] from snapshot + delta
      const snap = state.interaction._eboxShapeSnap;
      if (snap) {
        for (const [ebid, startPos] of state.interaction.editBoxStartPos) {
          const eb = state.editBoxes.find(e => e.id === ebid);
          const orig = snap[ebid];
          if (!eb || !orig) continue;
          const ddx = eb.x - startPos.x;
          const ddy = eb.y - startPos.y;
          eb.shapes = orig.map(s => {
            const c = { ...s };
            if (c.shapeType === 'line') {
              if (c.x1 != null) c.x1 += ddx; if (c.x2 != null) c.x2 += ddx;
              if (c.y1 != null) c.y1 += ddy; if (c.y2 != null) c.y2 += ddy;
            } else {
              if (c.left != null) c.left += ddx;
              if (c.top != null) c.top += ddy;
            }
            return c;
          });
        }
      }
    }
    // Move collapsed groups alongside cards during unified drag
    if (state.interaction.mode === 'dragging-unified' && state.interaction._groupStartPosForUnified) {
      const effectiveDx = dx + (snapDx || 0);
      const effectiveDy = dy + (snapDy || 0);
      for (const [gid, startPos] of Object.entries(state.interaction._groupStartPosForUnified)) {
        const group = state.groups.find(g => g.id === gid);
        if (group && group.collapsed) { group.x = startPos.x + effectiveDx; group.y = startPos.y + effectiveDy; }
      }
    }
    // Auto-scale transition durations based on new gap between connected cards (after snap)
    if (state.interaction.mode !== 'dragging-unified') {
      _recalcTransitionDurations(new Set(state.interaction.cardStartPos.keys()));
    }
    // Detect drop target: is any dragged card inside a group frame?
    state.interaction.dropTargetGroupId = null;
    const dragModeGroupId = state.interaction.mode === 'dragging-group' ? state.interaction.targetGroupId : null;
    for (const group of state.groups) {
      if (group.id === dragModeGroupId) continue; // don't drop group into itself
      if (group.collapsed) continue; // only expanded groups
      const frame = getGroupFrame(group);
      if (!frame) continue;
      let anyInside = false;
      for (const [cid] of state.interaction.cardStartPos) {
        const card = state.cards.find(c => c.id === cid);
        if (!card) continue;
        // Skip cards already in this group
        if (group.cardIds.includes(card.id)) continue;
        const cw = getCardWidth(card);
        const ch = (card.type === 'text') ? (card.height || 40) : CARD_HEIGHT;
        const cx = card.x + cw / 2, cy = card.y + ch / 2;
        if (cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h) {
          anyInside = true;
          break;
        }
      }
      if (anyInside) {
        state.interaction.dropTargetGroupId = group.id;
        break;
      }
    }
    render();
    return;
  }

  if (state.interaction.mode === 'dragging-group-resize') {
    const group = state.groups.find(g => g.id === state.interaction.targetGroupId);
    if (!group || !state.interaction._resizeStartFrame) return;
    const worldNow = screenToWorld(sx, sy);
    const dx = worldNow.x - state.interaction.dragStartWorld.x;
    const dy = worldNow.y - state.interaction.dragStartWorld.y;
    const sf = state.interaction._resizeStartFrame;
    const handle = state.interaction._resizeHandle;
    const MIN_W = 100, MIN_H = 60;
    // Resize based on handle direction
    if (handle.includes('e')) {
      group.width = Math.max(MIN_W, sf.w + dx);
    }
    if (handle.includes('s')) {
      group.height = Math.max(MIN_H, sf.h + dy);
    }
    if (handle.includes('w')) {
      const newW = Math.max(MIN_W, sf.w - dx);
      group.x = sf.x + sf.w - newW;
      group.width = newW;
    }
    if (handle.includes('n')) {
      const newH = Math.max(MIN_H, sf.h - dy);
      group.y = sf.y + sf.h - newH;
      group.height = newH;
    }
    render();
    return;
  }

  if (state.interaction.mode === 'trimming-left' || state.interaction.mode === 'trimming-right') {
    const card = state.cards.find(c => c.id === state.interaction.targetCardId);
    if (!card) return;
    const worldNow = screenToWorld(sx, sy);
    const worldStart = screenToWorld(
      state.interaction.dragStart.x - rect.left,
      state.interaction.dragStart.y - rect.top
    );
    const deltaX = (worldNow.x - worldStart.x);
    const deltaTime = deltaX / PIXELS_PER_SECOND;

    if (state.interaction.mode === 'trimming-left') {
      const newTrim = state.interaction.trimStartVal + deltaTime;
      card.trimIn = Math.max(0, Math.min(newTrim, card.trimOut - 0.1));
      // Keep right edge fixed: shift card.x right as it shrinks
      const minW = CARD_MIN_WIDTH;
      const rightEdge = state.interaction.trimStartX + state.interaction.trimStartWidth;
      card.x = Math.min(state.interaction.trimStartX + deltaX, rightEdge - minW);
      // Ripple group members to the left to maintain spacing
      if (state.interaction._rippleCards) {
        const delta = card.x - state.interaction._rippleCards.originalLeftEdge;
        for (const [cid, startPos] of state.interaction._rippleCards.cards) {
          const gc = state.cards.find(c => c.id === cid);
          if (gc) {
            gc.x = startPos.x + delta;
            gc.y = startPos.y;
          }
        }
      }
    } else {
      const newTrim = state.interaction.trimStartVal + deltaTime;
      card.trimOut = Math.max(card.trimIn + 0.1, card.type === 'composition' ? newTrim : Math.min(newTrim, card.totalDuration || card.duration));
      // Ripple: shift downstream cards by right-edge delta
      if (state.interaction._rippleCards) {
        const newWidth = getCardWidth(card);
        const newRightEdge = card.x + newWidth;
        const delta = newRightEdge - state.interaction._rippleCards.originalRightEdge;
        for (const [cid, startPos] of state.interaction._rippleCards.cards) {
          const dc = state.cards.find(c => c.id === cid);
          if (dc) {
            dc.x = startPos.x + delta;
            dc.y = startPos.y; // y stays the same
          }
        }
      }
    }
    // Auto-scale transition durations for trimmed card and any ripple-shifted cards
    {
      const affectedIds = new Set([card.id]);
      if (state.interaction._rippleCards) {
        for (const [cid] of state.interaction._rippleCards.cards) affectedIds.add(cid);
      }
      _recalcTransitionDurations(affectedIds);
    }
    render();
    return;
  }

  if (state.interaction.mode === 'adjusting-volume') {
    const card = state.cards.find(c => c.id === state.interaction.targetCardId);
    if (!card) return;
    const world = screenToWorld(sx, sy);
    const isAudio = card.type === 'audio';
    const wfY = isAudio ? card.y : card.y + CARD_THUMB_HEIGHT;
    const wfH = CARD_WAVEFORM_HEIGHT;
    const volTrackY = wfY + 8;
    const volTrackH = wfH - 16;
    // Vertical: top = 100%, bottom = 0%
    const frac = 1 - (world.y - volTrackY) / volTrackH;
    card.volume = Math.round(Math.max(0, Math.min(1, frac)) * 100) / 100;
    render();
    return;
  }

  if (state.interaction.mode === 'scrubbing') {
    const world = screenToWorld(sx, sy);
    if (state.interaction._scrubGroup) {
      // Group scrubbing: map mouse X to spatial playhead position
      const gp = state.playback.groupPlayback;
      if (!gp || gp.totalPixels <= 0) return;
      const clampedX = Math.max(gp.groupStartX, Math.min(gp.groupEndX, world.x));
      const totalDuration = gp.totalPixels / PIXELS_PER_SECOND;
      const newPausedAt = (clampedX - gp.groupStartX) / PIXELS_PER_SECOND;
      state.playback.pausedAt = Math.max(0, Math.min(totalDuration, newPausedAt));
      state.playback.totalDuration = totalDuration;
      // Update stored playhead for visual feedback
      state.playback._groupPlayheadX = clampedX;
      render();
      updatePreviewPanel();
      return;
    }
    const card = state.cards.find(c => c.id === state.interaction.targetCardId);
    if (!card) return;
    const cw = getCardWidth(card);
    const dur = card.trimOut - card.trimIn;
    if (dur <= 0) return;
    // Clamp world x to card bounds
    const clampedX = Math.max(card.x, Math.min(card.x + cw, world.x));
    const progress = (clampedX - card.x) / cw;
    const newTime = card.trimIn + progress * dur;
    state.playback.pausedCardTime = newTime;
    state.playback.pausedAt = calcTotalElapsedAtCard(card, progress);
    state.playback.cardProgress = progress;
    syncPlaybackVideo();
    render();
    updatePreviewPanel();
    return;
  }

  if (state.interaction.mode === 'drawing-empty-group') {
    const world = screenToWorld(sx, sy);
    state.interaction._emptyGroupCurrent = { x: world.x, y: world.y };
    render();
    return;
  }

  if (state.interaction.mode === 'rubber-band') {
    const world = screenToWorld(sx, sy);
    state.interaction._rubberBand.currentX = world.x;
    state.interaction._rubberBand.currentY = world.y;
    render();
    return;
  }

  if (state.interaction.mode === 'connecting') {
    state.interaction.mouseWorldPos = screenToWorld(sx, sy);
    const chit = hitTest(sx, sy);
    const prevHovConn = state.hoveredCardId;
    const fromId = state.interaction.connectingFrom.cardId || state.interaction.connectingFrom.markerCardId;

    // Editing existing keyframe anchor: constrain to source card's top edge
    if (state.interaction.connectingFrom._kfConnId && state.interaction.connectingFrom.side === 'top') {
      const fromCard = state.cards.find(c => c.id === fromId);
      if (fromCard) {
        const cw = getCardWidth(fromCard);
        let mx = state.interaction.mouseWorldPos.x;
        mx = Math.max(fromCard.x, Math.min(fromCard.x + cw, mx));
        state.interaction.connectingFrom.fromPosition = (mx - fromCard.x) / cw;
        state.interaction.mouseWorldPos = { x: mx, y: fromCard.y - 20 };
        // Snap target: the connected card's top-left anchor (fixed at position 0)
        const kfConn = state.connections.find(c => c.id === state.interaction.connectingFrom._kfConnId);
        if (kfConn) {
          const toCard = state.cards.find(c => c.id === kfConn.toCardId);
          if (toCard) state.interaction._connectSnapPos = getAnchorPos(toCard, 'top', 0);
        }
        // Seek preview video to the current fromPosition frame
        if (fromCard.type === 'video' && !fromCard.isFreezeFrame) {
          const pb = state.playback;
          const fromPos = state.interaction.connectingFrom.fromPosition;
          pb.currentCardId = fromCard.id;
          pb.cardProgress = fromPos;
          pb.pausedCardTime = fromCard.trimIn + fromPos * (fromCard.trimOut - fromCard.trimIn);
          pb.pausedAt = 1;
          pb.inTransition = false;
          pb._keyframeProps = null;
          if (playbackVideo._cardId !== fromCard.id) {
            playbackVideo.src = fromCard.fileURL;
            playbackVideo._cardId = fromCard.id;
          }
          playbackVideo.currentTime = pb.pausedCardTime;
          playbackVideo.pause();
          updatePreviewPanel();
        }
      }
      render();
      return;
    }

    // Edit box anchor connecting: snap to other edit boxes
    if (state.interaction.connectingFrom._isEditBoxAnchor) {
      const fromEbId = state.interaction.connectingFrom.editBoxId;
      if (chit.editBoxId && chit.editBoxId !== fromEbId) {
        const toEb = findEditBoxById(chit.editBoxId);
        if (toEb) {
          state.interaction._connectSnapPos = {
            x: toEb.x + toEb.width / 2,
            y: toEb.y + toEb.height + 10 / state.canvas.zoom
          };
          state.hoveredEditBoxId = toEb.id;
        }
      } else {
        state.hoveredEditBoxId = null;
        state.interaction._connectSnapPos = null;
      }
      render();
      return;
    }

    // Accept snap to cards or marker cards
    let snapTarget = null;
    if (chit.cardId && chit.cardId !== fromId) {
      state.hoveredCardId = chit.cardId;
      const fromCard = state.cards.find(c => c.id === fromId);
      const toCard = state.cards.find(c => c.id === chit.cardId);
      if (fromCard && toCard) {
        const fromSide = state.interaction.connectingFrom.side;
        if (fromSide === 'top') {
          // Keyframe connection: top-to-top
          snapTarget = getAnchorPos(toCard, 'top');
        } else {
        const fromCenterX = fromCard.x + getCardWidth(fromCard) / 2;
        const toCenterX = toCard.x + getCardWidth(toCard) / 2;
        const toSide = fromCenterX < toCenterX ? 'left' : 'right';
        const compatible = (fromSide === 'right' && toSide === 'left') || (fromSide === 'left' && toSide === 'right');
        if (compatible) {
          snapTarget = getAnchorPos(toCard, toSide);
        }
        }
      }
    } else if ((chit.type === 'marker-card' || chit.type === 'marker-anchor') && chit.markerCardId !== fromId) {
      const toMarker = state.markerCards.find(m => m.id === chit.markerCardId);
      if (toMarker) {
        snapTarget = { x: toMarker.x, y: toMarker.y };
      }
    } else {
      state.hoveredCardId = null;
    }
    state.interaction._connectSnapPos = snapTarget;
    if (state.hoveredCardId !== prevHovConn) render();
    return;
  }

  // Idle: update mouseWorldPos, cursor + hover state
  state.interaction.mouseWorldPos = screenToWorld(sx, sy);
  const hit = hitTest(sx, sy);
  const prevHoveredCard = state.hoveredCardId;
  const prevHoveredConn = state.hoveredConnectionId;
  const prevHoveredAnchor = state.hoveredAnchor;
  const prevHoveredGroup = state.hoveredGroupId;
  const prevHoveredEB = state.hoveredEditBoxId;

  state.hoveredCardId = hit.cardId || null;
  state.hoveredConnectionId = (hit.type === 'connection-badge' || hit.type === 'connection-delete') ? hit.connectionId : null;
  state.hoveredAnchor = hit.type === 'anchor' ? { cardId: hit.cardId, side: hit.side, _kfConnId: hit._kfConnId || null } :
    (hit.type === 'editbox-anchor' ? { editBoxId: hit.editBoxId, side: hit.side, _kfConnId: hit._kfConnId || null } : null);
  state.hoveredGroupId = (hit.type === 'group-title' || hit.type === 'group-body') ? hit.groupId : null;
  state.hoveredEditBoxId = hit.editBoxId || null;
  // Only re-render if hover target changed
  if (state.hoveredCardId !== prevHoveredCard ||
      state.hoveredConnectionId !== prevHoveredConn ||
      state.hoveredGroupId !== prevHoveredGroup ||
      state.hoveredEditBoxId !== prevHoveredEB ||
      (state.hoveredAnchor && (!prevHoveredAnchor ||
        (state.hoveredAnchor.cardId !== prevHoveredAnchor.cardId || state.hoveredAnchor.editBoxId !== prevHoveredAnchor.editBoxId || state.hoveredAnchor.side !== prevHoveredAnchor.side || state.hoveredAnchor._kfConnId !== prevHoveredAnchor._kfConnId))) ||
      (!state.hoveredAnchor && prevHoveredAnchor)) {
    render();
  }

  if (hit.type === 'anchor' || hit.type === 'editbox-anchor') {
    _setCanvasCursor('crosshair');
  } else if (hit.type === 'connection-badge') {
    _setCanvasCursor('pointer');
  } else if (hit.type === 'connection-delete') {
    _setCanvasCursor('pointer');
  } else if (hit.type === 'trimming-left' || hit.type === 'trimming-right') {
    _setCanvasCursor('ew-resize');
  } else if (hit.type === 'volume') {
    _setCanvasCursor('ns-resize');
  } else if (hit.type === 'volume-text') {
    _setCanvasCursor('text');
  } else if (hit.type === 'group-title') {
    _setCanvasCursor('grab');
  } else if (hit.type === 'group-body') {
    _setCanvasCursor('default');
  } else if (hit.type === 'card-label') {
    _setCanvasCursor('text');
  } else if (hit.type === 'card-body') {
    _setCanvasCursor('pointer');
  } else if (hit.type === 'playhead') {
    _setCanvasCursor('ew-resize');
  } else if (hit.type === 'line-endpoint') {
    _setCanvasCursor('pointer');
  } else if (hit.type === 'line-body') {
    _setCanvasCursor('move');
  } else if (state.interaction.spaceDown) {
    _setCanvasCursor('grab');
  } else {
    _setCanvasCursor('default');
  }
});

// ================================================================
// Input: Mouse up
// ================================================================
window.addEventListener('mouseup', (e) => {
  // Skip reentrant calls triggered by our own Fabric event forwarding
  if (typeof _isForwarding !== 'undefined' && _isForwarding) return;

  // Handle path drawing (mouseup after adding a point — continue drawing)
  if (state.drawingTool === 'path' && state._pathDraw) {
    // In path mode, mouseup is just the end of a click — path stays active.
    // The pathDraw._justAdded flag is cleared in mousemove after drag-to-curve.
    // Double-click or ESC finishes the path.
    return;
  }

  // Line drawing mode — wait for second click, don't reset on mouseup
  if (state.interaction.mode === 'drawing-line') return;

  // If Fabric is mid-transform or in edit-box forwarding mode → forward mouseup
  if (_isFabricBusy() || state.interaction._fabricForwarding) {
    _forwardToFabric('mouseup', e);
    state.interaction._fabricForwarding = false;
    // Fall through to 2D rubber-band end
  }

  // End line editing (endpoint drag or body drag)
  if (state.interaction.mode === 'dragging-line-endpoint' || state.interaction.mode === 'dragging-line-body') {
    state.interaction.mode = 'idle';
    state.interaction.targetShapeId = null;
    state.interaction._lineEndpointIdx = -1;
    render();
    return;
  }

  // End edit box dragging (or clear pending drag)
  if (state.interaction.mode === 'dragging-editbox' || state.interaction.mode === 'editbox-drag-pending' || state.interaction.mode === 'timeline-dot-drag') {
    // Anchor click (no significant drag) → select the connection
    if (state.interaction.mode === 'editbox-drag-pending' && state.interaction._anchorKfConnId) {
      state.selection.connectionId = state.interaction._anchorKfConnId;
      state.selection.connectionIds = [state.interaction._anchorKfConnId];
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.editBoxId = null;
    }
    state.interaction.mode = 'idle';
    state.interaction._eboxShapeStartPos = null;
    state.interaction._eboxShapeDataSnap = null;
    state.interaction._eboxGroupDrag = null;
    state.interaction._dotDragEbId = null;
    state.interaction._dotDragStartX = null;
    state.interaction._anchorKfConnId = null;
    // Update eb-keyframe connection durations after edit box drag
    const draggedEb = findEditBoxById(state.interaction.dragEditBoxId);
    if (draggedEb) {
      for (const c of state.connections) {
        if (c.type !== 'eb-keyframe') continue;
        if (c.fromEditBoxId !== draggedEb.id && c.toEditBoxId !== draggedEb.id) continue;
        const fromEb = findEditBoxById(c.fromEditBoxId);
        const toEb = findEditBoxById(c.toEditBoxId);
        if (fromEb && toEb) {
          c.transitionDuration = Math.abs(toEb.x - fromEb.x) / PIXELS_PER_SECOND;
        }
      }
    }
    render();
    return;
  }

  // End timeline progress scrub
  if (state.interaction.mode === 'timeline-progress-drag') {
    state.interaction.mode = 'idle';
    state.interaction._progressDragTl = null;
    state.interaction._progressDragStartProgress = null;
    render();
    return;
  }

  // Handle drawing-shape mode — keep Fabric object on canvas as editable shape
  if (state.interaction.mode === 'drawing-shape' && state._drawing) {
    const d = state._drawing;
    const obj = d.obj;
    const z = state.canvas.zoom;

    // Get bounding box in world coords
    let worldW, worldH;
    if (d.shapeType === 'ellipse') {
      worldW = Math.abs(obj.rx * 2 * z);
      worldH = Math.abs(obj.ry * 2 * z);
    } else { // rect
      worldW = Math.abs(obj.width * z);
      worldH = Math.abs(obj.height * z);
    }

    state._drawing = null;
    state.interaction.mode = 'idle';

    const minDim = 4;
    const bigEnough = worldW >= minDim && worldH >= minDim;

    if (bigEnough) {
      obj.set({
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        centeredRotation: true,
        lockUniScaling: false,
        fill: 'rgba(136,196,5,0.15)',
        stroke: '#88C405'
      });
      obj.setCoords();

      const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      obj._shapeId = id;
      obj._shapeType = d.shapeType;

      pushUndo();
      if (d.editBoxId) {
        // Push to edit box shapes in edit-box-local coords
        const eb = findEditBoxById(d.editBoxId);
        if (eb) {
          eb.shapes = eb.shapes || [];
          const entry = _fabricEditBoxObjToShapeData(obj, eb);
          if (entry) { entry.id = id; eb.shapes.push(entry); }
          obj._isEditBoxShape = true;
          obj._editBoxId = d.editBoxId;
        }
      } else {
        const shapeEntry = _fabricObjToShapeData(obj, id, d.shapeType);
        state.shapes.push(shapeEntry);
      }

      setDrawingTool('select');
      // Now select the new shape (selection must be enabled first)
      fabricCanvas.setActiveObject(obj);
      fabricCanvas.requestRenderAll();
      updateInspectorForFabricSelection();
    } else {
      // Too small — remove
      fabricCanvas.remove(obj);
      fabricCanvas.requestRenderAll();
      setDrawingTool('select');
    }

    render();
    return;
  }

  // Handle connecting mode — check if released over a compatible anchor
  if (state.interaction.mode === 'connecting') {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // If dragging an existing keyframe anchor, update fromPosition
    // (mousedown already called pushUndo to capture the original state)
    if (state.interaction.connectingFrom._kfConnId && state.interaction.connectingFrom.side === 'top') {
      const kfConn = state.connections.find(c => c.id === state.interaction.connectingFrom._kfConnId);
      if (kfConn && state.interaction.connectingFrom.fromPosition != null) {
        kfConn.fromPosition = state.interaction.connectingFrom.fromPosition;
      }
      state.interaction.mode = 'idle';
      state.interaction.connectingFrom = null;
      state.interaction._isTweenConnection = false;
      state.interaction._connectSnapPos = null;
      canvasWrap.classList.remove('connecting');
      render();
      return;
    }

    // Edit box anchor connecting: create eb-keyframe connection
    if (state.interaction.connectingFrom._isEditBoxAnchor) {
      const fromEbId = state.interaction.connectingFrom.editBoxId;
      const hit2 = hitTest(sx, sy);
      if (hit2.editBoxId && hit2.editBoxId !== fromEbId) {
        const connId = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.connections.push({
          id: connId,
          type: 'eb-keyframe',
          fromEditBoxId: fromEbId,
          toEditBoxId: hit2.editBoxId
        });
        state.selection.connectionId = connId;
        state.selection.connectionIds = [connId];
        state.selection.cardIds = [];
        state.selection.groupIds = [];
      }
      state.interaction.mode = 'idle';
      state.interaction.connectingFrom = null;
      state.interaction._isTweenConnection = false;
      state.interaction._connectSnapPos = null;
      canvasWrap.classList.remove('connecting');
      render();
      return;
    }

    const hit = hitTest(sx, sy);

    // Accept any hit on a card or marker card (not just anchor dots)
    const isFromMarker = !!state.interaction.connectingFrom.markerCardId;
    const fromId = isFromMarker ? state.interaction.connectingFrom.markerCardId : state.interaction.connectingFrom.cardId;

    // Build target info from whatever was hit
    let targetCardId = hit.cardId || null;
    let targetMarkerId = null;

    // If hit was a marker-card, use it as target
    if (hit.type === 'marker-card' || hit.type === 'marker-anchor') {
      targetMarkerId = hit.markerCardId || null;
      targetCardId = null;
    } else if (hit.cardId) {
      targetCardId = hit.cardId;
    }

    if (targetCardId && targetCardId !== fromId) {
      const fromCard = state.cards.find(c => c.id === fromId);
      const toCard = state.cards.find(c => c.id === targetCardId);
      if (fromCard && toCard) {
        const fromSide = state.interaction.connectingFrom.side;
        if (fromSide === 'top') {
          // Keyframe connection: top-to-top
          const connId = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const fromPosition = state.interaction.connectingFrom.fromPosition != null
            ? state.interaction.connectingFrom.fromPosition
            : 0.5;
          state.connections.push({
            id: connId,
            fromCardId: fromCard.id,
            fromSide: 'top',
            toCardId: toCard.id,
            toSide: 'top',
            type: 'keyframe',
            fromPosition,
            easing: 'ease-in-out',
            properties: ['opacity', 'transformScale', 'transformX', 'transformY']
          });
          // Auto-snap target card flush against source card
          toCard.x = fromCard.x + getCardWidth(fromCard);
          // Auto-select the new connection so the user can configure properties immediately
          state.selection.connectionId = connId;
          state.selection.cardIds = [];
          state.selection.groupIds = [];
          updateInspector();
        } else {
        // Always connect left→right, regardless of drag direction
        let leftCard = fromCard;
        let rightCard = toCard;
        if (fromCard.x + getCardWidth(fromCard) / 2 > toCard.x + getCardWidth(toCard) / 2) {
          leftCard = toCard;
          rightCard = fromCard;
        }
        const connId = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        let transDur = 0.5;
        const fromEndX = leftCard.x + getCardWidth(leftCard);
        let gap = rightCard.x - fromEndX;

        // Clamp card positions to valid gap range
        if (gap > MAX_TRANSITION_GAP) {
          leftCard.x = rightCard.x - getCardWidth(leftCard) - MAX_TRANSITION_GAP;
          gap = MAX_TRANSITION_GAP;
        } else if (gap < MIN_TRANSITION_GAP) {
          rightCard.x = leftCard.x + getCardWidth(leftCard) + MIN_TRANSITION_GAP;
          gap = MIN_TRANSITION_GAP;
        }

        // Replace any existing outgoing connection from leftCard (auto-switch target)
        const existingIdx = state.connections.findIndex(c =>
          c.fromCardId === leftCard.id && c.fromSide === 'right'
        );
        if (existingIdx !== -1) {
          state.connections.splice(existingIdx, 1);
        }

        transDur = Math.max(0.5, Math.min(5, gap / PIXELS_PER_SECOND));
        const isTween = state.interaction._isTweenConnection;
        state.connections.push({
          id: connId,
          fromCardId: leftCard.id,
          fromSide: 'right',
          toCardId: rightCard.id,
          toSide: 'left',
          type: isTween ? 'tween' : 'transition',
          transition: isTween ? 'cut' : 'dissolve',
          transitionDuration: isTween ? 0 : Math.round(transDur * 10) / 10,
          easing: 'linear'
        });
        }
      }
    }

    // Connecting from marker to a card or marker
    if (isFromMarker && (targetCardId || targetMarkerId)) {
      const fromMarker = state.markerCards.find(m => m.id === fromId);
      const toCardId = targetCardId || (targetMarkerId ? state.markerCards.find(m => m.id === targetMarkerId)?.parentCardId : null);
      if (fromMarker && toCardId) {
        const connId = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.connections.push({
          id: connId,
          fromCardId: fromId, // marker card id
          fromSide: 'right',
          toCardId: toCardId,
          toSide: 'left',
          type: 'tween',
          transition: 'cut',
          transitionDuration: 0,
          easing: 'linear'
        });
      }
    }

    state.interaction.mode = 'idle';
    state.interaction.connectingFrom = null;
    state.interaction._isTweenConnection = false;
    state.interaction._connectSnapPos = null;
    canvasWrap.classList.remove('connecting');
    render();
    return;
  }

  if (state.interaction.mode === 'drawing-empty-group') {
    const s = state.interaction._emptyGroupStart;
    const c = state.interaction._emptyGroupCurrent;
    if (s && c) {
      const rx = Math.min(s.x, c.x), ry = Math.min(s.y, c.y);
      const rw = Math.abs(c.x - s.x), rh = Math.abs(c.y - s.y);
      if (rw > 10 && rh > 10) {
        pushUndo();
        const id = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.groups.push({
          id, name: 'Group ' + (state.groups.length + 1),
          cardIds: [], collapsed: false,
          sizingMode: 'fixed',
          x: rx, y: ry,
          width: rw, height: rh
        });
      }
    }
    state.interaction.mode = 'idle';
    state.interaction._emptyGroupStart = null;
    state.interaction._emptyGroupCurrent = null;
    setDrawingTool('select');
    render();
    return;
  }

  if (state.interaction.mode === 'rubber-band') {
    const rb = state.interaction._rubberBand;
    if (rb) {
      const rx = Math.min(rb.startX, rb.currentX);
      const ry = Math.min(rb.startY, rb.currentY);
      const rw = Math.abs(rb.currentX - rb.startX);
      const rh = Math.abs(rb.currentY - rb.startY);
      if (rw > 3 || rh > 3) {
        // Cards
        const selected = [];
        for (const card of state.cards) {
          const cw = getCardWidth(card);
          const ch = (card.type === 'text') ? (card.height || 40) : CARD_HEIGHT;
          if (card.x < rx + rw && card.x + cw > rx && card.y < ry + rh && card.y + ch > ry) {
            selected.push(card.id);
          }
        }
        state.selection.cardIds = selected;
        // Groups
        const selectedGroups = [];
        for (const group of state.groups) {
          const frame = getGroupFrame(group);
          if (frame && frame.x < rx + rw && frame.x + frame.w > rx && frame.y < ry + rh && frame.y + frame.h > ry) {
            selectedGroups.push(group.id);
          }
        }
        state.selection.groupIds = selectedGroups;
        // Edit boxes
        const selectedEbs = [];
        for (const eb of state.editBoxes) {
          if (eb.x < rx + rw && eb.x + eb.width > rx && eb.y < ry + rh && eb.y + eb.height > ry) {
            selectedEbs.push(eb.id);
          }
        }
        state.selection.editBoxIds = selectedEbs;
        // Fabric shapes (global, not edit-box shapes)
        let selectedShapes = 0;
        const hasOtherSel = selected.length > 0 || selectedGroups.length > 0 || selectedEbs.length > 0;
        if (fabricCanvas) {
          fabricCanvas.discardActiveObject();
          const shapesInRect = [];
          for (const obj of fabricCanvas.getObjects()) {
            if (obj._isEditBoxShape) continue;
            const ol = obj.left || 0, ot = obj.top || 0;
            const ow = (obj.width || 0) * (obj.scaleX || 1);
            const oh = (obj.height || 0) * (obj.scaleY || 1);
            if (ol < rx + rw && ol + ow > rx && ot < ry + rh && ot + oh > ry) {
              shapesInRect.push(obj);
            }
          }
          selectedShapes = shapesInRect.length;
          if (hasOtherSel) {
            // Mixed selection: don't use Fabric ActiveSelection, track in state
            state.selection.shapeIds = shapesInRect.map(function(obj) { return obj._shapeId; }).filter(Boolean);
          } else if (shapesInRect.length > 1) {
            const sel = new fabric.ActiveSelection(shapesInRect, { canvas: fabricCanvas });
            fabricCanvas.setActiveObject(sel);
          } else if (shapesInRect.length === 1) {
            fabricCanvas.setActiveObject(shapesInRect[0]);
          }
          if (selectedShapes > 0) fabricCanvas.requestRenderAll();
        } else {
          state.selection.shapeIds = [];
        }
        // Connections
        const selectedConns = [];
        for (const conn of state.connections) {
          const bz = getConnectionBezier(conn);
          if (!bz) continue;
          const mx = (bz.p0.x + bz.p3.x) / 2;
          const my = (bz.p0.y + bz.p3.y) / 2;
          if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
            selectedConns.push(conn.id);
          }
        }
        state.selection.connectionIds = selectedConns;
        state.selection.connectionId = selectedConns.length === 1 ? selectedConns[0] : null;
      } else {
        state.selection.cardIds = [];
        state.selection.groupIds = [];
        state.selection.editBoxIds = [];
        state.selection.connectionIds = [];
        state.selection.connectionId = null;
        // Don't discard Fabric selection if rubber-band started on a Fabric shape
        // (the forwarded mousedown already selected it)
        if (fabricCanvas && !state.interaction._rbOverFabric) { fabricCanvas.discardActiveObject(); fabricCanvas.requestRenderAll(); }
      }
    }
    state.interaction._rubberBand = null;
    state.interaction._rbOverFabric = false;
    state.interaction.mode = 'idle';
    render();
    return;
  }

  if (state.interaction.mode === 'pan') {
    state.interaction.mode = 'idle';
    canvasWrap.classList.remove('panning');
    if (state.interaction.spaceDown) {
      canvasWrap.classList.add('space-held');
    }
  }
  if (state.interaction.mode === 'scrubbing') {
    state.interaction.mode = 'idle';
    state.interaction.targetCardId = null;
    state.interaction._scrubGroup = false;
    // Refresh group preview at new paused position
    if (state.playback.playbackMode === 'group') {
      const gp2 = state.playback.groupPlayback;
      const g2 = state.groups.find(g => g.id === gp2.groupId);
      if (g2 && state.playback._groupPlayheadX != null) {
        const cr = compositeGroupFrame(g2, gp2.timelineCards, state.playback._groupPlayheadX);
        if (cr) {
          const cw = cr.width, ch = cr.height;
          groupPreviewCanvas.width = cw; groupPreviewCanvas.height = ch;
          const displayW = rightPanel.clientWidth - 24;
          groupPreviewCanvas.style.width = displayW + 'px';
          groupPreviewCanvas.style.height = (displayW * ch / cw) + 'px';
          groupPreviewCanvas.getContext('2d').drawImage(cr, 0, 0);
        }
      }
    }
    updatePreviewPanel();
    render();
    return;
  }
  // Drop cards/groups into a target group
  if ((state.interaction.mode === 'dragging-card' || state.interaction.mode === 'dragging-group')
      && state.interaction.dropTargetGroupId) {
    const targetGroup = state.groups.find(g => g.id === state.interaction.dropTargetGroupId);
    if (targetGroup) {
      for (const [cid] of state.interaction.cardStartPos) {
        const card = state.cards.find(c => c.id === cid);
        if (!card || targetGroup.cardIds.includes(card.id)) continue;
        // Remove card from its current group (if any)
        for (const g of state.groups) {
          const idx = g.cardIds.indexOf(card.id);
          if (idx >= 0) g.cardIds.splice(idx, 1);
        }
        targetGroup.cardIds.push(card.id);
      }
      // Clean up empty non-fixed groups (fixed empty groups are intentional)
      for (let i = state.groups.length - 1; i >= 0; i--) {
        if (state.groups[i].cardIds.length === 0 && state.groups[i].sizingMode !== 'fixed') {
          state.groups.splice(i, 1);
        }
      }
    }
  }
  // If cards were dropped outside all groups, remove from fixed-mode groups if dragged outside the frame
  if ((state.interaction.mode === 'dragging-card' || state.interaction.mode === 'dragging-group')
      && !state.interaction.dropTargetGroupId) {
    for (const [cid] of state.interaction.cardStartPos) {
      const card = state.cards.find(c => c.id === cid);
      if (!card) continue;
      for (const g of state.groups) {
        if (g.sizingMode === 'fixed' && g.cardIds.includes(cid)) {
          const frame = getGroupFrame(g);
          if (!frame) continue;
          const cw = getCardWidth(card);
          const ch = (card.type === 'text') ? (card.height || 40) : CARD_HEIGHT;
          const cx = card.x + cw / 2, cy = card.y + ch / 2;
          // Only remove if card center is outside the group frame
          if (cx < frame.x || cx > frame.x + frame.w || cy < frame.y || cy > frame.y + frame.h) {
            const idx = g.cardIds.indexOf(cid);
            if (idx >= 0) g.cardIds.splice(idx, 1);
          }
        }
      }
    }
    for (let i = state.groups.length - 1; i >= 0; i--) {
      if (state.groups[i].cardIds.length === 0 && state.groups[i].sizingMode !== 'fixed') {
        state.groups.splice(i, 1);
      }
    }
  }
  // If we dragged the currently-playing group, rebuild timeline positions
  if (state.interaction.mode === 'dragging-group') {
    const pb = state.playback;
    if (pb.playbackMode === 'group' && pb.groupPlayback.groupId === state.interaction.targetGroupId) {
      const group = state.groups.find(g => g.id === state.interaction.targetGroupId);
      if (group) {
        const timeline = buildGroupTimeline(group);
        if (timeline) {
          pb.groupPlayback.groupStartX = timeline.startX;
          pb.groupPlayback.groupEndX = timeline.endX;
          pb.groupPlayback.totalPixels = timeline.totalPixels;
          const totalDuration = timeline.totalPixels / PIXELS_PER_SECOND;
          pb.totalDuration = totalDuration;
          if (pb.pausedAt > totalDuration) pb.pausedAt = totalDuration;
          pb._groupPlayheadX = timeline.startX + pb.pausedAt * PIXELS_PER_SECOND;
        }
      }
    }
  }

  if (state.interaction.mode !== 'idle') {
    const wasUnified = state.interaction.mode === 'dragging-unified';
    state.interaction.mode = 'idle';
    state.interaction.targetCardId = null;
    state.interaction.targetGroupId = null;
    state.interaction.cardStartPos = new Map();
    state.interaction._rippleCards = null;
    state.interaction._snapLines = null;
    state.interaction._groupStartPos = null;
    state.interaction._prevDragDx = 0;
    state.interaction.dropTargetGroupId = null;
    state.interaction._fabricStartPos = null;
    state.interaction.editBoxStartPos = null;
    state.interaction._eboxShapeSnap = null;
    state.interaction._groupStartPosForUnified = null;
    state.interaction.dragMarkerCardId = null;
    state.interaction._markerDragStartX = 0;
    // Unlock Fabric shapes after unified drag
    if (wasUnified && fabricCanvas) {
      _unlockFabricShapesAfterDrag();
    }
    render();
  }
  state.interaction._autoPaused = false;
});

// ================================================================
// Context Menu
// ================================================================
function showContextMenu(clientX, clientY, hit) {
  let html = '';

  if (hit.cardId) {
    // Card selected
    const card = state.cards.find(c => c.id === hit.cardId);
    if (card) {
      // Multi-select actions
      if (state.selection.cardIds.length >= 2) {
        html += `<div class="cm-item" data-action="create-group">创建组 (${state.selection.cardIds.length}张)</div>`;
        const anyInGroup = state.groups.some(g => g.cardIds.some(cid => state.selection.cardIds.includes(cid)));
        if (anyInGroup) {
          html += `<div class="cm-item" data-action="ungroup">取消分组</div>`;
          const parentGroup = state.groups.find(g => g.cardIds.some(cid => state.selection.cardIds.includes(cid)));
          if (parentGroup) {
            html += `<div class="cm-item" data-action="toggle-collapse">${parentGroup.collapsed ? '展开组' : '折叠组'}</div>`;
          }
        }
        html += `<div class="cm-sep"></div>`;
      }
      html += `<div class="cm-item" data-action="copy">复制</div>`;
      html += `<div class="cm-item${state.clipboard ? '' : ' disabled'}" data-action="paste">粘贴</div>`;
      if (card.type === 'text') {
        html += `<div class="cm-item" data-action="edit-text">编辑文字</div>`;
      } else {
        html += `<div class="cm-item" data-action="rename">重命名</div>`;
      }
      if (card.type === 'video' || card.type === 'audio' || card.type === 'bgm' || card.type === 'synthesized-video') {
        html += `<div class="cm-sep"></div>`;
        const pb = state.playback;
        let pausedOnThisCard = false;
        if (pb.playbackMode === 'group' && pb.pausedAt > 0 && pb._groupPlayheadX != null) {
          const cw2 = getCardWidth(card);
          pausedOnThisCard = pb._groupPlayheadX >= card.x && pb._groupPlayheadX <= card.x + cw2;
        } else {
          pausedOnThisCard = pb.pausedAt > 0 && pb.currentCardId === card.id;
        }
        html += `<div class="cm-item${pausedOnThisCard ? '' : ' disabled'}" data-action="cut-at-playhead">裁剪到此处</div>`;
        html += `<div class="cm-item" data-action="reset-trim">重置裁剪</div>`;
        if (card.type !== 'synthesized-video') {
          html += `<div class="cm-item" data-action="replace-content">替换素材...</div>`;
        }
        html += `<div class="cm-item" data-action="locate-eb-chain">定位编辑盒链</div>`;
      }
      if (card.type === 'composition') {
        html += `<div class="cm-sep"></div>`;
        html += `<div class="cm-item" data-action="locate-editbox">定位编辑盒</div>`;
      }
      if (card.type === 'image') {
        html += `<div class="cm-sep"></div>`;
        html += `<div class="cm-item" data-action="convert-to-still-video">转为静止视频卡片</div>`;
      }
      html += `<div class="cm-sep"></div>`;
      if (card.type === 'composition') {
        html += `<div class="cm-item danger" data-action="delete-comp-card">删除</div>`;
      } else {
        html += `<div class="cm-item danger" data-action="delete-card">删除</div>`;
      }
    }
  } else if (hit.connectionId) {
    // Connection selected
    const conn = state.connections.find(c => c.id === hit.connectionId);
    if (conn && conn.type === 'eb-keyframe') {
      html += `<div class="cm-item" data-action="insert-eb-keyframe">插入关键帧</div>`;
      html += `<div class="cm-item" data-action="synthesize-eb-video">合成视频</div>`;
      html += `<div class="cm-sep"></div>`;
    } else if (conn && conn.type !== 'eb-keyframe') {
      html += `<div class="cm-item" data-action="cycle-transition">切换转场</div>`;
    }
    html += `<div class="cm-sep"></div>`;
    html += `<div class="cm-item danger" data-action="delete-conn">删除连线</div>`;
  } else if (hit.editBoxId) {
    // Edit box selected
    const eb = findEditBoxById(hit.editBoxId);
    if (eb) {
      html += `<div class="cm-item" data-action="duplicate-editbox">复制编辑盒</div>`;
      html += `<div class="cm-item" data-action="create-comp-from-eb">创建合成卡片</div>`;
      // Check if this edit box is part of an eb-keyframe chain
      const ebKeyConns = state.connections.filter(c => c.type === 'eb-keyframe' && (c.fromEditBoxId === eb.id || c.toEditBoxId === eb.id));
      if (ebKeyConns.length > 0) {
        html += `<div class="cm-item" data-action="synthesize-eb-video">合成视频</div>`;
      }
      html += `<div class="cm-sep"></div>`;
      html += `<div class="cm-item danger" data-action="delete-editbox">删除编辑盒</div>`;
    }
  } else if (hit.groupId) {
    // Group selected
    const group = state.groups.find(g => g.id === hit.groupId);
    if (group) {
      html += `<div class="cm-item" data-action="copy">复制</div>`;
      html += `<div class="cm-item" data-action="ungroup">取消分组</div>`;
      html += `<div class="cm-sep"></div>`;
      html += `<div class="cm-item${state.clipboard ? '' : ' disabled'}" data-action="paste">粘贴</div>`;
      html += `<div class="cm-sep"></div>`;
      html += `<div class="cm-item" data-action="import-video">导入视频</div>`;
      html += `<div class="cm-item" data-action="import-audio">导入音频</div>`;
      html += `<div class="cm-item" data-action="import-image">导入图片</div>`;
      html += `<div class="cm-sep"></div>`;
      html += `<div class="cm-item" data-action="auto-arrange">排列全部</div>`;
    }
  } else {
    // Canvas / empty area — also check for selected shapes
    const hasSelectedShapes = state.selection.shapeId || (fabricCanvas && fabricCanvas.getActiveObject() && fabricCanvas.getActiveObject()._shapeId);
    if (hasSelectedShapes) {
      html += `<div class="cm-item" data-action="create-editbox">创建合成</div>`;
      html += `<div class="cm-sep"></div>`;
    }
    html += `<div class="cm-item${state.clipboard ? '' : ' disabled'}" data-action="paste">粘贴</div>`;
    html += `<div class="cm-sep"></div>`;
    html += `<div class="cm-item" data-action="import-video">导入视频</div>`;
    html += `<div class="cm-item" data-action="import-audio">导入音频</div>`;
    html += `<div class="cm-item" data-action="import-image">导入图片</div>`;
    html += `<div class="cm-sep"></div>`;
    html += `<div class="cm-item" data-action="auto-arrange">排列全部</div>`;
  }

  ctxMenu.innerHTML = html;
  ctxMenu._hit = hit;

  // Position menu
  ctxMenu.style.display = 'block';
  ctxMenu.style.left = clientX + 'px';
  ctxMenu.style.top = clientY + 'px';

  // Clamp to viewport
  const menuRect = ctxMenu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    ctxMenu.style.left = (clientX - menuRect.width) + 'px';
  }
  if (menuRect.bottom > window.innerHeight) {
    ctxMenu.style.top = (clientY - menuRect.height) + 'px';
  }
}

function hideContextMenu() {
  ctxMenu.style.display = 'none';
  ctxMenu._hit = null;
}

function cloneCardData(card) {
  const base = {
    id: card.id,
    type: card.type,
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    label: card.label || '',
    transformScale: card.transformScale || 1.0,
    transformX: card.transformX || 0,
    transformY: card.transformY || 0,
  };
  if (card.type === 'video' || card.type === 'audio' || card.type === 'bgm') {
    Object.assign(base, {
      file: card.file,
      fileURL: card.fileURL,
      trimIn: card.trimIn,
      trimOut: card.trimOut,
      volume: card.volume || 1,
      thumbStrip: card.thumbStrip,
      waveform: card.waveform,
      duration: card.duration,
      createdAt: card.createdAt,
      fadeIn: card.fadeIn || 0,
      fadeOut: card.fadeOut || 0,
      markers: (card.markers || []).map(m => ({ ...m })),
      isFreezeFrame: card.isFreezeFrame || false,
      frameImage: card.frameImage || null,
      frameImageDataURL: card.frameImageDataURL || '',
    });
  }
  if (card.type === 'image') {
    Object.assign(base, {
      file: card.file,
      fileURL: card.fileURL,
      trimIn: card.trimIn,
      trimOut: card.trimOut,
      volume: card.volume || 1,
      thumbStrip: card.thumbStrip,
      waveform: card.waveform,
      duration: card.duration,
      createdAt: card.createdAt,
      fadeIn: card.fadeIn || 0,
      fadeOut: card.fadeOut || 0,
      markers: (card.markers || []).map(m => ({ ...m })),
      isFreezeFrame: card.isFreezeFrame || false,
      frameImage: card.frameImage || null,
      frameImageDataURL: card.frameImageDataURL || '',
      _imageDataURL: card._imageDataURL || null,
      _imgWidth: card._imgWidth || 0,
      _imgHeight: card._imgHeight || 0,
    });
  }
  if (card.type === 'text') {
    Object.assign(base, {
      text: card.text || '输入文字',
      fontSize: card.fontSize || 24,
      fontFamily: card.fontFamily || 'Inter',
      fontWeight: card.fontWeight || 'Bold',
      color: card.color || '#000000',
      textAlign: card.textAlign || 'left',
      markers: (card.markers || []).map(m => ({ ...m }))
    });
  }
  if (card.type === 'synthesized-video' || card.type === 'composition') {
    Object.assign(base, {
      file: card.file,
      fileURL: card.fileURL,
      trimIn: card.trimIn,
      trimOut: card.trimOut,
      volume: card.volume || 1,
      duration: card.duration,
      createdAt: card.createdAt,
      fadeIn: card.fadeIn || 0,
      fadeOut: card.fadeOut || 0,
      markers: (card.markers || []).map(m => ({ ...m })),
      editBoxChain: card.editBoxChain ? [...card.editBoxChain] : undefined,
      _synthesizedDataURL: card._synthesizedDataURL || null,
      _synthesized: card._synthesized || false,
      totalDuration: card.totalDuration
    });
  }
  return base;
}

function handleContextAction(action, hit) {
  switch (action) {
    case 'copy': {
      if (hit.groupId) {
        const group = state.groups.find(g => g.id === hit.groupId);
        if (!group) break;
        const groupCards = group.cardIds.map(cid => state.cards.find(c => c.id === cid)).filter(Boolean);
        const cardDataList = groupCards.map(c => cloneCardData(c));
        // Copy internal connections (both ends are cards in this group)
        const cardIdSet = new Set(group.cardIds);
        const internalConns = state.connections
          .filter(c => c.fromCardId && c.toCardId && cardIdSet.has(c.fromCardId) && cardIdSet.has(c.toCardId))
          .map(c => ({ ...c }));
        state.clipboard = {
          type: 'group',
          groupData: {
            name: group.name,
            cardIds: group.cardIds,
            sizingMode: group.sizingMode,
            collapsed: group.collapsed,
            x: group.x, y: group.y,
            width: group.width, height: group.height
          },
          cardDataList,
          connections: internalConns
        };
      } else {
        const card = state.cards.find(c => c.id === hit.cardId);
        if (!card) break;
        state.clipboard = { type: 'card', cardData: cloneCardData(card) };
      }
      break;
    }
    case 'paste': {
      pushUndo();
      if (!state.clipboard) break;
      if (state.clipboard.type === 'group') {
        const { groupData, cardDataList, connections } = state.clipboard;
        // Build oldId -> newId map
        const idMap = {};
        const newCards = cardDataList.map(src => {
          const newCard = cloneCardData(src);
          const newId = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          idMap[src.id] = newId;
          newCard.id = newId;
          return newCard;
        });
        // Compute offset from group stored position or card bounding box
        const baseX = cardDataList.length > 0
          ? Math.min(...cardDataList.map(c => c.x))
          : (groupData.x || 0);
        const baseY = cardDataList.length > 0
          ? Math.min(...cardDataList.map(c => c.y))
          : (groupData.y || 0);
        const dx = (baseX + 40) - baseX;
        const dy = (baseY + 40) - baseY;
        newCards.forEach(c => { c.x += dx; c.y += dy; });
        state.cards.push(...newCards);
        // Create new group
        const newGroupId = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.groups.push({
          id: newGroupId,
          name: groupData.name + ' (copy)',
          cardIds: groupData.cardIds.map(oldId => idMap[oldId]).filter(Boolean),
          collapsed: groupData.collapsed,
          sizingMode: groupData.sizingMode,
          x: (groupData.x || baseX) + dx,
          y: (groupData.y || baseY) + dy,
          width: groupData.width,
          height: groupData.height
        });
        // Copy internal connections with remapped IDs
        const newConns = connections.map(c => ({
          ...c,
          id: 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          fromCardId: idMap[c.fromCardId],
          toCardId: idMap[c.toCardId]
        })).filter(c => c.fromCardId && c.toCardId);
        state.connections.push(...newConns);
        render();
      } else if (state.clipboard.type === 'card') {
        const src = state.clipboard.cardData;
        const newCard = cloneCardData(src);
        newCard.id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        newCard.x = (src.x || 0) + 40;
        newCard.y = (src.y || 0) + 40;
        state.cards.push(newCard);
        render();
      }
      break;
    }
    case 'rename': {
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card) break;
      const newName = prompt('重命名', card.label);
      if (newName && newName.trim()) {
        card.label = newName.trim();
        render();
      }
      break;
    }
    case 'edit-text': {
      startTextCardEdit(hit.cardId);
      break;
    }
    case 'cut-at-playhead': {
      pushUndo();
      const pb = state.playback;
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card || pb.pausedAt <= 0) break;
      // Compute pausedCardTime based on playback mode
      let pausedCardTime;
      if (pb.playbackMode === 'group' && pb._groupPlayheadX != null) {
        const cw2 = getCardWidth(card);
        if (pb._groupPlayheadX < card.x || pb._groupPlayheadX > card.x + cw2) break;
        pausedCardTime = card.trimIn + (pb._groupPlayheadX - card.x) / PIXELS_PER_SECOND;
      } else {
        if (pb.currentCardId !== card.id) break;
        pausedCardTime = pb.pausedCardTime;
      }
      if (pausedCardTime <= card.trimIn || pausedCardTime >= card.trimOut) break;

      const origTrimOut = card.trimOut;
      card.trimOut = pausedCardTime;

      const newCard = {
        id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        type: card.type,
        file: card.file,
        fileURL: card.fileURL,
        x: card.x + getCardWidth(card) + 40,
        y: card.y,
        width: 0,
        height: CARD_HEIGHT,
        trimIn: pausedCardTime,
        trimOut: origTrimOut,
        volume: card.volume,
        thumbStrip: card.thumbStrip,
        waveform: card.waveform,
        duration: card.duration,
        label: card.label + '_2',
        createdAt: Date.now(),
        transformScale: 1.0,
        transformX: 0,
        transformY: 0
      };
      state.cards.push(newCard);
      // If original card is in a group, add the new card right after it
      const parentGroup2 = state.groups.find(g => g.cardIds.includes(card.id));
      if (parentGroup2) {
        parentGroup2.cardIds.splice(parentGroup2.cardIds.indexOf(card.id) + 1, 0, newCard.id);
      }
      render();
      break;
    }
    case 'replace-content':
    case 'reset-trim': {
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card) break;
      if (action === 'replace-content') {
        replaceCardContent(card);
      } else {
        pushUndo();
        card.trimIn = 0;
        card.trimOut = card.duration;
      }
      render();
      break;
    }
    case 'delete-card': {
      pushUndo();
      const idx = state.cards.findIndex(c => c.id === hit.cardId);
      if (idx < 0) break;
      state.cards.splice(idx, 1);
      state.connections = state.connections.filter(
        c => c.fromCardId !== hit.cardId && c.toCardId !== hit.cardId
      );
      // Remove from groups
      for (const g of state.groups) {
        g.cardIds = g.cardIds.filter(cid => cid !== hit.cardId);
      }
      // Delete empty groups
      state.groups = state.groups.filter(g => g.cardIds.length > 0);
      state.selection.cardIds = state.selection.cardIds.filter(id => id !== hit.cardId);
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.hoveredCardId = null;
      state.hoveredConnectionId = null;
      render();
      break;
    }
    case 'delete-conn': {
      pushUndo();
      const idx = state.connections.findIndex(c => c.id === hit.connectionId);
      if (idx < 0) break;
      state.connections.splice(idx, 1);
      if (state.selection.connectionId === hit.connectionId) {
        state.selection.connectionId = null;
      state.selection.connectionIds = [];
      }
      state.hoveredConnectionId = null;
      render();
      break;
    }
    case 'cycle-transition': {
      pushUndo();
      const conn = state.connections.find(c => c.id === hit.connectionId);
      if (!conn) break;
      const idx = TRANSITION_CYCLE.indexOf(conn.transition);
      conn.transition = TRANSITION_CYCLE[(idx + 1) % TRANSITION_CYCLE.length];
      render();
      break;
    }
    case 'import-video': {
      document.getElementById('btn-import-video').click();
      break;
    }
    case 'import-audio': {
      document.getElementById('btn-import-video').click();
      break;
    }
    case 'import-image': {
      const imgInput = document.createElement('input');
      imgInput.type = 'file';
      imgInput.accept = 'image/*';
      imgInput.multiple = true;
      imgInput.addEventListener('change', () => {
        if (imgInput.files.length > 0) importFiles(imgInput.files);
      });
      imgInput.click();
      break;
    }
    case 'convert-to-still-video': {
      const imgCard = state.cards.find(c => c.id === hit.cardId);
      if (!imgCard || imgCard.type !== 'image') break;
      pushUndo();
      convertImageToStillVideo(imgCard);
      break;
    }
    case 'create-group': {
      const selIds = [...state.selection.cardIds];
      if (selIds.length >= 2) {
        pushUndo();
        const id = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.groups.push({
          id,
          name: 'Group ' + (state.groups.length + 1),
          cardIds: selIds,
          collapsed: false,
          sizingMode: 'fit',
          x: 0, y: 0, width: 200, height: 60
        });
        render();
      }
      break;
    }
    case 'toggle-collapse': {
      const parentGroup = state.groups.find(g => g.cardIds.some(cid => state.selection.cardIds.includes(cid)));
      if (parentGroup) {
        pushUndo();
        parentGroup.collapsed = !parentGroup.collapsed;
        render();
      }
      break;
    }
    case 'ungroup': {
      // Find groups to remove: via hit.groupId (right-click on group) or via selected cards
      const toRemove = [];
      if (hit.groupId && state.groups.some(g => g.id === hit.groupId)) {
        toRemove.push(hit.groupId);
      } else {
        const selIds = state.selection.cardIds;
        for (const g of state.groups) {
          if (g.cardIds.some(cid => selIds.includes(cid))) {
            toRemove.push(g.id);
          }
        }
      }
      if (toRemove.length > 0) {
        pushUndo();
        state.groups = state.groups.filter(g => !toRemove.includes(g.id));
        state.selection.groupIds = state.selection.groupIds.filter(id => !toRemove.includes(id));
        render();
      }
      break;
    }
    case 'auto-arrange': {
      autoArrange();
      navigateToCards();
      render();
      break;
    }
    // ---- Edit box & composition card actions ----
    case 'create-editbox': {
      pushUndo();
      // Collect all selected shapes (Fabric + line shapes)
      const shapesToClone = [];
      // Fabric shapes
      if (fabricCanvas) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && activeObj._shapeId) {
          const shapeObj = fabricCanvas.getObjects().find(o => o._shapeId === activeObj._shapeId);
          if (shapeObj) {
            const sdata = _serializeShape(shapeObj);
            if (sdata) shapesToClone.push(sdata);
          }
        } else {
          const selected = fabricCanvas.getActiveObjects ? fabricCanvas.getActiveObjects() : [];
          for (const obj of (selected.length ? selected : (activeObj ? [activeObj] : []))) {
            if (obj._shapeId) {
              const sdata = _serializeShape(obj);
              if (sdata) shapesToClone.push(sdata);
            }
          }
        }
      }
      // Line shapes (pure 2D)
      if (state.selection.shapeId) {
        const ls = state.shapes.find(s => s.id === state.selection.shapeId);
        if (ls) shapesToClone.push(JSON.parse(JSON.stringify(ls)));
      }
      if (shapesToClone.length === 0) break;
      // Compute shape bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const s of shapesToClone) {
        const b = getShapeBounds(s);
        if (b) {
          if (b.x < minX) minX = b.x;
          if (b.y < minY) minY = b.y;
          if (b.x + b.w > maxX) maxX = b.x + b.w;
          if (b.y + b.h > maxY) maxY = b.y + b.h;
        }
      }
      const shapeW = maxX - minX;
      const shapeH = maxY - minY;
      const shapeCX = (minX + maxX) / 2;
      const shapeCY = (minY + maxY) / 2;

      // Edit box matched to card row height, 16:9 ratio
      const ebH = CARD_HEIGHT;
      const ebW = CARD_HEIGHT * 16 / 9;
      // Place edit box to the right of the original shapes
      const ebX = maxX + 30;
      const ebY = minY + (shapeH - ebH) / 2;

      // Scale shapes to fit inside edit box (with padding)
      const pad = 8;
      const scale = Math.min((ebW - pad * 2) / shapeW, (ebH - pad * 2) / shapeH, 1);
      const ebCX = ebX + ebW / 2;
      const ebCY = ebY + ebH / 2;

      const ebId = 'ebox_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // Transform shapes: scale around shape center, then translate to edit box center
      for (const s of shapesToClone) {
        if (s.shapeType === 'line') {
          s.x1 = (s.x1 - shapeCX) * scale + ebCX;
          s.y1 = (s.y1 - shapeCY) * scale + ebCY;
          s.x2 = (s.x2 - shapeCX) * scale + ebCX;
          s.y2 = (s.y2 - shapeCY) * scale + ebCY;
          if (s.strokeWidth) s.strokeWidth *= scale;
        } else {
          s.left = (s.left - shapeCX) * scale + ebCX;
          s.top = (s.top - shapeCY) * scale + ebCY;
          if (s.width) s.width *= scale;
          if (s.height) s.height *= scale;
          if (s.fontSize) s.fontSize *= scale;
          if (s.strokeWidth) s.strokeWidth *= scale;
        }
      }
      // Then offset to be relative to edit box origin
      for (const s of shapesToClone) {
        _offsetShape(s, -ebX, -ebY);
      }

      const eb = {
        id: ebId,
        x: ebX, y: ebY,
        width: ebW, height: ebH,
        shapes: shapesToClone,
        camera: { zoom: 1, offsetX: 0, offsetY: 0 }
      };
      state.editBoxes.push(eb);
      state.selection.editBoxId = ebId;
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      state.selection.shapeId = null;
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      // Deselect Fabric objects after creating edit box
      if (fabricCanvas) {
        fabricCanvas.discardActiveObject();
        fabricCanvas.requestRenderAll();
      }
      // Zoom view to fit the edit box fullscreen
      const canvasEl = document.getElementById('main-canvas');
      if (canvasEl) {
        const fitZoom = Math.min(canvasEl.clientWidth / ebW, canvasEl.clientHeight / ebH);
        state.canvas.zoom = fitZoom;
        state.canvas.offsetX = -(ebX + ebW / 2) * fitZoom + canvasEl.clientWidth / 2;
        state.canvas.offsetY = -(ebY + ebH / 2) * fitZoom + canvasEl.clientHeight / 2;
      }
      render();
      break;
    }
    case 'duplicate-editbox': {
      // Save if currently active
      if (state.interaction.activeEditBoxId === hit.editBoxId) {
        const actEB = findEditBoxById(hit.editBoxId);
        if (actEB) _exitEditBoxOnFabric(actEB);
        state.interaction.activeEditBoxId = null;
      }
      const eb = findEditBoxById(hit.editBoxId);
      if (!eb) break;
      pushUndo();
      const offsetW = eb.width * 0.05;
      const offsetH = eb.height * 0.05;
      const newEb = {
        id: 'ebox_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        x: eb.x + offsetW, y: eb.y + offsetH,
        width: eb.width, height: eb.height,
        shapes: JSON.parse(JSON.stringify(eb.shapes || [])),
        _shapesWorldCoords: !!eb._shapesWorldCoords,
        camera: { zoom: eb.camera.zoom, offsetX: eb.camera.offsetX, offsetY: eb.camera.offsetY }
      };
      state.editBoxes.push(newEb);
      state.selection.editBoxId = newEb.id;
      // Auto-focus on the duplicated edit box
      const view = state.canvas;
      const canvasEl = document.getElementById('main-canvas');
      if (canvasEl) {
        const pad = 8;
        const availW = canvasEl.clientWidth - pad * 2;
        const availH = canvasEl.clientHeight - pad * 2;
        const fitZoom = Math.min(availW / newEb.width, availH / newEb.height);
        view.zoom = Math.min(1, fitZoom);
        view.offsetX = -(newEb.x + newEb.width / 2) * view.zoom + canvasEl.clientWidth / 2;
        view.offsetY = -(newEb.y + newEb.height / 2) * view.zoom + canvasEl.clientHeight / 2;
      }
      render();
      break;
    }
    case 'create-comp-from-eb': {
      if (!hit.editBoxId) break;
      createCompositionCard(hit.editBoxId);
      break;
    }
    case 'insert-eb-keyframe': {
      // Insert a new edit box at the midpoint of an eb-keyframe connection
      const conn = state.connections.find(c => c.id === hit.connectionId);
      if (!conn || conn.type !== 'eb-keyframe') break;
      const fromEb = findEditBoxById(conn.fromEditBoxId);
      const toEb = findEditBoxById(conn.toEditBoxId);
      if (!fromEb || !toEb) break;
      pushUndo();
      const midX = (fromEb.x + toEb.x) / 2;
      const newEbId = 'ebox_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const interpShapes = interpolateShapes(fromEb.shapes || [], toEb.shapes || [], 0.5, 'linear');
      const newEb = {
        id: newEbId,
        x: midX,
        y: fromEb.y,
        width: fromEb.width,
        height: fromEb.height,
        shapes: interpShapes,
        _shapesWorldCoords: !!(fromEb._shapesWorldCoords || toEb._shapesWorldCoords),
        camera: { zoom: fromEb.camera ? fromEb.camera.zoom : 1, offsetX: 0, offsetY: 0 }
      };
      state.editBoxes.push(newEb);
      // Delete old connection, create two new ones
      state.connections = state.connections.filter(c => c.id !== conn.id);
      const connId1 = 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const connId2 = 'conn_' + (Date.now() + 1) + '_' + Math.random().toString(36).slice(2, 6);
      state.connections.push({
        id: connId1, type: 'eb-keyframe', fromEditBoxId: conn.fromEditBoxId, toEditBoxId: newEbId
      });
      state.connections.push({
        id: connId2, type: 'eb-keyframe', fromEditBoxId: newEbId, toEditBoxId: conn.toEditBoxId
      });
      state.selection.editBoxId = newEbId;
      state.selection.editBoxIds = [newEbId];
      state.selection.cardIds = [];
      state.selection.groupIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      render();
      break;
    }
    case 'synthesize-eb-video': {
      // Create a synthesized-video card from an eb-keyframe chain
      let startEditBoxId = null;
      if (hit.editBoxId) {
        startEditBoxId = hit.editBoxId;
      } else if (hit.connectionId) {
        const conn = state.connections.find(c => c.id === hit.connectionId);
        if (conn && conn.type === 'eb-keyframe') {
          startEditBoxId = conn.fromEditBoxId;
        }
      }
      if (!startEditBoxId) break;
      const chain = buildEditBoxChain(startEditBoxId);
      if (chain.length < 2) {
        alert('合成视频需要至少 2 个编辑盒，请先创建关键帧连线再插入更多关键帧。');
        break;
      }
      pushUndo();
      const totalDuration = getEditBoxChainDuration(chain);
      const cardId = 'synthvid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const synthCard = {
        id: cardId,
        type: 'synthesized-video',
        editBoxChain: chain,
        x: 0,
        y: 0,
        width: totalDuration * PIXELS_PER_SECOND,
        duration: totalDuration,
        totalDuration: totalDuration,
        trimIn: 0,
        trimOut: totalDuration,
        thumbStrip: null,
        label: '合成动画',
        layer: state.cards.length,
        volume: 1.0,
        fadeIn: 0,
        fadeOut: 0,
        transformScale: 1.0,
        transformX: 0,
        transformY: 0,
        markers: [],
        fps: 30
      };
      // Auto-arrange position: place at the bottom after existing cards
      let maxY = 0;
      for (const c of state.cards) {
        const bottom = c.y + CARD_HEIGHT + 10;
        if (bottom > maxY) maxY = bottom;
      }
      synthCard.y = maxY;
      // Center horizontally relative to the edit boxes
      const firstEb = findEditBoxById(chain[0]);
      if (firstEb) synthCard.x = firstEb.x;
      state.cards.push(synthCard);
      state.selection.cardIds = [cardId];
      state.selection.editBoxId = null;
      state.selection.editBoxIds = [];
      state.selection.groupIds = [];
      state.selection.connectionId = null;
      state.selection.connectionIds = [];
      state.selection.markerCardIds = [];
      // Exit edit-box editing mode if active, so subsequent
      // renders (including video imports) don't draw at 0.25 opacity.
      try {
        if (state.interaction.activeEditBoxId) {
          const activeEb = findEditBoxById(state.interaction.activeEditBoxId);
          if (activeEb) _exitEditBoxOnFabric(activeEb);
        }
      } finally {
        state.interaction.activeEditBoxId = null;
        _fcSyncContainerState();
      }
      navigateToCards();
      render();

      // Generate thumbnail strip asynchronously (same pattern as video import)
      generateSynthThumbnails(synthCard).then(strip => {
        if (strip) {
          synthCard.thumbStrip = strip;
          render();
        }
      });
      break;
    }
    case 'delete-editbox': {
      const eb = findEditBoxById(hit.editBoxId);
      if (!eb) break;
      const linkedCards = findCompositionCardsByEditBoxId(eb.id);
      if (linkedCards.length > 0) {
        if (!confirm(`该编辑盒有 ${linkedCards.length} 张合成卡片，删除编辑盒将同时删除所有关联的合成卡片。确定删除？`)) break;
      }
      pushUndo();
      // Cascade delete linked composition cards
      state.compositionCards = state.compositionCards.filter(cc => cc.editBoxId !== eb.id);
      state.cards = state.cards.filter(c => !(c.type === 'composition' && c.editBoxId === eb.id));
      // Cascade delete eb-keyframe connections linked to this edit box
      state.connections = state.connections.filter(c => !(c.type === 'eb-keyframe' && (c.fromEditBoxId === eb.id || c.toEditBoxId === eb.id)));
      // Mark synthesized-video cards that reference this edit box as invalid
      for (const card of state.cards) {
        if (card.type === 'synthesized-video' && card.editBoxChain && card.editBoxChain.includes(eb.id)) {
          card._invalid = true;
        }
      }
      state.editBoxes = state.editBoxes.filter(b => b.id !== eb.id);
      if (state.selection.editBoxId === eb.id) state.selection.editBoxId = null;
      if (state.interaction.activeEditBoxId === eb.id) {
        if (eb) _clearEditBoxFabricObjects();
        // Restore global shapes
        if (fabricCanvas) {
          fabricCanvas.getObjects().forEach(o => {
            if (o._preEditSelectable !== undefined) {
              o.set({ selectable: o._preEditSelectable, evented: o._preEditEvented, opacity: 1 });
              delete o._preEditSelectable;
              delete o._preEditEvented;
            }
          });
        }
        state.interaction.activeEditBoxId = null;
      }
      _fcSyncContainerState();
      render();
      break;
    }
    case 'delete-comp-card': {
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card || card.type !== 'composition') break;
      pushUndo();
      state.cards = state.cards.filter(c => c.id !== card.id);
      state.compositionCards = state.compositionCards.filter(cc => cc.id !== card.id);
      state.selection.cardIds = state.selection.cardIds.filter(id => id !== card.id);
      render();
      break;
    }
    case 'locate-editbox': {
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card || card.type !== 'composition') break;
      const eb = findEditBoxById(card.editBoxId);
      if (!eb) break;
      // Auto-fit canvas to center on the edit box
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
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      render();
      break;
    }
    case 'locate-eb-chain': {
      const card = state.cards.find(c => c.id === hit.cardId);
      if (!card || card.type !== 'synthesized-video') break;
      const chain = card.editBoxChain || [];
      if (chain.length === 0) break;
      const firstEb = findEditBoxById(chain[0]);
      if (!firstEb) break;
      // Auto-fit canvas to center on the first edit box in the chain
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
      state.selection.groupIds = [];
      state.selection.editBoxIds = [];
      render();
      break;
    }
  }
}

// Context menu event: right-click on canvas
canvasWrap.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const hit = hitTest(sx, sy);

  // Right-click on connection (badge or delete) — select it
  if (hit.type === 'connection-badge' || hit.type === 'connection-delete') {
    state.selection.connectionId = hit.connectionId;
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.hoveredConnectionId = hit.connectionId;
    render();
  }

  // Right-click on any card hit — select that card if not already
  if (hit.cardId && !state.selection.cardIds.includes(hit.cardId)) {
    state.selection.cardIds = [hit.cardId];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    render();
  }

  // Right-click on edit box — select it
  if (hit.editBoxId && state.selection.editBoxId !== hit.editBoxId) {
    state.selection.editBoxId = hit.editBoxId;
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    render();
  }

  // Right-click on group — select it if not already
  if (hit.groupId && !state.selection.groupIds.includes(hit.groupId)) {
    state.selection.groupIds = [hit.groupId];
    state.selection.cardIds = [];
    state.selection.connectionId = null;
    render();
  }

  showContextMenu(e.clientX, e.clientY, hit);
});

// Double-click on edit box — enter immersive mode
// dblclick on edit box now handled in mousedown via timestamp detection
// (avoids Fabric canvas layer intercepting native dblclick event)

// Prevent browser context menu on side panels
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#left-panel') || e.target.closest('#right-panel')) {
    e.preventDefault();
  }
});

// Delegate context menu clicks
ctxMenu.addEventListener('click', (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  const hit = ctxMenu._hit;
  handleContextAction(action, hit);
  hideContextMenu();
});

// Dismiss menu: click outside
document.addEventListener('click', (e) => {
  if (ctxMenu.style.display === 'block' && !ctxMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// ================================================================
// Input: Keyboard
// ================================================================
window.addEventListener('keydown', (e) => {
  // Space: play/pause toggle or enter pan mode
  if (e.code === 'Space') {
    // If playing, pause immediately
    if (state.playback.isPlaying) {
      e.preventDefault();
      togglePlayback();
      state.interaction._spacePaused = true; // flag: prevent keyup from re-toggling
      return;
    }
    // If paused (has state to resume), handle on keyup
    if (state.playback.pausedAt > 0 && (state.playback.sequence.length > 0 || state.playback.playbackMode === 'eb-chain')) {
      // Don't enter space-held mode — will resume on keyup
      e.preventDefault();
      state.interaction._spaceResume = true; // flag: resume on keyup
      return;
    }
    // Otherwise enter potential-pan mode
    if (state.interaction.mode === 'idle') {
      e.preventDefault();
      state.interaction.spaceDown = true;
      canvasWrap.classList.add('space-held');
      _setCanvasCursor('grab');
    }
  }

  // JKL: playback control (J=back, K=pause, L=forward)
  if (state.playback.sequence.length > 0 && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if (e.code === 'KeyJ') {
        e.preventDefault();
        // Skip back 2s
        const cur = state.playback.isPlaying
          ? (state.playback.pausedAt + (performance.now() - state.playback.startTime) / 1000)
          : state.playback.pausedAt;
        const target = Math.max(0, cur > 0 ? cur - 2 : 0);
        if (state.playback.isPlaying) togglePlayback();
        seekToTime(target);
        return;
      }
      if (e.code === 'KeyK') {
        e.preventDefault();
        if (state.playback.isPlaying) togglePlayback();
        return;
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        // Skip forward 2s
        const cur = state.playback.isPlaying
          ? (state.playback.pausedAt + (performance.now() - state.playback.startTime) / 1000)
          : state.playback.pausedAt;
        const target = Math.min(cur > 0 ? cur + 2 : 2, state.playback.totalDuration);
        if (state.playback.isPlaying) togglePlayback();
        seekToTime(target);
        return;
      }
    }
  }

  // Ctrl/Cmd+Z: undo, Ctrl/Cmd+Shift+Z: redo
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); undo(); return; }
  }
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && e.shiftKey && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); redo(); return; }
  }

  // Enter: create composition card from selected edit box
  if (e.code === 'Enter' && state.interaction.mode === 'idle' && state.selection.editBoxId) {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      // Save fabric state if edit box is active
      if (state.interaction.activeEditBoxId) {
        const eb = findEditBoxById(state.interaction.activeEditBoxId);
        if (eb) _exitEditBoxOnFabric(eb);
        state.interaction.activeEditBoxId = null;
      }
      createCompositionCard(state.selection.editBoxId);
      return;
    }
  }

  // '0': reset zoom (skip when user is typing in an input)
  if (e.code === 'Digit0' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      state.canvas.zoom = 1.0;
      state.canvas.offsetX = 0;
      state.canvas.offsetY = 0;
      render();
    }
  }

  // Drawing tool shortcuts (idle mode)
  if (state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if (e.code === 'KeyV') { e.preventDefault(); setDrawingTool('select'); return; }
      if (e.code === 'KeyT') { e.preventDefault(); setDrawingTool('text'); return; }
      if (e.code === 'KeyR') { e.preventDefault(); setDrawingTool('rect'); return; }
      if (e.code === 'KeyE') { e.preventDefault(); setDrawingTool('ellipse'); return; }
      if (e.code === 'KeyL' && !state.playback.sequence.length) { e.preventDefault(); setDrawingTool('line'); return; }
      if (e.code === 'KeyP' && !state.playback.sequence.length) { e.preventDefault(); setDrawingTool('path'); return; }
      if (e.code === 'KeyG') { e.preventDefault(); setDrawingTool('empty-group'); return; }
    }
  }

  // Arrow keys: frame stepping when paused
  if (state.playback.pausedAt > 0 && state.playback.sequence.length > 0 && !state.playback.isPlaying && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const frameStep = 1 / 30; // assume 30fps
        seekToTime(Math.max(0, state.playback.pausedAt - frameStep));
        return;
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        const frameStep = 1 / 30;
        seekToTime(Math.min(state.playback.totalDuration, state.playback.pausedAt + frameStep));
        return;
      }
    }
  }

  // Delete / Backspace: delete selected cards or connections
  if ((e.code === 'Delete' || e.code === 'Backspace') && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      pushUndo();
      let deleted = false;

      // 1. Delete Fabric shapes (ActiveSelection, single object, or shapeIds from state)
      if (fabricCanvas) {
        let objsToDelete = [];
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
          objsToDelete = activeObj._objects ? activeObj._objects.slice() : [activeObj];
          fabricCanvas.discardActiveObject();
        } else if (state.selection.shapeIds.length > 0) {
          // Mixed selection: shapes tracked in state, not in Fabric ActiveSelection
          fabricCanvas.getObjects().forEach(function(obj) {
            if (obj._shapeId && state.selection.shapeIds.indexOf(obj._shapeId) >= 0 && !obj._isEditBoxShape) {
              objsToDelete.push(obj);
            }
          });
        }
        for (const obj of objsToDelete) {
          if (obj._isEditBoxShape && obj._editBoxId) {
            const eb = findEditBoxById(obj._editBoxId);
            if (eb) eb.shapes = (eb.shapes || []).filter(s => s.id !== obj._shapeId);
          } else if (obj._shapeId) {
            state.shapes = state.shapes.filter(s => s.id !== obj._shapeId);
          }
          fabricCanvas.remove(obj);
        }
        if (objsToDelete.length > 0) deleted = true;
        state.selection.shapeIds = [];
      }

      // 2. Delete line shapes (pure 2D canvas)
      if (state.selection.shapeId) {
        state.shapes = state.shapes.filter(s => s.id !== state.selection.shapeId);
        state.selection.shapeId = null;
        deleted = true;
      }

      // 3. Delete connections
      if (state.selection.connectionIds.length > 0) {
        for (const cid of state.selection.connectionIds) {
          const idx = state.connections.findIndex(c => c.id === cid);
          if (idx >= 0) state.connections.splice(idx, 1);
        }
        state.selection.connectionId = null;
        state.selection.connectionIds = [];
        state.hoveredConnectionId = null;
        deleted = true;
      }

      // 4. Delete edit boxes
      const ebIdsToDelete = state.selection.editBoxIds.length > 0
        ? [...state.selection.editBoxIds]
        : (state.selection.editBoxId ? [state.selection.editBoxId] : []);
      if (ebIdsToDelete.length > 0) {
        const allLinked = [];
        for (const ebid of ebIdsToDelete) {
          allLinked.push(...findCompositionCardsByEditBoxId(ebid));
        }
        if (allLinked.length > 0) {
          if (!confirm(`所选编辑盒有 ${allLinked.length} 张合成卡片，删除编辑盒将同时删除所有关联的合成卡片。确定删除？`)) return;
        }
        for (const ebid of ebIdsToDelete) {
          state.compositionCards = state.compositionCards.filter(cc => cc.editBoxId !== ebid);
          state.cards = state.cards.filter(c => !(c.type === 'composition' && c.editBoxId === ebid));
          state.editBoxes = state.editBoxes.filter(eb => eb.id !== ebid);
          if (state.interaction.activeEditBoxId === ebid) {
            _clearEditBoxFabricObjects();
            if (fabricCanvas) {
              fabricCanvas.getObjects().forEach(o => {
                if (o._preEditSelectable !== undefined) {
                  o.set({ selectable: o._preEditSelectable, evented: o._preEditEvented, opacity: 1 });
                  delete o._preEditSelectable;
                  delete o._preEditEvented;
                }
              });
            }
            state.interaction.activeEditBoxId = null;
            _fcSyncContainerState();
          }
        }
        state.selection.editBoxId = null;
        state.selection.editBoxIds = [];
        deleted = true;
      }

      // 5. Delete groups
      if (state.selection.groupIds.length > 0) {
        for (const gid of state.selection.groupIds) {
          const group = state.groups.find(g => g.id === gid);
          if (!group) continue;
          for (const cid of group.cardIds) {
            const idx = state.cards.findIndex(c => c.id === cid);
            if (idx >= 0) state.cards.splice(idx, 1);
            state.connections = state.connections.filter(
              c => c.fromCardId !== cid && c.toCardId !== cid
            );
          }
          state.groups = state.groups.filter(g => g.id !== gid);
        }
        state.selection.groupIds = [];
        state.selection.cardIds = [];
        deleted = true;
      }

      // 6. Delete cards
      if (state.selection.cardIds.length > 0) {
        const deletedCardIds = [...state.selection.cardIds];
        for (const cid of deletedCardIds) {
          const idx = state.cards.findIndex(c => c.id === cid);
          if (idx >= 0) state.cards.splice(idx, 1);
        }
        state.connections = state.connections.filter(
          c => !deletedCardIds.includes(c.fromCardId) && !deletedCardIds.includes(c.toCardId)
        );
        // Clean up marker cards associated with deleted cards
        state.markerCards = state.markerCards.filter(m => !deletedCardIds.includes(m.parentCardId));
        // Clean up connections that reference deleted marker cards
        const deletedMarkerIds = state.markerCards
          .filter(m => deletedCardIds.includes(m.parentCardId))
          .map(m => m.id);
        state.connections = state.connections.filter(
          c => !deletedMarkerIds.includes(c.fromCardId) && !deletedMarkerIds.includes(c.toCardId)
        );
        state.compositionCards = state.compositionCards.filter(cc => !deletedCardIds.includes(cc.id));
        for (const g of state.groups) {
          g.cardIds = g.cardIds.filter(cid => !deletedCardIds.includes(cid));
        }
        state.groups = state.groups.filter(g => g.cardIds.length > 0);
        state.selection.cardIds = [];
        deleted = true;
      }

      // 7. Delete marker cards
      if (state.selection.markerCardIds.length > 0 || state.selection.markerCardId) {
        const idsToDelete = state.selection.markerCardIds.length > 0
          ? [...state.selection.markerCardIds]
          : [state.selection.markerCardId];
        state.markerCards = state.markerCards.filter(m => !idsToDelete.includes(m.id));
        // Clean up connections referencing deleted marker cards
        state.connections = state.connections.filter(
          c => !idsToDelete.includes(c.fromCardId) && !idsToDelete.includes(c.toCardId)
        );
        state.selection.markerCardId = null;
        state.selection.markerCardIds = [];
        deleted = true;
      }

      if (deleted) {
        state.hoveredCardId = null;
        state.hoveredConnectionId = null;
        if (fabricCanvas) fabricCanvas.requestRenderAll();
        updateInspector();
        render();
      }
    }
  }

  // Ctrl/Cmd + C: copy first selected card
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selId = state.selection.cardIds[0];
      if (selId) {
        const card = state.cards.find(c => c.id === selId);
        if (card) {
          e.preventDefault();
          state.clipboard = { type: 'card', cardData: cloneCardData(card) };
        }
      }
    }
  }

  // Ctrl/Cmd + V: paste from clipboard
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      if (state.clipboard && state.clipboard.type === 'card') {
        e.preventDefault();
        pushUndo();
        const src = state.clipboard.cardData;
        const newCard = cloneCardData(src);
        newCard.id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const mp = state.interaction.mouseWorldPos;
        newCard.x = mp && mp.x > -1000 ? mp.x : (src.x || 0) + 40;
        newCard.y = mp && mp.y > -1000 ? mp.y : (src.y || 0) + 40;
        state.cards.push(newCard);
        render();
      }
    }
  }

  // Ctrl/Cmd + G: create group from selected cards
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG' && !e.shiftKey && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selIds = state.selection.cardIds;
      if (selIds.length >= 2) {
        e.preventDefault();
        pushUndo();
        const id = 'group_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        state.groups.push({
          id,
          name: 'Group ' + (state.groups.length + 1),
          cardIds: [...selIds],
          collapsed: false,
          sizingMode: 'fit',
          x: 0, y: 0, width: 200, height: 60
        });
        render();
      }
    }
  }

  // Ctrl/Cmd + Shift + G: ungroup
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyG' && e.shiftKey && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selIds = state.selection.cardIds;
      // Find groups containing any selected card
      const groupsWithSelection = state.groups.filter(g => g.cardIds.some(cid => selIds.includes(cid)));
      if (groupsWithSelection.length > 0) {
        e.preventDefault();
        pushUndo();
        for (const g of groupsWithSelection) {
          const idx = state.groups.indexOf(g);
          if (idx >= 0) state.groups.splice(idx, 1);
        }
        render();
      }
    }
  }

  // Ctrl/Cmd + D: duplicate selected card at offset
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyD' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selId = state.selection.cardIds[0];
      if (selId) {
        const card = state.cards.find(c => c.id === selId);
        if (card) {
          e.preventDefault();
          pushUndo();
          const newCard = cloneCardData(card);
          newCard.id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          newCard.x = card.x + getCardWidth(card) + 40;
          newCard.y = card.y;
          newCard.label = card.label + '_2';
          newCard.createdAt = Date.now();
          state.cards.push(newCard);
          // If original card is in a group, add duplicate to the same group
          const pGroup = state.groups.find(g => g.cardIds.includes(card.id));
          if (pGroup) {
            pGroup.cardIds.splice(pGroup.cardIds.indexOf(card.id) + 1, 0, newCard.id);
          }
          state.selection.cardIds = [newCard.id];
          state.selection.groupIds = [];
      state.selection.editBoxIds = [];
          render();
        }
      }
    }
  }

  // Ctrl/Cmd + R: replace selected card content
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyR' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selId = state.selection.cardIds[0];
      if (selId) {
        const card = state.cards.find(c => c.id === selId);
        if (card && (card.type === 'video' || card.type === 'audio' || card.type === 'bgm')) {
          e.preventDefault();
          replaceCardContent(card);
        }
      }
    }
  }

  // M: add marker on selected card
  if (e.code === 'KeyM' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      const selId = state.selection.cardIds[0];
      if (selId) {
        const card = state.cards.find(c => c.id === selId);
        if (card && (card.type === 'video' || card.type === 'audio' || card.type === 'bgm')) {
          e.preventDefault();
          pushUndo();
          const pb = state.playback;
          const markerTime = (pb.pausedAt > 0 && pb.currentCardId === card.id)
            ? pb.pausedCardTime
            : card.trimIn;
          const colorIdx = (card.markers || []).length % 5;
          const COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#6C5CE7', '#FF8A5C'];
          card.markers = card.markers || [];
          card.markers.push({
            id: 'marker_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            time: markerTime,
            color: COLORS[colorIdx],
            label: 'Marker ' + (card.markers.length + 1)
          });
          render();
        }
      }
    }
  }

  // F: toggle presentation/fullscreen mode
  if (e.code === 'KeyF' && state.interaction.mode === 'idle') {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      document.getElementById('app').classList.toggle('presentation-mode');
    }
    return;
  }

  // Escape: immersive exit first (highest priority)
  if (e.code === 'Escape' && eboxImmersiveOverlay.classList.contains('immersive-active')) {
    e.preventDefault();
    exitEditBoxImmersive();
    return;
  }

  // Escape: fullscreen exit
  if (e.code === 'Escape' && fullscreenOverlay.classList.contains('fullscreen-active')) {
    e.preventDefault();
    exitFullscreen();
    render();
    return;
  }

  // Escape: exit drawing tool / stop playback / deselect / cancel connecting / dismiss menu
  if (e.code === 'Escape') {
    document.getElementById('app').classList.remove('presentation-mode');
    hideContextMenu();

    if (state.drawingTool !== 'select') {
      e.preventDefault();
      // Cancel drawing — clean up temporary Fabric objects
      if (state._drawing) {
        if (state._drawing.obj) {
          fabricCanvas.remove(state._drawing.obj);
          fabricCanvas.requestRenderAll();
        }
        state._drawing = null;
        state.interaction.mode = 'idle';
      }
      // Clean up path drawing
      if (state._pathDraw) {
        fabricCanvas.remove(state._pathDraw.obj);
        fabricCanvas.requestRenderAll();
        state._pathDraw = null;
        state.interaction.mode = 'idle';
      }
      setDrawingTool('select');
      render();
      return;
    }
    // Deactivate edit box if active
    if (state.interaction.activeEditBoxId) {
      e.preventDefault();
      const eb = findEditBoxById(state.interaction.activeEditBoxId);
      if (eb) {
        eb._selectedShapeIdx = null;
        _exitEditBoxOnFabric(eb);
      }
      state.interaction.activeEditBoxId = null;
      _fcSyncContainerState();
      render();
      return;
    }
    if (state.playback.isPlaying || state.playback.pausedAt > 0) {
      e.preventDefault();
      // If frame edit is active, cancel it first instead of stopping playback
      if (state.playback._frameEditActive) {
        cancelEbFrameEdit();
        return;
      }
      stopPlayback();
      return;
    }
    state.selection.cardIds = [];
    state.selection.groupIds = [];
    state.selection.connectionId = null;
    state.selection.connectionIds = [];
    state.selection.shapeId = null;
    if (state.interaction.mode === 'connecting') {
      state.interaction.mode = 'idle';
      state.interaction.connectingFrom = null;
      state.interaction._isTweenConnection = false;
      canvasWrap.classList.remove('connecting');
    }
    render();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    const wasSpaceDown = state.interaction.spaceDown;
    const spacePaused = state.interaction._spacePaused;
    const spaceResume = state.interaction._spaceResume;
    state.interaction.spaceDown = false;
    state.interaction._spacePaused = false;
    state.interaction._spaceResume = false;

    if (state.interaction.mode !== 'pan') {
      canvasWrap.classList.remove('space-held');
      _setCanvasCursor('default');
    }
    // If Space was used to pause, don't toggle back
    if (spacePaused) {
      return;
    }
    // If Space was pressed while paused, resume
    if (spaceResume) {
      togglePlayback();
      return;
    }
    // Toggle playback if Space was tapped (not used for panning)
    if (wasSpaceDown && state.interaction.mode === 'idle' && !state.playback.isPlaying) {
      togglePlayback();
    }
  }
});

// Also reset if window loses focus
window.addEventListener('blur', () => {
  state.interaction.spaceDown = false;
  state.interaction.mode = 'idle';
  canvasWrap.classList.remove('space-held', 'panning');
  _setCanvasCursor('default');
});

// Float bar — hover indicator
const floatBar = document.getElementById('float-bar');
const floatHover = document.getElementById('float-hover');
floatBar.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('.float-btn[data-tool]');
  if (btn && btn.dataset.tool !== state.drawingTool) {
    const barRect = floatBar.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    floatHover.style.left = (btnRect.left - barRect.left + (btnRect.width - 32) / 2 - 1) + 'px';
    floatHover.style.top = (btnRect.top - barRect.top + (btnRect.height - 32) / 2 - 1) + 'px';
    floatHover.style.opacity = '1';
  } else {
    floatHover.style.opacity = '0';
  }
});
floatBar.addEventListener('mouseleave', () => {
  floatHover.style.opacity = '0';
});

// Float bar drawing tool buttons
floatBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.float-btn[data-tool]');
  if (!btn) return;
  setDrawingTool(btn.dataset.tool);
});

// Frame edit buttons (eb-chain per-frame editing)
// Use document listener because buttons are in #preview-screen, not #right-panel
document.addEventListener('click', (e) => {
  if (e.target.id === 'eb-frame-edit-btn') {
    e.preventDefault();
    enterEbFrameEdit();
  } else if (e.target.id === 'eb-frame-commit-btn') {
    e.preventDefault();
    commitEbFrameEdit();
  } else if (e.target.id === 'eb-frame-cancel-btn') {
    e.preventDefault();
    cancelEbFrameEdit();
  }
});

// ================================================================
// File Import: Drag & Drop
// ================================================================
canvasWrap.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

canvasWrap.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer.files.length > 0) {
    importFiles(e.dataTransfer.files);
  }
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
});

// ================================================================
// File Import: Button click
// ================================================================
document.getElementById('btn-import-video').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*,audio/*,image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    if (input.files.length > 0) {
      importFiles(input.files);
    }
  });
  input.click();
});

