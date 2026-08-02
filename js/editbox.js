// ================================================================
// Edit box ↔ Fabric.js coordinate transforms
// ================================================================
function _eboxLocalToWorld(eb, lx, ly) {
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  return {
    x: eb.x + cam.offsetX + lx * cam.zoom,
    y: eb.y + cam.offsetY + ly * cam.zoom
  };
}

function _eboxWorldToLocal(eb, wx, wy) {
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  return {
    x: (wx - eb.x - cam.offsetX) / cam.zoom,
    y: (wy - eb.y - cam.offsetY) / cam.zoom
  };
}

// Migrate legacy local-coord shapes to world coords in-place.
// Detects local coords by checking if shape position is relative to edit box.
function _migrateEditBoxShapesToWorld(eb) {
  const cam = eb.camera || { zoom: 1, offsetX: 0, offsetY: 0 };
  for (const s of (eb.shapes || [])) {
    if (s.shapeType === 'line') continue;
    // Local coords have small values (relative to eb origin).
    // World coords include eb.x/eb.y offset (typically 600+).
    // Heuristic: if left+top < eb.width*2, treat as local coords.
    if (s.left != null && s.top != null && Math.abs(s.left) + Math.abs(s.top) < Math.max(eb.width || 400, 400) * 2) {
      const wp = _eboxLocalToWorld(eb, s.left, s.top);
      s.left = wp.x;
      s.top = wp.y;
      s.width = (s.width || 100) * cam.zoom;
      s.height = (s.height || 100) * cam.zoom;
      if (s.fontSize) s.fontSize *= cam.zoom;
    }
  }
  eb._shapesWorldCoords = true;
}

// Load edit box shapes onto Fabric canvas for interactive editing.
function _loadEditBoxToFabric(eb) {
  if (!fabricCanvas) { console.warn('[EB] fabricCanvas is null!'); return; }
  _clearEditBoxFabricObjects();

  // Migrate old local-coord shapes to world coords on first load
  if (!eb._shapesWorldCoords) {
    _migrateEditBoxShapesToWorld(eb);
  }

  for (const s of (eb.shapes || [])) {
    if (s.shapeType === 'line') continue;
    const sw = s.width || 100;
    const sh = s.shapeType === 'text' ? (s.height || 40) : (s.height || 100);
    // Use CENTER-based coordinates — rotation naturally keeps center fixed.
    // Convert stored top-left coords to center coords for Fabric.
    const cx = (s.left != null ? s.left : 0) + sw / 2;
    const cy = (s.top != null ? s.top : 0) + sh / 2;
    let obj;
    const baseProps = {
      left: cx,
      top: cy,
      fill: s.fill || 'rgba(136,196,5,0.15)',
      stroke: s.stroke || '#88C405',
      strokeWidth: (s.strokeWidth || 2),
      strokeUniform: true,
      opacity: s.opacity != null ? s.opacity : 1,
      angle: s.angle || 0,
      scaleX: s.scaleX || 1, scaleY: s.scaleY || 1,
      originX: 'center', originY: 'center',
      selectable: true, evented: true, hasControls: true, hasBorders: true
    };
    if (s.shapeType === 'rect') {
      obj = new fabric.Rect({
        ...baseProps,
        width: sw,
        height: sh
      });
    } else if (s.shapeType === 'ellipse') {
      obj = new fabric.Ellipse({
        ...baseProps,
        rx: sw / 2,
        ry: sh / 2
      });
    } else if (s.shapeType === 'text') {
      obj = new fabric.IText(s.text || '', {
        left: cx,
        top: cy,
        fontSize: s.fontSize || 24,
        fontFamily: s.fontFamily || 'Inter, system-ui, sans-serif',
        fontWeight: s.fontWeight || 'Bold',
        fill: s.fill || '#000000',
        textAlign: s.textAlign || 'left',
        width: s.width || 200,
        opacity: s.opacity != null ? s.opacity : 1,
        angle: s.angle || 0,
        scaleX: s.scaleX || 1, scaleY: s.scaleY || 1,
        originX: 'center', originY: 'center',
        selectable: true, evented: true, hasControls: true, hasBorders: true,
        editingBorderColor: '#88C405', cursorColor: '#88C405', cursorWidth: 1.5,
        selectionColor: 'rgba(136,196,5,0.25)'
      });
    }
    if (obj) {
      obj._isEditBoxShape = true;
      obj._editBoxId = eb.id;
      obj._shapeId = s.id;
      obj._shapeType = s.shapeType;
      fabricCanvas.add(obj);
    }
  }
  fabricCanvas.requestRenderAll();
}

// ================================================================
// Edit box activation/deactivation
// ================================================================
function _enterEditBoxOnFabric(eb) {
  fabricCanvas.getObjects().forEach(o => {
    if (!o._isEditBoxShape) {
      o._preEditSelectable = o.selectable;
      o._preEditEvented = o.evented;
      o.set({ selectable: false, evented: false, opacity: 0.25 });
    }
  });
  _loadEditBoxToFabric(eb);
}

function _exitEditBoxOnFabric(eb) {
  if (eb) {
    _saveFabricToEditBox(eb);
    const editingMarkerId = state.interaction._editingMarkerId;
    if (editingMarkerId) {
      const marker = state.markerCards.find(m => m.id === editingMarkerId);
      if (marker) {
        const prevOverrides = marker.shapeOverrides || {};
        const delta = _computeShapeOverridesDelta(eb, prevOverrides);
        const cleanDelta = {};
        for (const [shapeId, overrides] of Object.entries(delta)) {
          const origShape = eb.shapes.find(s => s.id === shapeId);
          if (!origShape) continue;
          const filtered = {};
          for (const [key, val] of Object.entries(overrides)) {
            if (origShape[key] !== val) filtered[key] = val;
          }
          if (Object.keys(filtered).length > 0) cleanDelta[shapeId] = filtered;
        }
        marker.shapeOverrides = cleanDelta;
      }
      state.interaction._editingMarkerId = null;
    }
  }
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

// Serialize Fabric objects back to edit box shapes array (world coords)
function _saveFabricToEditBox(eb) {
  if (!fabricCanvas) return;
  const shapes = [];
  for (const s of (eb.shapes || [])) {
    if (s.shapeType === 'line') shapes.push(s);
  }
  fabricCanvas.getObjects().forEach(obj => {
    if (!obj._isEditBoxShape || obj._editBoxId !== eb.id) return;
    const entry = _fabricEditBoxObjToShapeData(obj, eb);
    if (entry) {
      shapes.push(entry);
    }
  });
  eb.shapes = shapes;
  eb._shapesWorldCoords = true;
}

// Convert a Fabric edit-box object to shape data (world coords).
// Fabric uses CENTER-based coords (originX:'center', originY:'center').
// Convert back to top-left coords for the 2D canvas renderer.
function _fabricEditBoxObjToShapeData(obj, eb) {
  const entry = {
    id: obj._shapeId,
    shapeType: obj._shapeType || 'rect'
  };

  if (obj._shapeType === 'text') {
    const w = obj.width || 200;
    const h = obj.height || 40;
    entry.text = obj.text || '';
    entry.fontSize = obj.fontSize || 24;
    entry.fontFamily = obj.fontFamily || 'Inter';
    entry.fontWeight = obj.fontWeight || 'Bold';
    entry.fill = obj.fill;
    entry.textAlign = obj.textAlign || 'left';
    entry.width = w;
    entry.height = h;
    entry.scaleX = obj.scaleX || 1;
    entry.scaleY = obj.scaleY || 1;
    entry.angle = obj.angle || 0;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
    // Fabric center → top-left
    entry.left = obj.left - w / 2;
    entry.top = obj.top - h / 2;
  } else if (obj._shapeType === 'ellipse') {
    const rx = obj.rx * (obj.scaleX || 1);
    const ry = obj.ry * (obj.scaleY || 1);
    const w = rx * 2;
    const h = ry * 2;
    entry.width = w;
    entry.height = h;
    entry.fill = obj.fill;
    entry.stroke = obj.stroke;
    entry.strokeWidth = obj.strokeWidth || 2;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
    entry.angle = obj.angle || 0;
    entry.scaleX = 1;
    entry.scaleY = 1;
    entry.left = obj.left - w / 2;
    entry.top = obj.top - h / 2;
  } else {
    // Rect (default)
    const w = obj.width * (obj.scaleX || 1);
    const h = obj.height * (obj.scaleY || 1);
    entry.width = w;
    entry.height = h;
    entry.fill = obj.fill;
    entry.stroke = obj.stroke;
    entry.strokeWidth = obj.strokeWidth || 2;
    entry.opacity = obj.opacity != null ? obj.opacity : 1;
    entry.angle = obj.angle || 0;
    entry.scaleX = 1;
    entry.scaleY = 1;
    entry.left = obj.left - w / 2;
    entry.top = obj.top - h / 2;
  }
  return entry;
}

// Remove all edit-box Fabric objects and debug markers from canvas
function _clearEditBoxFabricObjects() {
  if (!fabricCanvas) return;
  const toRemove = [];
  fabricCanvas.getObjects().forEach(o => {
    if (o._isEditBoxShape) toRemove.push(o);
  });
  toRemove.forEach(o => fabricCanvas.remove(o));
}

// Compute delta for shape overrides (world coords)
function _computeShapeOverridesDelta(eb, prevOverrides) {
  prevOverrides = prevOverrides || {};
  const delta = {};

  for (const s of (eb.shapes || [])) {
    if (s.shapeType === 'line') continue;
    const prev = prevOverrides[s.id] || {};
    const entry = {};
    if (s.shapeType === 'text') {
      if (prev.text !== (s.text || '')) entry.text = s.text || '';
      if (prev.fontSize !== (s.fontSize || 24)) entry.fontSize = s.fontSize || 24;
      if (prev.fontFamily !== (s.fontFamily || 'Inter')) entry.fontFamily = s.fontFamily || 'Inter';
      if (prev.fontWeight !== (s.fontWeight || 'Bold')) entry.fontWeight = s.fontWeight || 'Bold';
      if (prev.fill !== s.fill) entry.fill = s.fill;
      if (prev.textAlign !== (s.textAlign || 'left')) entry.textAlign = s.textAlign || 'left';
      if (prev.width !== (s.width || 200)) entry.width = s.width || 200;
      if (prev.height !== (s.height || 40)) entry.height = s.height || 40;
    } else {
      if (prev.left !== s.left) entry.left = s.left;
      if (prev.top !== s.top) entry.top = s.top;
      if (prev.width !== s.width) entry.width = s.width;
      if (prev.height !== s.height) entry.height = s.height;
      if (prev.fill !== s.fill) entry.fill = s.fill;
      if (prev.stroke !== s.stroke) entry.stroke = s.stroke;
      if (prev.strokeWidth !== (s.strokeWidth || 2)) entry.strokeWidth = s.strokeWidth || 2;
    }
    if (prev.opacity !== (s.opacity != null ? s.opacity : 1)) entry.opacity = s.opacity != null ? s.opacity : 1;
    if (prev.angle !== (s.angle || 0)) entry.angle = s.angle || 0;
    if (prev.scaleX !== (s.scaleX || 1)) entry.scaleX = s.scaleX || 1;
    if (prev.scaleY !== (s.scaleY || 1)) entry.scaleY = s.scaleY || 1;

    if (Object.keys(entry).length > 0) {
      delta[s.id] = entry;
    }
    if (prev && Object.keys(prev).length > 0 && !delta[s.id]) {
      delta[s.id] = prev;
    }
  }

  return delta;
}

// Sync single edit box shape from Fabric object (on object:modified)
function _updateEditBoxShapeFromObj(obj) {
  if (!obj._isEditBoxShape || !obj._editBoxId) return;
  const eb = findEditBoxById(obj._editBoxId);
  if (!eb) return;
  const sid = obj._shapeId;
  const idx = (eb.shapes || []).findIndex(s => s.id === sid);
  if (idx < 0) return;
  const entry = _fabricEditBoxObjToShapeData(obj, eb);
  if (entry) eb.shapes[idx] = entry;
}
