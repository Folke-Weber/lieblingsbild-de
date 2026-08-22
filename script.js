/* Lieblingsbild.de Bildberater V4.3 – echter Formatrahmen */

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

/* ===== Lieblingsbild.de V4 Bildberater ===== */

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
const zoomRange = document.getElementById('zoomRange');
const zoomValue = document.getElementById('zoomValue');
const liveAdvisor = document.getElementById('liveAdvisor');

let currentImage = null;
let currentObjectUrl = null;
let selectedSize = null;
let selectedVariant = null;
let selectedOrientationKind = 'original';
let zoom = 1;
let dragState = null;
let panX = 0;
let panY = 0;
let currentVariants = [];

const CM_PER_INCH = 2.54;
const MIN_PPI_OK = 180;
const PPI_EXCELLENT = 240;
const MAX_CROP_WARNING = 0.56;

function orientationLabel(w, h) {
  const r = w / h;
  if (r > 1.12) return 'Querformat';
  if (r < 0.89) return 'Hochformat';
  return 'Nahezu quadratisch';
}

function cropLossForRatio(imgRatio, targetRatio) {
  if (Math.abs(imgRatio - targetRatio) < 0.0001) return 0;
  if (imgRatio > targetRatio) return 1 - (targetRatio / imgRatio);
  return 1 - (imgRatio / targetRatio);
}

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
  return { label:'Nicht empfohlen', cls:'quality-low' };
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
  const loss = cropLossForRatio(img.width / img.height, f.ratio);
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

  if (imgRatio >= 1.8) {
    const panoW = Math.min(121, Math.max(36, Math.round((20 * imgRatio) * 10) / 10));
    const pano = {
      w: panoW, h: 20, type:'panorama',
      ratio: panoW / 20,
      loss: cropLossForRatio(imgRatio, panoW / 20),
      ppi: effectivePpiAfterCrop(img.width, img.height, panoW, 20)
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
      ? 'Sehr passend für breite Motive.'
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

  btn.addEventListener('click', () => selectSizeFormat(f, btn));
  return btn;
}

function renderAnalysis(img) {
  const candidates = buildCandidates(img);
  const recommended = candidates.filter(f => f.ppi >= MIN_PPI_OK).slice(0,3);
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
    <div class="fact"><small>Empfohlen</small><strong>${fallback.length} passende Größen</strong></div>
  `;

  const firstButton = recommendationsEl.querySelector('.format-option');
  if (fallback[0] && firstButton) selectSizeFormat(fallback[0], firstButton);

  analysisCard.classList.remove('is-hidden');
  analysisCard.scrollIntoView({ behavior:'smooth', block:'start' });
}

function baseDimensions(f) {
  return { short: Math.min(f.w, f.h), long: Math.max(f.w, f.h) };
}

function uniqueOrientationVariants(size) {
  if (!currentImage || !size) return [];

  if (size.type === 'panorama') {
    const ratio = size.w / size.h;
    return [{
      kind:'panorama',
      label:'Panorama',
      icon:'landscape',
      w:size.w,
      h:size.h,
      ratio,
      loss:cropLossForRatio(currentImage.width/currentImage.height, ratio),
      basePpi:effectivePpiAfterCrop(currentImage.width,currentImage.height,size.w,size.h)
    }];
  }

  const short = Math.min(size.w, size.h);
  const long = Math.max(size.w, size.h);
  const sourceLandscape = currentImage.width >= currentImage.height;

  // IMPORTANT: Always return all three choices.
  const variants = [
    {
      kind:'original',
      label:'Original',
      icon:'original',
      w: sourceLandscape ? long : short,
      h: sourceLandscape ? short : long
    },
    {
      kind:'portrait',
      label:'Hochformat',
      icon:'portrait',
      w:short,
      h:long
    },
    {
      kind:'landscape',
      label:'Querformat',
      icon:'landscape',
      w:long,
      h:short
    }
  ];

  return variants.map(v => {
    const ratio = v.w / v.h;
    return {
      ...v,
      ratio,
      loss:cropLossForRatio(currentImage.width/currentImage.height, ratio),
      basePpi:effectivePpiAfterCrop(currentImage.width,currentImage.height,v.w,v.h)
    };
  });
}
function dynamicPpiForVariant(v) {
  return v.basePpi / zoom;
}

function orientationStatus(v) {
  const ppi = dynamicPpiForVariant(v);
  const q = qualityInfo(ppi);
  const cropPct = Math.round(v.loss * 100);

  if (ppi >= PPI_EXCELLENT) {
    return `${q.label} · ${Math.round(ppi)} ppi · ${cropPct <= 1 ? 'kaum Beschnitt' : `ca. ${cropPct}% Beschnitt`}`;
  }
  if (ppi >= MIN_PPI_OK) {
    return `${q.label} · ${Math.round(ppi)} ppi · ${cropPct <= 1 ? 'kaum Beschnitt' : `ca. ${cropPct}% Beschnitt`}`;
  }
  return `frei wählbar · ${Math.round(ppi)} ppi · ${cropPct <= 1 ? 'kaum Beschnitt' : `ca. ${cropPct}% Beschnitt`}`;
}

function shapeIconClass(icon) {
  if (icon === 'portrait') return 'shape-portrait';
  if (icon === 'landscape') return 'shape-landscape';
  return 'shape-original';
}

function renderOrientationChoices(size, preserveKind = null) {
  currentVariants = uniqueOrientationVariants(size);
  orientationChoices.innerHTML = '';

  currentVariants.forEach((v, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.disabled = false;
    btn.className = `orientation-option customer-choice ${idx === 0 ? 'recommended' : ''}`;
    btn.dataset.kind = v.kind;
    btn.innerHTML = `
      <span>
        <span class="orientation-shape"><span class="shape-icon ${shapeIconClass(v.icon)}"></span></span>
        <span class="orientation-name">${v.label}</span>
      </span>
      <span>
        <span class="orientation-meta">${labelFormat(v)}</span>
        <span class="orientation-status">${orientationStatus(v)}</span>
      </span>
    `;
    btn.addEventListener('click', () => applyVariant(v, btn));
    orientationChoices.appendChild(btn);
  });

  const wantedKind = preserveKind || selectedOrientationKind || 'original';
  const chosen = currentVariants.find(v => v.kind === wantedKind) || currentVariants[0];
  const chosenBtn = [...orientationChoices.querySelectorAll('.orientation-option')]
    .find(b => b.dataset.kind === chosen.kind);

  if (chosen) applyVariant(chosen, chosenBtn, true);
}
function selectSizeFormat(size, button) {
  selectedSize = size;
  document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));
  if (button) button.classList.add('selected');

  zoom = 1;
  if (zoomRange) zoomRange.value = '1';
  if (zoomValue) zoomValue.textContent = '100 %';
  panX = 0;
  panY = 0;

  // IMPORTANT: the crop area must be visible before measuring it.
  cropCard.classList.remove('is-hidden');

  renderOrientationChoices(size, 'original');

  // Recalculate after the browser has laid out the now-visible crop area.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      renderCropPreview();
      updateSummary();
    });
  });

  cropCard.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function applyVariant(variant, button, silent=false) {
  selectedVariant = variant;
  if (currentImage && cropImage.src !== currentImage.src) {
    cropImage.src = currentImage.src;
  }
  selectedOrientationKind = variant.kind;
  panX = 0;
  panY = 0;

  document.querySelectorAll('.orientation-option').forEach(el => el.classList.remove('selected'));
  if (button) button.classList.add('selected');

  const cropRatio = variant.w / variant.h;
  cropPreview.style.setProperty('--crop-ratio', String(cropRatio));
  cropPreview.style.aspectRatio = `${variant.w} / ${variant.h}`;

  if (Math.abs(cropRatio - 1) < 0.04) {
    cropPreview.dataset.shape = 'square';
  } else if (cropRatio < 1) {
    cropPreview.dataset.shape = 'portrait';
  } else {
    cropPreview.dataset.shape = 'landscape';
  }

  selectedFormatLabel.textContent = `${labelFormat(variant)} · ${variant.label}`;
  cropTitle.textContent = `${labelFormat(variant)} – ${variant.label} prüfen`;

  requestAnimationFrame(() => {
    renderCropPreview();
    updateSummary();
  });

  if (!silent) cropCard.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function renderCropPreview() {
  if (!currentImage || !selectedVariant) return;

  // If the element was just unhidden, wait until it has real dimensions.
  const rect = cropPreview.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) {
    requestAnimationFrame(() => renderCropPreview());
    return;
  }

  const cw = rect.width;
  const ch = rect.height;

  const baseScale = Math.max(cw / currentImage.width, ch / currentImage.height);
  const displayW = currentImage.width * baseScale * zoom;
  const displayH = currentImage.height * baseScale * zoom;

  const maxPanX = Math.max(0, (displayW - cw) / 2);
  const maxPanY = Math.max(0, (displayH - ch) / 2);

  panX = Math.min(maxPanX, Math.max(-maxPanX, panX));
  panY = Math.min(maxPanY, Math.max(-maxPanY, panY));

  cropImage.style.width = `${displayW}px`;
  cropImage.style.height = `${displayH}px`;
  cropImage.style.left = `${(cw - displayW) / 2 + panX}px`;
  cropImage.style.top = `${(ch - displayH) / 2 + panY}px`;

  cropPreview.dataset.maxPanX = maxPanX;
  cropPreview.dataset.maxPanY = maxPanY;

  if (zoomValue) zoomValue.textContent = `${Math.round(zoom * 100)} %`;
  cropQuality.textContent =
    `Vorschau · ${selectedVariant.label} · ${Math.round(dynamicPpiForVariant(selectedVariant))} effektive ppi · Zoom ${Math.round(zoom * 100)} %`;

  renderOrientationStatuses();
}

function renderOrientationStatuses() {
  currentVariants.forEach(v => {
    const btn = orientationChoices.querySelector(`.orientation-option[data-kind="${v.kind}"] .orientation-status`);
    if (btn) btn.textContent = orientationStatus(v);
  });
}

function suggestionMessage(currentVariant) {
  const currentPpi = dynamicPpiForVariant(currentVariant);
  const q = qualityInfo(currentPpi);
  const cropPct = Math.round(currentVariant.loss * 100);

  // Build smaller alternatives from all sizes, preserving the currently chosen orientation kind where possible.
  const sourceArea = currentVariant.w * currentVariant.h;
  const alternatives = [];

  const candidates = buildCandidates(currentImage).filter(c => c.type !== 'panorama' || currentVariant.kind === 'panorama');

  candidates.forEach(size => {
    let variant;
    if (size.type === 'panorama') {
      variant = uniqueOrientationVariants(size)[0];
    } else {
      const options = uniqueOrientationVariants(size);
      variant = options.find(v => v.kind === selectedOrientationKind)
             || options.find(v => v.kind === 'original')
             || options[0];
    }
    if (!variant) return;
    const dynPpi = variant.basePpi / zoom;
    alternatives.push({
      ...variant,
      dynPpi,
      area: variant.w * variant.h
    });
  });

  const smallerGood = alternatives
    .filter(a => a.area < sourceArea && a.dynPpi >= MIN_PPI_OK)
    .sort((a,b) => b.area - a.area);

  const smallerExcellent = alternatives
    .filter(a => a.area < sourceArea && a.dynPpi >= PPI_EXCELLENT)
    .sort((a,b) => b.area - a.area);

  if (currentPpi >= PPI_EXCELLENT) {
    return {
      tone:'good',
      title:'Live-Bildberater',
      text:`Dein gewählter Ausschnitt ist in ${labelFormat(currentVariant)} mit ${q.label.toLowerCase()}er Qualität sehr gut geeignet.`,
      extra:`Du kannst den Ausschnitt frei verschieben oder stärker vergrößern – wir reagieren live, sobald eine kleinere Größe sinnvoller wäre.`
    };
  }

  if (currentPpi >= MIN_PPI_OK) {
    const alt = smallerExcellent[0] || smallerGood[0];
    return {
      tone:'mid',
      title:'Live-Bildberater',
      text:`Dein gewählter Ausschnitt ist in ${labelFormat(currentVariant)} noch gut, liegt aber bereits bei nur noch ${Math.round(currentPpi)} ppi.`,
      extra: alt
        ? `Für maximale Qualität wäre jetzt ${labelFormat(alt)} besonders empfehlenswert.`
        : `Wenn du noch weiter hineinzoomst, empfehlen wir automatisch kleinere Größen.`
    };
  }

  const a1 = smallerGood[0];
  const a2 = smallerGood[1];
  const suggestion = [a1, a2].filter(Boolean).map(a => labelFormat(a)).join(' oder ');

  return {
    tone:'bad',
    title:'Live-Bildberater',
    text:`Für ${labelFormat(currentVariant)} ist dieser Ausschnitt mit nur noch ${Math.round(currentPpi)} ppi nicht mehr optimal.`,
    extra: suggestion
      ? `Empfehlung: lieber ${suggestion} wählen, damit dein Lieblingsbild wieder sauber und hochwertig wirkt.`
      : `Bitte wähle einen weniger starken Ausschnitt oder eine kleinere Größe.`
  };
}

function updateSummary() {
  if (!selectedVariant) return;
  const currentPpi = dynamicPpiForVariant(selectedVariant);
  const q = qualityInfo(currentPpi);
  const cropPct = Math.round(selectedVariant.loss * 100);

  selectedFormatText.textContent =
    `${q.label}e effektive Bildqualität bei etwa ${Math.round(currentPpi)} ppi. ` +
    (cropPct <= 1 ? 'Nahezu ohne Beschnitt.' : `Formatbedingter Beschnitt: ca. ${cropPct}%.`) +
    ` Zusätzlicher Ausschnitt durch dein Zoom wird live mitbewertet.`;

  const msg = suggestionMessage(selectedVariant);
  liveAdvisor.innerHTML = `
    <strong>${msg.title}</strong>
    <p class="${msg.tone === 'bad' ? 'advisor-bad' : ''}">${msg.text}</p>
    <span class="advisor-alt">${msg.extra}</span>
  `;
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

zoomRange?.addEventListener('input', e => {
  zoom = parseFloat(e.target.value || '1');
  renderCropPreview();
  updateSummary();
});

// Drag inside crop preview
function pointerDown(e) {
  if (!selectedVariant) return;
  dragState = {
    id: e.pointerId,
    startX:e.clientX,
    startY:e.clientY,
    startPanX:panX,
    startPanY:panY
  };
  cropPreview.setPointerCapture?.(e.pointerId);
  cropPreview.classList.add('dragging');
}
function pointerMove(e) {
  if (!dragState || dragState.id !== e.pointerId) return;
  const maxPanX = parseFloat(cropPreview.dataset.maxPanX || '0');
  const maxPanY = parseFloat(cropPreview.dataset.maxPanY || '0');
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  panX = Math.min(maxPanX, Math.max(-maxPanX, dragState.startPanX + dx));
  panY = Math.min(maxPanY, Math.max(-maxPanY, dragState.startPanY + dy));
  renderCropPreview();
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

cropImage?.addEventListener('load', () => {
  if (selectedVariant) {
    requestAnimationFrame(() => {
      renderCropPreview();
      updateSummary();
    });
  }
});


window.addEventListener('resize', () => {
  if (selectedVariant) renderCropPreview();
});

continueBtn?.addEventListener('click', () => {
  if (!selectedVariant) return;
  alert(
    `Ausgewählt: ${labelFormat(selectedVariant)}\n` +
    `Ausrichtung: ${selectedVariant.label}\n` +
    `Zoom: ${Math.round(zoom * 100)} %\n` +
    `Effektive Auflösung: ${Math.round(dynamicPpiForVariant(selectedVariant))} ppi\n\n` +
    `Der Bestellabschluss wird im nächsten Schritt angebunden.`
  );
});
