
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

/* ===== Lieblingsbild.de V3 Bildberater ===== */

const STANDARD_FORMATS = [
  [15,15],[15,20],[15,21],[18,18],[18,24],[18,27],
  [20,20],[20,25],[20,28],[20,30],[24,30],[25,38],
  [28,35],[30,30],[30,38],[30,40],[30,42],[30,45],[30,50]
].map(([w,h]) => ({ w, h, type:'pearl' }));

const imageInput = document.getElementById('imageInput');
const chooseImageBtn = document.getElementById('chooseImageBtn');
const changeImageBtn = document.getElementById('changeImageBtn');
const dropzone = document.getElementById('dropzone');
const analysisCard = document.getElementById('analysisCard');
const cropCard = document.getElementById('cropCard');
const sourcePreview = document.getElementById('sourcePreview');
const cropImage = document.getElementById('cropImage');
const cropPreview = document.getElementById('cropPreview');
const imageFacts = document.getElementById('imageFacts');
const recommendationsEl = document.getElementById('recommendations');
const allSizesEl = document.getElementById('allSizes');
const allSizesBtn = document.getElementById('allSizesBtn');
const panoramaHint = document.getElementById('panoramaHint');
const orientationChoices = document.getElementById('orientationChoices');
const selectedFormatLabel = document.getElementById('selectedFormatLabel');
const selectedFormatText = document.getElementById('selectedFormatText');
const cropTitle = document.getElementById('cropTitle');
const cropQuality = document.getElementById('cropQuality');
const continueBtn = document.getElementById('continueBtn');

let currentImage = null;
let currentObjectUrl = null;
let selectedRecommendation = null;   // the format chosen in step 1
let selectedFormat = null;           // actual orientation variant used for crop
let selectedOrientation = 'original';
let dragState = null;
let cropPosition = { x:50, y:50 };

const CM_PER_INCH = 2.54;
const MIN_PPI_OK = 180;
const PPI_EXCELLENT = 240;
const MAX_RECOMMENDED_CROP = 0.42; // do not actively recommend extreme crops

function orientationLabel(w, h) {
  const r = w / h;
  if (r > 1.12) return 'Querformat';
  if (r < 0.89) return 'Hochformat';
  return 'Nahezu quadratisch';
}

function cropLossForRatio(imgRatio, targetRatio) {
  if (Math.abs(imgRatio - targetRatio) < 0.0001) return 0;
  if (imgRatio > targetRatio) {
    return 1 - (targetRatio / imgRatio); // width cropped
  }
  return 1 - (imgRatio / targetRatio); // height cropped
}

/*
  Effective print resolution AFTER cropping.
  This is more accurate than using all source pixels because pixels outside
  the selected crop do not contribute to the final print.
*/
function effectivePpiAfterCrop(pxW, pxH, cmW, cmH) {
  const targetRatio = cmW / cmH;
  const sourceRatio = pxW / pxH;
  let usedPxW = pxW;
  let usedPxH = pxH;

  if (sourceRatio > targetRatio) {
    usedPxW = pxH * targetRatio;
  } else if (sourceRatio < targetRatio) {
    usedPxH = pxW / targetRatio;
  }

  const inchW = cmW / CM_PER_INCH;
  const inchH = cmH / CM_PER_INCH;
  return Math.min(usedPxW / inchW, usedPxH / inchH);
}

function qualityInfo(ppi) {
  if (ppi >= PPI_EXCELLENT) return { label:'Sehr gut', cls:'quality-excellent' };
  if (ppi >= MIN_PPI_OK) return { label:'Gut', cls:'quality-good' };
  return { label:'Zu gering', cls:'quality-low' };
}

function fitOrientationVariants(format, imgRatio) {
  const a = { ...format, ratio: format.w / format.h };
  if (format.w === format.h) return [a];
  const b = { ...format, w: format.h, h: format.w, ratio: format.h / format.w };
  return [a,b].sort((x,y) => Math.abs(x.ratio-imgRatio)-Math.abs(y.ratio-imgRatio));
}

function labelFormat(f) {
  const w = String(f.w).replace('.', ',');
  const h = String(f.h).replace('.', ',');
  return `${w} × ${h} cm`;
}

function candidateScore(f, img) {
  const imgRatio = img.width / img.height;
  const loss = cropLossForRatio(imgRatio, f.ratio);
  const ppi = effectivePpiAfterCrop(img.width, img.height, f.w, f.h);
  const ratioPenalty = loss * 120;
  const resolutionPenalty = ppi >= PPI_EXCELLENT ? 0 :
                            ppi >= MIN_PPI_OK ? (PPI_EXCELLENT - ppi) / 8 :
                            22 + (MIN_PPI_OK - ppi) / 3.5;
  const area = f.w * f.h;
  const sizeBonus = Math.min(13, area / 115);
  return 100 - ratioPenalty - resolutionPenalty + sizeBonus;
}

function buildCandidates(img) {
  const imgRatio = img.width / img.height;
  const seen = new Set();
  const list = [];

  STANDARD_FORMATS.forEach(base => {
    fitOrientationVariants(base, imgRatio).forEach(f => {
      const key = `${f.w}x${f.h}`;
      if (seen.has(key)) return;
      seen.add(key);

      const ratio = f.w / f.h;
      const loss = cropLossForRatio(imgRatio, ratio);
      const ppi = effectivePpiAfterCrop(img.width, img.height, f.w, f.h);
      list.push({
        ...f,
        ratio,
        loss,
        ppi,
        score: candidateScore({ ...f, ratio }, img)
      });
    });
  });

  // Custom panorama: 20 cm high, width derived from source ratio, max 121 cm.
  if (imgRatio >= 1.8) {
    const panoW = Math.min(121, Math.max(36, Math.round((20 * imgRatio) * 10) / 10));
    const pano = {
      w: panoW,
      h: 20,
      type:'panorama',
      ratio:panoW/20,
      loss:cropLossForRatio(imgRatio, panoW/20),
      ppi:effectivePpiAfterCrop(img.width, img.height, panoW, 20)
    };
    pano.score = candidateScore(pano, img) + 14;
    list.push(pano);
  }

  return list.sort((a,b) => b.score - a.score);
}

function recommendationReason(f) {
  const cropPct = Math.round(f.loss * 100);
  const q = qualityInfo(f.ppi);
  if (f.type === 'panorama') {
    return cropPct <= 4
      ? 'Passt sehr natürlich zu deinem breiten Motiv.'
      : `Panorama mit ca. ${cropPct}% Beschnitt.`;
  }
  if (cropPct <= 2 && q.label === 'Sehr gut') return 'Nahezu ohne Beschnitt und mit sehr guter Bildqualität.';
  if (cropPct <= 7) return `Sehr passender Bildausschnitt · ca. ${cropPct}% Beschnitt.`;
  return `Guter Gesamteindruck · ca. ${cropPct}% Beschnitt.`;
}

function makeFormatButton(f, index, container) {
  const q = qualityInfo(f.ppi);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `format-option ${index === 0 && container === recommendationsEl ? 'optimal' : ''}`;
  btn.dataset.key = `${f.type}-${f.w}-${f.h}`;

  btn.innerHTML = `
    <span class="format-main">
      <strong>${labelFormat(f)}</strong>
      <small>${recommendationReason(f)}</small>
    </span>
    <span class="quality-badge ${q.cls}">${q.label}</span>
  `;

  btn.addEventListener('click', () => selectRecommendation(f, btn));
  return btn;
}

function renderAnalysis(img) {
  const candidates = buildCandidates(img);
  const recommended = candidates
    .filter(f => f.ppi >= MIN_PPI_OK && f.loss <= MAX_RECOMMENDED_CROP)
    .slice(0,3);
  const fallback = recommended.length ? recommended : candidates.slice(0,3);

  recommendationsEl.innerHTML = '';
  allSizesEl.innerHTML = '';

  fallback.forEach((f,i) => recommendationsEl.appendChild(makeFormatButton(f,i,recommendationsEl)));

  candidates.forEach((f,i) => {
    const isTop = fallback.some(x => x.type===f.type && x.w===f.w && x.h===f.h);
    if (!isTop) allSizesEl.appendChild(makeFormatButton(f,i,allSizesEl));
  });

  const ratio = img.width / img.height;
  if (ratio >= 1.8) {
    const pano = candidates.find(f => f.type === 'panorama');
    if (pano) {
      panoramaHint.classList.remove('is-hidden');
      panoramaHint.innerHTML = `<strong>Panorama-Tipp:</strong> Dein Bild ist besonders breit. ${labelFormat(pano)} nutzt das Motiv sehr gut aus.`;
    }
  } else {
    panoramaHint.classList.add('is-hidden');
    panoramaHint.innerHTML = '';
  }

  imageFacts.innerHTML = `
    <div class="fact"><small>Ausrichtung</small><strong>${orientationLabel(img.width,img.height)}</strong></div>
    <div class="fact"><small>Auflösung</small><strong>${img.width.toLocaleString('de-DE')} × ${img.height.toLocaleString('de-DE')} px</strong></div>
    <div class="fact"><small>Seitenverhältnis</small><strong>${ratio.toFixed(2).replace('.', ',')} : 1</strong></div>
    <div class="fact"><small>Empfehlungen</small><strong>${fallback.length} passende Formate</strong></div>
  `;

  const firstButton = recommendationsEl.querySelector('.format-option');
  if (fallback[0] && firstButton) selectRecommendation(fallback[0], firstButton);

  analysisCard.classList.remove('is-hidden');
  analysisCard.scrollIntoView({ behavior:'smooth', block:'start' });
}

function selectRecommendation(f, button) {
  selectedRecommendation = f;
  document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));
  if (button) button.classList.add('selected');

  renderOrientationChoices(f);
  cropCard.classList.remove('is-hidden');
  cropCard.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function baseDimensions(f) {
  return {
    short: Math.min(f.w, f.h),
    long: Math.max(f.w, f.h)
  };
}

function makeOrientationVariant(kind, recommendation) {
  if (!currentImage || !recommendation) return null;

  // Panorama remains panorama; rotating it would no longer be the same product logic.
  if (recommendation.type === 'panorama') {
    const ppi = effectivePpiAfterCrop(
      currentImage.width, currentImage.height,
      recommendation.w, recommendation.h
    );
    return {
      ...recommendation,
      kind:'original',
      ppi,
      loss:cropLossForRatio(currentImage.width/currentImage.height, recommendation.w/recommendation.h)
    };
  }

  const {short, long} = baseDimensions(recommendation);
  let w, h;

  if (kind === 'portrait') {
    w = short; h = long;
  } else if (kind === 'landscape') {
    w = long; h = short;
  } else {
    // "Original" means the physical orientation closest to the source image.
    const srcLandscape = currentImage.width >= currentImage.height;
    if (short === long) {
      w = short; h = long;
    } else if (srcLandscape) {
      w = long; h = short;
    } else {
      w = short; h = long;
    }
  }

  const ratio = w/h;
  const loss = cropLossForRatio(currentImage.width/currentImage.height, ratio);
  const ppi = effectivePpiAfterCrop(currentImage.width,currentImage.height,w,h);

  return {
    ...recommendation,
    w,h,ratio,loss,ppi,kind
  };
}

function orientationEligibility(v) {
  if (!v) return {ok:false, reason:'Nicht verfügbar'};
  const q = qualityInfo(v.ppi);
  const cropPct = Math.round(v.loss*100);

  if (v.ppi < MIN_PPI_OK) {
    return {ok:false, reason:`Auflösung zu gering · ${Math.round(v.ppi)} ppi`, quality:q};
  }
  if (v.loss > MAX_RECOMMENDED_CROP) {
    return {ok:false, reason:`Zu starker Beschnitt · ca. ${cropPct}%`, quality:q};
  }
  return {
    ok:true,
    reason:`${q.label} · ${Math.round(v.ppi)} ppi · ${cropPct <= 1 ? 'kaum Beschnitt' : `ca. ${cropPct}% Beschnitt`}`,
    quality:q
  };
}

function orientationIcon(kind) {
  if (kind === 'portrait') return '<span class="shape-icon shape-portrait"></span>';
  if (kind === 'landscape') return '<span class="shape-icon shape-landscape"></span>';
  return '<span class="shape-icon shape-original"></span>';
}

function orientationName(kind) {
  if (kind === 'portrait') return 'Hochformat';
  if (kind === 'landscape') return 'Querformat';
  return 'Original';
}

function renderOrientationChoices(recommendation) {
  orientationChoices.innerHTML = '';

  if (recommendation.type === 'panorama') {
    const v = makeOrientationVariant('original', recommendation);
    const info = orientationEligibility(v);
    const btn = makeOrientationButton(v, 'original', info, true);
    orientationChoices.appendChild(btn);
    applyOrientation(v, btn);
    return;
  }

  const kinds = ['original','portrait','landscape'];
  const variants = kinds.map(k => ({kind:k, variant:makeOrientationVariant(k,recommendation)}));

  // Avoid duplicates (e.g. original already equals portrait or landscape).
  const seen = new Set();
  const filtered = variants.filter(({variant,kind}) => {
    const key = `${variant.w}x${variant.h}`;
    if (kind === 'original') {
      seen.add(key);
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Original is always the default recommendation.
  filtered.forEach(({kind,variant}, idx) => {
    const info = orientationEligibility(variant);
    const btn = makeOrientationButton(variant, kind, info, kind === 'original');
    orientationChoices.appendChild(btn);
  });

  const defaultBtn = orientationChoices.querySelector('.orientation-option:not(:disabled)');
  const originalVariant = makeOrientationVariant('original', recommendation);
  if (defaultBtn) {
    const key = defaultBtn.dataset.orientation;
    const v = makeOrientationVariant(key, recommendation);
    applyOrientation(v, defaultBtn);
  } else {
    applyOrientation(originalVariant, null);
  }
}

function makeOrientationButton(variant, kind, info, recommended=false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `orientation-option ${recommended ? 'recommended' : ''}`;
  btn.dataset.orientation = kind;
  btn.disabled = !info.ok;

  const cropPct = Math.round(variant.loss * 100);
  btn.innerHTML = `
    <span>
      <span class="orientation-shape">${orientationIcon(kind)}</span>
      <span class="orientation-name">${orientationName(kind)}</span>
    </span>
    <span>
      <span class="orientation-meta">${labelFormat(variant)}</span>
      <span class="orientation-status">${info.reason}</span>
    </span>
  `;

  btn.addEventListener('click', () => applyOrientation(variant, btn));
  return btn;
}

function applyOrientation(variant, button) {
  selectedFormat = variant;
  selectedOrientation = variant.kind || 'original';
  cropPosition = {x:50,y:50};

  document.querySelectorAll('.orientation-option').forEach(el => el.classList.remove('selected'));
  if (button) button.classList.add('selected');

  cropPreview.style.aspectRatio = `${variant.w} / ${variant.h}`;
  cropImage.style.objectPosition = '50% 50%';

  const q = qualityInfo(variant.ppi);
  const cropPct = Math.round(variant.loss * 100);
  const orientation = orientationName(selectedOrientation);

  selectedFormatLabel.textContent = `${labelFormat(variant)} · ${orientation}`;
  selectedFormatText.textContent =
    `${q.label}e effektive Bildqualität nach dem Ausschnitt bei etwa ${Math.round(variant.ppi)} ppi. ` +
    (cropPct <= 1 ? 'Nahezu ohne Beschnitt.' : `Voraussichtlicher Beschnitt: ca. ${cropPct}%.`);

  cropQuality.textContent =
    `Vorschau · ${orientation} · ${Math.round(variant.ppi)} effektive ppi · ` +
    `${cropPct <= 1 ? 'nahezu ohne Beschnitt' : `ca. ${cropPct}% Beschnitt`}`;

  cropTitle.textContent = `${labelFormat(variant)} – ${orientation} prüfen`;
}

function handleFile(file) {
  if (!file) return;
  const accepted = ['image/jpeg','image/png','image/webp'];
  if (!accepted.includes(file.type)) {
    showUploadError('Bitte verwende für den Test ein JPEG-, PNG- oder WebP-Bild.');
    return;
  }

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  const img = new Image();
  img.onload = () => {
    currentImage = {
      width: img.naturalWidth,
      height: img.naturalHeight,
      src: currentObjectUrl,
      name: file.name
    };
    sourcePreview.src = currentObjectUrl;
    cropImage.src = currentObjectUrl;
    dropzone.classList.add('is-hidden');
    renderAnalysis(currentImage);
  };
  img.onerror = () => showUploadError('Das Bild konnte nicht gelesen werden.');
  img.src = currentObjectUrl;
}

function showUploadError(message) {
  let box = dropzone.querySelector('.error-message');
  if (!box) {
    box = document.createElement('div');
    box.className = 'error-message';
    dropzone.appendChild(box);
  }
  box.textContent = message;
}

chooseImageBtn?.addEventListener('click', () => imageInput?.click());
changeImageBtn?.addEventListener('click', () => imageInput?.click());
imageInput?.addEventListener('change', e => handleFile(e.target.files?.[0]));

dropzone?.addEventListener('dragover', e => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone?.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
  if (files.length) handleFile(files[0]);
});

allSizesBtn?.addEventListener('click', () => {
  const nowHidden = allSizesEl.classList.toggle('is-hidden');
  allSizesBtn.textContent = nowHidden ? 'Alle Größen anzeigen' : 'Weniger Größen anzeigen';
});

// Drag the image inside the crop window by adjusting object-position.
function pointerDown(e) {
  if (!selectedFormat) return;
  dragState = {
    id: e.pointerId,
    startX:e.clientX,
    startY:e.clientY,
    posX:cropPosition.x,
    posY:cropPosition.y
  };
  cropPreview.setPointerCapture?.(e.pointerId);
  cropPreview.classList.add('dragging');
}
function pointerMove(e) {
  if (!dragState || dragState.id !== e.pointerId) return;
  const rect = cropPreview.getBoundingClientRect();
  const dx = (e.clientX - dragState.startX) / rect.width * 100;
  const dy = (e.clientY - dragState.startY) / rect.height * 100;
  cropPosition.x = Math.max(0, Math.min(100, dragState.posX - dx));
  cropPosition.y = Math.max(0, Math.min(100, dragState.posY - dy));
  cropImage.style.objectPosition = `${cropPosition.x}% ${cropPosition.y}%`;
}
function pointerUp(e) {
  if (dragState && dragState.id === e.pointerId) {
    dragState = null;
    cropPreview.classList.remove('dragging');
  }
}
cropPreview?.addEventListener('pointerdown', pointerDown);
cropPreview?.addEventListener('pointermove', pointerMove);
cropPreview?.addEventListener('pointerup', pointerUp);
cropPreview?.addEventListener('pointercancel', pointerUp);

continueBtn?.addEventListener('click', () => {
  if (!selectedFormat) return;
  alert(
    `Ausgewählt: ${labelFormat(selectedFormat)}\n` +
    `Ausrichtung: ${orientationName(selectedOrientation)}\n` +
    `Effektive Auflösung: ${Math.round(selectedFormat.ppi)} ppi\n` +
    `Ausschnittposition: ${Math.round(cropPosition.x)}% / ${Math.round(cropPosition.y)}%\n\n` +
    `Der Bestellabschluss wird im nächsten Schritt angebunden.`
  );
});
