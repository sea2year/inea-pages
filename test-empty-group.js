/**
 * Empty Group 自动化测试 v3 — DIAG 日志追踪
 * events.js 中已添加 [DIAG-TOP], [DIAG-BLOCK], [DIAG-EMPTY] 日志
 * 此测试只做最小触发，关键信息看 DIAG 输出
 */
function runEmptyGroupTest() {
  const info = (msg, obj) => console.log(`  🔍 ${msg}`, obj || '');

  console.log('%c═══ Empty Group 测试 v3 — 检查 DIAG 日志 ═══', 'font-weight:bold');

  if (!state || !canvasWrap || !setDrawingTool) {
    console.log('%c  ❌ 前置条件缺失', 'color:red');
    return;
  }

  const groupsBefore = state.groups.length;
  setDrawingTool('empty-group');
  info(`drawingTool = "${state.drawingTool}"`);

  const canvasRect = canvas.getBoundingClientRect();
  const startSX = 200, startSY = 150, endSX = 500, endSY = 400;
  const startCX = canvasRect.left + startSX;
  const startCY = canvasRect.top + startSY;
  const endCX = canvasRect.left + endSX;
  const endCY = canvasRect.top + endSY;

  // ---- mousedown on canvasWrap (handler 在 canvasWrap) ----
  console.log('%c--- 派发 mousedown 到 canvasWrap ---', 'color:orange');
  const mdEvent = new MouseEvent('mousedown', {
    clientX: startCX, clientY: startCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  canvasWrap.dispatchEvent(mdEvent);
  info(`mode = "${state.interaction.mode}" (期望: drawing-empty-group)`);
  info(`_emptyGroupStart =`, state.interaction._emptyGroupStart);

  if (state.interaction.mode !== 'drawing-empty-group') {
    console.log('%c  ❌ 进入 drawing-empty-group 模式失败', 'color:red');
    setDrawingTool('select');
    return;
  }
  console.log('%c  ✅ 进入 drawing-empty-group 模式', 'color:green');

  // ---- 派发 mousemove 到 window ----
  console.log('%c--- 派发 mousemove 到 window (检查 DIAG 日志) ---', 'color:orange');
  state.interaction._emptyGroupCurrent = { x: startSX, y: startSY };

  const mmEvent = new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  window.dispatchEvent(mmEvent);

  info(`_emptyGroupCurrent 检查:`, state.interaction._emptyGroupCurrent);
  if (state.interaction._emptyGroupCurrent && state.interaction._emptyGroupCurrent.x !== startSX) {
    console.log('%c  ✅ _emptyGroupCurrent 已更新 (程序化 dispatch 有效)', 'color:green');
  } else {
    console.log('%c  ❌ _emptyGroupCurrent 未更新 (值仍为:', 'color:red', JSON.stringify(state.interaction._emptyGroupCurrent) + ')');
    console.log('  👉 请检查上面的 [DIAG-*] 日志:');
    console.log('     - 看到 [DIAG-TOP] = handler 入口被触发');
    console.log('     - 看到 [DIAG-BLOCK] = 被 _isForwarding 或 Fabric 拦截');
    console.log('     - 看到 [DIAG-EMPTY] = 成功到达 empty-group 更新代码');
  }

  // ---- mouseup ----
  console.log('%c--- 派发 mouseup 到 window ---', 'color:orange');
  const muEvent = new MouseEvent('mouseup', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 0, bubbles: true, cancelable: true
  });
  window.dispatchEvent(muEvent);

  const groupsAfter = state.groups.length;
  info(`groups: ${groupsBefore} → ${groupsAfter}`);
  if (groupsAfter > groupsBefore) {
    console.log('%c  ✅ group 已创建', 'color:green');
  } else {
    console.log('%c  ❌ group 未创建', 'color:red');
  }

  // 保持 empty-group 模式让用户手动尝试
  setDrawingTool('empty-group');
  console.log('%c--- 现在请在画布上手动拖拽，观察 DIAG 日志 ---', 'color:cyan;font-weight:bold');
  console.log('手动拖拽时控制台应出现 [DIAG-TOP] → [DIAG-EMPTY] 或 [DIAG-BLOCK]');
}

setTimeout(runEmptyGroupTest, 2000);
