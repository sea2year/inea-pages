/**
 * Empty Group 自动化测试 — 页面加载后自动运行
 */
function runEmptyGroupTest() {
  const log = (msg, obj) => obj ? console.log(`  ${msg}`, obj) : console.log(`  ${msg}`);
  const pass = (msg) => console.log(`%c  ✅ ${msg}`, 'color:green');
  const fail = (msg) => console.log(`%c  ❌ ${msg}`, 'color:red;font-weight:bold');
  const start = performance.now();

  console.log('%c╔══════════════════════════════════════╗', 'font-weight:bold');
  console.log('%c║   Empty Group 自动化测试            ║', 'font-weight:bold');
  console.log('%c╚══════════════════════════════════════╝', 'font-weight:bold');

  // ============================================
  // 1. 前置检查
  // ============================================
  console.log('1. 前置检查');
  let ok = true;

  if (typeof state !== 'undefined' && state) {
    pass('state 存在');
  } else { fail('state 不存在'); ok = false; }

  if (state && Array.isArray(state.groups)) {
    pass(`state.groups 是数组 (${state.groups.length} 个组)`);
  } else { fail('state.groups 不是数组'); ok = false; }

  if (typeof canvasWrap !== 'undefined' && canvasWrap) {
    pass(`canvasWrap 存在 (${canvasWrap.clientWidth}x${canvasWrap.clientHeight})`);
  } else { fail('canvasWrap 不存在'); ok = false; }

  if (typeof canvas !== 'undefined' && canvas) {
    pass(`canvas 存在 (${canvas.width}x${canvas.height})`);
  } else { fail('canvas 不存在'); ok = false; }

  if (canvas && canvas.width > 0 && canvas.height > 0) {
    pass(`canvas 有有效尺寸`);
  } else { fail(`canvas 尺寸为零 (${canvas?.width}x${canvas?.height})`); ok = false; }

  if (typeof setDrawingTool === 'function') {
    pass('setDrawingTool 函数存在');
  } else { fail('setDrawingTool 不是函数'); ok = false; }

  if (typeof screenToWorld === 'function') {
    pass('screenToWorld 函数存在');
  } else { fail('screenToWorld 不是函数'); ok = false; }

  if (typeof render === 'function') {
    pass('render 函数存在');
  } else { fail('render 不是函数'); ok = false; }

  const btn = document.querySelector('.float-btn[data-tool="empty-group"]');
  if (btn) {
    pass('float-bar 空组按钮存在');
  } else { fail('float-bar 空组按钮不存在'); ok = false; }

  if (!ok) {
    console.log('\n前置检查失败，中止测试。');
    return;
  }

  // ============================================
  // 2. 测试 setDrawingTool
  // ============================================
  console.log('\n2. setDrawingTool("empty-group")');
  const initTool = state.drawingTool;
  const initMode = state.interaction.mode;
  const groupsBefore = state.groups.length;

  try {
    setDrawingTool('empty-group');
  } catch (e) {
    fail(`setDrawingTool 抛出异常: ${e.message}`);
    console.error(e);
    return;
  }

  if (state.drawingTool === 'empty-group') {
    pass('drawingTool 已设为 empty-group');
  } else {
    fail(`drawingTool = "${state.drawingTool}" 而非 "empty-group"`);
  }

  if (canvasWrap.classList.contains('shape-drawing')) {
    pass('shape-drawing class 已添加');
  } else {
    fail('shape-drawing class 未添加');
  }

  const activeBtn = document.querySelector('.float-btn.active-tool');
  if (activeBtn && activeBtn.dataset.tool === 'empty-group') {
    pass('按钮高亮正确');
  } else {
    fail(`高亮按钮是 "${activeBtn?.dataset?.tool}" 而非 "empty-group"`);
    // 打印所有 float btn 的数据
    document.querySelectorAll('.float-btn[data-tool]').forEach(b => {
      log(`按钮: data-tool="${b.dataset.tool}" active="${b.classList.contains('active-tool')}"`);
    });
  }

  // ============================================
  // 3. 模拟画布拖拽
  // ============================================
  console.log('\n3. 模拟画布拖拽 (200,150) → (500,400)');

  const canvasRect = canvas.getBoundingClientRect();
  log(`canvas.getBoundingClientRect() =`, { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height });

  const startSX = 200, startSY = 150;
  const endSX = 500, endSY = 400;
  const startCX = canvasRect.left + startSX;
  const startCY = canvasRect.top + startSY;
  const endCX = canvasRect.left + endSX;
  const endCY = canvasRect.top + endSY;

  // --- mousedown ---
  log('dispatch mousedown on canvas...');
  const mdEvent = new MouseEvent('mousedown', {
    clientX: startCX, clientY: startCY,
    button: 0, buttons: 1,
    bubbles: true, cancelable: true
  });
  try {
    canvas.dispatchEvent(mdEvent);
  } catch (e) {
    fail(`mousedown 异常: ${e.message}`);
    console.error(e);
  }

  log(`mode 后 = "${state.interaction.mode}"`);
  if (state.interaction.mode === 'drawing-empty-group') {
    pass('mode 正确置为 drawing-empty-group');
  } else {
    fail(`mode 是 "${state.interaction.mode}" 而非 "drawing-empty-group"`);
    log(`drawingTool = "${state.drawingTool}"`);
    log(`_emptyGroupStart =`, state.interaction._emptyGroupStart);
  }

  const startPos = state.interaction._emptyGroupStart;
  if (startPos) {
    pass(`_emptyGroupStart 已设置 (${startPos.x}, ${startPos.y})`);
  } else {
    fail('_emptyGroupStart 为 null');
  }

  // --- mousemove ---
  log('dispatch mousemove on window...');
  const mmEvent = new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1,
    bubbles: true, cancelable: true
  });
  try {
    window.dispatchEvent(mmEvent);
  } catch (e) {
    fail(`mousemove 异常: ${e.message}`);
    console.error(e);
  }

  const curPos = state.interaction._emptyGroupCurrent;
  if (curPos) {
    pass(`_emptyGroupCurrent 已更新 (${curPos.x}, ${curPos.y})`);
  } else {
    fail('_emptyGroupCurrent 为 null');
  }

  // --- mouseup ---
  log('dispatch mouseup on window...');
  const muEvent = new MouseEvent('mouseup', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 0,
    bubbles: true, cancelable: true
  });
  try {
    window.dispatchEvent(muEvent);
  } catch (e) {
    fail(`mouseup 异常: ${e.message}`);
    console.error(e);
  }

  log(`mode 后 = "${state.interaction.mode}"`);

  // ============================================
  // 4. 结果验证
  // ============================================
  console.log('\n4. 结果验证');
  const groupsAfter = state.groups.length;

  if (groupsAfter > groupsBefore) {
    pass(`groups 数量: ${groupsBefore} → ${groupsAfter} (新增 ${groupsAfter - groupsBefore} 个)`);
    const newGroup = state.groups[state.groups.length - 1];
    console.log('  新 group:', JSON.stringify(newGroup, null, 2));

    if (newGroup.cardIds.length === 0) pass('cardIds 为空（空组）');
    else fail(`cardIds 不为空: ${newGroup.cardIds}`);

    if (newGroup.sizingMode === 'fixed') pass('sizingMode = fixed');
    else fail(`sizingMode = "${newGroup.sizingMode}"`);

    if (newGroup.width > 0 && newGroup.height > 0) pass(`尺寸有效: ${newGroup.width}x${newGroup.height}`);
    else fail(`尺寸无效: ${newGroup.width}x${newGroup.height}`);

    if (state.drawingTool === 'select') pass('工具已切回 select');
    else fail(`工具仍是 "${state.drawingTool}"`);

    if (state.interaction.mode === 'idle') pass('interaction mode 已重置为 idle');
    else fail(`mode 仍是 "${state.interaction.mode}"`);

    // 清理测试数据
    state.groups.pop();
    console.log('\n✅ 全部测试通过！已清理测试数据。');
  } else {
    fail(`groups 数量未变化: ${groupsBefore} → ${groupsAfter}`);

    // 诊断信息
    console.log('\n--- 诊断信息 ---');
    log('drawingTool:', state.drawingTool);
    log('interaction.mode:', state.interaction.mode);
    log('_emptyGroupStart:', state.interaction._emptyGroupStart);
    log('_emptyGroupCurrent:', state.interaction._emptyGroupCurrent);
    log('_isForwarding:', typeof _isForwarding !== 'undefined' ? _isForwarding : 'undefined');
    log('_fabricForwarding:', state.interaction._fabricForwarding);

    // 额外：测试直接调用（绕过 DOM 事件）
    console.log('\n--- 直接调用测试 ---');
    const worldStart = screenToWorld(startSX, startSY);
    const worldEnd = screenToWorld(endSX, endSY);
    log(`screenToWorld(${startSX},${startSY}) = (${worldStart.x}, ${worldStart.y})`);
    log(`screenToWorld(${endSX},${endSY}) = (${worldEnd.x}, ${worldEnd.y})`);

    // 直接模拟整个流程
    log('直接走流程...');
    state.drawingTool = 'empty-group';
    state.interaction.mode = 'drawing-empty-group';
    state.interaction._emptyGroupStart = { x: worldStart.x, y: worldStart.y };
    state.interaction._emptyGroupCurrent = { x: worldEnd.x, y: worldEnd.y };

    const s = state.interaction._emptyGroupStart;
    const c = state.interaction._emptyGroupCurrent;
    const rx = Math.min(s.x, c.x), ry = Math.min(s.y, c.y);
    const rw = Math.abs(c.x - s.x), rh = Math.abs(c.y - s.y);
    log(`计算: rx=${rx} ry=${ry} rw=${rw} rh=${rh}`);

    if (rw > 10 && rh > 10) {
      const id = 'test_group_' + Date.now();
      state.groups.push({
        id, name: 'Test Group',
        cardIds: [], collapsed: false,
        sizingMode: 'fixed',
        x: rx, y: ry,
        width: rw, height: rh
      });
      pass('直接调用可创建 group');

      // 检查 renderGroup 是否能渲染
      setDrawingTool('select');
      render();
      log('已调用 render()，检查组在画布上是否可见（紫色矩形）');

      state.groups.pop();
    } else {
      fail(`尺寸太小: rw=${rw} rh=${rh} (需 >10 才能创建)`);
      log('这可能是坐标计算出错导致的');
    }
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`\n⏱ 测试耗时: ${elapsed}ms`);
}

// 等待页面初始化完成后自动运行
setTimeout(runEmptyGroupTest, 2000);
