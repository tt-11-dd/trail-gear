// Trail Gear — 现代山系浅色装备美学交互引擎
const API_BASE = 'https://trail-gear-api.liuziting.workers.dev/api/v1';

let state = {
  token: null,
  user: null,
  categories: [],
  gears: [],
  trips: [],
  selectedCategoryId: '',
  searchKeyword: '',
  currentTripId: null,
  currentTripDetail: null,
  activeTab: 'closet',
  currentImageSource: null,
  rawFileSize: 0,
};

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

// 自动快速登录或初始化测试账号
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

// ======================== 数据加载与指标计算 ========================

async function loadCategories() {
  state.categories = await apiRequest('/categories');
  renderCategorySegmented();
  renderCategorySelect();
}

async function loadGears() {
  let url = '/gears';
  const params = new URLSearchParams();
  if (state.selectedCategoryId) params.append('category_id', state.selectedCategoryId);
  if (state.searchKeyword) params.append('keyword', state.searchKeyword);
  if (params.toString()) url += `?${params.toString()}`;

  const data = await apiRequest(url);
  state.gears = data.gears || [];

  // 计算关键指标
  const totalCount = data.total_count || 0;
  const totalKg = ((data.total_weight_grams || 0) / 1000).toFixed(1);

  // 基础重量 (排除消耗品)
  let baseWeightGrams = 0;
  state.gears.forEach(g => {
    if (g.category_id !== 'cat_consumable') {
      baseWeightGrams += g.weight_grams;
    }
  });
  const baseKg = (baseWeightGrams / 1000).toFixed(1);

  // 更新指标卡片
  document.getElementById('stat-total-count').textContent = totalCount;
  document.getElementById('stat-total-weight').textContent = totalKg;
  document.getElementById('stat-base-weight').textContent = baseKg;

  // 背负级别评估 (UL / 3S / HV)
  const ulLevelEl = document.getElementById('stat-ul-level');
  const ulDescEl = document.getElementById('stat-ul-desc');
  if (baseWeightGrams < 4500) {
    ulLevelEl.textContent = 'UL';
    ulDescEl.textContent = '轻量徒步';
  } else if (baseWeightGrams < 9000) {
    ulLevelEl.textContent = '3S';
    ulDescEl.textContent = '三季通用';
  } else {
    ulLevelEl.textContent = 'HV';
    ulDescEl.textContent = '重装穿越';
  }

  document.getElementById('sticker-stage-count').textContent = `${totalCount} 件好物`;

  renderStickerStage();
  renderGearsGrid();
}

async function loadTrips() {
  state.trips = await apiRequest('/trips');
  renderTripsList();
}

async function loadTripDetail(tripId) {
  state.currentTripId = tripId;
  state.currentTripDetail = await apiRequest(`/trips/${tripId}`);
  renderTripDetail();
  switchTab('trip-detail');
}

// ======================== 界面渲染 (山系现代纯净) ========================

// 顶部 Segmented Control
function renderCategorySegmented() {
  const container = document.getElementById('category-segmented');
  let html = `
    <button onclick="selectCategory('')" 
      class="seg-btn px-3.5 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${state.selectedCategoryId === '' ? 'bg-pine-800 text-white shadow-sm' : 'bg-white text-stone-700 border border-stone-200/80 hover:bg-chalk-100'}">
      全部
    </button>
  `;

  state.categories.forEach(c => {
    const isAct = state.selectedCategoryId === c.id;
    const shortName = c.name.split(' ')[0];
    html += `
      <button onclick="selectCategory('${c.id}')" 
        class="seg-btn px-3.5 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${isAct ? 'bg-pine-800 text-white shadow-sm' : 'bg-white text-stone-700 border border-stone-200/80 hover:bg-chalk-100'}">
        ${shortName}
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectCategory(id) {
  state.selectedCategoryId = id;
  renderCategorySegmented();
  loadGears();
}

function renderCategorySelect() {
  const select = document.getElementById('maker-category');
  if (select) {
    select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

// 核心高光：山野营地装备垫贴纸陈列 (Camp Mat Stage)
function renderStickerStage() {
  const stage = document.getElementById('sticker-stage');
  if (state.gears.length === 0) {
    stage.innerHTML = `
      <div class="text-center text-stone-500">
        <i class="fa-solid fa-mountain-sun text-3xl mb-1.5 opacity-40 text-stone-600"></i>
        <p class="text-xs font-medium">陈列垫暂无贴纸，点击制作您的第一件贴纸装备</p>
      </div>
    `;
    return;
  }

  // 取装备贴纸在营地垫上自然散落
  const stickersWithImg = state.gears.filter(g => g.sticker_image_url);
  const displayItems = stickersWithImg.length > 0 ? stickersWithImg : state.gears;

  stage.innerHTML = `
    <div class="relative w-full h-full flex items-center justify-center">
      ${displayItems.slice(0, 10).map((g, idx) => {
        const count = Math.min(displayItems.length, 10);
        const step = (idx / count) * Math.PI * 2;
        const radiusX = 85 + ((idx * 19) % 40);
        const radiusY = 28 + ((idx * 11) % 28);
        const posX = Math.cos(step) * radiusX;
        const posY = Math.sin(step) * radiusY;
        const angle = ((idx * 31) % 28) - 14;
        const zIndex = 10 + idx;

        return `
          <div class="absolute sticker-floating cursor-pointer group"
            style="transform: translate(${posX}px, ${posY}px) rotate(${angle}deg); z-index: ${zIndex};"
            onclick="confirmDeleteGear('${g.id}', '${g.name.replace(/'/g, "\\'")}')"
            title="${g.name} (${g.weight_grams}g)">
            
            ${g.sticker_image_url 
              ? `<img src="${g.sticker_image_url}" class="w-16 h-16 object-contain filter drop-shadow-md" alt="${g.name}">`
              : `<div class="w-14 h-14 bg-white border-2 border-pine-800 rounded-2xl flex items-center justify-center text-pine-900 shadow-md font-bold text-xs">
                  ${g.name.slice(0, 2)}
                 </div>`
            }
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// 装备卡片网格
function renderGearsGrid() {
  const container = document.getElementById('gears-grid');
  if (state.gears.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 py-10 text-center text-stone-400">
        <i class="fa-solid fa-box-open text-3xl mb-1.5 opacity-40"></i>
        <p class="text-xs">暂无装备</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.gears.map((g, index) => {
    const angle = ((index * 37) % 24 - 12) / 10;
    const weightStr = g.weight_grams >= 1000 
      ? `${(g.weight_grams / 1000).toFixed(2)} kg` 
      : `${g.weight_grams} g`;

    return `
      <div class="card-modern p-3.5 flex flex-col justify-between cursor-pointer hover:border-pine-800/40 transition group"
        onclick="confirmDeleteGear('${g.id}', '${g.name.replace(/'/g, "\\'")}')">
        
        <!-- 贴纸居中展示区 -->
        <div class="h-28 bg-chalk-100/90 rounded-2xl flex items-center justify-center p-2 overflow-hidden relative border border-chalk-200/60">
          ${g.sticker_image_url 
            ? `<img src="${g.sticker_image_url}" class="max-h-full max-w-full object-contain filter drop-shadow-sm transition transform group-hover:scale-105" style="transform: rotate(${angle}deg);" alt="${g.name}">`
            : `<i class="fa-solid fa-tent text-3xl text-pine-800"></i>`
          }
        </div>

        <div class="mt-2.5">
          ${g.brand ? `<p class="text-[10px] font-bold text-terracotta-500 tracking-wider truncate uppercase">${g.brand}</p>` : ''}
          <h4 class="text-xs font-bold text-stone-900 truncate mt-0.5">${g.name}</h4>
          
          <div class="flex justify-between items-center mt-2 pt-2 border-t border-chalk-200">
            <span class="text-[11px] font-bold text-pine-800 num-display bg-pine-800/5 px-2 py-0.5 rounded-md">
              ${weightStr}
            </span>
            <span class="text-[9px] text-stone-500 truncate max-w-[65px]">
              ${g.category_name ? g.category_name.split(' ')[0] : ''}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 行程列表
function renderTripsList() {
  const container = document.getElementById('trips-list');
  if (state.trips.length === 0) {
    container.innerHTML = `
      <div class="card-modern py-12 text-center text-stone-400">
        <i class="fa-solid fa-mountain text-4xl mb-2 opacity-30 text-stone-500"></i>
        <p class="text-xs">暂无行程安排，点击右上角新建</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.trips.map(t => {
    const s = t.stats || { total_items: 0, packed_items: 0, total_weight_grams: 0, base_weight_grams: 0 };
    const progress = s.total_items === 0 ? 0 : Math.round((s.packed_items / s.total_items) * 100);
    const baseKg = (s.base_weight_grams / 1000).toFixed(1);

    return `
      <div onclick="loadTripDetail('${t.id}')" class="card-modern p-5 cursor-pointer hover:border-pine-800/40 transition space-y-3">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="text-base font-bold text-stone-900">${t.title}</h4>
            ${t.description ? `<p class="text-xs text-stone-500 mt-1 line-clamp-1">${t.description}</p>` : ''}
          </div>
          <span class="text-[10px] bg-pine-800/10 text-pine-800 font-bold px-2.5 py-1 rounded-full border border-pine-800/20">
            ${progress === 100 && s.total_items > 0 ? '已打包齐备 ✅' : '筹备中'}
          </span>
        </div>

        <div>
          <div class="flex justify-between text-xs text-stone-600 font-medium mb-1.5">
            <span>打包进度: ${s.packed_items}/${s.total_items} 件</span>
            <span class="text-pine-800 font-bold">基础重量: ${baseKg} kg</span>
          </div>
          <div class="w-full bg-chalk-200 h-2 rounded-full overflow-hidden">
            <div class="bg-pine-800 h-full rounded-full transition-all duration-300" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 行程详情
function renderTripDetail() {
  const t = state.currentTripDetail;
  if (!t) return;

  document.getElementById('detail-trip-title').textContent = t.title;
  document.getElementById('detail-trip-desc').textContent = t.description || '无附加路线说明';

  const s = t.stats || { total_items: 0, packed_items: 0, total_weight_grams: 0, base_weight_grams: 0 };
  document.getElementById('detail-packed-count').textContent = `${s.packed_items}/${s.total_items}`;
  document.getElementById('detail-base-weight').textContent = `${(s.base_weight_grams / 1000).toFixed(1)} kg`;
  document.getElementById('detail-total-weight').textContent = `${(s.total_weight_grams / 1000).toFixed(1)} kg`;

  const container = document.getElementById('detail-items-list');
  const items = t.items || [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="card-modern py-12 text-center text-stone-400 border-dashed">
        <i class="fa-solid fa-list-check text-3xl mb-2 opacity-30"></i>
        <p class="text-xs">清单空空如也，点击右上角挑选装备加入</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="card-modern p-3.5 flex items-center justify-between shadow-sm">
      <div class="flex items-center space-x-3">
        <input type="checkbox" ${item.is_packed ? 'checked' : ''} 
          onchange="toggleItemPacked('${item.trip_item_id}', this.checked)"
          class="w-4 h-4 text-pine-800 rounded border-stone-300 focus:ring-pine-800 cursor-pointer">
        <div>
          <p class="text-xs font-bold ${item.is_packed ? 'line-through text-stone-400' : 'text-stone-900'}">${item.gear_name}</p>
          <p class="text-[10px] text-stone-500">${item.gear_brand || ''} · ${item.weight_grams}g</p>
        </div>
      </div>
      <span class="text-[10px] font-bold ${item.is_packed ? 'text-pine-800 bg-pine-800/10' : 'text-stone-500 bg-chalk-200'} px-2.5 py-1 rounded-full">
        ${item.is_packed ? '已就绪 ✅' : '待整理 ⏳'}
      </span>
    </div>
  `).join('');
}

async function toggleItemPacked(itemId, isPacked) {
  await apiRequest(`/trips/${state.currentTripId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_packed: isPacked }),
  });
  state.currentTripDetail = await apiRequest(`/trips/${state.currentTripId}`);
  renderTripDetail();
  loadTrips();
}

// ======================== 贴纸工坊核心算法 (Canvas Client-side) ========================

const canvas = document.getElementById('sticker-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const strokeSlider = document.getElementById('stroke-slider');
const strokeValText = document.getElementById('stroke-val');
const autoCutoutToggle = document.getElementById('auto-cutout-toggle');

strokeSlider.addEventListener('input', (e) => {
  strokeValText.textContent = `${e.target.value} px`;
  if (state.currentImageSource) {
    processSticker(state.currentImageSource, parseInt(e.target.value));
  }
});

if (autoCutoutToggle) {
  autoCutoutToggle.addEventListener('change', () => {
    if (state.currentImageSource) {
      processSticker(state.currentImageSource, parseInt(strokeSlider.value));
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
      // 1. 预压缩下采样：限制最大 1200px 避免内存臃肿
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
        processSticker(downsampledImg, parseInt(strokeSlider.value));
      };
      downsampledImg.src = preCanvas.toDataURL('image/jpeg', 0.9);
    };
    rawImg.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 智能背景消除 (智能抠图算子)
function smartRemoveBackground(img) {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.width;
  offscreen.height = img.height;
  const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
  offCtx.drawImage(img, 0, 0);

  const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imgData.data;
  const w = offscreen.width;
  const h = offscreen.height;

  let transparentBorderCount = 0;
  for (let x = 0; x < w; x++) {
    if (data[x * 4 + 3] < 50) transparentBorderCount++;
    if (data[((h - 1) * w + x) * 4 + 3] < 50) transparentBorderCount++;
  }
  if (transparentBorderCount > w * 0.4) {
    return offscreen;
  }

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  let bgR = 0, bgG = 0, bgB = 0;
  for (const [cx, cy] of corners) {
    const idx = (cy * w + cx) * 4;
    bgR += data[idx];
    bgG += data[idx + 1];
    bgB += data[idx + 2];
  }
  bgR = Math.round(bgR / 4);
  bgG = Math.round(bgG / 4);
  bgB = Math.round(bgB / 4);

  const visited = new Uint8Array(w * h);
  const queue = [];
  const colorTolerance = 45;

  function isBgColor(idx) {
    const r = data[idx], g = data[idx + 1], b = data[idx + 2];
    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
    return dist < colorTolerance;
  }

  for (let x = 0; x < w; x++) {
    const topIdx = x * 4;
    if (isBgColor(topIdx)) { queue.push(x, 0); visited[x] = 1; }
    const botIdx = ((h - 1) * w + x) * 4;
    if (isBgColor(botIdx)) { queue.push(x, h - 1); visited[(h - 1) * w + x] = 1; }
  }
  for (let y = 0; y < h; y++) {
    const leftIdx = y * w * 4;
    if (isBgColor(leftIdx) && !visited[y * w]) { queue.push(0, y); visited[y * w] = 1; }
    const rightIdx = (y * w + w - 1) * 4;
    if (isBgColor(rightIdx) && !visited[y * w + w - 1]) { queue.push(w - 1, y); visited[y * w + w - 1] = 1; }
  }

  let head = 0;
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (head < queue.length) {
    const qx = queue[head++];
    const qy = queue[head++];
    const pixIdx = (qy * w + qx) * 4;

    data[pixIdx + 3] = 0;

    for (let i = 0; i < 4; i++) {
      const nx = qx + dx[i];
      const ny = qy + dy[i];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nPos = ny * w + nx;
        if (!visited[nPos]) {
          visited[nPos] = 1;
          const nIdx = nPos * 4;
          if (isBgColor(nIdx)) {
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  offCtx.putImageData(imgData, 0, 0);
  return offscreen;
}

// 预设装备矢量渲染
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
    document.getElementById('maker-model').value = '20D 硅胶款';
    document.getElementById('maker-weight').value = '1250';
    document.getElementById('maker-desc').value = '双人自立式帐篷，抗风防雨';
    document.getElementById('maker-category').value = 'cat_shelter';
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
    document.getElementById('maker-model').value = 'Pro 65';
    document.getElementById('maker-weight').value = '2150';
    document.getElementById('maker-desc').value = '背负支撑极佳，适合多日长线穿越';
    document.getElementById('maker-category').value = 'cat_pack';
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
    document.getElementById('maker-model').value = 'WindMaster SOD-310';
    document.getElementById('maker-weight').value = '67';
    document.getElementById('maker-desc').value = '强抗风稳压微型气炉';
    document.getElementById('maker-category').value = 'cat_cook';
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
    document.getElementById('maker-brand').value = 'Snow Peak 雪峰';
    document.getElementById('maker-model').value = 'MG-143';
    document.getElementById('maker-weight').value = '70';
    document.getElementById('maker-desc').value = '轻量耐用，折叠手柄';
    document.getElementById('maker-category').value = 'cat_cook';
  }

  const img = new Image();
  img.onload = () => {
    state.currentImageSource = img;
    processSticker(img, parseInt(strokeSlider.value));
  };
  img.src = sampleCanvas.toDataURL();
}

function openMakerWithPreset() {
  switchTab('maker');
  loadGearPreset('tent');
}

// 核心贴纸描边算法
function processSticker(imgSource, strokeWidth) {
  document.getElementById('upload-placeholder').classList.add('hidden');
  canvas.classList.remove('hidden');
  const badge = document.getElementById('change-photo-badge');
  if (badge) badge.classList.remove('hidden');

  let renderSource = imgSource;
  if (autoCutoutToggle && autoCutoutToggle.checked) {
    renderSource = smartRemoveBackground(imgSource);
  }

  const padding = strokeWidth + 12;
  canvas.width = renderSource.width + padding * 2;
  canvas.height = renderSource.height + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 绘制纯白立体描边 (Sticker Pure White Outline)
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

  // 2. 覆盖柔和真实物理阴影 (Drop Shadow on Light Background)
  ctx.shadowColor = 'rgba(40, 35, 28, 0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;

  // 3. 覆盖原始主体在正中央
  ctx.drawImage(renderSource, padding, padding);
  ctx.restore();
}

// 贴纸紧密包围盒裁剪与极速压缩 (800px 规格化 + WebP 高效无损/透明压缩)
async function compressAndTrimSticker(sourceCanvas, maxDimension = 800) {
  const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const imgData = sCtx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. 扫描非透明内容包围盒 (Bounding Box)
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

  // 若为空白画面，回退至原画布
  if (!hasPixels) {
    minX = 0; minY = 0; maxX = w; maxY = h;
  }

  // 添加 6px 安全呼吸边距
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w, maxX + pad);
  maxY = Math.min(h, maxY + pad);

  const cropW = maxX - minX;
  const cropH = maxY - minY;

  // 2. 缩放到规范尺寸 (最大 maxDimension)
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

  // 3. 压缩为带透明度的 WebP 或 PNG
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

  // 更新前端压缩看板数据
  const compressedKb = Math.round(blob.size / 1024);
  const infoText = document.getElementById('compress-info-text');
  const sizePill = document.getElementById('compress-size-pill');

  if (infoText && sizePill) {
    if (state.rawFileSize > 0) {
      const rawMb = (state.rawFileSize / (1024 * 1024)).toFixed(1);
      const ratio = Math.round((1 - blob.size / state.rawFileSize) * 100);
      infoText.textContent = `原图 ${rawMb}MB → 贴纸 ${compressedKb}KB (规格 ${targetW}x${targetH}px)`;
      sizePill.textContent = `体积缩减 ${Math.max(10, ratio)}%`;
    } else {
      infoText.textContent = `贴纸已压缩优化: ${compressedKb} KB (${targetW}x${targetH}px)`;
      sizePill.textContent = '轻量已优化';
    }
  }

  return blob;
}

async function saveGearFromMaker() {
  const name = document.getElementById('maker-name').value.trim();
  const categoryId = document.getElementById('maker-category').value;
  const weight = parseFloat(document.getElementById('maker-weight').value);
  const brand = document.getElementById('maker-brand').value.trim();
  const model = document.getElementById('maker-model').value.trim();
  const desc = document.getElementById('maker-desc').value.trim();

  if (!name || isNaN(weight)) {
    alert('请填写装备名称与重量！');
    return;
  }

  const btn = document.getElementById('save-gear-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在压缩并上传 Cloudflare R2...`;

  try {
    // 自动裁剪多余空白边并压缩
    const compressedBlob = await compressAndTrimSticker(canvas, 800);
    const formData = new FormData();
    formData.append('file', compressedBlob, 'sticker.webp');
    formData.append('type', 'gear_sticker');

    const uploadRes = await apiRequest('/storage/upload', {
      method: 'POST',
      body: formData,
    });

    await apiRequest('/gears', {
      method: 'POST',
      body: JSON.stringify({
        category_id: categoryId,
        name,
        brand,
        model,
        weight_grams: weight,
        description: desc,
        sticker_image_url: uploadRes.url,
      }),
    });

    await loadGears();
    switchTab('closet');
  } catch (e) {
    alert(`保存失败: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> 保存并上传到 Cloudflare`;
  }
}

async function confirmDeleteGear(gearId, name) {
  if (confirm(`确定要从装备柜删除 "${name}" 吗？`)) {
    await apiRequest(`/gears/${gearId}`, { method: 'DELETE' });
    await loadGears();
  }
}

// 行程弹窗与添加
function openCreateTripModal() {
  document.getElementById('modal-create-trip').classList.remove('hidden');
}

async function submitCreateTrip() {
  const title = document.getElementById('trip-modal-title').value.trim();
  const desc = document.getElementById('trip-modal-desc').value.trim();
  if (!title) return alert('请输入行程标题');

  const now = Date.now();
  await apiRequest('/trips', {
    method: 'POST',
    body: JSON.stringify({
      title,
      description: desc,
      start_date: now,
      end_date: now + 86400000 * 2,
    }),
  });

  closeModal('modal-create-trip');
  loadTrips();
}

function openAddGearToTripModal() {
  const existingIds = new Set((state.currentTripDetail?.items || []).map(i => i.gear_id));
  const available = state.gears.filter(g => !existingIds.has(g.id));

  const listEl = document.getElementById('available-gears-list');
  if (available.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-6">装备柜中暂无新装备可添加</p>`;
  } else {
    listEl.innerHTML = available.map(g => `
      <label class="flex items-center space-x-3 p-3 rounded-xl hover:bg-chalk-100 border border-stone-200 cursor-pointer">
        <input type="checkbox" value="${g.id}" class="gear-add-checkbox w-4 h-4 text-pine-800 rounded">
        <div>
          <p class="text-xs font-bold text-stone-900">${g.name}</p>
          <p class="text-[10px] text-stone-500">${g.brand || ''} · ${g.weight_grams}g</p>
        </div>
      </label>
    `).join('');
  }

  document.getElementById('modal-add-gear').classList.remove('hidden');
}

async function submitAddGearsToTrip() {
  const checked = Array.from(document.querySelectorAll('.gear-add-checkbox:checked')).map(cb => cb.value);
  if (checked.length === 0) return alert('请勾选装备');

  await apiRequest(`/trips/${state.currentTripId}/items`, {
    method: 'POST',
    body: JSON.stringify({ gear_ids: checked }),
  });

  closeModal('modal-add-gear');
  state.currentTripDetail = await apiRequest(`/trips/${state.currentTripId}`);
  renderTripDetail();
  loadTrips();
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ======================== Tab 切换与底栏 Dock ========================

function switchTab(tab) {
  state.activeTab = tab;
  const views = ['closet', 'trips', 'maker', 'trip-detail'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== tab);
  });

  // Dock 按钮高亮 (浅色山系)
  const dockCloset = document.getElementById('dock-closet');
  const dockTrips = document.getElementById('dock-trips');
  const dockMaker = document.getElementById('dock-maker');

  [dockCloset, dockTrips, dockMaker].forEach(b => {
    b.className = 'w-12 h-10 rounded-2xl flex items-center justify-center text-stone-500 hover:text-stone-900 transition';
  });

  if (tab === 'closet') {
    dockCloset.className = 'w-12 h-10 rounded-2xl flex items-center justify-center text-white bg-pine-800 transition shadow-sm';
    document.getElementById('header-title').textContent = '装备收纳';
  } else if (tab === 'trips' || tab === 'trip-detail') {
    dockTrips.className = 'w-12 h-10 rounded-2xl flex items-center justify-center text-white bg-pine-800 transition shadow-sm';
    document.getElementById('header-title').textContent = '行程清单';
  } else if (tab === 'maker') {
    dockMaker.className = 'w-12 h-10 rounded-2xl flex items-center justify-center text-white bg-pine-800 transition shadow-sm';
    document.getElementById('header-title').textContent = '贴纸工坊';
  }
}

// 搜索框监听
document.getElementById('search-input').addEventListener('input', (e) => {
  state.searchKeyword = e.target.value.trim();
  loadGears();
});

// 初始化启动
async function bootstrap() {
  await initAuth();
  await loadCategories();
  await loadGears();
  await loadTrips();
}

bootstrap();
