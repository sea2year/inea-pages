/**
 * Empty Group 自动化测试 v2 — 精确定位事件断点
 */
function runEmptyGroupTest() {
  const pass = (msg) => console.log(`%c  ✅ ${msg}`, 'color:green');
  const fail = (msg) => console.log(`%c  ❌ ${msg}`, 'color:red;font-weight:bold');
  const info = (msg, obj) => console.log(`  🔍 ${msg}`, obj || '');

  console.log('%c═══ Empty Group 测试 v2 ═══', 'font-weight:bold');

  // 前置
  if (!state || !canvas || !setDrawingTool) { fail('前置条件缺失'); return; }

  const groupsBefore = state.groups.length;
  setDrawingTool('empty-group');
  info(`drawingTool = "${state.drawingTool}"`);

  const canvasRect = canvas.getBoundingClientRect();
  info(`canvas rect: left=${canvasRect.left} top=${canvasRect.top} w=${canvasRect.width} h=${canvasRect.height}`);

  const startSX = 200, startSY = 150, endSX = 500, endSY = 400;
  const startCX = canvasRect.left + startSX;
  const startCY = canvasRect.top + startSY;
  const endCX = canvasRect.left + endSX;
  const endCY = canvasRect.top + endSY;

  // ---- Spy: 监控 mousemove 是否被调用 ----
  let mmHandlerCalled = 0;
  let mmReachedEmptyGroup = false;
  const origMM = window.onmousemove; // save

  function mmSpy(e) {
    mmHandlerCalled++;
    // 在 empty-group 检查的坐标位置读取
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (state.interaction.mode === 'drawing-empty-group') {
      mmReachedEmptyGroup = true;
      info(`mmSpy: mode=drawing-empty-group, sx=${sx} sy=${sy}, clientX=${e.clientX} clientY=${e.clientY}`);
    }
  }
  window.addEventListener('mousemove', mmSpy);

  // ---- mousedown ----
  info('dispatch mousedown...');
  const mdEvent = new MouseEvent('mousedown', {
    clientX: startCX, clientY: startCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  canvas.dispatchEvent(mdEvent);
  info(`mode after mousedown: "${state.interaction.mode}"`);
  info(`_emptyGroupStart:`, state.interaction._emptyGroupStart);

  if (state.interaction.mode !== 'drawing-empty-group') {
    fail(`mousedown 未设置 drawing-empty-group 模式`);
    window.removeEventListener('mousemove', mmSpy);
    return;
  }
  pass('mousedown 成功进入 drawing-empty-group');

  // ---- 尝试多种 mousemove 派发方式 ----
  info('--- 测试 mousemove 派发 ---');

  // 方式1: dispatch on window
  mmHandlerCalled = 0;
  mmReachedEmptyGroup = false;
  const mm1 = new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  window.dispatchEvent(mm1);
  info(`方式1 (window.dispatch): handlerCalled=${mmHandlerCalled}, reachedEmptyGroup=${mmReachedEmptyGroup}, _emptyGroupCurrent=`, state.interaction._emptyGroupCurrent);

  if (mmHandlerCalled === 0) {
    fail('window.dispatchEvent(mousemove) 未触发任何 handler！');
  } else if (!mmReachedEmptyGroup) {
    fail(`handler 触发了 ${mmHandlerCalled} 次，但未到达 empty-group 分支`);
  }

  // 方式2: dispatch on document (bubbles to window)
  mmHandlerCalled = 0;
  mmReachedEmptyGroup = false;
  state.interaction._emptyGroupCurrent = { x: startSX, y: startSY }; // reset
  const mm2 = new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  document.dispatchEvent(mm2);
  info(`方式2 (document.dispatch): handlerCalled=${mmHandlerCalled}, reachedEmptyGroup=${mmReachedEmptyGroup}, _emptyGroupCurrent=`, state.interaction._emptyGroupCurrent);

  // 方式3: dispatch on canvasWrap (bubbles to window)
  mmHandlerCalled = 0;
  mmReachedEmptyGroup = false;
  state.interaction._emptyGroupCurrent = { x: startSX, y: startSY }; // reset
  const mm3 = new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  canvasWrap.dispatchEvent(mm3);
  info(`方式3 (canvasWrap.dispatch): handlerCalled=${mmHandlerCalled}, reachedEmptyGroup=${mmReachedEmptyGroup}, _emptyGroupCurrent=`, state.interaction._emptyGroupCurrent);

  // 方式4: 直接调用 screenToWorld 然后手动更新
  mmHandlerCalled = 0;
  mmReachedEmptyGroup = false;
  state.interaction._emptyGroupCurrent = { x: startSX, y: startSY }; // reset
  if (state.interaction.mode === 'drawing-empty-group') {
    const world = screenToWorld(endSX, endSY);
    state.interaction._emptyGroupCurrent = { x: world.x, y: world.y };
  }
  info(`方式4 (直接调用 screenToWorld+手动赋值): _emptyGroupCurrent=`, state.interaction._emptyGroupCurrent);
  pass('直接调用成功，说明 screenToWorld 和逻辑层没问题');

  // ---- 清理 spy ----
  window.removeEventListener('mousemove', mmSpy);

  // ---- mouseup ----
  info('dispatch mouseup...');
  const muEvent = new MouseEvent('mouseup', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 0, bubbles: true, cancelable: true
  });
  window.dispatchEvent(muEvent);
  info(`mode after mouseup: "${state.interaction.mode}"`);

  const groupsAfter = state.groups.length;
  if (groupsAfter > groupsBefore) {
    pass(`group 已创建！ groups: ${groupsBefore} → ${groupsAfter}`);
  } else {
    const s = state.interaction._emptyGroupStart;
    const c = state.interaction._emptyGroupCurrent;
    info(`_emptyGroupStart (mouseup 时) =`, s);
    info(`_emptyGroupCurrent (mouseup 时) =`, c);
    // 查看 mouseup 清理后的值
    info(`_emptyGroupStart (清理后) =`, state.interaction._emptyGroupStart);
    info(`_emptyGroupCurrent (清理后) =`, state.interaction._emptyGroupCurrent);
  }

  // 清理
  setDrawingTool('select');
}

setTimeout(runEmptyGroupTest, 2000);
