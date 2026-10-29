// Trail Gear Web 移动端原型交互引擎
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
      document.getElementById('user-name').textContent = state.user.nickname;
      return;
    } catch {
      state.token = null;
    }
  }

  // 尝试默认测试用户登录
  try {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@trailgear.app', password: 'trailgear2026' }),
    });
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('trailgear_token', res.token);
    document.getElementById('user-name').textContent = state.user.nickname;
  } catch {
    // 若不存在则注册
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
    document.getElementById('user-name').textContent = state.user.nickname;
  }
}

// ======================== 数据加载 ========================

async function loadCategories() {
  state.categories = await apiRequest('/categories');
  renderCategoryPills();
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

  document.getElementById('gear-count-text').textContent = `共 ${data.total_count} 件装备`;
  const kg = (data.total_weight_grams / 1000).toFixed(2);
  document.getElementById('gear-weight-badge').textContent = `总重 ${kg} kg`;

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

// ======================== 界面渲染 ========================

function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  let html = `
    <button onclick="selectCategory('')" 
      class="cat-pill px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${state.selectedCategoryId === '' ? 'bg-forest-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-200'}">
      全部
    </button>
  `;

  state.categories.forEach(c => {
    const isAct = state.selectedCategoryId === c.id;
    html += `
      <button onclick="selectCategory('${c.id}')" 
        class="cat-pill px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${isAct ? 'bg-forest-600 text-white shadow-sm' : 'bg-white text-gray-700 border border-gray-200'}">
        ${c.name.split(' ')[0]}
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectCategory(id) {
  state.selectedCategoryId = id;
  renderCategoryPills();
  loadGears();
}

function renderCategorySelect() {
  const select = document.getElementById('maker-category');
  select.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function renderGearsGrid() {
  const container = document.getElementById('gears-grid');
  if (state.gears.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 py-12 text-center text-gray-400">
        <i class="fa-solid fa-box-open text-4xl mb-2 text-gray-300"></i>
        <p class="text-xs">暂无装备，点击右下角添加第一张装备贴纸！</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.gears.map((g, index) => {
    // 产生稳定的轻微随机倾斜 (-2.5° ~ +2.5°)
    const angle = ((index * 37) % 50 - 25) / 10;
    const weightStr = g.weight_grams >= 1000 
      ? `${(g.weight_grams / 1000).toFixed(2)} kg` 
      : `${g.weight_grams} g`;

    return `
      <div class="sticker-card bg-white rounded-2xl p-3 border border-gray-100 flex flex-col justify-between cursor-pointer"
        style="transform: rotate(${angle}deg);"
        onclick="confirmDeleteGear('${g.id}', '${g.name.replace(/'/g, "\\'")}')">
        
        <!-- 贴纸图案区 -->
        <div class="h-28 bg-[#f8fafc] rounded-xl flex items-center justify-center p-2 overflow-hidden relative">
          ${g.sticker_image_url 
            ? `<img src="${g.sticker_image_url}" class="max-h-full max-w-full object-contain filter drop-shadow-sm" alt="${g.name}">`
            : `<i class="fa-solid fa-tent text-3xl text-emerald-600"></i>`
          }
        </div>

        <!-- 装备信息 -->
        <div class="mt-2.5">
          ${g.brand ? `<p class="text-[10px] font-bold text-gray-400 truncate">${g.brand}</p>` : ''}
          <h4 class="text-xs font-bold text-gray-800 truncate">${g.name}</h4>
          
          <div class="flex justify-between items-center mt-2">
            <span class="text-[10px] font-bold bg-forest-50 text-forest-700 px-1.5 py-0.5 rounded">
              ${weightStr}
            </span>
            <span class="text-[9px] text-gray-400 truncate max-w-[60px]">
              ${g.category_name ? g.category_name.split(' ')[0] : ''}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTripsList() {
  const container = document.getElementById('trips-list');
  if (state.trips.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-gray-400">
        <i class="fa-solid fa-mountain text-4xl mb-2 text-gray-300"></i>
        <p class="text-xs">暂无行程，点击右上角新建行程</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.trips.map(t => {
    const s = t.stats || { total_items: 0, packed_items: 0, total_weight_grams: 0, base_weight_grams: 0 };
    const progress = s.total_items === 0 ? 0 : Math.round((s.packed_items / s.total_items) * 100);
    const baseKg = (s.base_weight_grams / 1000).toFixed(2);

    return `
      <div onclick="loadTripDetail('${t.id}')" class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm cursor-pointer hover:border-forest-600 transition">
        <div class="flex justify-between items-start">
          <div>
            <h4 class="text-sm font-bold text-gray-800">${t.title}</h4>
            ${t.description ? `<p class="text-xs text-gray-400 mt-0.5 line-clamp-1">${t.description}</p>` : ''}
          </div>
          <span class="text-[10px] bg-forest-50 text-forest-700 font-bold px-2 py-0.5 rounded-full">
            ${progress === 100 && s.total_items > 0 ? '已就绪 ✅' : '筹备中'}
          </span>
        </div>

        <div class="mt-3">
          <div class="flex justify-between text-[11px] text-gray-500 font-medium mb-1">
            <span>打包进度: ${s.packed_items}/${s.total_items} 件</span>
            <span class="text-forest-700 font-bold">基础重量: ${baseKg} kg</span>
          </div>
          <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-forest-600 h-full rounded-full transition-all duration-300" style="width: ${progress}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTripDetail() {
  const t = state.currentTripDetail;
  if (!t) return;

  document.getElementById('detail-trip-title').textContent = t.title;
  document.getElementById('detail-trip-desc').textContent = t.description || '无附加路线说明';

  const s = t.stats || { total_items: 0, packed_items: 0, total_weight_grams: 0, base_weight_grams: 0 };
  document.getElementById('detail-packed-count').textContent = `${s.packed_items}/${s.total_items} 件`;
  document.getElementById('detail-base-weight').textContent = `${(s.base_weight_grams / 1000).toFixed(2)} kg`;
  document.getElementById('detail-total-weight').textContent = `${(s.total_weight_grams / 1000).toFixed(2)} kg`;

  const container = document.getElementById('detail-items-list');
  const items = t.items || [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="py-10 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
        <i class="fa-solid fa-list-check text-3xl mb-2 text-gray-300"></i>
        <p class="text-xs">清单还是空的，点击上方“从装备柜添加”</p>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="bg-white p-3 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm">
      <div class="flex items-center space-x-3">
        <input type="checkbox" ${item.is_packed ? 'checked' : ''} 
          onchange="toggleItemPacked('${item.trip_item_id}', this.checked)"
          class="w-4 h-4 text-forest-600 rounded border-gray-300 focus:ring-forest-600 cursor-pointer">
        <div>
          <p class="text-xs font-bold text-gray-800 ${item.is_packed ? 'line-through text-gray-400' : ''}">${item.gear_name}</p>
          <p class="text-[10px] text-gray-400">${item.gear_brand || ''} · ${item.weight_grams}g</p>
        </div>
      </div>
      <span class="text-[10px] font-bold ${item.is_packed ? 'text-forest-600 bg-forest-50' : 'text-orange-500 bg-orange-50'} px-2 py-0.5 rounded">
        ${item.is_packed ? '已打包 ✅' : '待收拾 ⏳'}
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

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      state.currentImageSource = img;
      // 自动设置文件名作为默认名称
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const nameInput = document.getElementById('maker-name');
      if (!nameInput.value || nameInput.value.includes('帐篷')) {
        nameInput.value = cleanName;
      }
      processSticker(img, parseInt(strokeSlider.value));
    };
    img.src = event.target.result;
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

  // 检查是否本身已经带透明通道（若大部分边缘已透明，则直接返回）
  let transparentBorderCount = 0;
  for (let x = 0; x < w; x++) {
    if (data[x * 4 + 3] < 50) transparentBorderCount++;
    if (data[((h - 1) * w + x) * 4 + 3] < 50) transparentBorderCount++;
  }
  if (transparentBorderCount > w * 0.4) {
    return offscreen; // 已经是透明 PNG，直接使用
  }

  // 取 4 个顶角的采样背景色
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

  // 泛洪/边缘扩散抠出背景
  const visited = new Uint8Array(w * h);
  const queue = [];

  // 将四边像素中与背景相近的点作为种子注入队列
  const colorTolerance = 45; // 色差容限

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

    // 清除为透明
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

// 预设装备图形库
function loadGearPreset(type) {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 300;
  sampleCanvas.height = 300;
  const sCtx = sampleCanvas.getContext('2d');

  if (type === 'tent') {
    // 帐篷
    sCtx.fillStyle = '#10b981';
    sCtx.beginPath();
    sCtx.moveTo(150, 40);
    sCtx.lineTo(260, 240);
    sCtx.lineTo(40, 240);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#047857';
    sCtx.beginPath();
    sCtx.moveTo(150, 80);
    sCtx.lineTo(210, 240);
    sCtx.lineTo(90, 240);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#fbbf24';
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
    // 背包
    sCtx.fillStyle = '#3b82f6';
    sCtx.roundRect(80, 70, 140, 180, 24);
    sCtx.fill();

    sCtx.fillStyle = '#1d4ed8';
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
    // 气炉
    sCtx.fillStyle = '#ef4444';
    sCtx.roundRect(100, 160, 100, 70, 16);
    sCtx.fill();

    sCtx.fillStyle = '#9ca3af';
    sCtx.fillRect(135, 110, 30, 50);

    sCtx.fillStyle = '#f97316';
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
    // 钛杯
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

// 打开贴纸制作器
function openMakerWithPreset() {
  switchTab('maker');
  loadGearPreset('tent');
}

// 核心贴纸描边算法：智能抠图 + 多向形态学膨胀 + 白色圆角描边 + 柔和阴影
function processSticker(imgSource, strokeWidth) {
  document.getElementById('upload-placeholder').classList.add('hidden');
  canvas.classList.remove('hidden');
  const badge = document.getElementById('change-photo-badge');
  if (badge) badge.classList.remove('hidden');

  // 若开启自动抠图，先进行端侧背景消除
  let renderSource = imgSource;
  if (autoCutoutToggle && autoCutoutToggle.checked) {
    renderSource = smartRemoveBackground(imgSource);
  }

  const padding = strokeWidth + 12;
  canvas.width = renderSource.width + padding * 2;
  canvas.height = renderSource.height + padding * 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. 绘制多层白色偏移生成膨胀描边 (Sticker Stroke)
  const steps = 36;
  ctx.save();
  for (let r = strokeWidth; r >= 1; r -= 2) {
    for (let i = 0; i < steps; i++) {
      const angle = (i * 2 * Math.PI) / steps;
      const ox = padding + Math.cos(angle) * r;
      const oy = padding + Math.sin(angle) * r;

      ctx.shadowColor = 'rgba(255, 255, 255, 0.95)';
      ctx.shadowBlur = 3;
      ctx.drawImage(renderSource, ox, oy);
    }
  }

  // 2. 覆盖柔和环境投影 (Drop Shadow)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.14)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // 3. 覆盖原始主体在正中央
  ctx.drawImage(renderSource, padding, padding);
  ctx.restore();
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
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在上传到 Cloudflare...`;

  try {
    // 导出 Canvas 为透明 PNG
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const formData = new FormData();
    formData.append('file', blob, 'sticker.png');
    formData.append('type', 'gear_sticker');

    // 上传到 Cloudflare R2
    const uploadRes = await apiRequest('/storage/upload', {
      method: 'POST',
      body: formData,
    });

    // 保存到 Cloudflare D1
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
    alert('🎉 贴纸装备已成功上传至 Cloudflare R2 与 D1！');
  } catch (e) {
    alert(`保存失败: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> 保存贴纸到装备柜`;
  }
}

async function confirmDeleteGear(gearId, name) {
  if (confirm(`确定要从装备柜删除 "${name}" 吗？`)) {
    await apiRequest(`/gears/${gearId}`, { method: 'DELETE' });
    await loadGears();
  }
}

// ======================== 行程创建与添加装备 ========================

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
    listEl.innerHTML = `<p class="text-xs text-gray-400 text-center py-6">装备柜中暂无新装备可添加</p>`;
  } else {
    listEl.innerHTML = available.map(g => `
      <label class="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 border border-gray-100 cursor-pointer">
        <input type="checkbox" value="${g.id}" class="gear-add-checkbox w-4 h-4 text-forest-600 rounded">
        <div>
          <p class="text-xs font-bold text-gray-800">${g.name}</p>
          <p class="text-[10px] text-gray-400">${g.brand || ''} · ${g.weight_grams}g</p>
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

  // FAB 悬浮按钮仅在装备柜显示
  document.getElementById('fab-maker').classList.toggle('hidden', tab !== 'closet');

  // Tab 按钮高亮
  const tabCloset = document.getElementById('tab-closet');
  const tabTrips = document.getElementById('tab-trips');
  if (tab === 'closet') {
    tabCloset.className = 'flex flex-col items-center text-forest-600 font-bold space-y-1';
    tabTrips.className = 'flex flex-col items-center text-gray-400 hover:text-gray-600 font-medium space-y-1';
    document.getElementById('header-title').textContent = '装备柜 Gear Closet';
  } else if (tab === 'trips' || tab === 'trip-detail') {
    tabTrips.className = 'flex flex-col items-center text-forest-600 font-bold space-y-1';
    tabCloset.className = 'flex flex-col items-center text-gray-400 hover:text-gray-600 font-medium space-y-1';
    document.getElementById('header-title').textContent = '行程清单 Trips';
  } else if (tab === 'maker') {
    document.getElementById('header-title').textContent = '贴纸工坊 Sticker Studio';
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
