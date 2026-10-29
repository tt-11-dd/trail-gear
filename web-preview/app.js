// Trail Gear — 纯粹贴纸主页交互引擎 (拍照 -> 生成贴纸 -> 展示)
const API_BASE = 'https://gear.tether-code.xyz/api/v1';

let state = {
  token: null,
  user: null,
  categories: [],
  gears: [],
  layoutMode: 'scattered', // 'scattered' (随性散落) | 'grid' (一键整理对齐)
  currentView: 'closet',   // 'closet' | 'camera' | 'maker'
  currentImageSource: null,
  rawFileSize: 0,
  positions: {},           // gearId -> { x, y, rot, rotStart, zIndex }
  maxZIndex: 20,
  newlyCreatedGearId: null, // 标记刚创建的新贴纸，用于触发独立下落动效
};

let cameraStream = null;
let currentFacingMode = 'environment';

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

// 重新散落：清除位置缓存，真正基于重力法则随机散落到装备垫各处并重力掉落
function reshuffleScattered() {
  if (state.layoutMode !== 'scattered') return;
  generateGravityScatterPositions(true);
  renderStickersCanvas(true);
}

// 真实物理重力散落引擎：在收纳垫纵向空间内自然沉降分布，每次点击都是全新布局
function generateGravityScatterPositions(forceRandom = false) {
  const container = document.getElementById('stickers-container');
  const w = container?.clientWidth || 340;
  const h = Math.max(440, container?.clientHeight || 460);

  const minX = 12;
  const maxX = Math.max(minX + 20, w - 150);
  const minY = 16;
  const maxY = Math.max(minY + 60, h - 135);

  const total = state.gears.length;
  if (total === 0) return;

  // 如果已有保存的有效布局且非主动强制随机，则优先复用已有拖拽位置
  if (!forceRandom) {
    let allValid = true;
    for (const g of state.gears) {
      if (!state.positions[g.id] || state.positions[g.id].x === undefined) {
        allValid = false;
        break;
      }
    }
    if (allValid) return;
  }

  // 真正的随机：打乱装备顺序，确保每次点击随机都是全新排布
  const shuffledGears = [...state.gears].sort(() => Math.random() - 0.5);

  shuffledGears.forEach((g, idx) => {
    // 纵向深度比率：在 0.05 到 0.95 之间全面展开，彻底打破“只在顶部”的限制！
    const verticalSlot = (idx + 0.5) / total;
    const jitterRatio = (Math.random() * 0.4 - 0.2) / total;
    const depthRatio = Math.max(0.04, Math.min(0.96, verticalSlot + jitterRatio));
    
    const targetY = minY + depthRatio * (maxY - minY);

    // 水平左右列与中轴错落散开
    let targetX;
    if (idx % 2 === 0) {
      // 偏左侧或中左
      targetX = minX + Math.random() * (w * 0.46 - minX);
    } else {
      // 偏右侧或中右
      targetX = (w * 0.42) + Math.random() * (maxX - w * 0.42);
    }

    const clampedX = Math.round(Math.max(minX, Math.min(maxX, targetX)));
    const clampedY = Math.round(Math.max(minY, Math.min(maxY, targetY)));

    // 从丰富角度池中取样并增加自然微倾角 (-34° 到 +34°)
    const angleIdx = Math.floor(Math.random() * ORGANIC_ANGLES.length);
    const baseAngle = ORGANIC_ANGLES[angleIdx];
    const rot = Math.round(baseAngle + (Math.random() * 10 - 5));

    // 坠落初始翻转角 (重力加速旋转感)
    const rotStart = rot + (Math.random() > 0.5 ? (30 + Math.random() * 20) : (-30 - Math.random() * 20));

    state.positions[g.id] = {
      x: clampedX,
      y: clampedY,
      rot: rot,
      rotStart: rotStart,
      zIndex: 10 + idx,
    };
  });

  saveStickerPositions();
}

// 获取装备贴纸当前坐标 (带自愈与重力落点兜底)
function getOrGenerateStickerPosition(gear, idx, total) {
  if (state.positions[gear.id]) {
    return state.positions[gear.id];
  }
  generateGravityScatterPositions(false);
  return state.positions[gear.id] || {
    x: 20,
    y: 40 + idx * 80,
    rot: ORGANIC_ANGLES[idx % ORGANIC_ANGLES.length],
    rotStart: -25,
    zIndex: 10 + idx,
  };
}

function renderStickersCanvas(isTriggerDrop = false) {
  const container = document.getElementById('stickers-container');
  const trayPill = document.getElementById('tray-stat-pill');
  if (trayPill) {
    trayPill.textContent = `${state.gears.length} 件贴纸`;
  }

  if (state.gears.length === 0) {
    container.className = 'relative flex flex-col items-center justify-center py-16 text-stone-400';
    container.style.height = '100%';
    container.innerHTML = `
      <i class="fa-solid fa-rug text-4xl mb-3 opacity-30 text-stone-500"></i>
      <p class="text-sm font-bold text-stone-700">装备收纳垫还是空的</p>
      <p class="text-xs text-stone-400 mt-1">点击下方拍照，第一张装备贴纸就会掉落在这里！</p>
    `;
    return;
  }

  // 确保所有装备均有重力分布坐标
  generateGravityScatterPositions(false);

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
    container.style.height = '100%';
    
    const htmlCards = state.gears.map((g, idx) => {
      const pos = getOrGenerateStickerPosition(g, idx, state.gears.length);

      const weightStr = g.weight_grams >= 1000 
        ? `${(g.weight_grams / 1000).toFixed(1)} kg` 
        : `${g.weight_grams} g`;

      let dropClass = '';
      if (state.newlyCreatedGearId && g.id === state.newlyCreatedGearId) {
        dropClass = 'new-arrival';
      } else if (isTriggerDrop) {
        dropClass = 'dropping';
      }

      return `
        <div class="sticker-entity ${dropClass} cursor-pointer select-none"
          id="sticker-${g.id}"
          data-id="${g.id}"
          style="--pos-x: ${pos.x}px; --pos-y: ${pos.y}px; --rot: ${pos.rot}deg; --rot-start: ${pos.rotStart || (pos.rot + 25)}deg; --delay: ${idx}; transform: translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.rot}deg); z-index: ${pos.zIndex || 10 + idx}; width: 148px;">
          
          <!-- 全区域点击感应层 (点击整个贴纸均可打开详情) -->
          <div class="sticker-hitbox absolute inset-0 z-20 cursor-pointer"></div>

          <!-- 纯白描边贴纸实体 (悬浮立体手账感) -->
          <div class="relative flex items-center justify-center p-1 pointer-events-none">
            ${g.sticker_image_url 
              ? `<img src="${g.sticker_image_url}" class="max-h-28 max-w-full object-contain filter drop-shadow-md select-none pointer-events-none" alt="${g.name}">`
              : `<div class="w-20 h-20 bg-white border-2 border-stone-800 rounded-3xl flex items-center justify-center text-stone-900 shadow-md font-bold text-sm pointer-events-none">${g.name.slice(0, 3)}</div>`
            }
          </div>

          <!-- 便签小标签：纯白极简胶带质感附着于贴纸 -->
          <div class="mt-1 text-center pointer-events-none select-none">
            <div class="inline-flex items-center gap-1 bg-white text-stone-900 px-2.5 py-0.5 rounded-full border border-stone-200/90 shadow-2xs backdrop-blur-xs">
              <span class="text-[10px] font-bold truncate max-w-[85px]">${g.name}</span>
              <span class="text-[9px] text-pine-800 font-black">${weightStr}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = htmlCards;

    // 绑定自由拖拽与点击事件
    attachStickerDragEvents(container);
    saveStickerPositions();

    // 新增贴纸动效完成后清理 class，保证后续拖拽绝对平滑
    if (state.newlyCreatedGearId) {
      const createdId = state.newlyCreatedGearId;
      setTimeout(() => {
        const el = document.getElementById(`sticker-${createdId}`);
        if (el) el.classList.remove('new-arrival');
      }, 900);
      state.newlyCreatedGearId = null;
    }

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

        // 提高拖拽位移阈值 (10px)，避免轻点贴纸图片时误判为拖拽
        if (!hasMoved && Math.hypot(dx, dy) > 10) {
          hasMoved = true;
        }

        if (hasMoved) {
          const container = document.getElementById('stickers-container');
          const maxDragX = Math.max(160, (container?.clientWidth || 340) - 146);
          // 拖动时的下边界：严格停在收纳垫安全区内，绝不允许贴纸拖入底部按钮遮挡区
          const maxDragY = Math.max(220, (container?.clientHeight || 460) - 120);

          // 严格将贴纸限制在垫子框安全范围内
          pos.x = Math.max(6, Math.min(maxDragX, Math.round(initialPosX + dx)));
          pos.y = Math.max(6, Math.min(maxDragY, Math.round(initialPosY + dy)));

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
          // 点击贴纸任何位置：打开贴纸详情卡片
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

    // 独立全贴纸点击监听 (确保点击贴纸图片主体、空白或文字一律打开弹窗)
    el.addEventListener('click', (e) => {
      openGearDetailModal(gearId);
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
    // 立即收起详情弹窗，让用户视线聚焦在收纳垫上物理“撕除贴纸”动效
    closeModal('modal-gear-detail');

    const stickerEl = document.getElementById(`sticker-${g.id}`);
    if (stickerEl) {
      // 触发纸张单角掀起、发力撕离与飘散动效
      stickerEl.classList.remove('settling', 'dropping', 'dragging');
      stickerEl.classList.add('peeling-off');
    }

    // 后台发起删除
    try {
      await apiRequest(`/gears/${g.id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('删除失败:', err);
    }

    // 撕下动画结束后 (820ms)，更新状态与界面
    setTimeout(() => {
      state.gears = state.gears.filter(item => item.id !== g.id);
      delete state.positions[g.id];
      saveStickerPositions();

      const totalKg = ((state.gears.reduce((sum, item) => sum + item.weight_grams, 0)) / 1000).toFixed(1);
      document.getElementById('stat-count-pill').textContent = `${state.gears.length} 件`;
      document.getElementById('stat-weight-text').textContent = `总负重 ${totalKg} kg`;

      renderStickersCanvas(false);
    }, 820);
  };

  modal.style.zIndex = '99999';
  modal.classList.remove('hidden');
}

// ======================== 实时相机取景与拍照贴纸制作 ========================

const canvas = document.getElementById('sticker-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

async function openCameraView() {
  switchView('camera');
  await startCamera();
}

async function startCamera() {
  const video = document.getElementById('camera-video');
  const tip = document.getElementById('camera-fallback-tip');
  if (!video) return;

  stopCamera();

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: currentFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      video.srcObject = cameraStream;
      await video.play().catch(() => {});
      if (tip) tip.classList.add('hidden');
      return;
    }
  } catch (err) {
    console.warn('摄像头获取受限，切换为相册选图模式:', err);
  }
  if (tip) tip.classList.remove('hidden');
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  if (video) video.srcObject = null;
}

async function toggleCameraFacing() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
}

// 核心快门拍照：从实时视频流捕获并按取景框竖屏精确裁切 (解决“取景框是竖的，生成的照片却是横的”问题)
function takePhotoFromCamera() {
  const video = document.getElementById('camera-video');
  const flash = document.getElementById('camera-flash');
  const targetBox = document.getElementById('camera-target-box');

  // 快门白光闪烁反馈
  if (flash) {
    flash.classList.remove('hidden');
    setTimeout(() => flash.classList.add('hidden'), 120);
  }

  if (video && video.videoWidth > 0 && cameraStream) {
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const videoElRect = video.getBoundingClientRect();
    const targetRect = targetBox ? targetBox.getBoundingClientRect() : videoElRect;

    // 计算 video 在容器中的实际渲染缩放比 (object-cover)
    const scale = Math.max(videoElRect.width / videoWidth, videoElRect.height / videoHeight);
    const renderedWidth = videoWidth * scale;
    const renderedHeight = videoHeight * scale;
    const renderedLeft = (videoElRect.width - renderedWidth) / 2;
    const renderedTop = (videoElRect.height - renderedHeight) / 2;

    // 计算准星框在原视频像素坐标系中的相对裁切区域
    const targetLeftOnScreen = targetRect.left - videoElRect.left;
    const targetTopOnScreen = targetRect.top - videoElRect.top;

    let srcX = (targetLeftOnScreen - renderedLeft) / scale;
    let srcY = (targetTopOnScreen - renderedTop) / scale;
    let srcW = targetRect.width / scale;
    let srcH = targetRect.height / scale;

    // 严格 1:1 正方形尺寸锁定 (居中正方形取样)
    const squareSide = Math.min(srcW, srcH);
    srcX += (srcW - squareSide) / 2;
    srcY += (srcH - squareSide) / 2;
    srcW = squareSide;
    srcH = squareSide;

    // 边界安全钳制
    srcX = Math.max(0, Math.min(videoWidth - srcW, srcX));
    srcY = Math.max(0, Math.min(videoHeight - srcH, srcY));

    // 输出为高品质 1:1 正方形贴纸原图 (720x720 纯正方形)
    const squareDim = 720;
    const capCanvas = document.createElement('canvas');
    capCanvas.width = squareDim;
    capCanvas.height = squareDim;
    const capCtx = capCanvas.getContext('2d');

    // 若为前置镜头自拍，水平镜像以与取景器预览完全一致
    if (currentFacingMode === 'user') {
      capCtx.translate(capCanvas.width, 0);
      capCtx.scale(-1, 1);
    }

    capCtx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, squareDim, squareDim);

    const capturedImg = new Image();
    capturedImg.onload = () => {
      state.currentImageSource = capturedImg;
      processSticker(capturedImg, 14);
      stopCamera();
      switchView('maker');
    };
    capturedImg.src = capCanvas.toDataURL('image/jpeg', 0.95);
  } else {
    // 无实时视频流时，调用系统原生相机/相册选择
    document.getElementById('image-file-input').click();
  }
}

// 相册选图监听
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
        processSticker(downsampledImg, 14);
        stopCamera();
        switchView('maker');
      };
      downsampledImg.src = preCanvas.toDataURL('image/jpeg', 0.9);
    };
    rawImg.src = event.target.result;
  };
  reader.readAsDataURL(file);
});

// 核心贴纸描边算法
function processSticker(renderSource, strokeWidth) {
  const placeholder = document.getElementById('upload-placeholder');
  if (placeholder) placeholder.classList.add('hidden');
  canvas.classList.remove('hidden');

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

    // 为新生成的贴纸设置在装备收纳垫上的着陆点，准备触发大反弹掉落
    if (createdGear && createdGear.id) {
      state.newlyCreatedGearId = createdGear.id;

      const container = document.getElementById('stickers-container');
      const trayWidth = container?.clientWidth || 340;
      const trayHeight = Math.max(440, container?.clientHeight || 460);
      
      const count = state.gears.length;
      const targetX = Math.round(16 + Math.random() * (trayWidth - 165));
      // 重力着陆落点：在收纳垫整体纵深内自然降落
      const targetY = Math.round(30 + Math.random() * (trayHeight - 165));

      const rot = ORGANIC_ANGLES[(count * 3 + (createdGear.name.charCodeAt(0) || 7)) % ORGANIC_ANGLES.length];
      const rotStart = rot + (Math.random() > 0.5 ? 32 : -32);

      state.positions[createdGear.id] = {
        x: targetX,
        y: targetY,
        rot,
        rotStart,
        zIndex: (state.maxZIndex || 20) + 10,
      };
      saveStickerPositions();
    }

    // 清空表单
    document.getElementById('maker-name').value = '';
    document.getElementById('maker-weight').value = '';
    document.getElementById('maker-brand').value = '';
    const descInput = document.getElementById('maker-desc');
    if (descInput) descInput.value = '';

    // 确保回到随性散落手账桌面
    state.layoutMode = 'scattered';
    const btnText = document.getElementById('layout-btn-text');
    if (btnText) btnText.textContent = '一键整理';
    const icon = document.getElementById('layout-icon');
    if (icon) icon.className = 'fa-solid fa-grip text-pine-800';
    document.getElementById('reshuffle-btn')?.classList.remove('hidden');

    // 立刻切换回首页，平滑滚动至顶端，让新贴纸自然自天而降进入垫子！
    switchView('closet');
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
    await loadGears(false);
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

// 视图切换：'closet' (首页贴纸垫) <-> 'camera' (实时拍照) <-> 'maker' (填写表单)
function switchView(view) {
  state.currentView = view;
  const viewCloset = document.getElementById('view-closet');
  const viewCamera = document.getElementById('view-camera');
  const viewMaker = document.getElementById('view-maker');
  const homeActionBar = document.getElementById('home-action-bar');
  const mainContent = document.getElementById('main-content');

  if (view === 'closet') {
    stopCamera();
    viewCloset?.classList.remove('hidden');
    viewCamera?.classList.add('hidden');
    viewMaker?.classList.add('hidden');
    homeActionBar?.classList.remove('hidden');
  } else if (view === 'camera') {
    viewCloset?.classList.add('hidden');
    viewCamera?.classList.remove('hidden');
    viewMaker?.classList.add('hidden');
    homeActionBar?.classList.add('hidden');
  } else if (view === 'maker') {
    stopCamera();
    viewCamera?.classList.add('hidden');
    viewMaker?.classList.remove('hidden');
    homeActionBar?.classList.add('hidden');
    if (viewMaker) viewMaker.scrollTop = 0;
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
