// ================================================================
// Tutorial Engine — 4 guided lessons for the canvas video editor
// ================================================================

const TUTORIAL_LESSONS = [
  // ---- Lesson 1: 多素材管理 ----
  {
    id: 'multi-media',
    title: '多素材管理',
    subtitle: '所有的灵感、参考、素材流淌在同一空间',
    steps: [
      {
        id: 'welcome',
        title: '欢迎来到 INEA 画板',
        desc: '这是一个自由形态的多媒体画布。视频、图片、音频都可以自由放置，像在桌面上整理素材一样直观。',
        highlight: null,
        tooltip: null,
        autoNext: false
      },
      {
        id: 'click-card',
        title: '点击卡片查看详情',
        desc: '试试点击画布上的视频卡片。右侧属性面板会显示它的名称、时长、入出点等信息。',
        highlight: null,
        tooltip: '👆 点击任意视频卡片',
        autoNext: { type: 'card-selected' }
      },
      {
        id: 'drag-card',
        title: '拖拽卡片自由排列',
        desc: '拖拽卡片到任意位置。画布是无限的，你可以用鼠标中键或滚轮平移视角。',
        highlight: null,
        tooltip: '👆 拖拽卡片移动位置',
        autoNext: { type: 'card-moved' }
      },
      {
        id: 'layers',
        title: '使用图层面板管理素材',
        desc: '左侧图层面板列出了所有素材。你可以拖拽图层调整顺序，双击名称重命名。',
        highlight: '#left-panel',
        tooltip: '图层管理',
        autoNext: false
      },
      {
        id: 'zoom-pan',
        title: '缩放与平移',
        desc: '按住 Cmd/Ctrl + 滚轮缩放画布（10%~600%）。按 0 键快速回到 100%。试试看！',
        highlight: '#canvas-wrap',
        tooltip: 'Cmd+滚轮 缩放画布',
        autoNext: false
      }
    ],
    preload(state) {
      // Generate placeholder cards on the canvas
      const cards = _genPlaceholderCards([
        { label: '航拍素材', duration: 20, color: '#3b82f6', x: 50, y: 60 },
        { label: '采访片段', duration: 35, color: '#f59e0b', x: 50, y: 200 },
        { label: '产品特写', duration: 15, color: '#10b981', x: 50, y: 340 },
        { label: '空镜过渡', duration: 25, color: '#8b5cf6', x: 50, y: 480 },
        { label: '背景音乐', duration: 60, color: '#ec4899', x: 50, y: 620, type: 'audio' },
      ]);
      state.cards = cards;
      state.canvas.offsetX = 0;
      state.canvas.offsetY = 0;
      state.canvas.zoom = 0.8;
    }
  },

  // ---- Lesson 2: 基础编辑逻辑 ----
  {
    id: 'basic-editing',
    title: '基础编辑逻辑',
    subtitle: '裁剪、连线、编组——像思维导图一样组织视频',
    steps: [
      {
        id: 'trim',
        title: '拖拽边缘裁剪视频',
        desc: '每张卡片左右两侧有裁剪手柄。拖拽它们可以调整视频的入点和出点，只保留你需要的片段。',
        highlight: null,
        tooltip: '👆 拖拽卡片左右边缘的裁剪手柄',
        autoNext: { type: 'card-trimmed' }
      },
      {
        id: 'connect',
        title: '连接卡片创建序列',
        desc: '从卡片右侧的圆点锚点拖出连线到另一张卡片的左侧，即可创建播放序列。连线支持切、叠、黑三种转场。',
        highlight: null,
        tooltip: '👆 从卡片边缘的圆点拖出连线',
        autoNext: { type: 'connection-created' }
      },
      {
        id: 'playback',
        title: '按空格键预览播放',
        desc: '选中任意卡片，按空格键即可在右侧预览面板播放当前序列。再按空格暂停，按 Esc 停止。',
        highlight: '#right-panel',
        tooltip: '按空格键 播放预览',
        autoNext: { type: 'playback-started' }
      },
      {
        id: 'group',
        title: '框选卡片编组管理',
        desc: '按住 Shift 点击多选卡片，然后右键选择"编组"。编组后可以统一移动、一起播放。',
        highlight: null,
        tooltip: 'Shift+点击 多选卡片',
        autoNext: false
      },
      {
        id: 'volume',
        title: '调整音量和属性',
        desc: '选中卡片后，在右侧属性面板可以调整音量、设置渐入渐出、修改名称等。拖拽卡片底部的音量滑块也可以快速调整。',
        highlight: '#right-panel',
        tooltip: '属性面板调整音量',
        autoNext: false
      }
    ],
    preload(state) {
      const cards = _genPlaceholderCards([
        { label: '开场镜头', duration: 12, color: '#3b82f6', x: 100, y: 200, trimIn: 1, trimOut: 10 },
        { label: '主内容A', duration: 25, color: '#f59e0b', x: 800, y: 200, trimIn: 2, trimOut: 22 },
        { label: '主内容B', duration: 30, color: '#10b981', x: 800, y: 360, trimIn: 3, trimOut: 27 },
        { label: '结尾镜头', duration: 15, color: '#8b5cf6', x: 1600, y: 200, trimIn: 0, trimOut: 12 },
      ]);
      // Pre-connect cards into a sequence
      const conns = [
        _genConnection(cards[0].id, cards[1].id, 'right', 'left', 'cut', 0.5),
        _genConnection(cards[1].id, cards[3].id, 'right', 'left', 'dissolve', 1.0),
        _genConnection(cards[2].id, cards[3].id, 'right', 'left', 'cut', 0.5),
      ];
      state.cards = cards;
      state.connections = conns;
      state.canvas.offsetX = -100;
      state.canvas.offsetY = -50;
      state.canvas.zoom = 0.7;
    }
  },

  // ---- Lesson 3: 视频关键帧 ----
  {
    id: 'video-keyframes',
    title: '视频关键帧',
    subtitle: '为图形设置关键帧，自动生成流畅的动画过渡',
    steps: [
      {
        id: 'select-ebox',
        title: '认识编辑盒与关键帧',
        desc: '画布上有 3 个编辑盒，它们之间用虚线连接。每个编辑盒里包含了不同位置/样式的图形——这就是关键帧。',
        highlight: null,
        tooltip: '👆 点击编辑盒查看图形',
        autoNext: { type: 'ebox-selected' }
      },
      {
        id: 'preview-chain',
        title: '预览关键帧动画',
        desc: '按空格键，系统会自动计算中间帧的图形位置、大小、颜色，生成流畅的动画。在右侧预览面板查看效果。',
        highlight: '#right-panel',
        tooltip: '按空格键 预览动画',
        autoNext: { type: 'eb-chain-playback-started' }
      },
      {
        id: 'pause-edit',
        title: '暂停并编辑中间帧',
        desc: '播放过程中按空格暂停。你可以在暂停位置编辑当前帧的图形，然后插入一个新的关键帧。试试看！',
        highlight: null,
        tooltip: '空格暂停后编辑此帧',
        autoNext: false
      },
      {
        id: 'easing',
        title: '调整缓动曲线',
        desc: '选中关键帧连线，在属性面板可以调整动画时长和缓动曲线（ease-in、ease-out 等），控制动画节奏。',
        highlight: '#right-panel',
        tooltip: '调整缓动和时长',
        autoNext: false
      }
    ],
    preload(state) {
      // Create 3 edit boxes with different shape configurations
      const eb1 = {
        id: 'ebox_' + Date.now() + '_1',
        x: 100, y: 100, width: 600, height: 400,
        camera: { zoom: 1, offsetX: 0, offsetY: 0 },
        shapes: [
          { id: 's1', shapeType: 'rect', left: 50, top: 100, width: 120, height: 80, fill: '#3b82f6', stroke: '#2563eb', strokeWidth: 2, opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
          { id: 's2', shapeType: 'ellipse', left: 250, top: 150, width: 80, height: 80, fill: '#f59e0b', stroke: '#d97706', strokeWidth: 2, opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
          { id: 's3', shapeType: 'text', left: 400, top: 100, width: 150, height: 40, text: 'Hello', fontSize: 32, fontFamily: 'Inter', fontWeight: 'Bold', fill: '#ffffff', textAlign: 'left', opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
        ]
      };
      const eb2 = {
        id: 'ebox_' + Date.now() + '_2',
        x: 800, y: 100, width: 600, height: 400,
        camera: { zoom: 1, offsetX: 0, offsetY: 0 },
        shapes: [
          { id: 's1', shapeType: 'rect', left: 300, top: 200, width: 120, height: 80, fill: '#10b981', stroke: '#059669', strokeWidth: 2, opacity: 0.8, angle: 45, scaleX: 1, scaleY: 1 },
          { id: 's2', shapeType: 'ellipse', left: 100, top: 80, width: 100, height: 100, fill: '#ef4444', stroke: '#dc2626', strokeWidth: 2, opacity: 1, angle: 0, scaleX: 1.3, scaleY: 1.3 },
          { id: 's3', shapeType: 'text', left: 350, top: 280, width: 200, height: 40, text: 'World', fontSize: 40, fontFamily: 'Inter', fontWeight: 'Bold', fill: '#f59e0b', textAlign: 'center', opacity: 1, angle: -10, scaleX: 1, scaleY: 1 },
        ]
      };
      const eb3 = {
        id: 'ebox_' + Date.now() + '_3',
        x: 1500, y: 100, width: 600, height: 400,
        camera: { zoom: 1, offsetX: 0, offsetY: 0 },
        shapes: [
          { id: 's1', shapeType: 'rect', left: 400, top: 50, width: 150, height: 100, fill: '#ec4899', stroke: '#db2777', strokeWidth: 3, opacity: 0.9, angle: 90, scaleX: 1.2, scaleY: 0.8 },
          { id: 's2', shapeType: 'ellipse', left: 200, top: 200, width: 60, height: 60, fill: '#8b5cf6', stroke: '#7c3aed', strokeWidth: 1, opacity: 0.6, angle: 0, scaleX: 1, scaleY: 1 },
          { id: 's3', shapeType: 'text', left: 50, top: 300, width: 250, height: 45, text: 'INEA!', fontSize: 48, fontFamily: 'Inter', fontWeight: 'Bold', fill: '#3b82f6', textAlign: 'left', opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
        ]
      };
      state.editBoxes = [eb1, eb2, eb3];
      state.connections = [
        _genEbConnection(eb1.id, eb2.id, 'ebox_' + Date.now() + '_c1', 'ease-in-out', 1.5),
        _genEbConnection(eb2.id, eb3.id, 'ebox_' + Date.now() + '_c2', 'ease-in-out', 1.5),
      ];
      state.selection.editBoxId = eb1.id;
      state.canvas.offsetX = -100;
      state.canvas.offsetY = 0;
      state.canvas.zoom = 0.6;
    }
  },

  // ---- Lesson 4: 几何动画制作 ----
  {
    id: 'geometry-animation',
    title: '几何动画制作',
    subtitle: '从零开始创建图形，搭建关键帧，生成完整动画',
    steps: [
      {
        id: 'draw-shapes',
        title: '在编辑盒内绘制图形',
        desc: '双击画布上的编辑盒进入编辑模式。使用底部浮动工具栏（矩形、圆形、文字、线条），在编辑盒内自由绘制图形。',
        highlight: '#float-bar',
        tooltip: '选择工具开始绘制',
        autoNext: false
      },
      {
        id: 'duplicate-ebox',
        title: '复制编辑盒创建第二个关键帧',
        desc: '右键编辑盒选择"复制"，然后在新编辑盒中修改图形的位置、大小、颜色、角度等属性。这是你的第二个关键帧。',
        highlight: null,
        tooltip: '右键编辑盒 → 复制',
        autoNext: false
      },
      {
        id: 'connect-keyframes',
        title: '连接两个编辑盒创建动画',
        desc: '从第一个编辑盒右侧锚点拖出连线到第二个编辑盒。这条虚线表示关键帧之间的动画过渡。',
        highlight: null,
        tooltip: '👆 拖拽编辑盒锚点连线',
        autoNext: { type: 'eb-connection-created' }
      },
      {
        id: 'preview-animation',
        title: '预览你的动画作品',
        desc: '选中编辑盒，按空格键预览完整的动画。图形会在两个关键帧之间平滑地变化位置、大小、颜色和角度。',
        highlight: '#right-panel',
        tooltip: '按空格键 预览',
        autoNext: { type: 'eb-chain-playback-started' }
      },
      {
        id: 'compose',
        title: '与视频合成',
        desc: '选中编辑盒按 Enter 创建合成卡片。将合成卡片拖到视频卡片上方编组，播放时图形会叠加到视频上——完美！',
        highlight: null,
        tooltip: 'Enter 创建合成卡片',
        autoNext: false
      }
    ],
    preload(state) {
      const eb1 = {
        id: 'ebox_' + Date.now() + '_g1',
        x: 200, y: 150, width: 500, height: 350,
        camera: { zoom: 1, offsetX: 0, offsetY: 0 },
        shapes: [
          { id: 'gs1', shapeType: 'rect', left: 60, top: 80, width: 100, height: 80, fill: '#3b82f6', stroke: '#2563eb', strokeWidth: 2, opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
          { id: 'gs2', shapeType: 'ellipse', left: 200, top: 120, width: 60, height: 60, fill: '#f59e0b', stroke: '#d97706', strokeWidth: 1.5, opacity: 1, angle: 0, scaleX: 1, scaleY: 1 },
        ]
      };
      // Also add a video card for composition demo
      const videoCard = _genPlaceholderCards([
        { label: '演示视频', duration: 15, color: '#3b82f6', x: 200, y: 550 },
      ])[0];
      state.cards = [videoCard];
      state.editBoxes = [eb1];
      state.canvas.offsetX = -50;
      state.canvas.offsetY = -50;
      state.canvas.zoom = 0.8;
    }
  }
];

// ================================================================
// Placeholder generation helpers
// ================================================================

function _genThumbStrip(color, count) {
  count = count || 10;
  const c = document.createElement('canvas');
  c.width = count * 120; c.height = 68;
  const ctx = c.getContext('2d');
  for (let i = 0; i < count; i++) {
    const x = i * 120;
    // Gradient with slight variation per frame
    const hue = parseInt(color.slice(1, 3), 16);
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 120, 68);
    // Add a pattern to make it look like a video frame
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 10, 10 + Math.sin(i * 0.7) * 8, 100, 20 + Math.cos(i * 0.5) * 10);
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 15, 40, 50 + (i % 3) * 15, 3);
    ctx.fillRect(x + 15, 50, 30 + (i % 2) * 20, 3);
  }
  return c;
}

function _genWaveform(duration, width) {
  width = width || 200;
  const c = document.createElement('canvas');
  c.width = width; c.height = 28;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, width, 28);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < width; i++) {
    const t = i / width;
    // Simulated waveform with varied amplitude
    const amp = 10 * (0.3 + 0.7 * Math.abs(Math.sin(t * Math.PI * 7 + Math.sin(t * 20) * 2)));
    const y = 14;
    ctx.moveTo(i, y - amp);
    ctx.lineTo(i, y + amp);
  }
  ctx.stroke();
  return c;
}

function _genPlaceholderCards(specs) {
  return specs.map((s, idx) => {
    const duration = s.duration || 20;
    const width = Math.max(CARD_MIN_WIDTH || 80, duration * (PIXELS_PER_SECOND || 50));
    const id = 'tutorial_card_' + Date.now() + '_' + idx;
    const thumbStrip = _genThumbStrip(s.color || '#3b82f6', 10);
    const waveform = _genWaveform(duration, Math.max(80, Math.round(width * 0.8)));

    return {
      id,
      type: s.type || 'video',
      x: s.x || 0,
      y: s.y || 0,
      width,
      height: CARD_HEIGHT || 116,
      trimIn: s.trimIn || 0,
      trimOut: s.trimOut || duration,
      volume: s.type === 'audio' ? 0.8 : 1.0,
      thumbStrip,
      waveform,
      duration,
      label: s.label || '素材',
      fadeIn: 0,
      fadeOut: 0,
      markers: [],
      createdAt: Date.now() - idx * 60000,
      transformScale: 1.0,
      transformX: 0,
      transformY: 0,
      _isTutorial: true
    };
  });
}

function _genConnection(fromId, toId, fromSide, toSide, type, dur) {
  return {
    id: 'conn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    fromCardId: fromId,
    toCardId: toId,
    fromSide: fromSide || 'right',
    toSide: toSide || 'left',
    type: type || 'cut',
    duration: dur || 0.5,
    easing: 'ease-in-out'
  };
}

function _genEbConnection(fromId, toId, connId, easing, duration) {
  return {
    id: connId,
    fromEditBoxId: fromId,
    toEditBoxId: toId,
    fromSide: 'right',
    toSide: 'left',
    type: 'eb-keyframe',
    transitionDuration: duration || 1.0,
    easing: easing || 'ease-in-out'
  };
}

// ================================================================
// Tutorial Runtime
// ================================================================

let _tut = {
  lessonIdx: -1,
  stepIdx: 0,
  lesson: null,
  active: false,
  _origState: null,      // snapshot before tutorial injection
  _stepStartedAt: 0,
  _watchers: [],
  _completedSteps: new Set(),
  _cardMoveStartPos: null,
  _cardTrimStartVal: null,
  _ebChainPlayed: false,
};

function startTutorial(lessonIdx) {
  _tut.lessonIdx = lessonIdx;
  _tut.stepIdx = 0;
  _tut.active = true;
  _tut._completedSteps = new Set();
  _tut._ebChainPlayed = false;
  _tut.lesson = TUTORIAL_LESSONS[lessonIdx];
  if (!_tut.lesson) return;

  // Save current state
  _tut._origState = {
    cards: state.cards,
    connections: state.connections,
    groups: state.groups,
    shapes: state.shapes,
    editBoxes: state.editBoxes,
    compositionCards: state.compositionCards,
    markerCards: state.markerCards,
    canvas: { ...state.canvas },
  };

  // Clear and load lesson state
  stopPlayback();
  state.cards = [];
  state.connections = [];
  state.groups = [];
  state.shapes = [];
  state.editBoxes = [];
  state.compositionCards = [];
  state.markerCards = [];
  state.selection = { cardIds: [], connectionId: null, connectionIds: [], groupIds: [], shapeId: null, shapeIds: [], editBoxId: null, editBoxIds: [], markerCardId: null, markerCardIds: [] };

  _tut.lesson.preload(state);

  // Hide homepage / tutorial index / lesson detail, show editor
  hideHomepage();
  const idxEl = document.getElementById('tutorial-index');
  if (idxEl) idxEl.style.display = 'none';
  const lessonDetail = document.getElementById('tutorial-lesson-detail');
  if (lessonDetail) lessonDetail.classList.remove('visible');

  document.body.classList.add('tutorial-active');
  _showTutorialUI();
  _showStep(_tut.stepIdx);
  _installWatchers();

  _syncShapesFromState();
  if (typeof renderLayerList === 'function') renderLayerList();
  resizeCanvas();
  render();
}

function exitTutorial() {
  _tut.active = false;
  _removeWatchers();
  _hideTutorialUI();

  // Restore original state if we have it
  if (_tut._origState) {
    stopPlayback();
    state.cards = _tut._origState.cards;
    state.connections = _tut._origState.connections;
    state.groups = _tut._origState.groups;
    state.shapes = _tut._origState.shapes;
    state.editBoxes = _tut._origState.editBoxes;
    state.compositionCards = _tut._origState.compositionCards;
    state.markerCards = _tut._origState.markerCards;
    state.canvas.offsetX = _tut._origState.canvas.offsetX;
    state.canvas.offsetY = _tut._origState.canvas.offsetY;
    state.canvas.zoom = _tut._origState.canvas.zoom;
    state.selection = { cardIds: [], connectionId: null, connectionIds: [], groupIds: [], shapeId: null, shapeIds: [], editBoxId: null, editBoxIds: [], markerCardId: null, markerCardIds: [] };
    _tut._origState = null;
    _syncShapesFromState();
    if (typeof renderLayerList === 'function') renderLayerList();
    resizeCanvas();
    render();
  }

  document.body.classList.remove('tutorial-active');
  const idxEl = document.getElementById('tutorial-index');
  if (idxEl) idxEl.style.display = 'flex';
}

function nextStep() {
  if (!_tut.active || !_tut.lesson) return;
  _tut._completedSteps.add(_tut.stepIdx);
  if (_tut.stepIdx + 1 >= _tut.lesson.steps.length) {
    _showCompletion();
    return;
  }
  _tut.stepIdx++;
  _showStep(_tut.stepIdx);
}

function prevStep() {
  if (!_tut.active || _tut.stepIdx <= 0) return;
  _tut.stepIdx--;
  _showStep(_tut.stepIdx);
}

// ================================================================
// UI management
// ================================================================

function _showTutorialUI() {
  // Create overlay elements if they don't exist
  if (!document.getElementById('tutorial-dim')) {
    const dim = document.createElement('div');
    dim.id = 'tutorial-dim';
    document.body.appendChild(dim);
  }
  if (!document.getElementById('tutorial-highlight')) {
    const hl = document.createElement('div');
    hl.id = 'tutorial-highlight';
    document.body.appendChild(hl);
  }
  if (!document.getElementById('tutorial-step-card')) {
    const card = document.createElement('div');
    card.id = 'tutorial-step-card';
    card.innerHTML = `
      <div class="step-header">
        <span class="step-badge" id="step-badge-text"></span>
        <span class="step-title" id="step-title-text"></span>
        <span style="flex:1"></span>
        <div class="step-dots" id="step-dots"></div>
      </div>
      <div class="step-desc" id="step-desc-text"></div>
      <div class="step-actions">
        <button class="btn-step secondary" id="btn-step-prev">上一步</button>
        <button class="btn-step primary" id="btn-step-next">下一步</button>
      </div>
    `;
    document.body.appendChild(card);
    document.getElementById('btn-step-next').addEventListener('click', nextStep);
    document.getElementById('btn-step-prev').addEventListener('click', prevStep);
  }
  if (!document.getElementById('tutorial-topbar')) {
    const bar = document.createElement('div');
    bar.id = 'tutorial-topbar';
    bar.innerHTML = `
      <span class="lesson-title" id="tut-topbar-title"></span>
      <span class="lesson-step" id="tut-topbar-step"></span>
      <span class="topbar-spacer"></span>
      <button class="btn-topbar" id="btn-tut-exit">退出教程</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('btn-tut-exit').addEventListener('click', exitTutorial);
  }
  if (!document.getElementById('tutorial-tooltip')) {
    const tt = document.createElement('div');
    tt.id = 'tutorial-tooltip';
    document.body.appendChild(tt);
  }

  document.getElementById('tutorial-step-card').style.display = 'block';
  document.getElementById('tutorial-topbar').style.display = 'flex';

  const lesson = _tut.lesson;
  document.getElementById('tut-topbar-title').textContent = lesson.title;
}

function _hideTutorialUI() {
  const dim = document.getElementById('tutorial-dim');
  const hl = document.getElementById('tutorial-highlight');
  const card = document.getElementById('tutorial-step-card');
  const bar = document.getElementById('tutorial-topbar');
  const tt = document.getElementById('tutorial-tooltip');
  const intro = document.getElementById('tutorial-intro-text');
  if (dim) dim.classList.remove('visible');
  if (hl) hl.classList.remove('visible', 'pulse');
  if (card) card.style.display = 'none';
  if (bar) bar.style.display = 'none';
  if (tt) tt.classList.remove('visible');
  if (intro) intro.remove();

  // Remove completion toast
  const toast = document.getElementById('tutorial-complete-toast');
  if (toast) toast.remove();
}

function _showStep(idx) {
  if (!_tut.lesson) return;
  const step = _tut.lesson.steps[idx];
  const totalSteps = _tut.lesson.steps.length;

  // Update step card
  document.getElementById('step-badge-text').textContent = `步骤 ${idx + 1} / ${totalSteps}`;
  document.getElementById('step-title-text').textContent = step.title;
  document.getElementById('step-desc-text').textContent = step.desc;
  document.getElementById('btn-step-prev').style.display = idx > 0 ? '' : 'none';
  document.getElementById('btn-step-next').textContent = idx + 1 >= totalSteps ? '完成' : '下一步';

  // Update topbar
  document.getElementById('tut-topbar-step').textContent = `步骤 ${idx + 1} / ${totalSteps}`;

  // Dots
  const dotsEl = document.getElementById('step-dots');
  let dotsHTML = '';
  for (let i = 0; i < totalSteps; i++) {
    let cls = 'step-dot';
    if (_tut._completedSteps.has(i)) cls += ' done';
    if (i === idx) cls += ' current';
    dotsHTML += `<span class="${cls}"></span>`;
  }
  dotsEl.innerHTML = dotsHTML;

  // Show intro text on step 0
  const intro = document.getElementById('tutorial-intro-text');
  if (idx === 0) {
    _showIntroText(step);
  } else {
    if (intro) intro.remove();
  }

  // Highlight
  _updateHighlight(step);
  _updateTooltip(step);

  _tut._stepStartedAt = Date.now();
  _tut._cardMoveStartPos = null;
  _tut._cardTrimStartVal = null;

  // Auto-next condition setup
  if (step.autoNext) {
    _setupAutoDetect(step);
  }
}

function _showIntroText(step) {
  // Remove existing intro
  const existing = document.getElementById('tutorial-intro-text');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'tutorial-intro-text';
  el.innerHTML = `
    <div class="intro-icon">${_getIntroIcon()}</div>
    <div class="intro-title">${step.title}</div>
    <div class="intro-subtitle">${step.desc}</div>
  `;
  document.body.appendChild(el);
}

function _getIntroIcon() {
  const icons = ['📦', '✂️', '🎬', '🎨'];
  return icons[_tut.lessonIdx] || '📦';
}

function _updateHighlight(step) {
  const hl = document.getElementById('tutorial-highlight');
  if (!hl) return;

  if (step.highlight) {
    const el = document.querySelector(step.highlight);
    if (el) {
      const r = el.getBoundingClientRect();
      hl.style.left = (r.left - 4) + 'px';
      hl.style.top = (r.top - 4) + 'px';
      hl.style.width = (r.width + 8) + 'px';
      hl.style.height = (r.height + 8) + 'px';
      hl.classList.add('visible', 'pulse');
    } else {
      hl.classList.remove('visible', 'pulse');
    }
  } else {
    hl.classList.remove('visible', 'pulse');
  }
}

function _updateTooltip(step) {
  const tt = document.getElementById('tutorial-tooltip');
  if (!tt) return;

  if (step.tooltip && !step.highlight) {
    tt.textContent = step.tooltip;
    tt.classList.add('visible');
    // Position in center-top area
    tt.style.left = '50%';
    tt.style.top = '120px';
    tt.style.transform = 'translateX(-50%)';
  } else if (step.tooltip && step.highlight) {
    tt.textContent = step.tooltip;
    tt.classList.add('visible');
    const el = document.querySelector(step.highlight);
    if (el) {
      const r = el.getBoundingClientRect();
      tt.style.left = (r.left + r.width / 2) + 'px';
      tt.style.top = (r.top - 44) + 'px';
      tt.style.transform = 'translateX(-50%)';
    }
  } else {
    tt.classList.remove('visible');
  }
}

// ================================================================
// Step completion auto-detection
// ================================================================

function _setupAutoDetect(step) {
  if (!step.autoNext) return;

  switch (step.autoNext.type) {
    case 'card-selected':
      _tut._watchers.push({ type: 'selection-change', stepIdx: _tut.stepIdx });
      break;
    case 'card-moved':
      _tut._cardMoveStartPos = state.cards.length > 0 ? { x: state.cards[0].x, y: state.cards[0].y } : null;
      _tut._watchers.push({ type: 'card-move', stepIdx: _tut.stepIdx, since: Date.now() });
      break;
    case 'card-trimmed':
      _tut._watchers.push({ type: 'card-trim', stepIdx: _tut.stepIdx });
      break;
    case 'connection-created':
      _tut._watchers.push({ type: 'connection-new', stepIdx: _tut.stepIdx, initialCount: state.connections.length });
      break;
    case 'playback-started':
      _tut._watchers.push({ type: 'playback-start', stepIdx: _tut.stepIdx });
      break;
    case 'ebox-selected':
      _tut._watchers.push({ type: 'ebox-select', stepIdx: _tut.stepIdx });
      break;
    case 'eb-chain-playback-started':
      _tut._watchers.push({ type: 'eb-chain-playback', stepIdx: _tut.stepIdx });
      break;
    case 'eb-connection-created':
      _tut._watchers.push({ type: 'eb-connection', stepIdx: _tut.stepIdx, initialCount: state.connections.length });
      break;
  }
}

function _installWatchers() {
  // We'll poll for completion conditions during render/event cycles
  // Using a MutationObserver-style approach via the existing event system

  // Hook into layer list rendering for auto-detection
  const origRenderLayerList = renderLayerList;
  renderLayerList = function() {
    _checkWatchers();
    return origRenderLayerList.apply(this, arguments);
  };
}

function _removeWatchers() {
  _tut._watchers = [];
}

function _checkWatchers() {
  if (!_tut.active || _tut._watchers.length === 0) return;

  for (const w of _tut._watchers) {
    if (w.stepIdx !== _tut.stepIdx) continue;
    let done = false;

    switch (w.type) {
      case 'selection-change':
        done = state.selection.cardIds.length > 0 || state.selection.editBoxId !== null || state.selection.groupIds.length > 0;
        break;
      case 'card-move':
        if (_tut._cardMoveStartPos && state.cards.length > 0) {
          const c = state.cards[0];
          done = Math.abs(c.x - _tut._cardMoveStartPos.x) > 5 || Math.abs(c.y - _tut._cardMoveStartPos.y) > 5;
        }
        break;
      case 'card-trim':
        done = _tut._cardTrimStartVal !== null && state.cards.length > 0 &&
               (state.cards[0].trimIn !== _tut._cardTrimStartVal || state.cards[0].trimOut !== _tut._cardTrimStartVal);
        break;
      case 'connection-new':
        done = state.connections.length > w.initialCount;
        break;
      case 'playback-start':
        done = state.playback.isPlaying && state.playback.playbackMode === 'linear';
        break;
      case 'ebox-select':
        done = state.selection.editBoxId !== null || state.interaction.activeEditBoxId !== null;
        break;
      case 'eb-chain-playback':
        done = state.playback.playbackMode === 'eb-chain' && state.playback.isPlaying;
        break;
      case 'eb-connection':
        done = state.connections.filter(c => c.type === 'eb-keyframe').length > w.initialCount;
        break;
    }

    if (done) {
      _tut._watchers = _tut._watchers.filter(x => x !== w);
      setTimeout(() => nextStep(), 600);
      break;
    }
  }
}

// Also hook into togglePlayback for playback detection
const _origTogglePlayback = togglePlayback;
togglePlayback = function() {
  const result = _origTogglePlayback.apply(this, arguments);
  _checkWatchers();
  return result;
};

// Hook into stopPlayback for eb-chain detection
const _origStopPlayback = stopPlayback;
stopPlayback = function() {
  // Check if eb-chain was playing before stopping
  if (_tut.active && state.playback.playbackMode === 'eb-chain' && state.playback.isPlaying) {
    _tut._ebChainPlayed = true;
  }
  const result = _origStopPlayback.apply(this, arguments);
  _checkWatchers();
  return result;
};

// ================================================================
// Completion
// ================================================================

function _showCompletion() {
  const lesson = _tut.lesson;
  const dim = document.getElementById('tutorial-dim');
  if (dim) dim.classList.add('visible');

  // Remove existing toast
  const existing = document.getElementById('tutorial-complete-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'tutorial-complete-toast';

  const isLast = _tut.lessonIdx >= TUTORIAL_LESSONS.length - 1;
  const nextLesson = !isLast ? TUTORIAL_LESSONS[_tut.lessonIdx + 1] : null;

  toast.innerHTML = `
    <div class="complete-icon">✓</div>
    <div class="complete-title">${lesson.title} — 完成!</div>
    <div class="complete-desc">${lesson.subtitle}</div>
    <div class="btn-row">
      ${nextLesson ? `<button class="btn-complete primary" id="btn-tut-next-lesson">下一课: ${nextLesson.title}</button>` : ''}
      <button class="btn-complete secondary" id="btn-tut-replay">重新学习</button>
      <button class="btn-complete secondary" id="btn-tut-index">回到首页</button>
    </div>
  `;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('visible'));

  document.getElementById('btn-tut-replay').addEventListener('click', () => {
    toast.remove();
    startTutorial(_tut.lessonIdx);
  });

  document.getElementById('btn-tut-index').addEventListener('click', () => {
    toast.remove();
    exitTutorial();
  });

  if (nextLesson) {
    document.getElementById('btn-tut-next-lesson').addEventListener('click', () => {
      toast.remove();
      startTutorial(_tut.lessonIdx + 1);
    });
  }
}

// ================================================================
// Homepage
// ================================================================

// ================================================================
// Gradient Pattern — Canvas replica of Figma gradient SVG
// ================================================================

// Each layer = a complete trapezoid (leftX, leftTopY, leftBotY, rightX, rightTopY, rightBotY)
// Values taken directly from Figma SVG paths
const GRID_LAYERS = [
  { lx: 387.667, lty: 208.111, lby: 441.111, rx: 1057.67, rty: 163.667, rby: 485.555 },
  { lx: 339.333, lty: 182.222, lby: 415.222, rx: 1009.33, rty: 143.333, rby: 454.111 },
  { lx: 291,     lty: 156.333, lby: 389.333, rx: 961,     rty: 123,     rby: 422.667 },
  { lx: 242.667, lty: 130.444, lby: 363.444, rx: 912.667, rty: 102.667, rby: 391.222 },
  { lx: 194.333, lty: 104.556, lby: 337.556, rx: 864.333, rty: 82.3335, rby: 359.778 },
  { lx: 146,     lty: 78.6667, lby: 311.667, rx: 816,     rty: 62,      rby: 328.333 },
  { lx: 97.6665, lty: 52.7776, lby: 285.778, rx: 767.667, rty: 41.6665, rby: 296.889 },
];

// Big outer trapezoid (path 1 in SVG)
const OUTER = { lx: 435.963, lty: 233.536, lby: 467.464, rx: 1105.96, rty: 183.501, rby: 517.499 };
// Left rectangle (path 2 in SVG)
const LEFT_RECT = { x: 50, y: 20, w: 671, h: 234 };

const GRAPHIC_ANIM = { offset: 0, active: false, rafId: 0 };

function drawGradientPattern(canvas, animOffset) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = rect.width || 1105;
  const H = rect.height || 516;
  // Scale factor from SVG viewBox (1092x519) to canvas display size
  const sx = W / 1092;
  const sy = H / 519;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#2B00FF';
  ctx.lineWidth = 1;

  const t = animOffset || 0; // time in ms
  // Amplitude and phase delay per layer (wave propagates top to bottom)
  const amps   = [20, 18, 16, 14, 12, 10, 8];
  const delays = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
  const speed = 0.0015; // wave speed

  function drawTrapezoid(lx, lty, lby, rx, rty, rby, waveY, amp) {
    // Opacity: waveY near -amp → high opacity, waveY near +amp → low opacity
    // Skewed: drops to low alpha quickly, stays transparent longer
    const norm = (waveY / amp + 1) / 2; // 0 (bottom) → 1 (top)
    const alpha = amp ? Math.max(0, 1 - Math.pow(norm, 0.5)) : 1;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(rx * sx, (rty + waveY) * sy);
    ctx.lineTo(lx * sx, (lty + waveY) * sy);
    ctx.lineTo(lx * sx, (lby + waveY) * sy);
    ctx.lineTo(rx * sx, (rby + waveY) * sy);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Outer trapezoid frame (with wave)
  const outerWave = 15 * Math.sin(t * speed - 0.15);
  drawTrapezoid(OUTER.lx, OUTER.lty, OUTER.lby, OUTER.rx, OUTER.rty, OUTER.rby, outerWave, 15);

  // Left rectangle (with wave + opacity)
  const rectWave = 15 * Math.sin(t * speed - 0.3);
  const rectNorm = (rectWave / 15 + 1) / 2;
  const rectAlpha = Math.max(0, 1 - Math.pow(rectNorm, 0.5));
  ctx.globalAlpha = rectAlpha;
  ctx.strokeRect(LEFT_RECT.x * sx, (LEFT_RECT.y + rectWave) * sy, LEFT_RECT.w * sx, LEFT_RECT.h * sy);
  ctx.globalAlpha = 1;

  // 7 nested trapezoids
  for (let i = 0; i < GRID_LAYERS.length; i++) {
    const L = GRID_LAYERS[i];
    const wave = amps[i] * Math.sin(t * speed + delays[i] * Math.PI * 2);
    drawTrapezoid(L.lx, L.lty, L.lby, L.rx, L.rty, L.rby, wave, amps[i]);
  }
}

let _gpCanvasEl = null;

function startGradientLoop() {
  if (GRAPHIC_ANIM.active) return;
  GRAPHIC_ANIM.active = true;
  const canvas = _gpCanvasEl;
  if (!canvas) return;

  let startT = 0;

  function tick(ts) {
    if (!GRAPHIC_ANIM.active) return;
    if (!startT) startT = ts;
    const elapsed = ts - startT;
    drawGradientPattern(canvas, elapsed);
    GRAPHIC_ANIM.rafId = requestAnimationFrame(tick);
  }
  GRAPHIC_ANIM.rafId = requestAnimationFrame(tick);
}

function stopGradientAnim() {
  if (GRAPHIC_ANIM.rafId) cancelAnimationFrame(GRAPHIC_ANIM.rafId);
  GRAPHIC_ANIM.active = false;
  GRAPHIC_ANIM.offset = 0;
  if (_gpCanvasEl) drawGradientPattern(_gpCanvasEl, 0);
}

function showHomepage() {
  _hideTutorialUI();
  document.body.classList.remove('tutorial-active');

  let hpEl = document.getElementById('homepage');
  if (!hpEl) {
    hpEl = document.createElement('div');
    hpEl.id = 'homepage';
    document.body.appendChild(hpEl);
  }

  // Background SVG (exact from Figma 首页-背景, 1280x832)
  const bgSVG = `<svg viewBox="0 0 1280 832" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="1280" height="832" fill="url(#hp-bg-grad)"/>
    <path d="M1089.5 200C1212.94 200 1313 300.064 1313 423.5C1313 546.936 1212.94 647 1089.5 647C966.064 647 866 546.936 866 423.5C866 300.064 966.064 200 1089.5 200ZM1089.3 299.767C1020.86 299.767 965.377 355.252 965.377 423.695C965.377 492.139 1020.86 547.623 1089.3 547.623C1157.75 547.623 1213.23 492.139 1213.23 423.695C1213.23 355.251 1157.75 299.767 1089.3 299.767Z" fill="#FF3156"/>
    <path d="M666.5 -99C789.936 -99 890 1.06436 890 124.5C890 247.936 789.936 348 666.5 348C543.064 348 443 247.936 443 124.5C443 1.06436 543.064 -99 666.5 -99ZM666.305 0.766602C597.861 0.766853 542.377 56.2516 542.377 124.695C542.377 193.139 597.861 248.623 666.305 248.623C734.748 248.623 790.233 193.139 790.233 124.695C790.233 56.2515 734.749 0.766602 666.305 0.766602Z" fill="#FF3156"/>
    <defs>
      <linearGradient id="hp-bg-grad" x1="640" y1="832" x2="640" y2="0" gradientUnits="userSpaceOnUse">
        <stop stop-color="#3A3A3A"/>
        <stop offset="1"/>
      </linearGradient>
    </defs>
  </svg>`;

  // Gradient pattern SVG (exact from Figma)
  // Canvas gradient pattern replaces the Figma SVG
  const gradientPatternHTML = `<canvas class="hp-gradient-pattern" id="hp-gradient-canvas"></canvas>`;

  // Start button SVG (exact from Figma 首页-教程开始按钮 - flat rectangle version)
  const startBtnSVG = `<svg class="hp-start-btn-svg" viewBox="0 0 674 337" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <path d="M673 1V336H1V1H673Z" fill="#2B00FF" stroke="black" stroke-width="2"/>
    <path d="M42.25 234.751L42.25 102.249L157.001 168.5L42.25 234.751Z" fill="black" stroke="#D4FF00" stroke-width="3"/>
    <path d="M162.84 139.28C156.333 139.28 149.773 138.853 143.16 138C136.547 137.2 130.227 136.133 124.2 134.8C118.173 133.413 112.813 131.92 108.12 130.32L115.56 117.28C124.52 120.64 133.053 122.827 141.16 123.84C149.32 124.8 157.133 125.28 164.6 125.28C170.147 125.28 174.333 125.067 177.16 124.64C179.987 124.16 181.4 123.413 181.4 122.4C181.4 121.493 180.36 120.853 178.28 120.48C176.253 120.107 173.507 119.893 170.04 119.84C166.573 119.733 162.707 119.627 158.44 119.52C154.227 119.413 149.853 119.227 145.32 118.96C140.84 118.693 136.493 118.213 132.28 117.52C128.067 116.773 124.28 115.707 120.92 114.32C117.56 112.933 114.867 111.093 112.84 108.8C110.867 106.507 109.88 103.627 109.88 100.16C109.88 96.5333 111 93.4667 113.24 90.96C115.533 88.4533 118.653 86.4533 122.6 84.96C126.547 83.4667 131.053 82.4 136.12 81.76C141.24 81.0667 146.6 80.72 152.2 80.72C157.213 80.72 162.253 80.96 167.32 81.44C172.44 81.8667 177.4 82.48 182.2 83.28C187 84.0267 191.453 84.9067 195.56 85.92C199.667 86.9333 203.187 88 206.12 89.12L198.68 102.16C194.147 100.56 189.133 99.2267 183.64 98.16C178.2 97.04 172.547 96.2133 166.68 95.68C160.813 95.0933 155 94.8 149.24 94.8C140.333 94.8 135.88 95.7333 135.88 97.6C135.88 98.4533 136.92 99.0667 139 99.44C141.08 99.8133 143.853 100.053 147.32 100.16C150.84 100.213 154.707 100.293 158.92 100.4C163.08 100.507 167.4 100.693 171.88 100.96C176.413 101.227 180.76 101.707 184.92 102.4C189.133 103.093 192.92 104.133 196.28 105.52C199.693 106.853 202.387 108.64 204.36 110.88C206.333 113.12 207.32 115.92 207.32 119.28C207.32 122.96 206.093 126.08 203.64 128.64C201.24 131.2 197.96 133.28 193.8 134.88C189.64 136.427 184.893 137.547 179.56 138.24C174.227 138.933 168.653 139.28 162.84 139.28ZM247.859 138V100.56H210.659V82H309.859V100.56H272.659V138H247.859ZM295.267 138L330.227 82H359.587L394.467 138H367.827L363.027 129.28H326.947L321.907 138H295.267ZM337.587 110.72L334.867 115.52H355.427L352.787 110.72L346.147 97.12H344.547L337.587 110.72ZM400.19 138V82H479.95C485.657 82 490.03 83.28 493.07 85.84C496.11 88.3467 497.63 91.8133 497.63 96.24C497.63 99.6533 496.59 102.427 494.51 104.56C492.43 106.693 489.177 108.16 484.75 108.96V110.56C489.603 110.987 493.257 112.373 495.71 114.72C498.163 117.013 499.39 120 499.39 123.68V138H473.47V124.48C473.47 123.52 473.177 122.747 472.59 122.16C472.003 121.573 471.203 121.28 470.19 121.28H424.99V138H400.19ZM424.99 106.08H468.59C469.603 106.08 470.403 105.76 470.99 105.12C471.577 104.48 471.87 103.627 471.87 102.56C471.87 101.387 471.55 100.507 470.91 99.92C470.27 99.3333 469.497 99.04 468.59 99.04H424.99V106.08ZM540.706 138V100.56H503.506V82H602.706V100.56H565.506V138H540.706Z" fill="white"/>
    <path d="M152.92 259.28C146.627 259.28 140.813 258.613 135.48 257.28C130.147 255.947 125.507 254.027 121.56 251.52C117.613 249.013 114.547 246 112.36 242.48C110.173 238.907 109.08 234.907 109.08 230.48V229.52C109.08 223.6 111.107 218.48 115.16 214.16C119.213 209.84 124.947 206.533 132.36 204.24C139.827 201.893 148.573 200.72 158.6 200.72C170.707 200.72 180.947 202.24 189.32 205.28C197.693 208.267 203.987 212.48 208.2 217.92L183.32 225.28C181.187 223.04 178.067 221.333 173.96 220.16C169.907 218.933 164.787 218.32 158.6 218.32C150.813 218.32 144.68 219.333 140.2 221.36C135.72 223.333 133.48 226.053 133.48 229.52V230.48C133.48 233.947 135.72 236.693 140.2 238.72C144.68 240.693 150.813 241.68 158.6 241.68C161.693 241.68 164.893 241.52 168.2 241.2C171.507 240.827 174.627 240.32 177.56 239.68C180.493 238.987 182.92 238.16 184.84 237.2H158.36V227.6H208.2V258H189L189.8 246H188.28C186.467 248.773 183.827 251.147 180.36 253.12C176.893 255.093 172.813 256.613 168.12 257.68C163.48 258.747 158.413 259.28 152.92 259.28ZM257.863 259.28C224.796 259.28 208.262 248.64 208.262 227.36V202H233.062V226.56C233.062 236.107 241.329 240.88 257.863 240.88C274.396 240.88 282.663 236.107 282.663 226.56V202H307.463V227.36C307.463 248.64 290.929 259.28 257.863 259.28ZM308.109 258V239.44H345.309V220.56H308.109V202H407.309V220.56H370.109V239.44H407.309V258H308.109ZM409.002 258V202H475.322C481.989 202 487.776 203.12 492.682 205.36C497.642 207.6 501.456 210.773 504.122 214.88C506.842 218.987 508.202 223.867 508.202 229.52V230.48C508.202 236.133 506.842 241.013 504.122 245.12C501.456 249.227 497.642 252.4 492.682 254.64C487.776 256.88 481.989 258 475.322 258H409.002ZM433.802 239.92H472.922C475.749 239.92 478.016 239.093 479.722 237.44C481.429 235.733 482.282 233.413 482.282 230.48V229.52C482.282 226.587 481.429 224.293 479.722 222.64C478.016 220.933 475.749 220.08 472.922 220.08H433.802V239.92ZM508.774 258V202H607.974V218.16H533.574V223.12H599.334V236.88H533.574V241.84H607.974V258H508.774Z" fill="white"/>
    <path d="M443.76 180L431.88 159H442.29L448.98 172.2L455.97 159H465.06L471.75 172.2L478.74 159H489.15L477.24 180H466.53L460.5 168.54L454.47 180H443.76ZM490.185 180V173.04H504.135V165.96H490.185V159H527.385V165.96H513.435V173.04H527.385V180H490.185ZM543.08 180V165.96H529.13V159H566.33V165.96H552.38V180H543.08ZM568.506 180V159H577.806V165.87H596.406V159H605.706V180H596.406V172.53H577.806V180H568.506Z" fill="white"/>
  </svg>`;

  // Time SVG (exact from Figma 首页-时间)
  const timeSVG = `<svg class="hp-time" viewBox="0 0 198 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M-5.37261e-05 23.26V0.659999H14.4999V23.26H-5.37261e-05ZM13.4999 12.48C13.4999 10.6 12.9199 9.05333 11.7599 7.84C10.6133 6.61333 8.97995 6 6.85995 6H1.43995V7.26H3.07995V17.74H1.43995V19H6.91995C8.97328 19 10.5799 18.3933 11.7399 17.18C12.9133 15.9533 13.4999 14.3867 13.4999 12.48ZM11.9399 12.5C11.9399 14.1133 11.4999 15.3933 10.6199 16.34C9.75328 17.2733 8.49328 17.74 6.83995 17.74H4.53995V7.26H6.83995C8.49328 7.26 9.75328 7.74 10.6199 8.7C11.4999 9.66 11.9399 10.9267 11.9399 12.5ZM14.0253 0.659999H26.9453V17.72H25.3653L21.1053 6H17.3853V7.28H19.4653L15.6053 17.72H14.0253V0.659999ZM20.5853 8.12L22.7053 14.08H18.3253L20.4853 8.12H20.5853ZM26.9453 23.26H14.0253V19H18.5853V17.72H16.9853L17.9053 15.22H23.1053L23.9853 17.72H22.4453V19H26.9453V23.26ZM26.4667 23.26V0.659999H38.3067V23.26H26.4667ZM36.4067 10.06L37.7067 9.96L37.3067 6H27.4667L27.0867 9.96L28.3667 10.06L28.7667 7.28H31.6467V17.72H29.4067V19H35.4067V17.72H33.1067V7.28H36.0067L36.4067 10.06ZM37.8339 23.26V0.659999H49.9939V23.26H37.8339ZM38.8739 19H48.5539L48.9339 15.32L47.6739 15.18L47.2739 17.72H41.9739V13.04H48.1139V11.76H41.9739V7.28H47.0939L47.4939 9.82L48.7739 9.68L48.3739 6H38.8739V7.28H40.5139V17.72H38.8739V19ZM59.7535 8.12C59.3535 8.12 59.0002 7.98667 58.6935 7.72C58.3869 7.44 58.2335 7.07333 58.2335 6.62C58.2335 6.16667 58.3869 5.80667 58.6935 5.54C59.0002 5.26 59.3535 5.12 59.7535 5.12C60.1535 5.12 60.5069 5.26 60.8135 5.54C61.1202 5.80667 61.2735 6.16667 61.2735 6.62C61.2735 7.07333 61.1202 7.44 60.8135 7.72C60.5069 7.98667 60.1535 8.12 59.7535 8.12ZM59.7535 17.92C59.3535 17.92 59.0002 17.7867 58.6935 17.52C58.3869 17.24 58.2335 16.8733 58.2335 16.42C58.2335 15.9533 58.3869 15.5867 58.6935 15.32C59.0002 15.04 59.3535 14.9 59.7535 14.9C60.1535 14.9 60.5069 15.04 60.8135 15.32C61.1202 15.5867 61.2735 15.9533 61.2735 16.42C61.2735 16.8733 61.1202 17.24 60.8135 17.52C60.5069 17.7867 60.1535 17.92 59.7535 17.92ZM69.5135 0.659999H79.3335V23.26H69.5135V0.659999ZM78.8135 9.42L78.6135 8.58H70.3935V12.06H71.7135V9.84H77.2535L72.4135 21.6H73.8735L78.8135 9.42ZM78.8495 23.26V0.659999H83.4695V23.26H78.8495ZM80.1895 16.84V19H82.1295V16.84H80.1895ZM82.9901 0.659999H93.6901V23.26H82.9901V0.659999ZM84.7101 9.26L84.3701 11.46L85.5301 11.6L85.8501 10.1C86.1834 9.95333 86.5501 9.84 86.9501 9.76C87.3501 9.68 87.6901 9.64 87.9701 9.64C89.5568 9.64 90.3501 10.3067 90.3501 11.64C90.3501 12.6267 89.7901 13.5933 88.6701 14.54C87.5501 15.4733 86.0434 16.58 84.1501 17.86L84.3101 19H92.4301L92.6501 16.22L91.4301 16.12L91.2501 17.72H86.0501C86.7834 17.28 87.6034 16.7533 88.5101 16.14C89.4301 15.5133 90.2234 14.8133 90.8901 14.04C91.5701 13.2533 91.9101 12.4 91.9101 11.48C91.9101 10.7467 91.6301 10.0467 91.0701 9.38C90.5234 8.71333 89.5968 8.38 88.2901 8.38C87.7034 8.38 87.0768 8.46 86.4101 8.62C85.7568 8.76667 85.1901 8.98 84.7101 9.26ZM93.2049 0.659999H105.105V23.26H93.2049V0.659999ZM103.985 13.82C103.985 12.2867 103.598 11 102.825 9.96C102.052 8.90667 100.845 8.38 99.2049 8.38C97.6049 8.38 96.3916 8.90667 95.5649 9.96C94.7516 11 94.3449 12.3067 94.3449 13.88C94.3449 15.4933 94.7449 16.7867 95.5449 17.76C96.3583 18.72 97.5516 19.2 99.1249 19.2C100.685 19.2 101.885 18.72 102.725 17.76C103.565 16.7867 103.985 15.4733 103.985 13.82ZM102.445 13.76C102.445 16.52 101.352 17.9 99.1649 17.9C98.0849 17.9 97.2716 17.54 96.7249 16.82C96.1783 16.1 95.9049 15.0867 95.9049 13.78C95.9049 12.4733 96.1716 11.4667 96.7049 10.76C97.2516 10.04 98.0783 9.68 99.1849 9.68C100.305 9.68 101.125 10.0467 101.645 10.78C102.178 11.5133 102.445 12.5067 102.445 13.76ZM104.631 23.26V0.659999H111.811V23.26H104.631ZM111.151 5.24H109.771L105.471 19H106.851L111.151 5.24ZM111.33 0.659999H123.23V23.26H111.33V0.659999ZM122.11 13.82C122.11 12.2867 121.723 11 120.95 9.96C120.177 8.90667 118.97 8.38 117.33 8.38C115.73 8.38 114.517 8.90667 113.69 9.96C112.877 11 112.47 12.3067 112.47 13.88C112.47 15.4933 112.87 16.7867 113.67 17.76C114.483 18.72 115.677 19.2 117.25 19.2C118.81 19.2 120.01 18.72 120.85 17.76C121.69 16.7867 122.11 15.4733 122.11 13.82ZM120.57 13.76C120.57 16.52 119.477 17.9 117.29 17.9C116.21 17.9 115.397 17.54 114.85 16.82C114.303 16.1 114.03 15.0867 114.03 13.78C114.03 12.4733 114.297 11.4667 114.83 10.76C115.377 10.04 116.203 9.68 117.31 9.68C118.43 9.68 119.25 10.0467 119.77 10.78C120.303 11.5133 120.57 12.5067 120.57 13.76ZM122.756 0.659999H134.656V23.26H122.756V0.659999ZM133.536 13.82C133.536 12.2867 133.149 11 132.376 9.96C131.602 8.90667 130.396 8.38 128.756 8.38C127.156 8.38 125.942 8.90667 125.116 9.96C124.302 11 123.896 12.3067 123.896 13.88C123.896 15.4933 124.296 16.7867 125.096 17.76C125.909 18.72 127.102 19.2 128.676 19.2C130.236 19.2 131.436 18.72 132.276 17.76C133.116 16.7867 133.536 15.4733 133.536 13.82ZM131.996 13.76C131.996 16.52 130.902 17.9 128.716 17.9C127.636 17.9 126.822 17.54 126.276 16.82C125.729 16.1 125.456 15.0867 125.456 13.78C125.456 12.4733 125.722 11.4667 126.256 10.76C126.802 10.04 127.629 9.68 128.736 9.68C129.856 9.68 130.676 10.0467 131.196 10.78C131.729 11.5133 131.996 12.5067 131.996 13.76ZM134.182 0.659999H139.042V23.26H134.182V0.659999ZM135.682 12.26H137.562V10.1H135.682V12.26ZM135.682 19H137.562V16.84H135.682V19ZM138.557 0.659999H149.257V23.26H138.557V0.659999ZM140.277 9.26L139.937 11.46L141.097 11.6L141.417 10.1C141.75 9.95333 142.117 9.84 142.517 9.76C142.917 9.68 143.257 9.64 143.537 9.64C145.123 9.64 145.917 10.3067 145.917 11.64C145.917 12.6267 145.357 13.5933 144.237 14.54C143.117 15.4733 141.61 16.58 139.717 17.86L139.877 19H147.997L148.217 16.22L146.997 16.12L146.817 17.72H141.617C142.35 17.28 143.17 16.7533 144.077 16.14C144.997 15.5133 145.79 14.8133 146.457 14.04C147.137 13.2533 147.477 12.4 147.477 11.48C147.477 10.7467 147.197 10.0467 146.637 9.38C146.09 8.71333 145.163 8.38 143.857 8.38C143.27 8.38 142.643 8.46 141.977 8.62C141.323 8.76667 140.757 8.98 140.277 9.26ZM148.771 0.659999H160.671V23.26H148.771V0.659999ZM159.551 13.82C159.551 12.2867 159.165 11 158.391 9.96C157.618 8.90667 156.411 8.38 154.771 8.38C153.171 8.38 151.958 8.90667 151.131 9.96C150.318 11 149.911 12.3067 149.911 13.88C149.911 15.4933 150.311 16.7867 151.111 17.76C151.925 18.72 153.118 19.2 154.691 19.2C156.251 19.2 157.451 18.72 158.291 17.76C159.131 16.7867 159.551 15.4733 159.551 13.82ZM158.011 13.76C158.011 16.52 156.918 17.9 154.731 17.9C153.651 17.9 152.838 17.54 152.291 16.82C151.745 16.1 151.471 15.0867 151.471 13.78C151.471 12.4733 151.738 11.4667 152.271 10.76C152.818 10.04 153.645 9.68 154.751 9.68C155.871 9.68 156.691 10.0467 157.211 10.78C157.745 11.5133 158.011 12.5067 158.011 13.76ZM160.197 23.26V0.659999H167.377V23.26H160.197ZM166.717 5.24H165.337L161.037 19H162.417L166.717 5.24ZM166.896 0.659999H179.816V17.72H178.236L173.976 6H170.256V7.28H172.336L168.476 17.72H166.896V0.659999ZM173.456 8.12L175.576 14.08H171.196L173.356 8.12H173.456ZM179.816 23.26H166.896V19H171.456V17.72H169.856L170.776 15.22H175.976L176.856 17.72H175.316V19H179.816V23.26ZM179.338 23.26V0.659999H197.358V23.26H179.338ZM194.678 7.28H196.378V6H193.378L188.458 16.18H188.378L183.318 6H180.338V7.28H182.038V17.72H180.398V19H184.998V17.72H183.438V9.38H183.518L187.978 18.34H188.758L193.118 9.44H193.198V17.72H191.678V19H196.298V17.72H194.678V7.28Z" fill="#2B00FF"/>
  </svg>`;

  hpEl.innerHTML = `
    <div class="hp-bg">${bgSVG}</div>
    <div class="hp-inner">
      <div class="hp-left-rect-wrap"><div class="hp-left-rect"></div></div>
      ${gradientPatternHTML}
      <div class="hp-nav">
        <button>start</button>
        <button>document</button>
        <button>society</button>
        <button>model</button>
        <button>material</button>
      </div>
      <span class="hp-badge">#测试版</span>
      <div class="hp-dot"></div>
      <div class="hp-dots1"></div>
      <div class="hp-dots2"></div>
      ${timeSVG}
      <div class="hp-logo">
        <img src="assets/logo.png" alt="Logo" style="width:100%;height:100%;object-fit:contain;" />
      </div>
      <div class="hp-english">canvas video editor</div>
    </div>
    <div class="hp-glass">
      <img src="assets/glass.png" alt="" style="width:100%;height:100%;object-fit:fill;" />
    </div>
    <div class="hp-dove">
      <img src="assets/dove-wing.png" alt="" style="width:100%;height:100%;object-fit:contain;" />
    </div>
    <div class="hp-negative"></div>
    <div class="hp-design-by-sea">DESIGN BY SEA</div>
    <div class="hp-start-btn-wrap"><div class="hp-start-btn" id="hp-start-btn">
      ${startBtnSVG}
    </div></div>
  `;

  hpEl.style.display = '';

  // Initialize gradient canvas
  _gpCanvasEl = hpEl.querySelector('#hp-gradient-canvas');
  if (_gpCanvasEl) {
    setTimeout(() => drawGradientPattern(_gpCanvasEl, 0), 50);
  }

  // Continuous wave animation
  startGradientLoop();

  // Negative rectangle follows mouse on dove hover
  const doveEl = hpEl.querySelector('.hp-dove');
  const negEl = hpEl.querySelector('.hp-negative');
  if (doveEl && negEl) {
    const negW = 512, negH = 112;
    const baseTopStr = 'calc(50vh - 222px)';
    let targetX = 600, targetY = 0, curX = 600, curY = 0;
    let rafId = null, active = false;

    negEl.style.top = baseTopStr;
    negEl.style.left = '600px';
    curY = negEl.getBoundingClientRect().top;
    targetY = curY;

    doveEl.style.pointerEvents = 'auto';

    function tick() {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      negEl.style.left = curX + 'px';
      negEl.style.top = curY + 'px';
      if (!active && Math.abs(curX - targetX) < 0.3 && Math.abs(curY - targetY) < 0.3) {
        rafId = null;
        return;
      }
      rafId = requestAnimationFrame(tick);
    }

    doveEl.addEventListener('mouseenter', () => {
      active = true;
      if (!rafId) rafId = requestAnimationFrame(tick);
    });
    doveEl.addEventListener('mousemove', (e) => {
      targetX = e.clientX - negW / 2;
      targetY = e.clientY - negH / 2;
    });
    doveEl.addEventListener('mouseleave', () => {
      active = false;
    });
  }

  // Click handler for start button
  hpEl.querySelector('#hp-start-btn').addEventListener('click', () => {
    hpEl.style.display = 'none';
    showTutorialIndex();
  });
}

function hideHomepage() {
  stopGradientAnim();
  const hpEl = document.getElementById('homepage');
  if (hpEl) hpEl.style.display = 'none';
}

// ================================================================
// Tutorial Detail Page (Figma 教程1-4)
// ================================================================

function showTutorialDetail(lessonIdx) {
  const lesson = TUTORIAL_LESSONS[lessonIdx];
  if (!lesson) return;

  // Step summaries derived from lesson steps (first 3)
  const stepSummaries = lesson.steps.slice(0, 3).map((s, i) =>
    `${i + 1}、${s.title}`
  );

  // Layer list config
  const layers = [
    { name: 'video 1', tag: 'V', tagColor: '#6541cb' },
    { name: 'video 2', tag: 'V', tagColor: '#6541cb' },
    { name: 'pattern 1', tag: 'P', tagColor: '#D4FF00' },
    { name: 'pattern 2', tag: 'P', tagColor: '#D4FF00' },
    { name: 'BGM 1', tag: 'B', tagColor: '#f35d78' },
    { name: 'circle', tag: '', tagColor: '' },
    { name: 'rectangle', tag: '', tagColor: '' },
  ];

  let overlay = document.getElementById('tutorial-lesson-detail');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tutorial-lesson-detail';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="td-inner">
      <!-- Top bar -->
      <div class="td-topbar">
        <span class="td-badge">#测试版</span>
        <span class="td-project-name">New project 1</span>
        <span class="td-top-spacer"></span>
        <span class="td-export">Export</span>
        <span class="td-zoom">100%</span>
      </div>
      <!-- Middle: left panel | center | right panel -->
      <div class="td-body">
        <div class="td-left-panel">
          <div class="td-panel-title">Layers</div>
          ${layers.map(l => `
            <div class="td-layer-item">
              ${l.tag ? `<span class="td-layer-tag" style="color:${l.tagColor}">${l.tag}</span>` : '<span class="td-layer-tag"></span>'}
              ${l.name}
            </div>
          `).join('')}
        </div>
        <div class="td-center"></div>
        <div class="td-right-panel">
          <div class="td-preview-box"></div>
          <div class="td-timecode">00:15 / 00:20</div>
          <div class="td-inspector-section">
            <div class="td-section-title">Position</div>
            <div class="td-prop-row"><span class="td-prop-label">X</span><span class="td-prop-value">1010</span></div>
            <div class="td-prop-row"><span class="td-prop-label">Y</span><span class="td-prop-value">15°</span></div>
          </div>
          <div class="td-inspector-section">
            <div class="td-section-title">Layout</div>
            <div class="td-prop-row"><span class="td-prop-label">W</span><span class="td-prop-value">20</span></div>
            <div class="td-prop-row"><span class="td-prop-label">h</span><span class="td-prop-value">10</span></div>
          </div>
          <div class="td-inspector-section">
            <div class="td-section-title">Color</div>
            <div class="td-prop-row"><span class="td-prop-label">exposure</span></div>
            <div class="td-prop-row"><span class="td-prop-label">contrast</span></div>
            <div class="td-prop-row"><span class="td-prop-label">saturation</span></div>
            <div class="td-prop-row"><span class="td-prop-label">temperat</span></div>
            <div class="td-prop-row"><span class="td-prop-label">tint</span></div>
          </div>
          <div class="td-inspector-section">
            <div class="td-section-title">Fill</div>
            <div class="td-prop-row"><span class="td-prop-value">111111</span></div>
          </div>
          <div class="td-inspector-section">
            <div class="td-section-title">Stroke</div>
          </div>
        </div>
      </div>
      <!-- Bottom: lesson info -->
      <div class="td-bottom">
        <div class="td-no">no.${lessonIdx + 1}</div>
        <div class="td-title">#${lesson.title}</div>
        <div class="td-tagline">${lesson.subtitle}</div>
        <div class="td-steps">
          ${stepSummaries.map(s => `<span>${s}</span>`).join('')}
        </div>
      </div>
      <!-- Go button -->
      <div class="td-go" id="td-go-btn">go</div>
    </div>
  `;

  overlay.classList.add('visible');

  // Click "go" to start the tutorial
  overlay.querySelector('#td-go-btn').addEventListener('click', () => {
    overlay.classList.remove('visible');
    startTutorial(lessonIdx);
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      overlay.classList.remove('visible');
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ================================================================
// Tutorial Index Page
// ================================================================

function showTutorialIndex() {
  // Hide editor UI areas
  _tut.active = false;
  _hideTutorialUI();
  document.body.classList.remove('tutorial-active');

  // Restore state if needed
  if (_tut._origState) {
    stopPlayback();
    state.cards = _tut._origState.cards;
    state.connections = _tut._origState.connections;
    state.groups = _tut._origState.groups;
    state.shapes = _tut._origState.shapes;
    state.editBoxes = _tut._origState.editBoxes;
    state.compositionCards = _tut._origState.compositionCards;
    state.markerCards = _tut._origState.markerCards;
    state.canvas.offsetX = _tut._origState.canvas.offsetX;
    state.canvas.offsetY = _tut._origState.canvas.offsetY;
    state.canvas.zoom = _tut._origState.canvas.zoom;
    state.selection = { cardIds: [], connectionId: null, connectionIds: [], groupIds: [], shapeId: null, shapeIds: [], editBoxId: null, editBoxIds: [], markerCardId: null, markerCardIds: [] };
    _tut._origState = null;
    _syncShapesFromState();
    if (typeof renderLayerList === 'function') renderLayerList();
    resizeCanvas();
    render();
  }

  let idxEl = document.getElementById('tutorial-index');
  if (!idxEl) {
    idxEl = document.createElement('div');
    idxEl.id = 'tutorial-index';
    document.body.appendChild(idxEl);
  }
  idxEl.style.display = ''; // reset from back-button hide

  // Build tutorial index using exported PNG card assets
  // Cards are full Figma exports including no.X text, ### marks, green bars
  const cardAssets = [
    { img: 'assets/card1-multi-media.png', title: '多素材整理', en: 'Media Management' },
    { img: 'assets/card2-basic-edit.png', title: '基础编辑逻辑', en: 'Basic Editing' },
    { img: 'assets/card3-keyframe.png', title: '视频关键帧', en: 'Video Keyframes' },
    { img: 'assets/card4-geometry.png', title: '几何动画', en: 'Geometry Animation' },
  ];

  const colsHTML = cardAssets.map((card, i) => `
    <div class="index-col" data-lesson="${i}">
      <img class="col-img" src="${card.img}" alt="" draggable="false" />
      <div class="col-shimmer"></div>
      <div class="col-overlay">
        <div class="col-green-dim"></div>
        <span class="col-title">${card.title}</span>
        <span class="col-subtitle">${card.en}</span>
      </div>
    </div>
  `).join('');

  // Each STEP text layer as a separate SVG <img> to avoid CSS text rendering ghosting.
  // Wave animation applied on the <img> element level.
  const makeStepImg = (fontSize, opacity, x, klass) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1314" height="895" viewBox="0 0 1314 895">
      <text x="${x}" y="0" font-size="${fontSize}" font-weight="700" font-family="Inter,SF Pro Display,system-ui,sans-serif" fill="#ffffff" fill-opacity="${opacity}" text-anchor="start" dominant-baseline="hanging">STEP：</text>
    </svg>`;
    return `<img class="index-bg-img ${klass}" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="" draggable="false" />`;
  };

  idxEl.innerHTML = `
    ${makeStepImg(300, 1, 0, 'bg-step-1')}
    ${makeStepImg(240, 0.6, 0, 'bg-step-2')}
    ${makeStepImg(180, 0.2, 15, 'bg-step-3')}
    <span class="index-badge">#测试版</span>
    <div class="index-columns">${colsHTML}</div>
    <div class="index-bottom"></div>
    <div class="index-back" id="index-back-btn">
      <svg viewBox="0 0 39 29" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 8.66016L15 17.3204V-9.82285e-05L0 8.66016ZM13.5 8.66016V10.1602H28.1096V8.66016V7.16016H13.5V8.66016ZM28.1096 26.6602V25.1602H0V26.6602V28.1602H28.1096V26.6602ZM37.1096 17.6602H35.6096C35.6096 21.8023 32.2517 25.1602 28.1096 25.1602V26.6602V28.1602C33.9086 28.1602 38.6096 23.4591 38.6096 17.6602H37.1096ZM28.1096 8.66016V10.1602C32.2517 10.1602 35.6096 13.518 35.6096 17.6602H37.1096H38.6096C38.6096 11.8612 33.9086 7.16016 28.1096 7.16016V8.66016Z" fill="white"/>
      </svg>
    </div>
  `;

  // Back button — go to homepage
  idxEl.querySelector('#index-back-btn').addEventListener('click', () => {
    idxEl.style.display = 'none';
    const lessonDetail = document.getElementById('tutorial-lesson-detail');
    if (lessonDetail) lessonDetail.classList.remove('visible');
    showHomepage();
  });

  // Bind click events
  idxEl.querySelectorAll('.index-col').forEach(col => {
    col.addEventListener('click', () => {
      const idx = parseInt(col.dataset.lesson);
      showTutorialDetail(idx);
    });
  });
}

// ================================================================
// Init
// ================================================================

// Pre-populate demo cards on load
window.addEventListener('DOMContentLoaded', () => {
  const cards = _genPlaceholderCards([
    { label: '航拍素材', duration: 20, color: '#3b82f6', x: 80, y: 80 },
    { label: '采访片段', duration: 35, color: '#f59e0b', x: 80, y: 240 },
    { label: '产品特写', duration: 15, color: '#10b981', x: 80, y: 400 },
    { label: '空镜过渡', duration: 25, color: '#8b5cf6', x: 80, y: 560 },
    { label: '背景音乐', duration: 60, color: '#ec4899', x: 80, y: 720, type: 'audio' },
  ]);
  state.cards = cards;
  state.canvas.offsetX = 0;
  state.canvas.offsetY = 0;
  state.canvas.zoom = 0.8;
  if (typeof renderLayerList === 'function') renderLayerList();
  resizeCanvas();
  render();
});

console.log('[TUTORIAL] Tutorial engine loaded. 4 lessons ready.');
