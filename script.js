/* Lieblingsbild.de Bildberater V5.5 – klickbare Größenempfehlung */

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

const STANDARD_FORMATS = [
  [15,15],[15,20],[15,21],[18,18],[18,24],[18,27],
  [20,20],[20,25],[20,28],[20,30],[24,30],[25,38],
  [28,35],[30,30],[30,38],[30,40],[30,42],[30,45],[30,50]
].map(([w,h]) => ({w,h,type:'pearl'}));

const CM_PER_INCH = 2.54;
const MIN_PPI_OK = 180;
const PPI_EXCELLENT = 240;
const SQUARE_SIZES = [15,18,20,30];

const imageInput = document.getElementById('imageInput');
const chooseImageBtn = document.getElementById('chooseImageBtn');
const changeImageBtn = document.getElementById('changeImageBtn');
const dropzone = document.getElementById('dropzone');
const analysisCard = document.getElementById('analysisCard');
const cropCard = document.getElementById('cropCard');
const sourcePreview = document.getElementById('sourcePreview');
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
const optimizeChoices = document.getElementById('optimizeChoices');
const rotateLeftBtn = document.getElementById('rotateLeftBtn');
const rotateRightBtn = document.getElementById('rotateRightBtn');
const rotationResetBtn = document.getElementById('rotationResetBtn');
const tiltRange = document.getElementById('tiltRange');
const tiltValue = document.getElementById('tiltValue');
const styleChoices = document.getElementById('styleChoices');
const cropCanvas = document.getElementById('cropCanvas');
const cropStage = document.getElementById('cropStage');
const ctx = cropCanvas.getContext('2d', {alpha:false});

let currentImage = null;
let currentObjectUrl = null;
let selectedSize = null;
let selectedVariant = null;
let selectedOrientationKind = 'original';
let selectedStyle = 'color';
let selectedOptimization = 'original';
let quarterTurns = 0;
let tiltDegrees = 0;
let enhancementProfile = {brightness:1, contrast:1.04, saturation:1.04};
let currentVariants = [];
let zoom = 1;
let cropCenterX = 0.5;
let cropCenterY = 0.5;
let dragState = null;
let lastCrop = null;

function orientationLabel(w,h){
  const r=w/h;
  if(r>1.12) return 'Querformat';
  if(r<0.89) return 'Hochformat';
  return 'Nahezu quadratisch';
}

function cropLossForRatio(imgRatio,targetRatio){
  if(Math.abs(imgRatio-targetRatio)<0.0001) return 0;
  if(imgRatio>targetRatio) return 1-(targetRatio/imgRatio);
  return 1-(imgRatio/targetRatio);
}

function effectivePpiAfterCrop(pxW,pxH,cmW,cmH){
  const targetRatio=cmW/cmH;
  const sourceRatio=pxW/pxH;
  let usedW=pxW, usedH=pxH;
  if(sourceRatio>targetRatio) usedW=pxH*targetRatio;
  else if(sourceRatio<targetRatio) usedH=pxW/targetRatio;
  return Math.min(
    usedW/(cmW/CM_PER_INCH),
    usedH/(cmH/CM_PER_INCH)
  );
}

function qualityInfo(ppi){
  if(ppi>=PPI_EXCELLENT) return {label:'Sehr gut',cls:'quality-excellent'};
  if(ppi>=MIN_PPI_OK) return {label:'Gut',cls:'quality-good'};
  return {label:'Nicht empfohlen',cls:'quality-low'};
}

function labelFormat(f){
  return `${String(f.w).replace('.',',')} × ${String(f.h).replace('.',',')} cm`;
}

function styleLabel(){
  return selectedStyle === 'bw' ? 'Schwarz-Weiß' : 'Farbe';
}

function renderStyleChoices(){
  if(!styleChoices) return;
  styleChoices.innerHTML = '';

  const options = [
    {
      key:'color',
      title:'Farbe',
      meta:'Ihr Lieblingsbild wird in seiner natürlichen Farbstimmung gezeigt.',
      chip:'Standard'
    },
    {
      key:'bw',
      title:'Schwarz-Weiß',
      meta:'Zeitlos, ruhig und emotional – ideal für Portraits, Hochzeiten und besondere Erinnerungen.',
      chip:'Optional'
    }
  ];

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `style-option ${selectedStyle === opt.key ? 'selected' : ''}`;
    btn.innerHTML = `
      <span>
        <span class="style-name">${opt.title}</span>
      </span>
      <span class="style-meta">${opt.meta}</span>
      <span class="style-chip">${opt.chip}</span>
    `;
    btn.addEventListener('click', () => {
      selectedStyle = opt.key;
      renderStyleChoices();
      drawCrop();
      updateSummary();
    });
    styleChoices.appendChild(btn);
  });
}

function fitOrientationVariants(format,imgRatio){
  const a={...format,ratio:format.w/format.h};
  if(format.w===format.h) return [a];
  const b={...format,w:format.h,h:format.w,ratio:format.h/format.w};
  return [a,b].sort((x,y)=>Math.abs(x.ratio-imgRatio)-Math.abs(y.ratio-imgRatio));
}

function candidateScore(f,img){
  const loss=cropLossForRatio(img.width/img.height,f.ratio);
  const ppi=effectivePpiAfterCrop(img.width,img.height,f.w,f.h);
  const ratioPenalty=loss*115;
  const resolutionPenalty=
    ppi>=PPI_EXCELLENT ? 0 :
    ppi>=MIN_PPI_OK ? (PPI_EXCELLENT-ppi)/8 :
    22+(MIN_PPI_OK-ppi)/3.5;
  const sizeBonus=Math.min(13,(f.w*f.h)/115);
  return 100-ratioPenalty-resolutionPenalty+sizeBonus;
}

function buildCandidates(img){
  const imgRatio=img.width/img.height;
  const seen=new Set();
  const list=[];

  STANDARD_FORMATS.forEach(base=>{
    fitOrientationVariants(base,imgRatio).forEach(f=>{
      const key=`${f.w}x${f.h}`;
      if(seen.has(key)) return;
      seen.add(key);
      const ratio=f.w/f.h;
      const loss=cropLossForRatio(imgRatio,ratio);
      const ppi=effectivePpiAfterCrop(img.width,img.height,f.w,f.h);
      list.push({...f,ratio,loss,ppi,score:candidateScore({...f,ratio},img)});
    });
  });

  if(imgRatio>=1.8){
    const panoW=Math.min(121,Math.max(36,Math.round((20*imgRatio)*10)/10));
    const pano={
      w:panoW,h:20,type:'panorama',
      ratio:panoW/20,
      loss:cropLossForRatio(imgRatio,panoW/20),
      ppi:effectivePpiAfterCrop(img.width,img.height,panoW,20)
    };
    pano.score=candidateScore(pano,img)+14;
    list.push(pano);
  }

  return list.sort((a,b)=>b.score-a.score);
}

function recommendationReason(f){
  const cropPct=Math.round(f.loss*100);
  const q=qualityInfo(f.ppi);
  if(f.type==='panorama'){
    return cropPct<=4 ? 'Sehr passend für breite Motive.' : `Panorama mit ca. ${cropPct}% Beschnitt.`;
  }
  if(cropPct<=2 && q.label==='Sehr gut') return 'Nahezu ohne Beschnitt und mit sehr guter Bildqualität.';
  if(cropPct<=7) return `Sehr passender Bildausschnitt · ca. ${cropPct}% Beschnitt.`;
  return `Guter Gesamteindruck · ca. ${cropPct}% Beschnitt.`;
}

function makeFormatButton(f,index,container){
  const q=qualityInfo(f.ppi);
  const btn=document.createElement('button');
  btn.type='button';
  btn.className=`format-option ${index===0 && container===recommendationsEl ? 'optimal':''}`;
  btn.innerHTML=`
    <span class="format-main">
      <strong>${labelFormat(f)}</strong>
      <small>${recommendationReason(f)}</small>
    </span>
    <span class="quality-badge ${q.cls}">${q.label}</span>`;
  btn.addEventListener('click',()=>selectSizeFormat(f,btn));
  return btn;
}

function renderAnalysis(img){
  const candidates=buildCandidates(img);
  const recommended=candidates.filter(f=>f.ppi>=MIN_PPI_OK).slice(0,3);
  const fallback=recommended.length?recommended:candidates.slice(0,3);

  recommendationsEl.innerHTML='';
  allSizesEl.innerHTML='';

  fallback.forEach((f,i)=>recommendationsEl.appendChild(makeFormatButton(f,i,recommendationsEl)));
  candidates.forEach((f,i)=>{
    const isTop=fallback.some(x=>x.type===f.type && x.w===f.w && x.h===f.h);
    if(!isTop) allSizesEl.appendChild(makeFormatButton(f,i,allSizesEl));
  });

  const ratio=img.width/img.height;
  if(ratio>=1.8){
    const pano=candidates.find(f=>f.type==='panorama');
    if(pano){
      panoramaHint.classList.remove('is-hidden');
      panoramaHint.innerHTML=`<strong>Panorama-Tipp:</strong> Ihr Bild ist besonders breit. ${labelFormat(pano)} nutzt das Motiv sehr gut aus.`;
    }
  }else{
    panoramaHint.classList.add('is-hidden');
  }

  imageFacts.innerHTML=`
    <div class="fact"><small>Ausrichtung</small><strong>${orientationLabel(img.width,img.height)}</strong></div>
    <div class="fact"><small>Auflösung</small><strong>${img.width.toLocaleString('de-DE')} × ${img.height.toLocaleString('de-DE')} px</strong></div>
    <div class="fact"><small>Seitenverhältnis</small><strong>${ratio.toFixed(2).replace('.',',')} : 1</strong></div>
    <div class="fact"><small>Empfohlen</small><strong>${fallback.length} passende Größen</strong></div>`;

  analysisCard.classList.remove('is-hidden');

  const firstButton=recommendationsEl.querySelector('.format-option');
  if(fallback[0] && firstButton) selectSizeFormat(fallback[0],firstButton);

  analysisCard.scrollIntoView({behavior:'smooth',block:'start'});
}

function orientationVariants(size){
  if(size.type==='panorama'){
    return [{kind:'panorama',label:'Panorama',icon:'landscape',w:size.w,h:size.h}];
  }

  const short=Math.min(size.w,size.h);
  const long=Math.max(size.w,size.h);
  const sourceLandscape=currentImage.width>=currentImage.height;

  const variants = [
    {
      kind:'original',
      label:'Original',
      icon:'original',
      w:sourceLandscape?long:short,
      h:sourceLandscape?short:long
    },
    {kind:'portrait',label:'Hochformat',icon:'portrait',w:short,h:long},
    {kind:'landscape',label:'Querformat',icon:'landscape',w:long,h:short}
  ];

  // Optional square choice for a Fachgeschäft-style advisory flow.
  if(short !== long){
    const eligibleSquareSides = SQUARE_SIZES.filter(s => s <= long);
    const squareSide = eligibleSquareSides.length
      ? eligibleSquareSides.reduce((best, s) => Math.abs(s-short) < Math.abs(best-short) ? s : best, eligibleSquareSides[0])
      : SQUARE_SIZES[0];

    variants.push({
      kind:'square',
      label:'Quadratisch',
      icon:'square',
      w:squareSide,
      h:squareSide
    });
  }

  const seen = new Set();
  return variants
    .map(v=>({
      ...v,
      ratio:v.w/v.h,
      loss:cropLossForRatio(currentImage.width/currentImage.height,v.w/v.h),
      basePpi:effectivePpiAfterCrop(currentImage.width,currentImage.height,v.w,v.h)
    }))
    .filter(v=>{
      const key=`${v.kind}:${v.w}x${v.h}`;
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function shapeIconClass(icon){
  if(icon==='portrait') return 'shape-portrait';
  if(icon==='landscape') return 'shape-landscape';
  if(icon==='square') return 'shape-square';
  return 'shape-original';
}
function initialOrientationStatus(v){
  const q=qualityInfo(v.basePpi);
  const cropPct=Math.round(v.loss*100);
  return `${q.label} · ${Math.round(v.basePpi)} ppi · ${cropPct<=1?'kaum Beschnitt':`ca. ${cropPct}% Beschnitt`}`;
}

function renderOrientationChoices(size,preserveKind='original'){
  currentVariants=orientationVariants(size);
  orientationChoices.innerHTML='';

  currentVariants.forEach((v,idx)=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=`orientation-option customer-choice ${idx===0?'recommended':''}`;
    btn.dataset.kind=v.kind;
    btn.innerHTML=`
      <span>
        <span class="orientation-shape"><span class="shape-icon ${shapeIconClass(v.icon)}"></span></span>
        <span class="orientation-name">${v.label}</span>
      </span>
      <span>
        <span class="orientation-meta">${labelFormat(v)}</span>
        <span class="orientation-status">${initialOrientationStatus(v)}</span>
      </span>`;
    btn.addEventListener('click',()=>applyVariant(v,btn));
    orientationChoices.appendChild(btn);
  });

  const chosen=currentVariants.find(v=>v.kind===preserveKind)||currentVariants[0];
  const chosenBtn=[...orientationChoices.querySelectorAll('.orientation-option')]
    .find(b=>b.dataset.kind===chosen.kind);
  applyVariant(chosen,chosenBtn,true);
}

function selectSizeFormat(size,button){
  selectedSize=size;
  document.querySelectorAll('.format-option').forEach(el=>el.classList.remove('selected'));
  if(button) button.classList.add('selected');

  zoom=1;
  cropCenterX=0.5;
  cropCenterY=0.5;
  if(zoomRange) zoomRange.value='1';
  if(zoomValue) zoomValue.textContent='100 %';

  cropCard.classList.remove('is-hidden');
  renderOrientationChoices(size,'original');
  renderStyleChoices();

  requestAnimationFrame(()=>{
    renderStyleChoices();
    resizeCanvasForVariant();
    drawCrop();
    updateSummary();
  });

  cropCard.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function applyVariant(v,button,silent=false){
  selectedVariant=v;
  selectedOrientationKind=v.kind;
  zoom=1;
  cropCenterX=0.5;
  cropCenterY=0.5;

  if(zoomRange) zoomRange.value='1';
  if(zoomValue) zoomValue.textContent='100 %';

  document.querySelectorAll('.orientation-option').forEach(el=>el.classList.remove('selected'));
  if(button) button.classList.add('selected');

  selectedFormatLabel.textContent=`${labelFormat(v)} · ${v.label}`;
  cropTitle.textContent=`${labelFormat(v)} – ${v.label} prüfen`;

  requestAnimationFrame(()=>{
    resizeCanvasForVariant();
    drawCrop();
    updateSummary();
  });

  if(!silent) cropCard.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function resizeCanvasForVariant(){
  if(!selectedVariant || !cropStage) return;

  const ratio=selectedVariant.w/selectedVariant.h;
  const available=Math.max(280,cropStage.clientWidth||700);

  let cssW,cssH;

  if(ratio<0.9){
    // Portrait: visibly portrait, max ~720 px high.
    cssH=Math.min(720,available/ratio);
    cssW=cssH*ratio;
    if(cssW>available){
      cssW=available;
      cssH=cssW/ratio;
    }
    cropCanvas.dataset.shape='portrait';
  }else if(ratio>1.1){
    cssW=available;
    cssH=cssW/ratio;
    if(cssH>650){
      cssH=650;
      cssW=cssH*ratio;
    }
    cropCanvas.dataset.shape='landscape';
  }else{
    cssW=Math.min(available,650);
    cssH=cssW/ratio;
    cropCanvas.dataset.shape='square';
  }

  cropCanvas.style.width=`${Math.round(cssW)}px`;
  cropCanvas.style.height=`${Math.round(cssH)}px`;

  const dpr=Math.min(2,window.devicePixelRatio||1);
  cropCanvas.width=Math.max(1,Math.round(cssW*dpr));
  cropCanvas.height=Math.max(1,Math.round(cssH*dpr));
}

function cropGeometry(){
  if(!currentImage || !selectedVariant) return null;

  const imgW=currentImage.width;
  const imgH=currentImage.height;
  const metrics=rotatedCropMetrics(
    imgW,imgH,
    selectedVariant.w,selectedVariant.h,
    totalRotationDegrees(),
    zoom
  );

  const minCX=metrics.boundW/(2*imgW);
  const maxCX=1-minCX;
  const minCY=metrics.boundH/(2*imgH);
  const maxCY=1-minCY;

  cropCenterX=Math.max(minCX,Math.min(maxCX,cropCenterX));
  cropCenterY=Math.max(minCY,Math.min(maxCY,cropCenterY));

  return {
    ...metrics,
    cx:cropCenterX*imgW,
    cy:cropCenterY*imgH
  };
}
function currentEffectivePpi(){
  const g=lastCrop || cropGeometry();
  if(!g || !selectedVariant) return 0;
  return Math.min(
    g.cropW/(selectedVariant.w/CM_PER_INCH),
    g.cropH/(selectedVariant.h/CM_PER_INCH)
  );
}
function drawCrop(){
  if(!currentImage || !currentImage.element || !selectedVariant) return;

  const g=cropGeometry();
  if(!g) return;
  lastCrop=g;

  ctx.save();
  ctx.fillStyle='#050606';
  ctx.fillRect(0,0,cropCanvas.width,cropCanvas.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.filter = enhancementFilter();

  const scale = cropCanvas.width / g.cropW;

  ctx.translate(cropCanvas.width/2, cropCanvas.height/2);
  ctx.rotate(g.rad);
  ctx.scale(scale,scale);
  ctx.translate(-g.cx,-g.cy);
  ctx.drawImage(currentImage.element,0,0);

  ctx.filter='none';
  ctx.restore();

  const ppi=currentEffectivePpi();
  cropQuality.textContent=
    `Vorschau · ${selectedVariant.label} · ${styleLabel()} · ${optimizationLabel()} · `+
    `${normalizedRotationLabel()} · ${Math.round(ppi)} effektive ppi · Zoom ${Math.round(zoom*100)} %`;

  renderOrientationStatuses();
}
function renderOrientationStatuses(){
  currentVariants.forEach(v=>{
    const el=orientationChoices.querySelector(`.orientation-option[data-kind="${v.kind}"] .orientation-status`);
    if(!el) return;

    // Base value at 100 % for variants that are not currently selected.
    const ppi=(selectedVariant && v.kind===selectedVariant.kind)
      ? currentEffectivePpi()
      : v.basePpi;
    const q=qualityInfo(ppi);
    const cropPct=Math.round(v.loss*100);
    el.textContent=`${q.label} · ${Math.round(ppi)} ppi · ${cropPct<=1?'kaum Beschnitt':`ca. ${cropPct}% Beschnitt`}`;
  });
}

function findSmallerAlternatives(){
  if(!currentImage || !selectedVariant) return [];

  const currentArea=selectedVariant.w*selectedVariant.h;
  const kind=selectedOrientationKind;
  const results=[];

  STANDARD_FORMATS.forEach(base=>{
    const short=Math.min(base.w,base.h);
    const long=Math.max(base.w,base.h);
    let w,h;

    if(kind==='portrait'){
      w=short; h=long;
    }else if(kind==='landscape'){
      w=long; h=short;
    }else if(kind==='square'){
      const sq=[15,18,20,30].filter(s=>s*s<currentArea).sort((a,b)=>b-a)[0];
      if(!sq) return;
      w=sq; h=sq;
    }else{
      const landscape=currentImage.width>=currentImage.height;
      w=landscape?long:short;
      h=landscape?short:long;
    }

    const area=w*h;
    if(area>=currentArea) return;

    const metrics=rotatedCropMetrics(
      currentImage.width,currentImage.height,
      w,h,totalRotationDegrees(),zoom
    );

    if(metrics.ppi>=MIN_PPI_OK){
      results.push({w,h,ppi:metrics.ppi,area});
    }
  });

  results.sort((a,b)=>{
    const qa=(a.ppi>=PPI_EXCELLENT?1:0);
    const qb=(b.ppi>=PPI_EXCELLENT?1:0);
    if(qb!==qa) return qb-qa;
    return b.area-a.area;
  });

  const unique=[];
  const seen=new Set();
  for(const r of results){
    const key=`${r.w}x${r.h}`;
    if(!seen.has(key)){
      seen.add(key);
      unique.push(r);
    }
    if(unique.length>=2) break;
  }
  return unique;
}
function recommendationToSelectableSize(alt){
  // Use the recommended physical size exactly as shown to the customer.
  return {
    w:alt.w,
    h:alt.h,
    type:'pearl',
    ratio:alt.w/alt.h,
    loss:cropLossForRatio(currentImage.width/currentImage.height, alt.w/alt.h),
    ppi:effectivePpiAfterCrop(currentImage.width,currentImage.height,alt.w,alt.h)
  };
}

function applyRecommendedSize(alt){
  if(!alt || !currentImage) return;

  // Preserve the customer's creative decisions.
  const preserve = {
    orientation:selectedOrientationKind,
    style:selectedStyle,
    optimization:selectedOptimization,
    quarterTurns,
    tiltDegrees,
    zoom,
    centerX:cropCenterX,
    centerY:cropCenterY
  };

  const newSize = recommendationToSelectableSize(alt);
  selectedSize = newSize;

  // Mark a corresponding size button if present.
  document.querySelectorAll('.format-option').forEach(el => el.classList.remove('selected'));

  // Do NOT reset style / optimization / rotation.
  selectedStyle = preserve.style;
  selectedOptimization = preserve.optimization;
  quarterTurns = preserve.quarterTurns;
  tiltDegrees = preserve.tiltDegrees;
  updateRotationUi();
  renderStyleChoices();
  renderOptimizationChoices();

  currentVariants = orientationVariants(newSize);
  orientationChoices.innerHTML='';

  currentVariants.forEach((v,idx)=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=`orientation-option customer-choice ${idx===0?'recommended':''}`;
    btn.dataset.kind=v.kind;
    btn.innerHTML=`
      <span>
        <span class="orientation-shape"><span class="shape-icon ${shapeIconClass(v.icon)}"></span></span>
        <span class="orientation-name">${v.label}</span>
      </span>
      <span>
        <span class="orientation-meta">${labelFormat(v)}</span>
        <span class="orientation-status">${initialOrientationStatus(v)}</span>
      </span>`;
    btn.addEventListener('click',()=>applyVariant(v,btn));
    orientationChoices.appendChild(btn);
  });

  let desiredKind = preserve.orientation;
  if(!currentVariants.some(v=>v.kind===desiredKind)){
    desiredKind = currentVariants.some(v=>v.kind==='original') ? 'original' : currentVariants[0]?.kind;
  }

  const chosen=currentVariants.find(v=>v.kind===desiredKind) || currentVariants[0];
  const chosenBtn=[...orientationChoices.querySelectorAll('.orientation-option')]
    .find(b=>b.dataset.kind===chosen.kind);

  selectedVariant=chosen;
  selectedOrientationKind=chosen.kind;

  // Preserve zoom and crop centre where possible.
  zoom=preserve.zoom;
  if(zoomRange) zoomRange.value=String(zoom);
  if(zoomValue) zoomValue.textContent=`${Math.round(zoom*100)} %`;
  cropCenterX=preserve.centerX;
  cropCenterY=preserve.centerY;

  document.querySelectorAll('.orientation-option').forEach(el=>el.classList.remove('selected'));
  if(chosenBtn) chosenBtn.classList.add('selected');

  selectedFormatLabel.textContent=`${labelFormat(chosen)} · ${chosen.label}`;
  cropTitle.textContent=`${labelFormat(chosen)} – ${chosen.label} prüfen`;

  requestAnimationFrame(()=>{
    resizeCanvasForVariant();
    drawCrop();
    updateSummary();
  });

  cropCard.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function updateSummary(){
  if(!selectedVariant) return;

  const ppi=currentEffectivePpi();
  const q=qualityInfo(ppi);
  const formatCropPct=Math.round(selectedVariant.loss*100);

  selectedFormatText.textContent=
    `Bildstil: ${styleLabel()} · ${optimizationLabel()} · Ausrichtung ${normalizedRotationLabel()}. ` +
    `${q.label}e effektive Bildqualität bei etwa ${Math.round(ppi)} ppi. `+
    (formatCropPct<=1?'Nahezu ohne formatbedingten Beschnitt. ':`Formatbedingter Beschnitt: ca. ${formatCropPct}%. `)+
    `Ihr zusätzlicher Zoom wird live mitgerechnet.`;

  const alternatives=findSmallerAlternatives();

  if(ppi < MIN_PPI_OK){
    liveAdvisor.className='live-advisor warning';

    const buttons = alternatives.slice(0,2).map((alt,idx)=>`
      <button
        type="button"
        class="advisor-size-button"
        data-recommendation-index="${idx}"
        aria-label="Auf ${labelFormat(alt)} wechseln"
      >${labelFormat(alt)}</button>
    `).join('');

    liveAdvisor.innerHTML=`
      <div class="advisor-warning-title">
        <span class="advisor-warning-symbol">!</span>
        <span>Qualitätswarnung</span>
      </div>
      <p class="advisor-warning-text">
        Für <strong>${labelFormat(selectedVariant)}</strong> ist genau dieser Ausschnitt mit
        <strong>${styleLabel()}</strong> · <strong>${optimizationLabel()}</strong> und nur noch rund
        <strong>${Math.round(ppi)} ppi</strong> nicht mehr optimal.
      </p>
      ${
        alternatives.length
          ? `<div class="advisor-recommendation">
               <strong>✓ Empfohlen</strong>
               <span>Mit einer kleineren Größe erhalten Sie wieder eine deutlich bessere Bildqualität.</span>
               <div class="advisor-recommendation-buttons">${buttons}</div>
               <span class="advisor-recommendation-hint">Klicken Sie auf Ihre gewünschte Empfehlung – der Bildberater übernimmt das Format sofort.</span>
             </div>`
          : `<div class="advisor-recommendation">
               <strong>✓ Empfehlung</strong>
               <span>Bitte zoomen Sie weniger stark oder wählen Sie eine kleinere Größe.</span>
             </div>`
      }
    `;

    liveAdvisor.querySelectorAll('.advisor-size-button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const idx=parseInt(btn.dataset.recommendationIndex || '0',10);
        const alt=alternatives[idx];
        if(alt) applyRecommendedSize(alt);
      });
    });

    return;
  }

  liveAdvisor.className='live-advisor ok';

  if(ppi>=PPI_EXCELLENT){
    liveAdvisor.innerHTML=`
      <strong>Live-Bildberater</strong>
      <p>Ihr tatsächlich sichtbarer Ausschnitt ist in ${labelFormat(selectedVariant)}
      mit ${styleLabel()} · ${optimizationLabel()} und sehr guter Qualität geeignet.</p>
      <span class="advisor-alt">Sie können das Bild frei verschieben oder weiter hineinzoomen – der Bildberater rechnet sofort neu.</span>
    `;
  }else{
    const buttons = alternatives.slice(0,2).map((alt,idx)=>`
      <button type="button" class="advisor-size-button" data-recommendation-index="${idx}">
        ${labelFormat(alt)}
      </button>
    `).join('');

    liveAdvisor.innerHTML=`
      <strong>Live-Bildberater</strong>
      <p>Ihr Ausschnitt ist in ${labelFormat(selectedVariant)} mit ${styleLabel()} · ${optimizationLabel()}
      noch gut, liegt aber nur noch bei rund ${Math.round(ppi)} ppi.</p>
      ${
        alternatives.length
          ? `<span class="advisor-alt">Für maximale Qualität empfehlen wir eine kleinere Größe.</span>
             <div class="advisor-recommendation-buttons">${buttons}</div>`
          : `<span class="advisor-alt">Bei weiterem Zoom wäre eine kleinere Größe sinnvoll.</span>`
      }
    `;

    liveAdvisor.querySelectorAll('.advisor-size-button').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const idx=parseInt(btn.dataset.recommendationIndex || '0',10);
        const alt=alternatives[idx];
        if(alt) applyRecommendedSize(alt);
      });
    });
  }
}
function handleFile(file){
  if(!file) return;

  const accepted=['image/jpeg','image/png','image/webp'];
  if(!accepted.includes(file.type)){
    showUploadError('Bitte verwende für den Test ein JPEG-, PNG- oder WebP-Bild.');
    return;
  }

  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl=URL.createObjectURL(file);

  const img=new Image();
  img.onload=()=>{
    enhancementProfile = analyzeImageForEnhancement(img);
    selectedOptimization = 'original';
    quarterTurns = 0;
    tiltDegrees = 0;
    updateRotationUi();
    renderOptimizationChoices();
    currentImage={
      width:img.naturalWidth,
      height:img.naturalHeight,
      src:currentObjectUrl,
      name:file.name,
      element:img
    };
    sourcePreview.src=currentObjectUrl;
    dropzone.classList.add('is-hidden');
    renderAnalysis(currentImage);
  };
  img.onerror=()=>showUploadError('Das Bild konnte nicht gelesen werden.');
  img.src=currentObjectUrl;
}

function showUploadError(message){
  let box=dropzone.querySelector('.error-message');
  if(!box){
    box=document.createElement('div');
    box.className='error-message';
    dropzone.appendChild(box);
  }
  box.textContent=message;
}

chooseImageBtn?.addEventListener('click',()=>imageInput?.click());
changeImageBtn?.addEventListener('click',()=>imageInput?.click());
imageInput?.addEventListener('change',e=>handleFile(e.target.files?.[0]));

dropzone?.addEventListener('dragover',e=>{
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone?.addEventListener('dragleave',()=>dropzone.classList.remove('dragover'));
dropzone?.addEventListener('drop',e=>{
  e.preventDefault();
  dropzone.classList.remove('dragover');
  const files=[...e.dataTransfer.files].filter(f=>f.type.startsWith('image/'));
  if(files.length) handleFile(files[0]);
});

allSizesBtn?.addEventListener('click',()=>{
  const hidden=allSizesEl.classList.toggle('is-hidden');
  allSizesBtn.textContent=hidden?'Alle Größen anzeigen':'Weniger Größen anzeigen';
});

zoomRange?.addEventListener('input',e=>{
  zoom=parseFloat(e.target.value||'1');
  if(zoomValue) zoomValue.textContent=`${Math.round(zoom*100)} %`;
  drawCrop();
  updateSummary();
});

/* Canvas dragging: move the visible source crop inside the original photo. */
cropCanvas?.addEventListener('pointerdown',e=>{
  if(!selectedVariant || !lastCrop) return;
  dragState={
    id:e.pointerId,
    x:e.clientX,
    y:e.clientY,
    centerX:cropCenterX,
    centerY:cropCenterY,
    cropW:lastCrop.cropW,
    angleRad:lastCrop.rad
  };
  cropCanvas.setPointerCapture?.(e.pointerId);
  cropCanvas.classList.add('dragging');
});

cropCanvas?.addEventListener('pointermove',e=>{
  if(!dragState || dragState.id!==e.pointerId || !currentImage) return;

  const rect=cropCanvas.getBoundingClientRect();
  const dx=e.clientX-dragState.x;
  const dy=e.clientY-dragState.y;

  const cssScale=rect.width/dragState.cropW;
  const u=dx/cssScale;
  const v=dy/cssScale;
  const c=Math.cos(dragState.angleRad);
  const s=Math.sin(dragState.angleRad);

  // Inverse rotation: dragging the visible image moves the source centre oppositely.
  const srcDx=c*u+s*v;
  const srcDy=-s*u+c*v;

  cropCenterX=dragState.centerX-srcDx/currentImage.width;
  cropCenterY=dragState.centerY-srcDy/currentImage.height;

  drawCrop();
});

function finishDrag(e){
  if(dragState && dragState.id===e.pointerId){
    dragState=null;
    cropCanvas.classList.remove('dragging');
    updateSummary();
  }
}
cropCanvas?.addEventListener('pointerup',finishDrag);
cropCanvas?.addEventListener('pointercancel',finishDrag);


rotateLeftBtn?.addEventListener('click',()=>{
  quarterTurns=(quarterTurns+3)%4;
  cropCenterX=.5;
  cropCenterY=.5;
  drawCrop();
  updateSummary();
});

rotateRightBtn?.addEventListener('click',()=>{
  quarterTurns=(quarterTurns+1)%4;
  cropCenterX=.5;
  cropCenterY=.5;
  drawCrop();
  updateSummary();
});

rotationResetBtn?.addEventListener('click',()=>{
  quarterTurns=0;
  tiltDegrees=0;
  cropCenterX=.5;
  cropCenterY=.5;
  updateRotationUi();
  drawCrop();
  updateSummary();
});

tiltRange?.addEventListener('input',e=>{
  tiltDegrees=parseFloat(e.target.value||'0');
  updateRotationUi();
  drawCrop();
  updateSummary();
});


window.addEventListener('resize',()=>{
  if(selectedVariant){
    resizeCanvasForVariant();
    drawCrop();
  }
});

continueBtn?.addEventListener('click',()=>{
  if(!selectedVariant) return;
  const ppi=currentEffectivePpi();
  alert(
    `Ausgewählt: ${labelFormat(selectedVariant)}\n`+
    `Ausrichtung: ${selectedVariant.label}\n`+
    `Bildstil: ${styleLabel()}\n`+
    `Bildoptimierung: ${optimizationLabel()}\n`+
    `Drehung/Neigung: ${normalizedRotationLabel()}\n`+
    `Zoom: ${Math.round(zoom*100)} %\n`+
    `Effektive Auflösung des sichtbaren Ausschnitts: ${Math.round(ppi)} ppi\n\n`+
    `Der Bestellabschluss wird im nächsten Schritt angebunden.`
  );
});
