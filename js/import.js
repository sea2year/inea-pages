// ================================================================
// Auto-arrange: sort by shooting time, 4 per row
// ================================================================
function autoArrange() {
  const startX = 100;
  const startY = 100;
  const colGap = 60;

  // Separate cards by type
  const videos = state.cards.filter(c => c.type === 'video').sort((a, b) => a.createdAt - b.createdAt);
  const images = state.cards.filter(c => c.type === 'image').sort((a, b) => a.createdAt - b.createdAt);
  const audios = state.cards.filter(c => c.type === 'audio').sort((a, b) => a.createdAt - b.createdAt);

  // Arrange videos in rows of 4
  let row = 0, col = 0;
  for (const card of videos) {
    let x = startX;
    for (let i = 0; i < col; i++) {
      x += getCardWidth(videos[row * CARDS_PER_ROW + i]) + colGap;
    }
    card.x = x;
    card.y = startY + row * CARD_HEIGHT * ROW_GAP_RATIO;
    col++;
    if (col >= CARDS_PER_ROW) { col = 0; row++; }
  }

  // Arrange audio cards in their own row(s) below videos
  const audioRows = audios.length > 0 ? Math.ceil(audios.length / CARDS_PER_ROW) : 0;
  const audioStartY = startY + (videos.length > 0 ? (row + 1) : 0) * CARD_HEIGHT * ROW_GAP_RATIO + 40;
  let aCol = 0, aRow = 0;
  for (const card of audios) {
    let x = startX;
    for (let i = 0; i < aCol; i++) {
      x += getCardWidth(audios[aRow * CARDS_PER_ROW + i]) + colGap;
    }
    card.x = x;
    card.y = audioStartY + aRow * CARD_HEIGHT * ROW_GAP_RATIO;
    aCol++;
    if (aCol >= CARDS_PER_ROW) { aCol = 0; aRow++; }
  }

  // Arrange image cards in their own row(s) below audio
  // Image cards have varying heights, so use the tallest in each row
  const imageStartY = audioStartY + (audioRows > 0 ? (aRow + 1) : 0) * CARD_HEIGHT * ROW_GAP_RATIO + 40;
  let iCol = 0, iRow = 0, iRowMaxH = 0, iY = imageStartY;
  for (const card of images) {
    let x = startX;
    for (let j = 0; j < iCol; j++) {
      x += getCardWidth(images[iRow * CARDS_PER_ROW + j]) + colGap;
    }
    card.x = x;
    card.y = iY;
    const ch = (card.height && card.height > 0) ? card.height : (CARD_THUMB_HEIGHT + CARD_LABEL_HEIGHT);
    if (ch > iRowMaxH) iRowMaxH = ch;
    iCol++;
    if (iCol >= CARDS_PER_ROW) {
      iCol = 0; iRow++;
      iY += iRowMaxH + 20;
      iRowMaxH = 0;
    }
  }
}

function navigateToCards(cardsToShow) {
  const cards = cardsToShow || state.cards;
  if (cards.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const card of cards) {
    const cw = getCardWidth(card);
    if (card.x < minX) minX = card.x;
    if (card.y < minY) minY = card.y;
    const ch = (card.type === 'image') ? (card.height || CARD_HEIGHT) : CARD_HEIGHT;
    if (card.x + cw > maxX) maxX = card.x + cw;
    if (card.y + ch > maxY) maxY = card.y + ch;
  }

  const worldCX = (minX + maxX) / 2;
  const worldCY = (minY + maxY) / 2;

  const dpr = window.devicePixelRatio || 1;
  const screenW = canvas.width / dpr;
  const screenH = canvas.height / dpr;

  // Keep current zoom, just pan to center on the cards
  state.canvas.offsetX = screenW / 2 - worldCX * state.canvas.zoom;
  state.canvas.offsetY = screenH / 2 - worldCY * state.canvas.zoom;
}

// ================================================================
// Import: Thumbnail generation
// ================================================================
async function generateThumbnails(file) {
  let video = null;
  let url = null;

  try {
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';
    video.style.position = 'fixed';
    video.style.top = '-9999px';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    document.body.appendChild(video);

    url = URL.createObjectURL(file);
    video.src = url;

    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', reject, { once: true });
    });

    const duration = video.duration;
    if (!duration || duration <= 0) {
      return { strip: null, duration: 0 };
    }

    // Wait until browser has enough data to seek and render frames
    if (video.readyState < 2) {
      await new Promise(resolve => {
        video.addEventListener('canplay', resolve, { once: true });
      });
    }

    const count = Math.min(THUMBNAIL_COUNT, Math.max(3, Math.floor(duration / 2)));
    const frameW = 240;
    const frameH = 136;

    // Single strip canvas: all thumbnails composited side-by-side
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = frameW * count;
    stripCanvas.height = frameH;
    const stripCtx = stripCanvas.getContext('2d');

    // Dark background so blank areas don't show as white
    stripCtx.fillStyle = '#3a3a3a';
    stripCtx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

    // Avoid first/last 5% — often black frames or fade-in/out
    const startPct = 0.05;
    const endPct = 0.95;
    const usableDur = duration * (endPct - startPct);

    for (let i = 0; i < count; i++) {
      const seekTime = duration * startPct + (usableDur / (count - 1 || 1)) * i;
      video.currentTime = seekTime;

      await new Promise((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          // Wait two rAF cycles so the browser decodes + paints the video frame
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        };
        const onError = (e) => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          reject(e);
        };
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
      });

      // Draw frame directly onto the strip
      stripCtx.drawImage(video, i * frameW, 0, frameW, frameH);
    }

    return { strip: stripCanvas, frameW, frameH, count, duration };
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (video && video.parentNode) document.body.removeChild(video);
  }
}

// ================================================================
// Import: Waveform generation
// ================================================================
async function generateWaveform(file, samples = WAVEFORM_SAMPLES) {
  // Strategy:
  // 1. Try FileReader + decodeAudioData (different code path from file.arrayBuffer())
  // 2. If that fails, try fetch(blobUrl) + decodeAudioData
  // 3. If still failing, try audio-element playback capture

  const blobUrl = URL.createObjectURL(file);

  let audioCtx = null;
  try {
    // -- Attempt 1: FileReader + decodeAudioData --
    const arrayBuf = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });

    audioCtx = new AudioContext();
    const buffer = await audioCtx.decodeAudioData(arrayBuf);
    const data = buffer.getChannelData(0);
    const peaks = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const start = Math.floor(i * data.length / samples);
      const end = Math.floor((i + 1) * data.length / samples);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }
    return peaks;
  } catch (e1) {
    // Attempt 1 failed — close old context, try fetch-based approach
    if (audioCtx) {
      try { await audioCtx.close(); } catch (_) {}
      audioCtx = null;
    }

    try {
      const response = await fetch(blobUrl);
      const arrayBuf = await response.arrayBuffer();

      audioCtx = new AudioContext();
      const buffer = await audioCtx.decodeAudioData(arrayBuf);
      const data = buffer.getChannelData(0);
      const peaks = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        const start = Math.floor(i * data.length / samples);
        const end = Math.floor((i + 1) * data.length / samples);
        let max = 0;
        for (let j = start; j < end; j++) {
          const abs = Math.abs(data[j]);
          if (abs > max) max = abs;
        }
        peaks[i] = max;
      }
      return peaks;
    } catch (e2) {
      console.warn('Waveform: decodeAudioData failed for this video format, using empty waveform', { e1: e1.message, e2: e2.message });
    }
    return new Float32Array(samples);
  } finally {
    if (audioCtx) {
      try { await audioCtx.close(); } catch (_) {}
    }
    URL.revokeObjectURL(blobUrl);
  }
}

// ================================================================
// Import: Extract creation time from file
// ================================================================
function extractCreationDate(file) {
  // Use file.lastModified as the primary source
  // In a real app, we'd parse EXIF from the video container,
  // but browser APIs don't expose this. lastModified is a good proxy.
  const dateStr = file.lastModified;

  // Try to parse date from filename (common patterns: IMG_20240101, VID_20240101_120000)
  const nameMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
  if (nameMatch) {
    const [_, y, m, d] = nameMatch;
    const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return dateStr;
}

// ================================================================
// Import: Process video file
// ================================================================
async function importVideoFile(file) {
  const id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const createdAt = extractCreationDate(file);
  const label = file.name.replace(/\.[^.]+$/, ''); // strip extension

  // Create card placeholder immediately
  const card = {
    id,
    type: 'video',
    file,
    fileURL: URL.createObjectURL(file),
    x: 0, y: 0,
    width: 0,
    height: CARD_HEIGHT,
    trimIn: 0,
    trimOut: 0,
    volume: 1.0,
    thumbStrip: null,   // single ImageBitmap: all frames composited horizontally
    waveform: null,
    duration: 0,
    label,
    fadeIn: 0,
    fadeOut: 0,
    markers: [],
    createdAt,
    transformScale: 1.0,
    transformX: 0,
    transformY: 0
  };

  state.cards.push(card);
  autoArrange();
  render();

  // Generate thumbnails (always needed for duration + visual)
  try {
    const thumbResult = await generateThumbnails(file);
    card.thumbStrip = thumbResult.strip;
    card.duration = thumbResult.duration;
    card.trimOut = thumbResult.duration;
  } catch (e) {
    console.error('Thumbnail generation failed', file.name, e);
  }

  // Generate waveform (best-effort, won't block rendering)
  try {
    card.waveform = await generateWaveform(file);
  } catch (e) {
    console.warn('Waveform generation failed', file.name, e);
  }

  // Always re-arrange and render, even if thumbnail/waveform failed
  autoArrange();
  navigateToCards();
  render();
}

// ================================================================
// Import: Process audio file
// ================================================================
async function importAudioFile(file) {
  const id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const createdAt = extractCreationDate(file);
  const label = file.name.replace(/\.[^.]+$/, '');

  const card = {
    id,
    type: 'audio',
    file,
    fileURL: URL.createObjectURL(file),
    x: 0, y: 0,
    width: 0,
    height: CARD_HEIGHT,
    trimIn: 0,
    trimOut: 0,
    volume: 0.8,
    thumbStrip: null,
    waveform: null,
    duration: 0,
    label,
    fadeIn: 0,
    fadeOut: 0,
    markers: [],
    createdAt,
    transformScale: 1.0,
    transformX: 0,
    transformY: 0
  };

  state.cards.push(card);
  autoArrange();
  render();

  let audioCtx = null;
  try {
    // For audio, get duration + waveform via AudioContext
    audioCtx = new AudioContext();
    const buffer = await audioCtx.decodeAudioData(await file.arrayBuffer());
    card.duration = buffer.duration;
    card.trimOut = buffer.duration;

    const peaks = new Float32Array(WAVEFORM_SAMPLES);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
      const start = Math.floor(i * data.length / WAVEFORM_SAMPLES);
      const end = Math.floor((i + 1) * data.length / WAVEFORM_SAMPLES);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(data[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = max;
    }
    card.waveform = peaks;

    autoArrange();
    navigateToCards();
    render();
  } catch (e) {
    console.error('Failed to process audio', file.name, e);
  } finally {
    if (audioCtx) {
      try { await audioCtx.close(); } catch (_) {}
    }
  }
}

// ================================================================
// Import: Process image file
// ================================================================
async function importImageFile(file) {
  const id = 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const createdAt = extractCreationDate(file);
  const label = file.name.replace(/\.[^.]+$/, '');

  // Create card placeholder immediately
  const card = {
    id,
    type: 'image',
    file,
    fileURL: URL.createObjectURL(file),
    x: 0, y: 0,
    width: 0,            // will be set based on aspect ratio
    height: 0,           // will be set based on aspect ratio
    _imgWidth: 0,
    _imgHeight: 0,
    trimIn: 0,
    trimOut: 5,          // default 5-second still
    volume: 1.0,
    thumbStrip: null,
    waveform: null,
    duration: 5,         // default still duration
    label,
    fadeIn: 0,
    fadeOut: 0,
    markers: [],
    createdAt,
    transformScale: 1.0,
    transformX: 0,
    transformY: 0,
    _imageDataURL: null  // cached for convert-to-still-video
  };

  state.cards.push(card);
  autoArrange();
  render();

  // Load the image and generate the display canvas
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = card.fileURL;
    });

    // Display at a reasonable size, keeping aspect ratio
    const maxDisplayH = 150;
    const maxDisplayW = 300;
    let dw = img.width, dh = img.height;
    if (dh > maxDisplayH) {
      const s = maxDisplayH / dh;
      dw = Math.round(dw * s);
      dh = maxDisplayH;
    }
    if (dw > maxDisplayW) {
      const s = maxDisplayW / dw;
      dw = Math.round(dw * s);
      dh = Math.round(dh * s);
    }
    card.width = dw;
    card.height = dh;
    card._imgWidth = img.width;
    card._imgHeight = img.height;

    // Draw full image onto a canvas for display
    const dispCanvas = document.createElement('canvas');
    dispCanvas.width = dw;
    dispCanvas.height = dh;
    const sctx = dispCanvas.getContext('2d');
    sctx.drawImage(img, 0, 0, dw, dh);
    card.thumbStrip = dispCanvas;

    // Cache the original for convert-to-still-video
    card._imageDataURL = img.src;
  } catch (e) {
    console.error('Image import failed', file.name, e);
  }

  autoArrange();
  navigateToCards();
  render();
}

// ================================================================
// Import: Batch import
// ================================================================
async function importFiles(files) {
  const fileArr = [...files];
  const videoFiles = fileArr.filter(f => f.type.startsWith('video/'));
  const audioFiles = fileArr.filter(f => f.type.startsWith('audio/'));
  const imageFiles = fileArr.filter(f => f.type.startsWith('image/'));

  if (videoFiles.length === 0 && audioFiles.length === 0 && imageFiles.length === 0) return;

  pushUndo();
  if (statusHint) statusHint.textContent = `导入中...`;

  const promises = [
    ...videoFiles.map(f => importVideoFile(f)),
    ...audioFiles.map(f => importAudioFile(f)),
    ...imageFiles.map(f => importImageFile(f))
  ];
  await Promise.all(promises);

  if (statusHint) statusHint.textContent = `共 ${state.cards.length} 个素材`;
}

// ================================================================
// Replace Card Content
// ================================================================
function replaceCardContent(card) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = card.type === 'video' ? 'video/*' : card.type === 'audio' ? 'audio/*' : 'image/*';
  input.addEventListener('change', async () => {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    pushUndo();
    const oldFileURL = card.fileURL;
    card.file = file;
    card.fileURL = URL.createObjectURL(file);
    card.label = file.name.replace(/\.[^.]+$/, '');
    card.trimIn = 0;
    card.thumbStrip = null;
    card.waveform = null;
    card.duration = 0;
    card.trimOut = 0;
    render();

    // Regenerate thumbnails and waveform
    let audioCtx = null;
    if (card.type === 'audio') {
      try {
        audioCtx = new AudioContext();
        const buffer = await audioCtx.decodeAudioData(await file.arrayBuffer());
        card.duration = buffer.duration;
        card.trimOut = buffer.duration;
        const peaks = new Float32Array(WAVEFORM_SAMPLES);
        const data = buffer.getChannelData(0);
        const step = data.length / WAVEFORM_SAMPLES;
        for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
          let max = 0;
          const start = Math.floor(i * step);
          const end = Math.floor((i + 1) * step);
          for (let j = start; j < end; j++) max = Math.max(max, Math.abs(data[j] || 0));
          peaks[i] = max;
        }
        card.waveform = peaks;
      } catch (err) {
        console.error('Audio processing failed', err);
      } finally {
        if (audioCtx) {
          try { await audioCtx.close(); } catch (_) {}
        }
      }
    } else if (card.type === 'image') {
      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = card.fileURL;
        });
        const maxDisplayH = 150, maxDisplayW = 300;
        let dw = img.width, dh = img.height;
        if (dh > maxDisplayH) { const s = maxDisplayH / dh; dw = Math.round(dw * s); dh = maxDisplayH; }
        if (dw > maxDisplayW) { const s = maxDisplayW / dw; dw = Math.round(dw * s); dh = Math.round(dh * s); }
        card.width = dw;
        card.height = dh;
        card._imgWidth = img.width;
        card._imgHeight = img.height;
        const dispCanvas = document.createElement('canvas');
        dispCanvas.width = dw;
        dispCanvas.height = dh;
        const sctx = dispCanvas.getContext('2d');
        sctx.drawImage(img, 0, 0, dw, dh);
        card.thumbStrip = dispCanvas;
        card._imageDataURL = img.src;
        card.duration = 5;
        card.trimOut = 5;
      } catch (err) {
        console.error('Image replacement failed', err);
      }
    } else {
      try {
        const thumbResult = await generateThumbnails(file);
        card.thumbStrip = thumbResult.strip;
        card.duration = thumbResult.duration;
        card.trimOut = thumbResult.duration;
      } catch (err) {
        console.error('Thumbnail generation failed', err);
      }
      // Waveform (best-effort, won't block rendering)
      try {
        card.waveform = await generateWaveform(file);
      } catch (err) {
        console.warn('Waveform generation failed', err);
      }
    }
    render();
    // Revoke old URL after a short delay
    setTimeout(() => { if (oldFileURL) URL.revokeObjectURL(oldFileURL); }, 1000);
  });
  input.click();
}

// ================================================================
// Convert Image Card to Still Video Card
// ================================================================
async function convertImageToStillVideo(card) {
  if (statusHint) statusHint.textContent = '转换中...';

  try {
    const dur = card.duration || card.trimOut || 5;
    let imgSrc = card._imageDataURL;

    // If no cached dataURL, try the file/thumbStrip
    if (!imgSrc && card.fileURL) {
      imgSrc = card.fileURL;
    }
    if (!imgSrc && card.thumbStrip) {
      imgSrc = card.thumbStrip.toDataURL();
    }
    if (!imgSrc) {
      console.error('No image source available for conversion');
      if (statusHint) statusHint.textContent = '转换失败：找不到图片';
      return;
    }

    // Load the full-resolution image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imgSrc;
    });

    // Create a canvas at reasonable resolution (max 1920x1080)
    const maxW = 1920, maxH = 1080;
    let vidW = img.width, vidH = img.height;
    if (vidW > maxW || vidH > maxH) {
      const s = Math.min(maxW / vidW, maxH / vidH);
      vidW = Math.round(vidW * s);
      vidH = Math.round(vidH * s);
    }

    const vidCanvas = document.createElement('canvas');
    vidCanvas.width = vidW;
    vidCanvas.height = vidH;
    const vctx = vidCanvas.getContext('2d');

    // Keep redrawing the canvas to feed the stream (MediaRecorder needs continuous frames)
    let recording = true;
    function drawFrame() {
      if (!recording) return;
      vctx.drawImage(img, 0, 0, vidW, vidH);
      requestAnimationFrame(drawFrame);
    }
    drawFrame();

    // Record a short video — MediaRecorder is real-time, so keep it brief
    // The actual playback duration is set via card metadata, video just needs valid frames
    const stream = vidCanvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

    const recordMs = 500; // Record just 0.5s — enough valid frames, way faster than full duration
    await new Promise((resolve) => {
      rec.onstop = () => {
        recording = false;
        resolve();
      };
      rec.start();
      setTimeout(() => rec.stop(), recordMs);
    });

    const videoBlob = new Blob(chunks, { type: mimeType });
    const videoURL = URL.createObjectURL(videoBlob);

    // Revoke old URLs
    if (card.fileURL) URL.revokeObjectURL(card.fileURL);
    card.file = new File([videoBlob], card.label + '.webm', { type: mimeType });
    card.fileURL = videoURL;

    // Update card type
    const oldWidth = card.width;
    card.type = 'video';
    card.duration = dur;
    card.trimIn = 0;
    card.trimOut = dur;
    card.width = dur * PIXELS_PER_SECOND;
    card.height = CARD_HEIGHT;
    card.isFreezeFrame = true;
    card.frameImage = img;
    card.frameImageDataURL = imgSrc;

    // Generate thumbnail strip directly from image (MediaRecorder WebM doesn't seek well)
    card.thumbStrip = null;
    try {
      const thumbW = 120, thumbH = CARD_THUMB_HEIGHT;
      const stripCanvas = document.createElement('canvas');
      const frameCount = Math.min(THUMBNAIL_COUNT, Math.max(3, Math.floor(dur / 2)));
      stripCanvas.width = thumbW * frameCount;
      stripCanvas.height = thumbH;
      const sctx = stripCanvas.getContext('2d');
      sctx.fillStyle = '#3a3a3a';
      sctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
      for (let i = 0; i < frameCount; i++) {
        sctx.drawImage(img, i * thumbW, 0, thumbW, thumbH);
      }
      card.thumbStrip = stripCanvas;
    } catch (e) {
      console.warn('Thumbnail generation from image failed', e);
    }

    // Clean up
    delete card._imageDataURL;
    delete card._imgWidth;
    delete card._imgHeight;

    if (statusHint) statusHint.textContent = '转换完成';
    render();
  } catch (e) {
    console.error('Image to still video conversion failed', e);
    if (statusHint) statusHint.textContent = '转换失败';
  }
}

