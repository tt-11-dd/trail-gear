// Trail Gear — 纯粹贴纸主页交互引擎 (拍照 -> 生成贴纸 -> 展示)
const API_BASE = 'https://trail-gear-api.liuziting.workers.dev/api/v1';

let state = {
  token: null,
  user: null,
  categories: [],
  gears: [],
  layoutMode: 'scattered', // 'scattered' (随性散落) | 'grid' (一键整理对齐)
  currentView: 'closet',   // 'closet' | 'maker'
  currentImageSource: null,
  rawFileSize: 0,
  positions: {},           // gearId -> { x, y, rot, rotStart, zIndex }
  maxZIndex: 20,
};

// 预设丰富、非单一的角度池 (从 -34° 到 +34°，让每个装备落下时角度各异)
const ORGANIC_ANGLES = [-28, 19, -15, 32, -8, 25, -34, 14, -22, 29, -12, 18, -26, 23, -18, 31];

// 存储与读取自定义摆放位置
function loadSavedPositions() {
  try {
    const saved = localStorage.getItem('trailgear_sticker_positions');
    if (saved) {
      state.positions = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('读取贴纸位置失败:', e);
  }
}

function saveStickerPositions() {
  try {
    localStorage.setItem('trailgear_sticker_positions', JSON.stringify(state.positions));
  } catch (e) {
    console.warn('存储贴纸位置失败:', e);
  }
}

// 模拟时钟
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const el = document.getElementById('clock-display');
  if (el) el.textContent = `${hours}:${minutes}`;
}
setInterval(updateClock, 1000);
updateClock();

// ======================== API 请求包装 ========================

async function apiRequest(endpoint, options = {}) {
  const headers = options.headers || {};
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) {
    throw new Error(json.message || `请求失败: ${res.status}`);
  }
  return json.data;
}

// 自动快速登录
async function initAuth() {
  const savedToken = localStorage.getItem('trailgear_token');
  if (savedToken) {
    state.token = savedToken;
    try {
      state.user = await apiRequest('/auth/me');
      return;
    } catch {
      state.token = null;
    }
  }

  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@trailgear.app', password: 'trailgear2026' }),
    });
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('trailgear_token', res.token);
  } catch {
    const regRes = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@trailgear.app',
        password: 'trailgear2026',
        nickname: '荒野大客',
      }),
    });
    state.token = regRes.token;
    state.user = regRes.user;
    localStorage.setItem('trailgear_token', regRes.token);
  }
}

// ======================== 数据加载 ========================

async function loadCategories() {
  state.categories = await apiRequest('/categories');
  const select = document.getElementById('maker-category');
  if (select) {
    select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

async function loadGears(isTriggerDrop = false) {
  const data = await apiRequest('/gears');
  state.gears = data.gears || [];

  const totalCount = data.total_count || 0;
  const totalKg = ((data.total_weight_grams || 0) / 1000).toFixed(1);

  document.getElementById('stat-count-pill').textContent = `${totalCount} 件`;
  document.getElementById('stat-weight-text').textContent = `总负重 ${totalKg} kg`;

  renderStickersCanvas(isTriggerDrop);
}

// ======================== 核心贴纸主页渲染：随机平铺与一键整理 ========================

function toggleLayoutMode() {
  state.layoutMode = state.layoutMode === 'scattered' ? 'grid' : 'scattered';
  const btnText = document.getElementById('layout-btn-text');
  const icon = document.getElementById('layout-icon');
  const reshuffleBtn = document.getElementById('reshuffle-btn');
  const modeTag = document.getElementById('closet-mode-tag');
  const hintText = document.getElementById('closet-hint-text');

  if (state.layoutMode === 'grid') {
    btnText.textContent = '随性散落';
    icon.className = 'fa-solid fa-dice text-pine-800';
    if (reshuffleBtn) reshuffleBtn.classList.add('hidden');
    if (modeTag) modeTag.textContent = '一键整理';
    if (hintText) hintText.textContent = '3列整齐陈列 · 点击查看装备';
  } else {
    btnText.textContent = '一键整理';
    icon.className = 'fa-solid fa-grip text-pine-800';
    if (reshuffleBtn) reshuffleBtn.classList.remove('hidden');
    if (modeTag) modeTag.textContent = '随性散落';
    if (hintText) hintText.textContent = '自由拖动贴纸 · 点击查看装备';
  }

  renderStickersCanvas(true);
}

// 重新散落：清除位置缓存，重新以有机丰富多样的角度从上方掉落
function reshuffleScattered() {
  if (state.layoutMode !== 'scattered') return;
  state.positions = {};
  saveStickerPositions();
  renderStickersCanvas(true);
}

// 为装备计算或恢复带有自然掉落感的物理坐标与角度 (严格约束在装备收纳垫框内)
function getOrGenerateStickerPosition(gear, idx, total, forceRefresh = false) {
  if (!forceRefresh && state.positions[gear.id]) {
    const existing = state.positions[gear.id];
    if (existing.x !== undefined && existing.y !== undefined && existing.rot !== undefined) {
      return existing;
    }
  }

  const container = document.getElementById('stickers-container');
  const trayWidth = container?.clientWidth || 340;

  // 严格在装备垫框内两列错落分布
  const col = idx % 2;
  const row = Math.floor(idx / 2);
  
  const jitterX = Math.round((Math.random() * 18 - 9));
  const jitterY = Math.round((Math.random() * 20 - 10));

  // 左列 12~30px，右列 168~185px (右边界 185 + 144 = 329px 严密约束在框内)
  const rawX = col === 0 ? (12 + Math.random() * 16 + jitterX) : (168 + Math.random() * 16 + jitterX);
  const rawY = row * 155 + 14 + jitterY;

  const posX = Math.max(10, Math.min(Math.max(160, trayWidth - 148), Math.round(rawX)));
  const posY = Math.max(12, Math.round(rawY));

  // 从丰富角度池中取样，消除单一角度
  const angleIdx = (idx * 5 + (gear.name.charCodeAt(0) || 7)) % ORGANIC_ANGLES.length;
  const baseAngle = ORGANIC_ANGLES[angleIdx];
  const rot = Math.round(baseAngle + (Math.random() * 8 - 4));
  
  // 掉落初始翻转角
  const rotStart = rot + (Math.random() > 0.5 ? 26 : -26);

  const pos = {
    x: posX,
    y: posY,
    rot,
    rotStart,
    zIndex: 10 + (idx % 20),
  };

  state.positions[gear.id] = pos;
  return pos;
}

function renderStickersCanvas(isTriggerDrop = false) {
  const container = document.getElementById('stickers-container');
  const trayPill = document.getElementById('tray-stat-pill');
  if (trayPill) {
    trayPill.textContent = `${state.gears.length} 件贴纸`;
  }

  if (state.gears.length === 0) {
    container.className = 'relative flex flex-col items-center justify-center py-20 text-stone-400';
    container.style.height = 'auto';
    container.innerHTML = `
      <i class="fa-solid fa-rug text-4xl mb-3 opacity-30 text-stone-500"></i>
      <p class="text-sm font-bold text-stone-700">装备收纳垫还是空的</p>
      <p class="text-xs text-stone-400 mt-1">点击下方拍照，第一张装备贴纸就会掉落在这里！</p>
    `;
    return;
  }

  if (state.layoutMode === 'grid') {
    // 【一键整理模式】：3列现代整齐网格陈列
    container.className = 'grid grid-cols-3 gap-2.5 transition-all duration-500 py-1';
    container.style.height = 'auto';
    container.innerHTML = state.gears.map((g) => {
      const weightStr = g.weight_grams >= 1000 
        ? `${(g.weight_grams / 1000).toFixed(1)}kg` 
        : `${g.weight_grams}g`;
      return `
        <div class="grid-view-item bg-white/95 p-2 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col items-center justify-between group"
          onclick="openGearDetailModal('${g.id}')">
          <div class="w-full h-20 flex items-center justify-center p-1 overflow-hidden">
            ${g.sticker_image_url 
              ? `<img src="${g.sticker_image_url}" class="max-h-full max-w-full object-contain filter drop-shadow-sm select-none" alt="${g.name}">`
              : `<div class="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-pine-800 font-bold text-xs select-none">${g.name.slice(0, 2)}</div>`
            }
          </div>
          <p class="text-[11px] font-bold text-stone-900 truncate w-full text-center mt-1">${g.name}</p>
          <span class="text-[9px] font-black text-pine-800 bg-pine-800/10 px-1.5 py-0.5 rounded mt-0.5">
            ${weightStr}
          </span>
        </div>
      `;
    }).join('');
  } else {
    // 【随性散落手账桌面模式】：重力掉落弹性质感 + 多角度自然摆放 + 任意拖动
    container.className = 'scattered-board transition-all duration-300';
    
    let maxY = 420;
    const htmlCards = state.gears.map((g, idx) => {
      const pos = getOrGenerateStickerPosition(g, idx, state.gears.length);
      if (pos.y > maxY) maxY = pos.y;

      const weightStr = g.weight_grams >= 1000 
        ? `${(g.weight_grams / 1000).toFixed(1)} kg` 
        : `${g.weight_grams} g`;

      const dropClass = isTriggerDrop ? 'dropping' : '';

      return `
        <div class="sticker-entity ${dropClass}"
          id="sticker-${g.id}"
          data-id="${g.id}"
          style="--pos-x: ${pos.x}px; --pos-y: ${pos.y}px; --rot: ${pos.rot}deg; --rot-start: ${pos.rotStart || (pos.rot + 25)}deg; --delay: ${idx}; transform: translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.rot}deg); z-index: ${pos.zIndex || 10 + idx}; width: 148px;">
          
          <!-- 纯白描边贴纸实体 (悬浮立体手账感) -->
          <div class="relative flex items-center justify-center pointer-events-none p-1">
            ${g.sticker_image_url 
              ? `<img src="${g.sticker_image_url}" class="max-h-28 max-w-full object-contain filter drop-shadow-md select-none pointer-events-none" alt="${g.name}">`
              : `<div class="w-20 h-20 bg-white border-2 border-stone-800 rounded-3xl flex items-center justify-center text-stone-900 shadow-md font-bold text-sm pointer-events-none">${g.name.slice(0, 3)}</div>`
            }
          </div>

          <!-- 便签小标签：胶带质感附着于贴纸 -->
          <div class="mt-1 text-center pointer-events-none select-none">
            <div class="inline-flex items-center gap-1 bg-[#FAF7EE] text-stone-900 px-2.5 py-0.5 rounded-full border border-stone-300/80 shadow-2xs backdrop-blur-xs">
              <span class="text-[10px] font-bold truncate max-w-[85px]">${g.name}</span>
              <span class="text-[9px] text-pine-800 font-black">${weightStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.style.height = `${Math.max(560, maxY + 180)}px`;
    container.innerHTML = htmlCards;

    // 绑定自由拖拽与点击事件
    attachStickerDragEvents(container);
    saveStickerPositions();

    // 掉落动画完成后清理 dropping class，保证后续拖拽绝对跟手
    if (isTriggerDrop) {
      setTimeout(() => {
        container.querySelectorAll('.sticker-entity.dropping').forEach(el => {
          el.classList.remove('dropping');
        });
      }, state.gears.length * 80 + 700);
    }
  }
}

// 自由拖拽交互引擎：支持触屏 Touch 与鼠标 Pointer
function attachStickerDragEvents(container) {
  const stickers = container.querySelectorAll('.sticker-entity');
  
  stickers.forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.button && e.button !== 0) return; // 仅处理主按键或单指
      
      const gearId = el.dataset.id;
      const pos = state.positions[gearId];
      if (!pos) return;

      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {}

      const startX = e.clientX;
      const startY = e.clientY;
      const initialPosX = pos.x;
      const initialPosY = pos.y;
      const initialRot = pos.rot;

      let hasMoved = false;
      let lastClientX = startX;

      // 抬起到最顶层
      state.maxZIndex = (state.maxZIndex || 20) + 1;
      pos.zIndex = state.maxZIndex;
      el.style.zIndex = pos.zIndex;

      // 拾起立体悬浮效果
      el.classList.remove('dropping', 'settling');
      el.classList.add('dragging');

      function onPointerMove(moveEvent) {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (!hasMoved && Math.hypot(dx, dy) > 4) {
          hasMoved = true;
        }

        if (hasMoved) {
          const container = document.getElementById('stickers-container');
          const maxDragX = Math.max(160, (container?.clientWidth || 340) - 146);

          // 严格将贴纸限制在垫子框范围内，绝不脱离框
          pos.x = Math.max(6, Math.min(maxDragX, Math.round(initialPosX + dx)));
          pos.y = Math.max(6, Math.round(initialPosY + dy));

          // 依据拖动速度产生真实物理跟随微倾角
          const vx = moveEvent.clientX - lastClientX;
          lastClientX = moveEvent.clientX;
          const tilt = Math.max(-14, Math.min(14, vx * 1.3));

          el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(1.1) rotate(${initialRot + tilt}deg)`;
        }
      }

      function onPointerUp(upEvent) {
        try {
          el.releasePointerCapture(upEvent.pointerId);
        } catch (err) {}

        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);

        el.classList.remove('dragging');

        if (!hasMoved) {
          // 点击：打开贴纸详情卡片
          el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(1) rotate(${pos.rot}deg)`;
          openGearDetailModal(gearId);
        } else {
          // 拖拽释放：物理落地微弹并持久化位置
          el.style.setProperty('--pos-x', `${pos.x}px`);
          el.style.setProperty('--pos-y', `${pos.y}px`);
          el.style.setProperty('--rot', `${pos.rot}deg`);
          el.classList.add('settling');
          el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) scale(1) rotate(${pos.rot}deg)`;

          setTimeout(() => {
            el.classList.remove('settling');
          }, 280);

          saveStickerPositions();
        }
      }

      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
    });
  });
}

// 打开贴纸详情
function openGearDetailModal(gearId) {
  const g = state.gears.find(item => item.id === gearId);
  if (!g) return;

  const modal = document.getElementById('modal-gear-detail');
  document.getElementById('detail-gear-name').textContent = g.name;
  document.getElementById('detail-gear-brand').textContent = g.brand || '装备好物';
  document.getElementById('detail-gear-weight').textContent = g.weight_grams >= 1000 
    ? `${(g.weight_grams / 1000).toFixed(2)} kg` 
    : `${g.weight_grams} g`;

  // 装备备注
  const descWrap = document.getElementById('detail-gear-desc-wrap');
  const descEl = document.getElementById('detail-gear-desc');
  if (g.description && g.description.trim()) {
    descEl.textContent = g.description;
    descWrap.classList.remove('hidden');
  } else {
    descWrap.classList.add('hidden');
  }

  const imgEl = document.getElementById('detail-gear-img');
  if (g.sticker_image_url) {
    imgEl.src = g.sticker_image_url;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.classList.add('hidden');
  }

  const delBtn = document.getElementById('delete-gear-btn');
  delBtn.onclick = async () => {
    if (confirm(`确定要从装备垫撕下删除 "${g.name}" 吗？`)) {
      closeModal('modal-gear-detail');
      await apiRequest(`/gears/${g.id}`, { method: 'DELETE' });
      await loadGears();
    }
  };

  modal.classList.remove('hidden');
}

// ======================== 贴纸制作与极速压缩 ========================

const canvas = document.getElementById('sticker-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const strokeSlider = document.getElementById('stroke-slider');
const strokeValText = document.getElementById('stroke-val');

if (strokeSlider && strokeValText) {
  strokeSlider.addEventListener('input', (e) => {
    strokeValText.textContent = `${e.target.value} px`;
    if (state.currentImageSource) {
      processSticker(state.currentImageSource, parseInt(e.target.value));
    }
  });
}

document.getElementById('image-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  state.rawFileSize = file.size;

  const reader = new FileReader();
  reader.onload = (event) => {
    const rawImg = new Image();
    rawImg.onload = () => {
      const maxDim = 1200;
      let targetW = rawImg.width;
      let targetH = rawImg.height;
      if (targetW > maxDim || targetH > maxDim) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDim) / targetW);
          targetW = maxDim;
        } else {
          targetW = Math.round((targetW * maxDim) / targetH);
          targetH = maxDim;
        }
      }

      const preCanvas = document.createElement('canvas');
      preCanvas.width = targetW;
      preCanvas.height = targetH;
      const preCtx = preCanvas.getContext('2d');
      preCtx.drawImage(rawImg, 0, 0, targetW, targetH);

      const downsampledImg = new Image();
      downsampledImg.onload = () => {
        state.currentImageSource = downsampledImg;
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        const nameInput = document.getElementById('maker-name');
        if (!nameInput.value || nameInput.value.includes('帐篷')) {
          nameInput.value = cleanName;
        }
        const defaultStroke = strokeSlider ? parseInt(strokeSlider.value) : 14;
        processSticker(downsampledImg, defaultStroke);
      };
      downsampledImg.src = preCanvas.toDataURL('image/jpeg', 0.9);
    };
    rawImg.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 预设矢量装备
function loadGearPreset(type) {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 300;
  sampleCanvas.height = 300;
  const sCtx = sampleCanvas.getContext('2d');

  if (type === 'tent') {
    sCtx.fillStyle = '#22c55e';
    sCtx.beginPath();
    sCtx.moveTo(150, 40);
    sCtx.lineTo(260, 240);
    sCtx.lineTo(40, 240);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#15803d';
    sCtx.beginPath();
    sCtx.moveTo(150, 80);
    sCtx.lineTo(210, 240);
    sCtx.lineTo(90, 240);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#fde047';
    sCtx.beginPath();
    sCtx.moveTo(150, 110);
    sCtx.lineTo(180, 240);
    sCtx.lineTo(120, 240);
    sCtx.closePath();
    sCtx.fill();

    document.getElementById('maker-name').value = '云尚2 超轻双人帐篷';
    document.getElementById('maker-brand').value = 'Naturehike';
    document.getElementById('maker-weight').value = '1250';
    const desc = document.getElementById('maker-desc');
    if (desc) desc.value = '20D硅胶款，超轻自立防大雨';
  } else if (type === 'pack') {
    sCtx.fillStyle = '#38bdf8';
    sCtx.roundRect(80, 70, 140, 180, 24);
    sCtx.fill();

    sCtx.fillStyle = '#0284c7';
    sCtx.roundRect(95, 40, 110, 45, 12);
    sCtx.fill();

    sCtx.fillStyle = '#f59e0b';
    sCtx.fillRect(100, 140, 100, 16);
    sCtx.fillRect(100, 180, 100, 16);

    document.getElementById('maker-name').value = 'Baltoro 65L 重装徒步包';
    document.getElementById('maker-brand').value = 'Gregory 格里高利';
    document.getElementById('maker-weight').value = '2150';
    const desc = document.getElementById('maker-desc');
    if (desc) desc.value = '重装长线徒步背负系统，舒适承重25kg';
  } else if (type === 'stove') {
    sCtx.fillStyle = '#f87171';
    sCtx.roundRect(100, 160, 100, 70, 16);
    sCtx.fill();

    sCtx.fillStyle = '#cbd5e1';
    sCtx.fillRect(135, 110, 30, 50);

    sCtx.fillStyle = '#fb923c';
    sCtx.beginPath();
    sCtx.arc(150, 95, 20, 0, Math.PI * 2);
    sCtx.fill();

    document.getElementById('maker-name').value = '风暴微型一体气炉';
    document.getElementById('maker-brand').value = 'SOTO';
    document.getElementById('maker-weight').value = '67';
    const desc = document.getElementById('maker-desc');
    if (desc) desc.value = '稳压直连气罐，高海拔低温防风';
  } else if (type === 'cup') {
    sCtx.fillStyle = '#94a3b8';
    sCtx.roundRect(90, 80, 120, 130, 14);
    sCtx.fill();

    sCtx.strokeStyle = '#64748b';
    sCtx.lineWidth = 14;
    sCtx.beginPath();
    sCtx.arc(210, 145, 32, -Math.PI / 2, Math.PI / 2);
    sCtx.stroke();

    document.getElementById('maker-name').value = '450ml 单层钛金属露营杯';
    document.getElementById('maker-brand').value = 'Snow Peak';
    document.getElementById('maker-weight').value = '70';
    const desc = document.getElementById('maker-desc');
    if (desc) desc.value = '超轻耐腐蚀，直火烧水，把手可折叠';
  }

  const img = new Image();
  img.onload = () => {
    state.currentImageSource = img;
    processSticker(img, 14);
  };
  img.src = sampleCanvas.toDataURL();
}

function openMakerWithPreset() {
  switchView('maker');
  loadGearPreset('tent');
}

// 核心贴纸描边算法
function processSticker(renderSource, strokeWidth) {
  document.getElementById('upload-placeholder').classList.add('hidden');
  canvas.classList.remove('hidden');
  const badge = document.getElementById('change-photo-badge');
  if (badge) badge.classList.remove('hidden');

  const padding = strokeWidth + 12;
  canvas.width = renderSource.width + padding * 2;
  canvas.height = renderSource.height + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 绘制纯白立体描边
  const steps = 36;
  ctx.save();
  for (let r = strokeWidth; r >= 1; r -= 2) {
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      const ox = padding + Math.cos(angle) * r;
      const oy = padding + Math.sin(angle) * r;

      ctx.shadowColor = 'rgba(255, 255, 255, 0.98)';
      ctx.shadowBlur = 3;
      ctx.drawImage(renderSource, ox, oy);
    }
  }

  // 2. 覆盖柔和真实物理阴影
  ctx.shadowColor = 'rgba(40, 35, 28, 0.2)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;

  // 3. 覆盖原始主体在正中央
  ctx.drawImage(renderSource, padding, padding);
  ctx.restore();
}

// 紧密包围盒裁剪与压缩为 WebP/PNG
async function compressAndTrimSticker(sourceCanvas, maxDimension = 800) {
  const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const imgData = sCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasPixels = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        hasPixels = true;
      }
    }
  }

  if (!hasPixels) {
    minX = 0; minY = 0; maxX = w; maxY = h;
  }

  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w, maxX + pad);
  maxY = Math.min(h, maxY + pad);

  const cropW = maxX - minX;
  const cropH = maxY - minY;

  let targetW = cropW;
  let targetH = cropH;
  if (targetW > maxDimension || targetH > maxDimension) {
    if (targetW > targetH) {
      targetH = Math.round((targetH * maxDimension) / targetW);
      targetW = maxDimension;
    } else {
      targetW = Math.round((targetW * maxDimension) / targetH);
      targetH = maxDimension;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d');
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  outCtx.drawImage(
    sourceCanvas,
    minX, minY, cropW, cropH,
    0, 0, targetW, targetH
  );

  const blob = await new Promise(resolve => {
    outCanvas.toBlob(
      b => {
        if (b) resolve(b);
        else outCanvas.toBlob(resolve, 'image/png');
      },
      'image/webp',
      0.88
    );
  });

  const compressedKb = Math.round(blob.size / 1024);
  const infoText = document.getElementById('compress-info-text');
  const sizePill = document.getElementById('compress-size-pill');

  if (infoText && sizePill) {
    if (state.rawFileSize > 0) {
      const rawMb = (state.rawFileSize / (1024 * 1024)).toFixed(1);
      const ratio = Math.round((1 - blob.size / state.rawFileSize) * 100);
      infoText.textContent = `原图 ${rawMb}MB → 贴纸 ${compressedKb}KB (${targetW}x${targetH}px)`;
      sizePill.textContent = `省流 ${Math.max(10, ratio)}%`;
    } else {
      infoText.textContent = `贴纸已压缩: ${compressedKb} KB (${targetW}x${targetH}px)`;
      sizePill.textContent = '轻量已优化';
    }
  }

  return blob;
}

async function saveGearFromMaker() {
  const name = document.getElementById('maker-name').value.trim();
  const weight = parseFloat(document.getElementById('maker-weight').value);
  const brand = document.getElementById('maker-brand').value.trim();
  const desc = (document.getElementById('maker-desc')?.value || '').trim();

  if (!name || isNaN(weight)) {
    alert('请填写装备名称与重量！');
    return;
  }

  const btn = document.getElementById('save-gear-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在生成并压缩贴纸...`;

  try {
    const compressedBlob = await compressAndTrimSticker(canvas, 800);
    const formData = new FormData();
    formData.append('file', compressedBlob, 'sticker.webp');
    formData.append('type', 'gear_sticker');

    const uploadRes = await apiRequest('/storage/upload', {
      method: 'POST',
      body: formData,
    });

    const categoryId = state.categories[0]?.id || 'cat_other';

    const createdGear = await apiRequest('/gears', {
      method: 'POST',
      body: JSON.stringify({
        category_id: categoryId,
        name,
        brand: brand || '装备好物',
        weight_grams: weight,
        description: desc,
        sticker_image_url: uploadRes.url,
      }),
    });

    // 为新生成的贴纸设置在装备收纳垫最正中上方的着陆点，准备触发大反弹掉落
    if (createdGear && createdGear.id) {
      const container = document.getElementById('stickers-container');
      const trayWidth = container?.clientWidth || 340;
      const targetX = Math.max(16, Math.round((trayWidth - 146) / 2));
      state.positions[createdGear.id] = {
        x: targetX,
        y: 18,
        rot: ORGANIC_ANGLES[Math.floor(Math.random() * ORGANIC_ANGLES.length)],
        rotStart: -35,
        zIndex: (state.maxZIndex || 20) + 5,
      };
      saveStickerPositions();
    }

    // 清空表单
    document.getElementById('maker-name').value = '';
    document.getElementById('maker-weight').value = '';
    document.getElementById('maker-brand').value = '';
    const descInput = document.getElementById('maker-desc');
    if (descInput) descInput.value = '';

    // 立刻切换回首页，并触发物理重力掉落特效！
    switchView('closet');
    await loadGears(true);
  } catch (e) {
    alert(`保存失败: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-sparkles text-amber-300"></i> 生成贴纸并掉落到首页`;
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// 视图切换：'closet' (贴纸墙) <-> 'maker' (做贴纸)
function switchView(view) {
  state.currentView = view;
  const viewCloset = document.getElementById('view-closet');
  const viewMaker = document.getElementById('view-maker');
  const homeActionBar = document.getElementById('home-action-bar');
  const mainContent = document.getElementById('main-content');

  if (view === 'closet') {
    viewCloset.classList.remove('hidden');
    viewMaker.classList.add('hidden');
    homeActionBar.classList.remove('hidden');
  } else {
    viewCloset.classList.add('hidden');
    viewMaker.classList.remove('hidden');
    homeActionBar.classList.add('hidden');
  }

  if (mainContent) mainContent.scrollTop = 0;
}

// 初始化启动
async function bootstrap() {
  loadSavedPositions();
  await initAuth();
  await loadCategories();
  await loadGears(true); // 首次进入桌面时，贴纸带着重力感与弹性质感从空中掉落
}

bootstrap();
