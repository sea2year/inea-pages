// ================================================================
// State
// ================================================================
const PIXELS_PER_SECOND = 50;
const CARD_THUMB_HEIGHT = 68;
const CARD_WAVEFORM_HEIGHT = 28;
const CARD_LABEL_HEIGHT = 20;
const CARD_HEIGHT = CARD_THUMB_HEIGHT + CARD_WAVEFORM_HEIGHT + CARD_LABEL_HEIGHT; // 116px
const CARD_MIN_WIDTH = 80;
const CARDS_PER_ROW = 4;
const COL_GAP_RATIO = 0.3;
const ROW_GAP_RATIO = 1.5;
const THUMBNAIL_COUNT = 10;
const WAVEFORM_SAMPLES = 200;
const ZOOM_MIN = 0.10;
const ZOOM_MAX = 6.0;
const ZOOM_FACTOR = 1.1;
const TRIM_HIT = 12;       // px hit area for trim handles (screen pixels)
const VOL_SLIDER_W = 36;   // volume slider width in world units
const ANCHOR_RADIUS = 8;   // world units — visual anchor dot radius
const ANCHOR_HIT_R = 24;   // screen px — hit radius for anchors
const BEZIER_OFFSET = 80;  // world units — horizontal control-point offset
const CONN_HIT_R = 10;     // screen px — hit radius for connection badge/delete
const state = {
  cards: [],
  connections: [],
  groups: [],
  editBoxes: [],            // [{ id, x, y, width, height, shapes, camera }]
  compositionCards: [],     // [{ id, type:'composition', editBoxId, x, y, width, height, totalDuration, trimStart, trimEnd, label, layer }]
  markerCards: [],          // [{ id, parentCardId, x, y, properties: {opacity, transformScale, transformX, transformY}, shapeOverrides: {} }]
  selection: {
    cardIds: [],
    connectionId: null,
    connectionIds: [],
    groupIds: [],
    shapeId: null,          // currently selected line shape id (pure 2D canvas)
    shapeIds: [],            // selected Fabric shape ids (rect/ellipse/text/path)
    editBoxId: null,         // currently selected edit box id
    editBoxIds: [],          // multi-selected edit box ids
    markerCardId: null,     // currently selected marker card id
    markerCardIds: []       // multi-selected marker card ids
  },
  canvas: {
    offsetX: 0,
    offsetY: 0,
    zoom: 1.0
  },
  drawingTool: 'select',
  interaction: {
    mode: 'idle',         // 'idle' | 'pan' | 'dragging-card' | 'dragging-group' | 'dragging-group-resize' | 'trimming-left' | 'trimming-right' | 'adjusting-volume' | 'connecting' | 'rubber-band' | 'dragging-line-endpoint' | 'dragging-line-body'
    targetCardId: null,
    targetGroupId: null,
    dragStart: { x: 0, y: 0 },
    dragStartWorld: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 },
    cardStartPos: new Map(),  // cardId/sketchId → {x, y}  when dragging
    trimStartVal: 0,          // initial trim value when trimming
    trimStartX: 0,            // initial card.x when trimming
    trimStartWidth: 0,        // initial card width when trimming
    _rippleCards: null,       // { originalRightEdge, cards: Map<cardId, {x, y}> } for ripple trim
    volStartVal: 0,           // initial volume when adjusting
    spaceDown: false,
    connectingFrom: null,     // { cardId, side } when in connecting mode
    mouseWorldPos: { x: 0, y: 0 },  // current mouse position in world coords
    _rubberBand: null,        // { startX, startY, currentX, currentY } in world coords
    _snapLines: null,         // [{ orient: 'v'|'h', pos: number }] for snap guide rendering
    _connectSnapPos: null,    // {x, y} snap target for connection preview
    dropTargetGroupId: null,  // target group when dragging cards over a group frame
    // Line shape editing (pure 2D canvas, not Fabric)
    targetShapeId: null,         // shape id being edited
    _lineEndpointIdx: -1,        // 0 or 1 — which endpoint is being dragged
    _lineDragStartX1: 0, _lineDragStartY1: 0, _lineDragStartX2: 0, _lineDragStartY2: 0,
    activeEditBoxId: null,     // currently focused edit box (drawing tools act on it)
    targetEditBoxId: null,     // edit box being drawn into during drawing-ebox mode
    _isTweenConnection: false, // Alt key held during connect => tween connection
    _editingMarkerId: null,    // marker card id being edited (shape overrides)
    dragMarkerCardId: null,    // marker card id being dragged
    _markerDragStartX: 0       // initial x when dragging marker card
  },
  hoveredCardId: null,
  hoveredEditBoxId: null,
  hoveredConnectionId: null,
  hoveredAnchor: null,        // { cardId, side }
  hoveredGroupId: null,
  // Playback
  playbackVideo: null,        // reference to #playback-video
  playback: {
    isPlaying: false,
    sequence: [],             // ordered card IDs
    currentSeqIndex: 0,
    currentCardId: null,
    cardProgress: 0,          // 0–1 within the current card
    pausedCardTime: 0,        // absolute file-time within current card when paused
    totalDuration: 0,         // seconds
    startTime: 0,             // performance.now()
    pausedAt: 0,              // elapsed seconds when paused
    inTransition: false,
    transitionConn: null,     // the connection being transitioned
    transitionProgress: 0,    // 0–1 within the transition
    _dissolveOverlayCanvas: null, // outgoing frame canvas for dissolve crossfade
    rafId: null,
    playbackMode: 'linear',   // 'linear' | 'group' | 'eb-chain'
    groupPlayback: {
      groupId: null,
      groupStartX: 0,
      groupEndX: 0,
      totalPixels: 0,
      timelineCards: []
    },
    _ebChain: null,           // { chain, firstEbId, startTime, duration, _currentInterp }
    _ebChainProgress: 0,      // 0-1
    _preEditBoxId: null,      // edit box id to restore after playback stops
    _frameEditActive: false   // whether per-frame edit mode is active
  },
  bgmEntries: [],            // [{ cardId, audio, coverElapsed, active }]
  groupVideoEntries: [],     // [{ cardId, video, active }]
  bgmPrevTimestamp: 0,       // for dt calculation in tick
  clipboard: null,            // { type: 'card', cardData: {...} }
  shapes: [],                 // Fabric-based shapes (rect/ellipse/line/path)
  _pathDraw: null             // path drawing temporary state { obj, points, _anchorPt, _justAdded }
};

// Undo/redo stacks
const MAX_UNDO = 100;
let _undoStack = [];
let _redoStack = [];
let _undoSuppress = false;  // set true when restoring state to avoid re-pushing

function pushUndo() {
  if (_undoSuppress) return;
  _redoStack = [];
  const snapshot = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    groups: JSON.parse(JSON.stringify(state.groups)),
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    editBoxes: JSON.parse(JSON.stringify(state.editBoxes)),
    compositionCards: JSON.parse(JSON.stringify(state.compositionCards)),
    markerCards: JSON.parse(JSON.stringify(state.markerCards)),
  };
  _undoStack.push(snapshot);
  if (_undoStack.length > MAX_UNDO) _undoStack.shift();
}

function undo() {
  if (_undoStack.length === 0) return;
  const current = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    groups: JSON.parse(JSON.stringify(state.groups)),
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    editBoxes: JSON.parse(JSON.stringify(state.editBoxes)),
    compositionCards: JSON.parse(JSON.stringify(state.compositionCards)),
    markerCards: JSON.parse(JSON.stringify(state.markerCards)),
  };
  _redoStack.push(current);
  const prev = _undoStack.pop();
  _undoSuppress = true;
  state.cards = prev.cards;
  state.connections = prev.connections;
  state.groups = prev.groups || [];
  state.shapes = prev.shapes || [];
  state.editBoxes = prev.editBoxes || [];
  state.compositionCards = prev.compositionCards || [];
  state.markerCards = prev.markerCards || [];
  state.selection.cardIds = [];
  state.selection.groupIds = [];
  state.selection.connectionId = null;
  state.selection.connectionIds = [];
  state.selection.shapeId = null;
  state.selection.shapeIds = [];
  state.selection.editBoxId = null;
  state.selection.editBoxIds = [];
  state.selection.markerCardId = null;
  state.selection.markerCardIds = [];
  _clearEditBoxFabricObjects();
  state.interaction.activeEditBoxId = null;
  state.interaction.targetEditBoxId = null;
  state.interaction._editingMarkerId = null;
  state.interaction._isTweenConnection = false;
  _syncShapesFromState();
  _undoSuppress = false;
  render();
}

function redo() {
  if (_redoStack.length === 0) return;
  const current = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    groups: JSON.parse(JSON.stringify(state.groups)),
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    editBoxes: JSON.parse(JSON.stringify(state.editBoxes)),
    compositionCards: JSON.parse(JSON.stringify(state.compositionCards)),
    markerCards: JSON.parse(JSON.stringify(state.markerCards)),
  };
  _undoStack.push(current);
  const next = _redoStack.pop();
  _undoSuppress = true;
  state.cards = next.cards;
  state.connections = next.connections;
  state.groups = next.groups || [];
  state.shapes = next.shapes || [];
  state.editBoxes = next.editBoxes || [];
  state.compositionCards = next.compositionCards || [];
  state.markerCards = next.markerCards || [];
  state.selection.cardIds = [];
  state.selection.groupIds = [];
  state.selection.connectionId = null;
  state.selection.connectionIds = [];
  state.selection.shapeId = null;
  state.selection.shapeIds = [];
  state.selection.editBoxId = null;
  state.selection.editBoxIds = [];
  state.selection.markerCardId = null;
  state.selection.markerCardIds = [];
  _clearEditBoxFabricObjects();
  state.interaction.activeEditBoxId = null;
  state.interaction.targetEditBoxId = null;
  state.interaction._editingMarkerId = null;
  state.interaction._isTweenConnection = false;
  _syncShapesFromState();
  _undoSuppress = false;
  render();
}

