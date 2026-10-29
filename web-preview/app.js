// Trail Gear — 现代极简贴纸主页交互引擎
const API_BASE = 'https://trail-gear-api.liuziting.workers.dev/api/v1';

let state = {
  token: null,
  user: null,
  categories: [],
  gears: [],
  trips: [],
  layoutMode: 'scattered', // 'scattered' (随性散落) | 'grid' (一键整理对齐)
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
  const select = document.getElementById('maker-category');
  if (select) {
    select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
}

async function loadGears() {
  const data = await apiRequest('/gears');
  state.gears = data.gears || [];

  // 计算关键指标
  const totalCount = data.total_count || 0;
  const totalKg = ((data.total_weight_grams || 0) / 1000).toFixed(1);

  let baseWeightGrams = 0;
  state.gears.forEach(g => {
    if (g.category_id !== 'cat_consumable') {
      baseWeightGrams += g.weight_grams;
    }
  });
  const baseKg = (baseWeightGrams / 1000).toFixed(1);

  // 顶部极简信息更新
  document.getElementById('stat-count-pill').textContent = `${totalCount} 件`;
  document.getElementById('stat-weight-text').textContent = `总负重 ${totalKg} kg · 基础 ${baseKg} kg`;

  renderStickersCanvas();
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

// ======================== 核心贴纸主页渲染：随机平铺与一键整理 ========================

// 切换布局模式：散落 vs 整理
function toggleLayoutMode() {
  state.layoutMode = state.layoutMode === 'scattered' ? 'grid' : 'scattered';
  const btnText = document.getElementById('layout-btn-text');
  const icon = document.getElementById('layout-icon');
  const reshuffleBtn = document.getElementById('reshuffle-btn');

  if (state.layoutMode === 'grid') {
    btnText.textContent = '随性散落';
    icon.className = 'fa-solid fa-dice text-pine-800';
    reshuffleBtn.classList.add('hidden');
  } else {
    btnText.textContent = '一键整理';
    icon.className = 'fa-solid fa-grip text-pine-800';
    reshuffleBtn.classList.remove('hidden');
  }

  renderStickersCanvas();
}

// 重新摇乱散落
function reshuffleScattered() {
  if (state.layoutMode !== 'scattered') return;
  // 更新随机种子
  state.scatterSeed = Math.random();
  renderStickersCanvas();
}

// 渲染贴纸主画布
function renderStickersCanvas() {
  const container = document.getElementById('stickers-container');
  if (state.gears.length === 0) {
    container.className = 'relative flex flex-col items-center justify-center py-24 text-stone-400';
    container.innerHTML = `
      <i class="fa-solid fa-layer-group text-4xl mb-3 opacity-30 text-stone-500"></i>
      <p class="text-sm font-bold text-stone-700">桌面空空如也</p>
      <p class="text-xs text-stone-400 mt-1">点击右下角按钮拍照，生成第一张装备贴纸！</p>
    `;
    return;
  }

  if (state.layoutMode === 'grid') {
    // 【整理对齐模式】：整齐的 3 列现代化轻盈陈列网格
    container.className = 'grid grid-cols-3 gap-3.5 transition-all duration-500';
    container.innerHTML = state.gears.map((g, idx) => `
      <div class="sticker-item bg-white/90 p-2.5 rounded-2xl border border-stone-200/80 shadow-sm flex flex-col items-center justify-between transition-all group"
        onclick="openGearDetailModal('${g.id}')">
        <div class="w-full h-20 flex items-center justify-center p-1 overflow-hidden">
          ${g.sticker_image_url 
            ? `<img src="${g.sticker_image_url}" class="max-h-full max-w-full object-contain filter drop-shadow" alt="${g.name}">`
            : `<div class="w-12 h-12 bg-stone-100 rounded-xl flex items-center justify-center text-pine-800 font-bold text-xs">${g.name.slice(0, 2)}</div>`
          }
        </div>
        <p class="text-[11px] font-bold text-stone-900 truncate w-full text-center mt-1.5">${g.name}</p>
        <span class="text-[9px] font-extrabold text-pine-800 bg-pine-800/10 px-1.5 py-0.5 rounded mt-0.5">
          ${g.weight_grams >= 1000 ? (g.weight_grams / 1000).toFixed(1) + 'kg' : g.weight_grams + 'g'}
        </span>
      </div>
    `).join('');
  } else {
    // 【随性散落平铺模式】：自由流动自然堆叠，犹如真实的户外贴纸手账
    container.className = 'grid grid-cols-2 gap-y-4 gap-x-2 transition-all duration-500 py-2';
    
    container.innerHTML = state.gears.map((g, idx) => {
      // 计算每个贴纸自然的手账倾斜与微位移
      const hash = (g.id.charCodeAt(0) * 17 + idx * 31) % 100;
      const angle = (hash % 18) - 9; // -9° ~ +9°
      const shiftX = (hash % 10) - 5;
      const weightStr = g.weight_grams >= 1000 
        ? `${(g.weight_grams / 1000).toFixed(1)} kg` 
        : `${g.weight_grams} g`;

      return `
        <div class="sticker-item relative flex flex-col items-center p-2 group"
          style="transform: translate(${shiftX}px, 0px) rotate(${angle}deg); z-index: ${10 + (idx % 20)};"
          onclick="openGearDetailModal('${g.id}')">
          
          <!-- 贴纸实体 (纯白外边 + 自然立体阴影) -->
          <div class="relative max-h-32 flex items-center justify-center">
            ${g.sticker_image_url 
              ? `<img src="${g.sticker_image_url}" class="max-h-28 max-w-full object-contain filter drop-shadow-md select-none pointer-events-none" alt="${g.name}">`
              : `<div class="w-20 h-20 bg-white border-2 border-stone-800 rounded-3xl flex items-center justify-center text-stone-900 shadow-md font-bold text-sm">${g.name.slice(0, 3)}</div>`
            }
          </div>

          <!-- 极轻巧便签说明 -->
          <div class="mt-1 text-center bg-white/75 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-stone-300/60 shadow-2xs">
            <span class="text-[10px] font-bold text-stone-900">${g.name}</span>
            <span class="text-[9px] text-pine-800 font-extrabold ml-1">${weightStr}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// 打开贴纸详情弹窗 (点击即可查看)
function openGearDetailModal(gearId) {
  const g = state.gears.find(item => item.id === gearId);
  if (!g) return;

  const modal = document.getElementById('modal-gear-detail');
  document.getElementById('detail-gear-name').textContent = g.name;
  document.getElementById('detail-gear-brand').textContent = g.brand || '自选好物';
  document.getElementById('detail-gear-cat').textContent = g.category_name || '未分类';
  document.getElementById('detail-gear-weight').textContent = g.weight_grams >= 1000 
    ? `${(g.weight_grams / 1000).toFixed(2)} kg` 
    : `${g.weight_grams} g`;
  document.getElementById('detail-gear-desc').textContent = g.description || '无附加说明';

  const imgEl = document.getElementById('detail-gear-img');
  if (g.sticker_image_url) {
    imgEl.src = g.sticker_image_url;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.classList.add('hidden');
  }

  // 绑定删除按钮
  const delBtn = document.getElementById('delete-gear-btn');
  delBtn.onclick = async () => {
    if (confirm(`确定要从装备库移除 "${g.name}" 吗？`)) {
      closeModal('modal-gear-detail');
      await apiRequest(`/gears/${g.id}`, { method: 'DELETE' });
      await loadGears();
    }
  };

  modal.classList.remove('hidden');
}

// 行程列表
function renderTripsList() {
  const container = document.getElementById('trips-list');
  if (state.trips.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-stone-400">
        <i class="fa-solid fa-mountain text-4xl mb-2 opacity-30 text-stone-500"></i>
        <p class="text-xs font-bold text-stone-700">暂无行程安排</p>
        <p class="text-[11px] text-stone-400 mt-0.5">点击右上角创建行程，挑选手账贴纸打包</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.trips.map(t => {
    const s = t.stats || { total_items: 0, packed_items: 0, total_weight_grams: 0, base_weight_grams: 0 };
    const progress = s.total_items === 0 ? 0 : Math.round((s.packed_items / s.total_items) * 100);
    const baseKg = (s.base_weight_grams / 1000).toFixed(1);

    return `
      <div onclick="loadTripDetail('${t.id}')" class="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-sm cursor-pointer hover:border-pine-800/40 transition space-y-2.5">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="text-sm font-bold text-stone-900">${t.title}</h4>
            ${t.description ? `<p class="text-xs text-stone-500 mt-0.5 line-clamp-1">${t.description}</p>` : ''}
          </div>
          <span class="text-[10px] bg-pine-800/10 text-pine-800 font-bold px-2 py-0.5 rounded-full">
            ${progress === 100 && s.total_items > 0 ? '已就绪 ✅' : '筹备中'}
          </span>
        </div>

        <div>
          <div class="flex justify-between text-[11px] text-stone-600 font-medium mb-1">
            <span>打包进度: ${s.packed_items}/${s.total_items} 件</span>
            <span class="text-pine-800 font-bold">基础重量: ${baseKg} kg</span>
          </div>
          <div class="w-full bg-stone-100 h-1.5 rounded-full overflow-hidden">
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
      <div class="py-12 text-center text-stone-400 bg-white rounded-2xl border border-dashed border-stone-200">
        <i class="fa-solid fa-list-check text-3xl mb-2 opacity-30"></i>
        <p class="text-xs">清单空空如也，点击右上角挑选手账贴纸加入</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="bg-white p-3 rounded-xl border border-stone-200/80 flex items-center justify-between shadow-2xs">
      <div class="flex items-center space-x-3">
        <input type="checkbox" ${item.is_packed ? 'checked' : ''} 
          onchange="toggleItemPacked('${item.trip_item_id}', this.checked)"
          class="w-4 h-4 text-pine-800 rounded border-stone-300 focus:ring-pine-800 cursor-pointer">
        <div>
          <p class="text-xs font-bold ${item.is_packed ? 'line-through text-stone-400' : 'text-stone-900'}">${item.gear_name}</p>
          <p class="text-[10px] text-stone-500">${item.gear_brand || ''} · ${item.weight_grams}g</p>
        </div>
      </div>
      <span class="text-[10px] font-bold ${item.is_packed ? 'text-pine-800 bg-pine-800/10' : 'text-stone-500 bg-stone-100'} px-2 py-0.5 rounded">
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

// ======================== 贴纸工坊核心算法与自动压缩 ========================

const canvas = document.getElementById('sticker-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const strokeSlider = document.getElementById('stroke-slider');
const strokeValText = document.getElementById('stroke-val');

strokeSlider.addEventListener('input', (e) => {
  strokeValText.textContent = `${e.target.value} px`;
  if (state.currentImageSource) {
    processSticker(state.currentImageSource, parseInt(e.target.value));
  }
});

document.getElementById('image-file-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  state.rawFileSize = file.size;

  const reader = new FileReader();
  reader.onload = (event) => {
    const rawImg = new Image();
    rawImg.onload = () => {
      // 预压缩至最大 1200px
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
    document.getElementById('maker-model').value = '20D 硅胶款';
    document.getElementById('maker-weight').value = '1250';
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
    document.getElementById('maker-model').value = 'SOD-310';
    document.getElementById('maker-weight').value = '67';
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
    document.getElementById('maker-brand').value = 'Snow Peak';
    document.getElementById('maker-model').value = 'MG-143';
    document.getElementById('maker-weight').value = '70';
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
  const categoryId = document.getElementById('maker-category').value;
  const weight = parseFloat(document.getElementById('maker-weight').value);
  const brand = document.getElementById('maker-brand').value.trim();
  const model = document.getElementById('maker-model').value.trim();

  if (!name || isNaN(weight)) {
    alert('请填写装备名称与重量！');
    return;
  }

  const btn = document.getElementById('save-gear-btn');
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 压缩并上传至 Cloudflare...`;

  try {
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
        description: '',
        sticker_image_url: uploadRes.url,
      }),
    });

    await loadGears();
    switchTab('closet');
  } catch (e) {
    alert(`保存失败: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-check"></i> 贴入装备柜`;
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
    listEl.innerHTML = `<p class="text-xs text-stone-500 text-center py-6">装备库中暂无新装备可添加</p>`;
  } else {
    listEl.innerHTML = available.map(g => `
      <label class="flex items-center space-x-3 p-3 rounded-xl hover:bg-stone-50 border border-stone-200 cursor-pointer">
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

// ======================== Tab 切换 ========================

function switchTab(tab) {
  state.activeTab = tab;
  const views = ['closet', 'trips', 'maker', 'trip-detail'];
  views.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== tab);
  });

  // FAB 仅在装备贴纸墙显示
  const fab = document.getElementById('fab-container');
  if (fab) fab.classList.toggle('hidden', tab !== 'closet');

  // 底栏在制作贴纸时隐藏，避免阻挡保存按钮
  const dock = document.getElementById('dock-container');
  if (dock) dock.classList.toggle('hidden', tab === 'maker');

  // 回滚主视口到顶部
  const mainContent = document.getElementById('main-content');
  if (mainContent) mainContent.scrollTop = 0;

  const dockCloset = document.getElementById('dock-closet');
  const dockTrips = document.getElementById('dock-trips');

  if (tab === 'closet') {
    dockCloset.className = 'flex items-center space-x-2 text-pine-800 font-black text-xs px-3 py-1.5 rounded-full bg-pine-800/10 transition';
    dockTrips.className = 'flex items-center space-x-2 text-stone-500 hover:text-stone-900 font-bold text-xs px-3 py-1.5 rounded-full transition';
  } else if (tab === 'trips' || tab === 'trip-detail') {
    dockTrips.className = 'flex items-center space-x-2 text-pine-800 font-black text-xs px-3 py-1.5 rounded-full bg-pine-800/10 transition';
    dockCloset.className = 'flex items-center space-x-2 text-stone-500 hover:text-stone-900 font-bold text-xs px-3 py-1.5 rounded-full transition';
  }
}

// 初始化启动
async function bootstrap() {
  await initAuth();
  await loadCategories();
  await loadGears();
  await loadTrips();
}

bootstrap();
