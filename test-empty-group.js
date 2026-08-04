/**
 * Empty Group 自动化测试 v4 — 验证修复后功能正常
 */
function runEmptyGroupTest() {
  const pass = (msg) => console.log(`%c  ✅ ${msg}`, 'color:green');
  const fail = (msg) => console.log(`%c  ❌ ${msg}`, 'color:red;font-weight:bold');
  const info = (msg, obj) => console.log(`  🔍 ${msg}`, obj || '');

  console.log('%c═══ Empty Group 测试 v4 ═══', 'font-weight:bold');

  if (!state || !canvasWrap || !setDrawingTool) { fail('前置条件缺失'); return; }

  const groupsBefore = state.groups.length;
  setDrawingTool('empty-group');

  // ---- mousedown ----
  const canvasRect = canvas.getBoundingClientRect();
  const startCX = canvasRect.left + 200, startCY = canvasRect.top + 150;
  const mdEvent = new MouseEvent('mousedown', {
    clientX: startCX, clientY: startCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  });
  canvasWrap.dispatchEvent(mdEvent);

  if (state.interaction.mode !== 'drawing-empty-group') {
    fail('mousedown 未进入 drawing-empty-group'); setDrawingTool('select'); return;
  }
  pass('进入 drawing-empty-group');

  // ---- mousemove ----
  const endCX = canvasRect.left + 500, endCY = canvasRect.top + 400;
  window.dispatchEvent(new MouseEvent('mousemove', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 1, bubbles: true, cancelable: true
  }));

  const startPos = state.interaction._emptyGroupStart;
  const currentPos = state.interaction._emptyGroupCurrent;
  const moved = currentPos && startPos &&
    (currentPos.x !== startPos.x || currentPos.y !== startPos.y);
  info('_emptyGroupStart =', startPos);
  info('_emptyGroupCurrent =', currentPos);
  if (moved) {
    pass('mousemove 更新了 _emptyGroupCurrent');
  } else {
    fail('mousemove 未更新 _emptyGroupCurrent');
  }

  // ---- mouseup ----
  window.dispatchEvent(new MouseEvent('mouseup', {
    clientX: endCX, clientY: endCY,
    button: 0, buttons: 0, bubbles: true, cancelable: true
  }));

  if (state.groups.length > groupsBefore) {
    pass(`group 已创建！groups: ${groupsBefore} → ${state.groups.length}`);
  } else {
    fail('group 未创建');
  }

  setDrawingTool('select');
  console.log('%c--- 测试完成，请手动拖拽验证 ---', 'color:cyan');
}

setTimeout(runEmptyGroupTest, 2000);
