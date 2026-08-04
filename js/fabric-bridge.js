// ================================================================
// Fabric.js Drawing
// ================================================================
let fabricCanvas = null;

function initFabricCanvas() {
  // Make selection controls bold and visible for all objects
  fabric.Object.prototype.borderColor = '#88C405';
  fabric.Object.prototype.borderScaleFactor = 0.6;  // border lineWidth = 1/0.6 ≈ 1.7px
  fabric.Object.prototype.cornerColor = '#ffffff';
  fabric.Object.prototype.cornerStrokeColor = '#88C405';
  fabric.Object.prototype.cornerSize = 14;
  fabric.Object.prototype.cornerStyle = 'rect';
  fabric.Object.prototype.cornerStrokeWidth = 1.5;
  fabric.Object.prototype.transparentCorners = false;
  fabric.Object.prototype.padding = 8;
  fabric.Object.prototype.borderOpacityWhenMoving = 1;

  fabricCanvas = new fabric.Canvas('fabric-canvas', {
    enableRetinaScaling: true,
    selection: true,
    preserveObjectStacking: true,
    // Rubber-band selection styling
    selectionColor: 'rgba(136,196,5,0.1)',
    selectionBorderColor: '#88C405',
    selectionLineWidth: 1,
    // Per-object controls
    borderColor: '#88C405',
    borderScaleFactor: 0.6,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#88C405',
    cornerSize: 14,
    cornerStyle: 'rect',
    transparentCorners: false,
    padding: 8
  });
  syncFabricSizeAndTransform();

  // Set initial button active state
  document.querySelectorAll('.float-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active-tool', btn.dataset.tool === 'select');
  });
  _moveFloatIndicator('select');


  fabricCanvas.on('object:modified', (e) => {
    const obj = e.target;
    if (obj && obj._isEditBoxShape) {
      _updateEditBoxShapeFromObj(obj);
    } else if (obj && obj._shapeId) {
      _updateShapeDataFromObj(obj);
    }
    renderLayerList();
    render();
  });

  // Keep layer list in sync when objects are added/removed
  fabricCanvas.on('object:added', () => { renderLayerList(); });
  fabricCanvas.on('object:removed', () => { renderLayerList(); });
  fabricCanvas.on('selection:created', () => {
    _syncFabricSelToState();
    renderLayerList();
    updateInspectorForFabricSelection();
    render();
    fabricCanvas.requestRenderAll();
  });
  fabricCanvas.on('selection:updated', () => {
    _syncFabricSelToState();
    updateInspectorForFabricSelection();
    render();
    fabricCanvas.requestRenderAll();
  });
  fabricCanvas.on('selection:cleared', () => {
    // Only clear shapeIds if we're not in the middle of a state-managed deselection
    if (!state.interaction._suppressShapeIdSync) {
      state.selection.shapeIds = [];
    }
    state.interaction._fabricShowControls = false;
    renderLayerList();
    updateInspector();
    render();
    fabricCanvas.requestRenderAll();
  });

  // Fabric mouse:down — events are forwarded from the 2D mousedown handler via _forwardToFabric.
  // No cross-layer logic needed here: cards/groups are handled by the 2D canvas.
  fabricCanvas.on('mouse:down', (opt) => {
    if (state.interaction.activeEditBoxId) return;
    const target = fabricCanvas.findTarget(opt.e);
    if (!target && !opt.e.shiftKey && !opt.e.metaKey && !opt.e.ctrlKey) {
      // Clicked empty Fabric space (unlikely with hover-based routing, but handle edge case)
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    }
  });

  // Text editing: commit on exit, remove if empty
  fabricCanvas.on('text:editing:exited', (e) => {
    const obj = e.target;
    if (!obj || obj._shapeType !== 'text') return;
    if (!obj.text || obj.text.trim() === '') {
      // Empty text — remove the object
      // If it's an edit box shape, also remove from eb.shapes
      if (obj._isEditBoxShape && obj._editBoxId) {
        const eb = findEditBoxById(obj._editBoxId);
        if (eb) eb.shapes = (eb.shapes || []).filter(s => s.id !== obj._shapeId);
      }
      fabricCanvas.remove(obj);
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      updateInspector();
      render();
    } else if (!obj._committed) {
      // First time committing non-empty text — push to undo stack
      obj._committed = true;
      pushUndo();
      if (obj._isEditBoxShape && obj._editBoxId) {
        const eb = findEditBoxById(obj._editBoxId);
        if (eb) {
          eb.shapes = eb.shapes || [];
          const entry = _fabricEditBoxObjToShapeData(obj, eb);
          if (entry) { entry.id = obj._shapeId; eb.shapes.push(entry); }
          _updateEditBoxShapeFromObj(obj);
        }
      } else {
        const shapeEntry = _fabricObjToShapeData(obj, obj._shapeId, 'text');
        state.shapes.push(shapeEntry);
        _updateShapeDataFromObj(obj);
      }
      updateInspectorForFabricSelection();
      render();
    } else {
      // Subsequent edits — update existing data
      if (obj._isEditBoxShape) {
        _updateEditBoxShapeFromObj(obj);
      } else {
        _updateShapeDataFromObj(obj);
      }
      render();
    }
  });
}

function syncFabricSizeAndTransform() {
  if (!fabricCanvas) return;
  const w = canvasWrap.clientWidth;
  const h = canvasWrap.clientHeight;
  if (fabricCanvas.width !== w || fabricCanvas.height !== h) {
    fabricCanvas.setWidth(w);
    fabricCanvas.setHeight(h);
  }

  fabricCanvas.calcOffset();
  const vpt = fabricCanvas.viewportTransform;
  if (vpt) {
    vpt[0] = state.canvas.zoom;
    vpt[1] = 0;
    vpt[2] = 0;
    vpt[3] = state.canvas.zoom;
    vpt[4] = state.canvas.offsetX;
    vpt[5] = state.canvas.offsetY;
  }
  // Force recalc of oCoords — strokeUniform makes coords depend on zoom
  fabricCanvas.getObjects().forEach(o => o.setCoords());
  fabricCanvas.requestRenderAll();
}

function _fcSyncContainerState() {
  // Visual indication for edit mode on the main canvas wrapper
  if (state.interaction.activeEditBoxId) {
    canvasWrap.classList.add('editbox-editing');
  } else {
    canvasWrap.classList.remove('editbox-editing');
  }
}

// ================================================================
// Event routing helpers — Fabric canvas has permanent pointer-events:none.
// All events come through the 2D canvas and are forwarded programmatically.
// ================================================================

// Is Fabric currently mid-transform (drag/scale/rotate) or mid rubber-band selection?
function _isFabricBusy() {
  if (!fabricCanvas) return false;
  return !!(fabricCanvas._currentTransform || fabricCanvas._groupSelector);
}

// Is the cursor over a selectable Fabric shape?
// Uses left/top/width/height directly (canvas-space) plus checks
// getActiveObject() because ActiveSelection is NOT in getObjects().
function _isOverFabricShape(clientX, clientY) {
  if (!fabricCanvas) return false;
  var pos = fabricCanvas.getPointer({ clientX: clientX, clientY: clientY });

  var _check = function(obj) {
    if (!obj) return false;
    // Edit box shapes are only interactable when their edit box is active
    if (obj._isEditBoxShape && !state.interaction.activeEditBoxId) return false;
    if (obj.selectable === false || obj.evented === false) return false;
    var l, t, w, h;
    if (obj.type === 'activeselection') {
      // ActiveSelection: left/top is CENTER (group originX/Y = 'center')
      l = obj.left - obj.width / 2;
      t = obj.top - obj.height / 2;
      w = obj.width;
      h = obj.height;
    } else {
      l = obj.left || 0;
      t = obj.top || 0;
      w = (obj.width || 0) * (obj.scaleX || 1);
      h = (obj.height || 0) * (obj.scaleY || 1);
    }
    var pad = (obj.padding != null ? obj.padding : 8);
    if (obj.angle) {
      var diag = Math.sqrt(w * w + h * h);
      var cx = l + w / 2, cy = t + h / 2;
      l = cx - diag / 2; t = cy - diag / 2;
      w = diag; h = diag;
    }
    return pos.x >= l - pad && pos.x <= l + w + pad &&
           pos.y >= t - pad && pos.y <= t + h + pad;
  };

  // ActiveSelection is NOT in getObjects() — check it first
  if (_check(fabricCanvas.getActiveObject())) return true;

  // Then check regular objects
  var objects = fabricCanvas.getObjects();
  for (var i = 0; i < objects.length; i++) {
    if (_check(objects[i])) return true;
  }
  return false;
}

// Sync Fabric's active object to state.selection.shapeIds.
// Called by selection:created and selection:updated.
function _syncFabricSelToState() {
  if (!fabricCanvas) return;
  var active = fabricCanvas.getActiveObject();
  if (!active || active._isEditBoxShape) {
    state.selection.shapeIds = [];
    return;
  }
  if (active.type === 'activeselection') {
    state.selection.shapeIds = active.getObjects().map(function(o) { return o._shapeId; }).filter(Boolean);
  } else if (active._shapeId) {
    state.selection.shapeIds = [active._shapeId];
  } else {
    state.selection.shapeIds = [];
  }
}

// Destroy Fabric's ActiveSelection (for mixed selection: cards + shapes).
// Keeps shapeIds in state so we can restore later.
function _destroyFabricShapeSelection() {
  if (!fabricCanvas) return;
  var active = fabricCanvas.getActiveObject();
  if (!active) return;
  // Save IDs before discarding
  if (active.type === 'activeselection') {
    state.selection.shapeIds = active.getObjects().map(function(o) { return o._shapeId; }).filter(Boolean);
  } else if (active._shapeId) {
    state.selection.shapeIds = [active._shapeId];
  }
  state.interaction._suppressShapeIdSync = true;
  fabricCanvas.discardActiveObject();
  state.interaction._suppressShapeIdSync = false;
  fabricCanvas.requestRenderAll();
}

// Restore Fabric ActiveSelection from state.selection.shapeIds (when mixed
// selection is resolved back to pure shape selection).
function _restoreFabricShapeSelection() {
  if (!fabricCanvas || state.selection.shapeIds.length === 0) return;
  var objs = [];
  fabricCanvas.getObjects().forEach(function(o) {
    if (o._shapeId && state.selection.shapeIds.indexOf(o._shapeId) >= 0 && !o._isEditBoxShape) {
      objs.push(o);
    }
  });
  if (objs.length === 0) { state.selection.shapeIds = []; return; }
  state.interaction._suppressShapeIdSync = true;
  if (objs.length === 1) {
    fabricCanvas.setActiveObject(objs[0]);
  } else {
    fabricCanvas.setActiveObject(new fabric.ActiveSelection(objs, { canvas: fabricCanvas }));
  }
  state.interaction._suppressShapeIdSync = false;
  fabricCanvas.requestRenderAll();
}

// Fabric v5.3.0 uses mousedown/mousemove/mouseup (not pointer events).
// mousedown listener is on upperCanvasEl; mousemove/mouseup are on document.
// Reentrancy guard: prevent infinite recursion when Fabric's handlers
// synchronously trigger render() → syncFabricSizeAndTransform() →
// event callbacks that try to forward again.
let _isForwarding = false;

function _hideFabricControls() {
  if (state.interaction._fabricShowControls) return; // double-click cancelled it
  const sel = fabricCanvas.getActiveObject();
  if (!sel) return;
  if (sel.type === 'activeselection') {
    sel.getObjects().forEach(o => { o.hasBorders = false; o.hasControls = false; });
  } else {
    sel.hasBorders = false;
    sel.hasControls = false;
  }
  fabricCanvas.requestRenderAll();
}

function _forwardToFabric(type, e) {
  if (!fabricCanvas || _isForwarding) return;
  _isForwarding = true;
  try {
    if (type === 'mousedown') {
      const now = Date.now();
      const dx = Math.abs(e.clientX - (state.interaction._lastFabricClickX || 0));
      const dy = Math.abs(e.clientY - (state.interaction._lastFabricClickY || 0));
      const dt = now - (state.interaction._lastFabricClickTime || 0);
      const isDbl = (dt < 400 && dx < 10 && dy < 10);
      state.interaction._lastFabricClickTime = now;
      state.interaction._lastFabricClickX = e.clientX;
      state.interaction._lastFabricClickY = e.clientY;
      if (isDbl) {
        state.interaction._fabricShowControls = true;
      } else {
        // Single click: hide controls after Fabric finishes selection
        setTimeout(() => _hideFabricControls(), 0);
      }
    }
    // mousedown target: upperCanvasEl (Fabric's handler is bound directly).
    // bubbles: false — no need to bubble since handler is on the target element,
    // and this prevents re-entering canvasWrap's mousedown handler.
    // mousemove/mouseup target: document (Fabric binds these on document during drag).
    // bubbles: true — must reach document-level listeners.
    const isMD = type === 'mousedown';
    const ev = new MouseEvent(type, {
      clientX: e.clientX, clientY: e.clientY,
      button: e.button, buttons: e.buttons,
      shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
      bubbles: !isMD, cancelable: true
    });
    const target = isMD ? fabricCanvas.upperCanvasEl : document;
    target.dispatchEvent(ev);
  } finally {
    _isForwarding = false;
  }
}

// ================================================================
// Unified drag: move Fabric shapes together with 2D cards
// ================================================================

// Get Fabric objects selected by state.selection.shapeIds (used when Fabric
// ActiveSelection has been destroyed due to mixed selection).
function _getShapeObjectsByIds() {
  var result = [];
  if (!fabricCanvas) return result;
  for (var i = 0; i < fabricCanvas.getObjects().length; i++) {
    var obj = fabricCanvas.getObjects()[i];
    if (obj._shapeId && state.selection.shapeIds.indexOf(obj._shapeId) >= 0 && !obj._isEditBoxShape) {
      result.push(obj);
    }
  }
  return result;
}

// Lock Fabric shapes so they don't move via native Fabric drag during unified drag
function _lockFabricShapesForDrag() {
  var objs;
  var activeObj = fabricCanvas.getActiveObject();
  if (activeObj) {
    objs = activeObj.type === 'activeselection' ? activeObj.getObjects() : [activeObj];
  } else {
    objs = _getShapeObjectsByIds();
  }
  objs.forEach(function(obj) {
    obj._wasLockedX = obj.lockMovementX;
    obj._wasLockedY = obj.lockMovementY;
    obj.set({ lockMovementX: true, lockMovementY: true });
  });
}

function _unlockFabricShapesAfterDrag() {
  fabricCanvas.getObjects().forEach(function(obj) {
    if (obj._wasLockedX !== undefined) {
      obj.set({ lockMovementX: obj._wasLockedX, lockMovementY: obj._wasLockedY });
      delete obj._wasLockedX;
      delete obj._wasLockedY;
    }
  });
}

// Record start positions of all selected Fabric shapes
function _recordFabricShapeStartPos() {
  var positions = [];
  var activeObj = fabricCanvas.getActiveObject();
  var objs;
  if (activeObj) {
    objs = activeObj.type === 'activeselection' ? activeObj.getObjects() : [activeObj];
  } else {
    objs = _getShapeObjectsByIds();
  }
  objs.forEach(function(obj) {
    positions.push({ obj: obj, left: obj.left, top: obj.top });
  });
  return positions;
}

// Move Fabric shapes by (dx, dy) from their recorded start positions
function _moveFabricShapesDelta(startPositions, dx, dy) {
  for (const entry of startPositions) {
    entry.obj.set({ left: entry.left + dx, top: entry.top + dy });
    entry.obj.setCoords();
  }
  fabricCanvas.requestRenderAll();
}

function _moveFloatIndicator(tool) {
  const bar = document.getElementById('float-bar');
  const indicator = document.getElementById('float-indicator');
  if (!bar || !indicator) return;
  const btn = bar.querySelector(`.float-btn[data-tool="${tool}"]`);
  if (!btn) {
    indicator.style.display = 'none';
    return;
  }
  indicator.style.display = '';
  const barRect = bar.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const left = btnRect.left - barRect.left + (btnRect.width - 36) / 2 - 1;
  const top = btnRect.top - barRect.top + (btnRect.height - 36) / 2 - 1;
  indicator.style.left = left + 'px';
  indicator.style.top = top + 'px';
}

function setDrawingTool(tool) {
  // Clean up any in-progress drawing before switching
  if (tool !== state.drawingTool) {
    if (state._drawing && state._drawing.obj) {
      fabricCanvas.remove(state._drawing.obj);
      fabricCanvas.requestRenderAll();
    }
    state._drawing = null;
    if (state._pathDraw) {
      fabricCanvas.remove(state._pathDraw.obj);
      fabricCanvas.requestRenderAll();
    }
    state._pathDraw = null;
    state.interaction.mode = 'idle';
  }

  state.drawingTool = tool;

  document.querySelectorAll('.float-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active-tool', btn.dataset.tool === tool);
  });

  _moveFloatIndicator(tool);

  // Shape drawing cursor
  const shapeTools = ['rect', 'ellipse', 'line', 'path', 'empty-group'];
  if (shapeTools.includes(tool)) {
    canvasWrap.classList.add('shape-drawing');
  } else {
    canvasWrap.classList.remove('shape-drawing');
  }

  if (fabricCanvas) {
    if (tool === 'select') {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.requestRenderAll();
    } else if (tool === 'line') {
      // Line tool works on 2D canvas — keep Fabric interactive but deselect
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
    } else {
      fabricCanvas.discardActiveObject();
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.requestRenderAll();
    }
  }

}

// ================================================================
// Shape Helper Utilities
// ================================================================
function getShapeBounds(s) {
  if (s.shapeType === 'rect' || s.shapeType === 'text') {
    return { x: s.left, y: s.top, w: s.width || 100, h: s.height || 40 };
  } else if (s.shapeType === 'ellipse') {
    return { x: s.left, y: s.top, w: s.width || 100, h: s.height || 100 };
  } else if (s.shapeType === 'line') {
    const minX = Math.min(s.x1, s.x2), maxX = Math.max(s.x1, s.x2);
    const minY = Math.min(s.y1, s.y2), maxY = Math.max(s.y1, s.y2);
    return { x: minX, y: minY, w: Math.max(maxX - minX, 2), h: Math.max(maxY - minY, 2) };
  }
  return null;
}

function _offsetShape(s, dx, dy) {
  if (s.shapeType === 'line') { s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy; }
  else { if (s.left != null) s.left += dx; if (s.top != null) s.top += dy; }
}

function _serializeShape(obj) {
  if (!obj || !obj._shapeId) return null;
  const data = {
    id: obj._shapeId,
    shapeType: obj._shapeType || 'rect',
    left: obj.left, top: obj.top,
    width: obj.type === 'ellipse' ? (obj.rx * 2) : (obj.width * (obj.scaleX || 1)),
    height: obj.type === 'ellipse' ? (obj.ry * 2) : (obj.height * (obj.scaleY || 1)),
    fill: obj.fill || null,
    stroke: obj.stroke || null,
    strokeWidth: obj.strokeWidth || 2,
    opacity: obj.opacity != null ? obj.opacity : 1,
    angle: obj.angle || 0,
  };
  if (obj._shapeType === 'text') {
    data.text = obj.text || '';
    data.fontSize = obj.fontSize || 24;
    data.fontFamily = obj.fontFamily || 'Inter';
    data.fontWeight = obj.fontWeight || 'Bold';
    data.textAlign = obj.textAlign || 'left';
  }
  return data;
}

function createCompositionCard(editBoxId) {
  const eb = findEditBoxById(editBoxId);
  if (!eb) return;

  // Exit edit-box editing mode — otherwise render() draws all cards
  // at 0.25 opacity, making newly imported cards invisible.
  // Use try-finally so activeEditBoxId is ALWAYS cleared even if
  // _exitEditBoxOnFabric throws (e.g. corrupt shape data).
  try {
    if (state.interaction.activeEditBoxId) {
      const activeEb = findEditBoxById(state.interaction.activeEditBoxId);
      if (activeEb) _exitEditBoxOnFabric(activeEb);
    }
  } finally {
    state.interaction.activeEditBoxId = null;
    _fcSyncContainerState();
  }

  pushUndo();
  const compId = 'comp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const totalDuration = 5;
  const compCard = {
    id: compId,
    type: 'composition',
    editBoxId: eb.id,
    x: eb.x + eb.width + 40,
    y: eb.y,
    width: totalDuration * PIXELS_PER_SECOND,
    height: CARD_HEIGHT,
    duration: totalDuration,
    totalDuration: totalDuration,
    trimStart: 0,
    trimEnd: totalDuration,
    trimIn: 0,
    trimOut: totalDuration,
    label: eb.shapes && eb.shapes.length > 0 ? '合成 ' + (eb.shapes.length) + ' 图形' : '合成',
    layer: state.cards.length
  };
  state.cards.push(compCard);
  state.compositionCards.push(compCard);
  state.selection.cardIds = [compId];
  state.selection.editBoxId = null;
  state.selection.groupIds = [];
  navigateToCards();
  render();
}

// ================================================================
// Fabric Shape Drawing Helpers
// ================================================================
function createFabricShape(type, x, y) {
  const z = state.canvas.zoom;
  // x,y are already in world coordinates (from screenToWorld).
  // Fabric's viewportTransform applies zoom, so internal coords = world coords.
  const opts = {
    left: x,
    top: y,
    width: 0,
    height: 0,
    fill: 'rgba(136,196,5,0.15)',
    stroke: '#88C405',
    strokeWidth: 2 / z,
    strokeUniform: true,
    centeredRotation: true,
    selectable: false,
    evented: false
  };

  switch (type) {
    case 'rect':
      return new fabric.Rect({ ...opts, originX: 'left', originY: 'top' });
    case 'ellipse':
      return new fabric.Ellipse({ ...opts, rx: 0, ry: 0, originX: 'left', originY: 'top' });
    default:
      return null;
  }
}

function updateFabricShape(drawing, mx, my) {
  const z = state.canvas.zoom;
  const startX = drawing.startX;
  const startY = drawing.startY;
  const type = drawing.shapeType;

  // rect / ellipse
  let w = mx - startX;
  let h = my - startY;
  const absW = Math.abs(w);
  const absH = Math.abs(h);

  if (type === 'ellipse') {
    drawing.obj.set({
      rx: absW / 2,
      ry: absH / 2,
      left: (w >= 0 ? startX : mx),
      top: (h >= 0 ? startY : my)
    });
  } else {
    drawing.obj.set({
      width: absW,
      height: absH,
      left: (w >= 0 ? startX : mx),
      top: (h >= 0 ? startY : my)
    });
  }
  drawing.obj.setCoords();
}

// Recalculate fabric.Path bounds after modifying path data array
function _recalcPathBounds(pathObj) {
  // Trigger Fabric's path setter to recalculate dimensions
  pathObj.set({ path: [...pathObj.path] });
}

// Finalize path drawing — create shape entry and switch to select
function _commitPathDraw() {
  const pathDraw = state._pathDraw;
  if (!pathDraw) return;

  const obj = pathDraw.obj;
  const points = pathDraw.points;

  // Auto-close path if last point near first
  if (points.length > 1) {
    const last = points[points.length - 1];
    const first = points[0];
    if (Math.abs(last.x - first.x) < 10 && Math.abs(last.y - first.y) < 10) {
      obj.path.push(['Z']);
    }
  }

  _recalcPathBounds(obj);

  const z = state.canvas.zoom;
  obj.set({
    stroke: '#88C405',
    strokeWidth: 2 / z,
    strokeUniform: true,
    fill: 'rgba(136,196,5,0.08)',
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockUniScaling: false
  });
  obj.setCoords();

  const id = 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  obj._shapeId = id;
  obj._shapeType = 'path';

  const shapeEntry = _fabricObjToShapeData(obj, id, 'path');
  pushUndo();
  state.shapes.push(shapeEntry);

  state._pathDraw = null;
  state.interaction.mode = 'idle';

  setDrawingTool('select');
  fabricCanvas.setActiveObject(obj);
  fabricCanvas.requestRenderAll();
  updateInspectorForFabricSelection();
  render();
}

// 2D canvas line preview during line drawing drag
function renderLinePreview() {
  const d = state._drawing;
  if (!d || d.shapeType !== 'line') return;

  const z = state.canvas.zoom;
  ctx.strokeStyle = '#88C405';
  ctx.lineWidth = 2 / z;
  ctx.setLineDash([6 / z, 3 / z]);
  ctx.beginPath();
  ctx.moveTo(d.startX, d.startY);
  ctx.lineTo(d.currentX, d.currentY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw endpoints
  ctx.fillStyle = '#88C405';
  ctx.beginPath();
  ctx.arc(d.startX, d.startY, 4 / z, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(d.currentX, d.currentY, 4 / z, 0, Math.PI * 2);
  ctx.fill();
}

// Render all line shapes (pure 2D canvas) in world space
function renderLines() {
  const z = state.canvas.zoom;
  for (const s of state.shapes) {
    if (s.shapeType !== 'line') continue;
    ctx.save();
    ctx.globalAlpha = s.opacity != null ? s.opacity : 1;
    ctx.strokeStyle = s.stroke || '#88C405';
    ctx.lineWidth = (s.strokeWidth || 2) / z;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    ctx.restore();
  }
}

// Render endpoint handles for the selected line
function renderLineEndpointHandles() {
  const shapeId = state.selection.shapeId;
  if (!shapeId) return;
  const s = state.shapes.find(sh => sh.id === shapeId);
  if (!s || s.shapeType !== 'line') return;
  const z = state.canvas.zoom;
  const r = 5 / z;
  for (const ep of [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]) {
    // White stroke
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 / z;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r + 1.5 / z, 0, Math.PI * 2);
    ctx.stroke();
    // Handle fill
    ctx.fillStyle = '#88C405';
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Serialize a Fabric shape object to state.shapes entry
function _fabricObjToShapeData(obj, id, shapeType) {
  const z = state.canvas.zoom;
  const entry = { id, shapeType };
  if (shapeType === 'text') {
    entry.text = obj.text || '';
    entry.fontSize = obj.fontSize;
    entry.fontFamily = obj.fontFamily;
    entry.fontWeight = obj.fontWeight;
    entry.fill = obj.fill;
    entry.textAlign = obj.textAlign;
    entry.left = obj.left; entry.top = obj.top;
    entry.scaleX = obj.scaleX; entry.scaleY = obj.scaleY;
    entry.angle = obj.angle || 0;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
    entry.width = obj.width;
    entry.height = obj.height;
  } else if (shapeType === 'path') {
    entry.pathData = obj.path;
    entry.stroke = obj.stroke;
    entry.strokeWidth = obj.strokeWidth * z;
    entry.fill = obj.fill;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
  } else {
    entry.left = obj.left; entry.top = obj.top;
    entry.width = obj.width; entry.height = obj.height;
    entry.fill = obj.fill;
    entry.stroke = obj.stroke;
    entry.strokeWidth = obj.strokeWidth * z;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
    entry.angle = obj.angle;
    entry.scaleX = obj.scaleX; entry.scaleY = obj.scaleY;
  }
  return entry;
}

// Update state.shapes entry from a Fabric object (on object:modified)
function _updateShapeDataFromObj(obj) {
  const sid = obj._shapeId;
  if (!sid) return;
  const idx = state.shapes.findIndex(s => s.id === sid);
  if (idx < 0) return;
  const shapeType = obj._shapeType || state.shapes[idx].shapeType;
  state.shapes[idx] = _fabricObjToShapeData(obj, sid, shapeType);
}

// Recreate all Fabric shape objects from state.shapes (on undo/redo)
function _syncShapesFromState() {
  if (!fabricCanvas) return;
  // Remove all existing shape objects
  const toRemove = [];
  fabricCanvas.getObjects().forEach(o => { if (o._shapeId) toRemove.push(o); });
  toRemove.forEach(o => fabricCanvas.remove(o));
  // Recreate from state (skip lines — they are pure 2D canvas)
  for (const s of state.shapes) {
    if (s.shapeType === 'line') continue;
    _createShapeFromData(s);
  }
  fabricCanvas.discardActiveObject();
  fabricCanvas.requestRenderAll();
}

// Create a Fabric object from shape data entry
function _createShapeFromData(s) {
  if (!fabricCanvas) return;
  const z = state.canvas.zoom;
  let obj;
  if (s.shapeType === 'ellipse') {
    obj = new fabric.Ellipse({
      left: s.left, top: s.top,
      rx: (s.width || 50) / 2, ry: (s.height || 50) / 2,
      fill: s.fill || 'rgba(136,196,5,0.15)',
      stroke: s.stroke || '#88C405',
      strokeWidth: (s.strokeWidth || 2) / z,
      strokeUniform: true,
      opacity: s.opacity != null ? s.opacity : 1,
      angle: s.angle || 0,
      scaleX: s.scaleX || 1, scaleY: s.scaleY || 1,
      originX: 'left', originY: 'top',
      centeredRotation: true,
      selectable: true, evented: true, hasControls: true, hasBorders: true
    });
  } else if (s.shapeType === 'text') {
    obj = new fabric.IText(s.text || '', {
      left: s.left, top: s.top,
      fontSize: s.fontSize || 24,
      fontFamily: s.fontFamily || 'Inter, system-ui, sans-serif',
      fontWeight: s.fontWeight || 'Bold',
      fill: s.fill || '#000000',
      textAlign: s.textAlign || 'left',
      opacity: s.opacity != null ? s.opacity : 1,
      angle: s.angle || 0,
      scaleX: s.scaleX || 1, scaleY: s.scaleY || 1,
      centeredRotation: true,
      editingBorderColor: '#88C405',
      cursorColor: '#88C405',
      selectionColor: 'rgba(136,196,5,0.25)',
      selectable: true, evented: true, hasControls: true, hasBorders: true
    });
    obj._committed = true;
  } else if (s.shapeType === 'path') {
    obj = new fabric.Path(s.pathData || [], {
      stroke: s.stroke || '#88C405',
      strokeWidth: (s.strokeWidth || 2) / z,
      strokeUniform: true,
      fill: s.fill || 'rgba(136,196,5,0.08)',
      opacity: s.opacity != null ? s.opacity : 1,
      selectable: true, evented: true, hasControls: true, hasBorders: true
    });
  } else { // rect
    obj = new fabric.Rect({
      left: s.left, top: s.top,
      width: s.width || 50, height: s.height || 50,
      fill: s.fill || 'rgba(136,196,5,0.15)',
      stroke: s.stroke || '#88C405',
      strokeWidth: (s.strokeWidth || 2) / z,
      strokeUniform: true,
      opacity: s.opacity != null ? s.opacity : 1,
      angle: s.angle || 0,
      scaleX: s.scaleX || 1, scaleY: s.scaleY || 1,
      originX: 'left', originY: 'top',
      centeredRotation: true,
      selectable: true, evented: true, hasControls: true, hasBorders: true
    });
  }
  obj._shapeId = s.id;
  obj._shapeType = s.shapeType;
  fabricCanvas.add(obj);
}

// Update inspector when a Fabric shape is selected
function updateInspectorForFabricSelection() {
  const active = fabricCanvas && fabricCanvas.getActiveObject();
  if (!active || !active._shapeId) { updateInspector(); return; }
  if (active._shapeType === 'text') { updateInspectorForFabricText(); return; }

  const st = active._shapeType;
  const z = state.canvas.zoom;
  const typeNames = { rect: '矩形', ellipse: '圆形', line: '直线', path: '路径' };
  let fill = active.fill || 'rgba(136,196,5,0.15)';
  let stroke = active.stroke || '#88C405';
  let strokeWidth = Math.round((active.strokeWidth || 2 / z) * z);
  let opacity = active.opacity != null ? active.opacity : 1;
  const isLine = st === 'line';
  const isPath = st === 'path';
  const hasFill = !isLine;
  const hasSize = !isLine && !isPath;

  // Position section
  const posHtml = _fabPair('X', 'insp-shape-x', Math.round(active.left), 'Y', 'insp-shape-y', Math.round(active.top));
  let html = _fabSecStatic('位置', posHtml) + _fabDiv();

  // Layout section (W/h)
  if (hasSize) {
    let width, height;
    if (st === 'ellipse') {
      width = Math.round(active.rx * 2 * active.scaleX);
      height = Math.round(active.ry * 2 * active.scaleY);
    } else {
      width = Math.round(active.width * active.scaleX);
      height = Math.round(active.height * active.scaleY);
    }
    html += _fabSecStatic('尺寸', _fabPair('W', 'insp-shape-w', width, 'h', 'insp-shape-h', height)) + _fabDiv();
  }

  // Color section
  let colorHtml = '';
  if (hasFill) {
    colorHtml += `<div class="inspector-color-bar">
      <span class="color-swatch" style="background:${_colorToHex(fill)};"></span>
      <span>填充</span>
      <input type="color" id="insp-shape-fill" value="${_colorToHex(fill)}">
      <span class="opacity-val">100%</span>
    </div>`;
  }
  colorHtml += `<div class="inspector-color-bar">
    <span class="color-swatch" style="background:${_colorToHex(stroke)};"></span>
    <span>描边</span>
    <input type="color" id="insp-shape-stroke" value="${_colorToHex(stroke)}">
    <span class="opacity-val">${strokeWidth}px</span>
  </div>`;
  colorHtml += _fabRow('不透明度', `<input type="range" id="insp-shape-opacity" min="0" max="100" value="${Math.round(opacity * 100)}"><span style="font-size:10px;color:#999;width:28px;flex-shrink:0;">${Math.round(opacity * 100)}%</span>`);
  if (!hasFill) {
    colorHtml += _fabRow('线宽', `<input type="number" id="insp-shape-strokew" value="${strokeWidth}" min="1" max="20" step="1">`);
  }
  html += _fabSecStatic('颜色', colorHtml);

  propsContent.innerHTML = html;
  _bindFabToggles();
  _bindShapeInspectorEvents();
}

/* ---- fabric-specific HTML helpers ---- */
function _fabSec(title, bodyHtml, collapsed) {
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
function _fabSecStatic(title, bodyHtml) {
  return `<div class="panel-section">
    <div class="section-header section-header-static">
      <span>${escHtml(title)}</span>
    </div>
    <div class="section-body">${bodyHtml}</div>
  </div>`;
}
function _fabDiv() { return '<div class="section-divider"></div>'; }
function _fabRow(label, inner) {
  return `<div class="inspector-row"><label>${label}</label>${inner}</div>`;
}
function _fabPair(aLabel, aId, aVal, bLabel, bId, bVal) {
  return `<div class="inspector-pair" style="display:flex;gap:5px;margin-bottom:6px;">
    <div class="input-box" style="box-sizing:border-box;width:101px;flex:none;display:flex;align-items:center;height:22px;padding:0 6px;gap:4px;border:1px solid transparent;border-radius:5px;background:#f2f2f2;"><span class="box-label" style="font-size:8px;color:#6c6c6c;font-weight:400;flex-shrink:0;">${aLabel}</span><input type="number" id="${aId}" value="${aVal}" step="1" style="flex:1;min-width:0;border:none;background:transparent;font-size:8px;color:#6c6c6c;outline:none;padding:0;font-family:inherit;"></div>
    <div class="input-box" style="box-sizing:border-box;width:101px;flex:none;display:flex;align-items:center;height:22px;padding:0 6px;gap:4px;border:1px solid transparent;border-radius:5px;background:#f2f2f2;"><span class="box-label" style="font-size:8px;color:#6c6c6c;font-weight:400;flex-shrink:0;">${bLabel}</span><input type="number" id="${bId}" value="${bVal}" step="1" style="flex:1;min-width:0;border:none;background:transparent;font-size:8px;color:#6c6c6c;outline:none;padding:0;font-family:inherit;"></div>
  </div>`;
}
function _bindFabToggles() {
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

// ================================================================
// Text inspector (Fabric.IText)
// ================================================================
function updateInspectorForFabricText() {
  const active = fabricCanvas && fabricCanvas.getActiveObject();
  if (!active || active._shapeType !== 'text') return;

  const fontFamilies = ['Inter', 'Arial', 'Georgia', 'monospace', 'system-ui'];
  const ff = active.fontFamily || 'Inter, system-ui, sans-serif';
  const ffBase = ff.split(',')[0].replace(/['"]/g, '').trim();

  let ffOpts = '';
  fontFamilies.forEach(f => {
    ffOpts += `<option value="${f}" ${ffBase === f ? 'selected' : ''}>${f}</option>`;
  });

  const fontHtml = _fabRow('字号', `<input type="number" id="insp-text-size" value="${active.fontSize || 24}" min="8" max="200" step="1">`) +
    _fabRow('字体', `<select id="insp-text-font">${ffOpts}</select>`) +
    _fabRow('粗细', `<select id="insp-text-weight">
      <option value="normal" ${active.fontWeight === 'normal' ? 'selected' : ''}>常规</option>
      <option value="bold" ${active.fontWeight !== 'normal' ? 'selected' : ''}>粗体</option>
    </select>`);

  const alignHtml = _fabRow('水平', `<select id="insp-text-align">
    <option value="left" ${active.textAlign === 'left' ? 'selected' : ''}>左对齐</option>
    <option value="center" ${active.textAlign === 'center' ? 'selected' : ''}>居中</option>
    <option value="right" ${active.textAlign === 'right' ? 'selected' : ''}>右对齐</option>
  </select>`);

  const colorHtml = `<div class="inspector-color-bar">
    <span class="color-swatch" style="background:${_colorToHex(active.fill || '#000000')};"></span>
    <span>${_colorToHex(active.fill || '#000000').toUpperCase()}</span>
    <input type="color" id="insp-text-color" value="${_colorToHex(active.fill || '#000000')}">
    <span class="opacity-val">${Math.round((active.opacity != null ? active.opacity : 1) * 100)}%</span>
  </div>` +
  _fabRow('不透明度', `<input type="range" id="insp-text-opacity" min="0" max="100" value="${Math.round((active.opacity != null ? active.opacity : 1) * 100)}"><span style="font-size:10px;color:#999;width:28px;flex-shrink:0;">${Math.round((active.opacity != null ? active.opacity : 1) * 100)}%</span>`);

  let html = _fabSec('字体', fontHtml, false) + _fabDiv() +
    _fabSec('对齐', alignHtml, false) + _fabDiv() +
    _fabSec('颜色', colorHtml, false);

  propsContent.innerHTML = html;
  _bindFabToggles();
  _bindTextInspectorEvents();
}

function _bindTextInspectorEvents() {
  const active = fabricCanvas && fabricCanvas.getActiveObject();
  if (!active || active._shapeType !== 'text') return;

  const fontEl = document.getElementById('insp-text-font');
  const sizeEl = document.getElementById('insp-text-size');
  const weightEl = document.getElementById('insp-text-weight');
  const colorEl = document.getElementById('insp-text-color');
  const alignEl = document.getElementById('insp-text-align');
  const opEl = document.getElementById('insp-text-opacity');

  const apply = () => {
    if (fontEl) active.set({ fontFamily: fontEl.value });
    if (sizeEl) active.set({ fontSize: parseInt(sizeEl.value) || 24 });
    if (weightEl) active.set({ fontWeight: weightEl.value });
    if (colorEl) active.set({ fill: colorEl.value });
    if (alignEl) active.set({ textAlign: alignEl.value });
    if (opEl) active.set({ opacity: parseInt(opEl.value) / 100 });
    active.setCoords();
    fabricCanvas.requestRenderAll();
    _updateShapeDataFromObj(active);
  };

  if (fontEl) fontEl.addEventListener('input', apply);
  if (sizeEl) sizeEl.addEventListener('input', apply);
  if (weightEl) weightEl.addEventListener('change', apply);
  if (colorEl) colorEl.addEventListener('input', apply);
  if (alignEl) alignEl.addEventListener('change', apply);
  if (opEl) opEl.addEventListener('input', apply);
}

function _bindShapeInspectorEvents() {
  const active = fabricCanvas && fabricCanvas.getActiveObject();
  if (!active || !active._shapeId) return;
  const z = state.canvas.zoom;

  const xEl = document.getElementById('insp-shape-x');
  const yEl = document.getElementById('insp-shape-y');
  const fillEl = document.getElementById('insp-shape-fill');
  const strokeEl = document.getElementById('insp-shape-stroke');
  const swEl = document.getElementById('insp-shape-strokew');
  const opEl = document.getElementById('insp-shape-opacity');
  const wEl = document.getElementById('insp-shape-w');
  const hEl = document.getElementById('insp-shape-h');

  const apply = () => {
    if (xEl) active.set({ left: parseInt(xEl.value) || 0 });
    if (yEl) active.set({ top: parseInt(yEl.value) || 0 });
    if (fillEl) active.set({ fill: fillEl.value });
    if (strokeEl) active.set({ stroke: strokeEl.value });
    if (swEl) active.set({ strokeWidth: parseInt(swEl.value) / z });
    if (opEl) active.set({ opacity: parseInt(opEl.value) / 100 });
    if (wEl) {
      const newW = parseInt(wEl.value);
      if (active._shapeType === 'ellipse') {
        active.set({ rx: newW / 2 / active.scaleX });
      } else {
        active.set({ width: newW / active.scaleX });
      }
    }
    if (hEl) {
      const newH = parseInt(hEl.value);
      if (active._shapeType === 'ellipse') {
        active.set({ ry: newH / 2 / active.scaleY });
      } else {
        active.set({ height: newH / active.scaleY });
      }
    }
    active.setCoords();
    fabricCanvas.requestRenderAll();
    _updateShapeDataFromObj(active);
    render();
  };

  if (xEl) xEl.addEventListener('input', apply);
  if (yEl) yEl.addEventListener('input', apply);
  if (fillEl) fillEl.addEventListener('input', apply);
  if (strokeEl) strokeEl.addEventListener('input', apply);
  if (swEl) swEl.addEventListener('input', apply);
  if (opEl) opEl.addEventListener('input', apply);
  if (wEl) wEl.addEventListener('input', apply);
  if (hEl) hEl.addEventListener('input', apply);
}

// ================================================================
// Line inspector (pure 2D canvas lines)
// ================================================================
function updateLineInspector(shape) {
  const stroke = shape.stroke || '#88C405';
  const strokeWidth = shape.strokeWidth || 2;
  const opacity = shape.opacity != null ? shape.opacity : 1;

  const colorHtml = `<div class="inspector-color-bar">
    <span class="color-swatch" style="background:${_colorToHex(stroke)};"></span>
    <span>${_colorToHex(stroke).toUpperCase()}</span>
    <input type="color" id="insp-line-color" value="${_colorToHex(stroke)}">
    <span class="opacity-val">${strokeWidth}px</span>
  </div>` +
  _fabRow('线宽', `<input type="number" id="insp-line-strokew" value="${strokeWidth}" min="1" max="20" step="1">`) +
  _fabRow('不透明度', `<input type="range" id="insp-line-opacity" min="0" max="100" value="${Math.round(opacity * 100)}"><span style="font-size:10px;color:#999;width:28px;flex-shrink:0;">${Math.round(opacity * 100)}%</span>`);

  const html = _fabSec('颜色', colorHtml, false);
  propsContent.innerHTML = html;
  _bindFabToggles();
  _bindLineInspectorEvents(shape);
}

function _bindLineInspectorEvents(shape) {
  const colorEl = document.getElementById('insp-line-color');
  const swEl = document.getElementById('insp-line-strokew');
  const opEl = document.getElementById('insp-line-opacity');

  const apply = () => {
    if (colorEl) shape.stroke = colorEl.value;
    if (swEl) shape.strokeWidth = parseInt(swEl.value) || 2;
    if (opEl) shape.opacity = parseInt(opEl.value) / 100;
    render();
  };

  if (colorEl) colorEl.addEventListener('input', apply);
  if (swEl) swEl.addEventListener('input', apply);
  if (opEl) opEl.addEventListener('input', apply);
}

function _colorToHex(c) {
  if (!c) return '#000000';
  if (typeof c === 'string' && c.startsWith('#')) return c;
  if (typeof c === 'string' && c.startsWith('rgba')) {
    const m = c.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      return '#' + [m[0], m[1], m[2]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }
  }
  return '#000000';
}

// Apply shape overrides from a marker card to Fabric objects in an edit box.
// shapeOverrides is a map of shapeId → { left, top, width, height, ... }
// Apply shape overrides from a marker card to Fabric objects in an edit box.
// shapeOverrides is a map of shapeId → { left, top, width, height, ... } in world coords.
function _applyShapeOverridesToFabric(eb, shapeOverrides) {
  if (!fabricCanvas || !eb) return;
  for (const [shapeId, overrides] of Object.entries(shapeOverrides)) {
    const obj = fabricCanvas.getObjects().find(o => o._isEditBoxShape && o._editBoxId === eb.id && o._shapeId === shapeId);
    if (!obj) continue;
    const props = {};

    // Get effective dimensions (accounting for override or current obj state)
    let effW, effH;
    if (obj._shapeType === 'ellipse') {
      effW = overrides.width != null ? overrides.width : obj.rx * 2 * (obj.scaleX || 1);
      effH = overrides.height != null ? overrides.height : obj.ry * 2 * (obj.scaleY || 1);
    } else {
      effW = overrides.width != null ? overrides.width : (obj.width || 200) * (obj.scaleX || 1);
      effH = overrides.height != null ? overrides.height : (obj.height || 100) * (obj.scaleY || 1);
    }

    // Convert top-left coords (stored in shapeOverrides) to center coords (Fabric uses originX:'center')
    if (overrides.left != null) props.left = overrides.left + effW / 2;
    if (overrides.top != null) props.top = overrides.top + effH / 2;

    if (overrides.width != null) {
      if (obj._shapeType === 'ellipse') {
        props.rx = overrides.width / 2;
      } else {
        props.width = overrides.width;
      }
    }
    if (overrides.height != null) {
      if (obj._shapeType === 'ellipse') {
        props.ry = overrides.height / 2;
      } else {
        props.height = overrides.height;
      }
    }
    // Bake scale into dimensions
    props.scaleX = 1;
    props.scaleY = 1;

    if (overrides.fill != null) props.fill = overrides.fill;
    if (overrides.stroke != null) props.stroke = overrides.stroke;
    if (overrides.opacity != null) props.opacity = overrides.opacity;
    if (overrides.angle != null) props.angle = overrides.angle;
    if (overrides.text != null && obj._shapeType === 'text') props.text = overrides.text;
    if (overrides.fontSize != null && obj._shapeType === 'text') props.fontSize = overrides.fontSize;
    if (Object.keys(props).length > 0) {
      obj.set(props);
      obj.setCoords();
    }
  }
  if (fabricCanvas) fabricCanvas.requestRenderAll();
}

