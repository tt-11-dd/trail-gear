import { Hono } from 'hono';
import type { Env, HonoVariables, Trip } from '../types';
import { authMiddleware } from '../middleware/auth';

export const tripRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

tripRoutes.use('*', authMiddleware);

// 获取行程列表（包含装备数量、已打包数与重量概览）
tripRoutes.get('/', async (c) => {
  const currentUser = c.get('user');

  const { results: trips } = await c.env.DB.prepare(
    `SELECT * FROM trips WHERE user_id = ? AND is_deleted = 0 ORDER BY start_date DESC, created_at DESC`
  )
    .bind(currentUser.id)
    .all<Trip>();

  // 聚合计算每个行程的统计数据
  const enrichedTrips = await Promise.all(
    trips.map(async (trip) => {
      const stats = await c.env.DB.prepare(
        `SELECT 
          COUNT(ti.id) as total_items,
          SUM(CASE WHEN ti.is_packed = 1 THEN 1 ELSE 0 END) as packed_items,
          COALESCE(SUM(g.weight_grams * ti.custom_quantity), 0) as total_weight_grams,
          COALESCE(SUM(CASE WHEN g.category_id != 'cat_consumable' THEN g.weight_grams * ti.custom_quantity ELSE 0 END), 0) as base_weight_grams
        FROM trip_items ti
        JOIN gears g ON ti.gear_id = g.id
        WHERE ti.trip_id = ? AND ti.is_deleted = 0 AND g.is_deleted = 0`
      )
        .bind(trip.id)
        .first<{
          total_items: number;
          packed_items: number;
          total_weight_grams: number;
          base_weight_grams: number;
        }>();

      return {
        ...trip,
        stats: {
          total_items: stats?.total_items || 0,
          packed_items: stats?.packed_items || 0,
          total_weight_grams: Math.round((stats?.total_weight_grams || 0) * 10) / 10,
          base_weight_grams: Math.round((stats?.base_weight_grams || 0) * 10) / 10,
        },
      };
    })
  );

  return c.json({
    code: 0,
    message: 'success',
    data: enrichedTrips,
  });
});

// 创建行程
tripRoutes.post('/', async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{
    title?: string;
    description?: string;
    start_date?: number;
    end_date?: number;
    cover_image_url?: string;
  }>().catch(() => ({}))) as {
    title?: string;
    description?: string;
    start_date?: number;
    end_date?: number;
    cover_image_url?: string;
  };

  const { title, description, start_date, end_date, cover_image_url } = body;

  if (!title || !title.trim()) {
    return c.json({ code: 400, message: '行程标题不能为空' }, 400);
  }

  const tripId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO trips (
      id, user_id, title, description, start_date, end_date, cover_image_url, status, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'planning', 0, ?, ?)`
  )
    .bind(
      tripId,
      currentUser.id,
      title.trim(),
      description ? description.trim() : null,
      start_date || now,
      end_date || (start_date ? start_date + 86400000 : now + 86400000),
      cover_image_url ?? null,
      now,
      now
    )
    .run();

  const trip = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(tripId).first<Trip>();

  return c.json({
    code: 0,
    message: '行程创建成功',
    data: trip,
  });
});

// 获取行程详情（含打包清单物品）
tripRoutes.get('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');

  const trip = await c.env.DB.prepare(
    'SELECT * FROM trips WHERE id = ? AND user_id = ? AND is_deleted = 0'
  )
    .bind(id, currentUser.id)
    .first<Trip>();

  if (!trip) {
    return c.json({ code: 404, message: '未找到该行程' }, 404);
  }

  const { results: items } = await c.env.DB.prepare(
    `SELECT 
      ti.id as trip_item_id,
      ti.is_packed,
      ti.custom_quantity,
      ti.sort_order,
      g.id as gear_id,
      g.name as gear_name,
      g.brand as gear_brand,
      g.model as gear_model,
      g.weight_grams,
      g.category_id,
      c.name as category_name,
      c.icon as category_icon,
      g.sticker_image_url
    FROM trip_items ti
    JOIN gears g ON ti.gear_id = g.id
    LEFT JOIN categories c ON g.category_id = c.id
    WHERE ti.trip_id = ? AND ti.is_deleted = 0 AND g.is_deleted = 0
    ORDER BY ti.sort_order ASC, ti.updated_at ASC`
  )
    .bind(id)
    .all();

  // 重量统计
  let totalWeight = 0;
  let baseWeight = 0;
  let packedCount = 0;

  for (const item of items as Array<{ is_packed: number; custom_quantity: number; weight_grams: number; category_id: string }>) {
    const itemTotalWeight = (item.weight_grams || 0) * (item.custom_quantity || 1);
    totalWeight += itemTotalWeight;
    if (item.category_id !== 'cat_consumable') {
      baseWeight += itemTotalWeight;
    }
    if (item.is_packed === 1) {
      packedCount++;
    }
  }

  return c.json({
    code: 0,
    message: 'success',
    data: {
      ...trip,
      stats: {
        total_items: items.length,
        packed_items: packedCount,
        total_weight_grams: Math.round(totalWeight * 10) / 10,
        base_weight_grams: Math.round(baseWeight * 10) / 10,
      },
      items,
    },
  });
});

// 修改行程基本信息
tripRoutes.put('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json<{
    title?: string;
    description?: string;
    start_date?: number;
    end_date?: number;
    cover_image_url?: string;
    status?: 'planning' | 'active' | 'completed';
  }>().catch(() => ({}))) as {
    title?: string;
    description?: string;
    start_date?: number;
    end_date?: number;
    cover_image_url?: string;
    status?: 'planning' | 'active' | 'completed';
  };

  const existing = await c.env.DB.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ? AND is_deleted = 0')
    .bind(id, currentUser.id)
    .first();

  if (!existing) {
    return c.json({ code: 404, message: '未找到该行程' }, 404);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE trips SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      cover_image_url = COALESCE(?, cover_image_url),
      status = COALESCE(?, status),
      updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      body.title ? body.title.trim() : null,
      body.description !== undefined ? (body.description ? body.description.trim() : null) : null,
      body.start_date ?? null,
      body.end_date ?? null,
      body.cover_image_url !== undefined ? body.cover_image_url : null,
      body.status ?? null,
      now,
      id,
      currentUser.id
    )
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(id).first<Trip>();

  return c.json({
    code: 0,
    message: '行程修改成功',
    data: updated,
  });
});

// 删除行程
tripRoutes.delete('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');
  const now = Date.now();

  const result = await c.env.DB.prepare(
    'UPDATE trips SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(now, id, currentUser.id)
    .run();

  if (!result.meta.changes) {
    return c.json({ code: 404, message: '行程不存在或已删除' }, 404);
  }

  // 级联软删除清单项目
  await c.env.DB.prepare('UPDATE trip_items SET is_deleted = 1, updated_at = ? WHERE trip_id = ?')
    .bind(now, id)
    .run();

  return c.json({
    code: 0,
    message: '行程已删除',
  });
});

// 批量向行程清单添加装备
tripRoutes.post('/:id/items', async (c) => {
  const currentUser = c.get('user');
  const tripId = c.req.param('id');

  // 验证行程归属
  const trip = await c.env.DB.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ? AND is_deleted = 0')
    .bind(tripId, currentUser.id)
    .first();

  if (!trip) {
    return c.json({ code: 404, message: '行程不存在' }, 404);
  }

  const body = (await c.req.json<{ gear_ids?: string[]; custom_quantity?: number }>().catch(() => ({}))) as {
    gear_ids?: string[];
    custom_quantity?: number;
  };
  const gearIds = body.gear_ids || [];

  if (!gearIds.length) {
    return c.json({ code: 400, message: '请选择要添加的装备' }, 400);
  }

  const now = Date.now();
  const statements = gearIds.map((gearId: string) => {
    const itemId = crypto.randomUUID();
    return c.env.DB.prepare(
      `INSERT INTO trip_items (id, trip_id, gear_id, is_packed, custom_quantity, sort_order, is_deleted, updated_at)
       VALUES (?, ?, ?, 0, ?, 0, 0, ?)`
    ).bind(itemId, tripId, gearId, body.custom_quantity || 1, now);
  });

  await c.env.DB.batch(statements);

  return c.json({
    code: 0,
    message: `已添加 ${gearIds.length} 件装备到打包清单`,
  });
});

// 切换打包状态 / 修改数量
tripRoutes.patch('/:id/items/:item_id', async (c) => {
  const currentUser = c.get('user');
  const tripId = c.req.param('id');
  const itemId = c.req.param('item_id');

  // 验证行程归属
  const trip = await c.env.DB.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ? AND is_deleted = 0')
    .bind(tripId, currentUser.id)
    .first();

  if (!trip) {
    return c.json({ code: 404, message: '行程不存在' }, 404);
  }

  const body = (await c.req.json<{ is_packed?: boolean | number; custom_quantity?: number }>().catch(() => ({}))) as {
    is_packed?: boolean | number;
    custom_quantity?: number;
  };
  const now = Date.now();

  const isPackedVal = body.is_packed !== undefined ? (body.is_packed ? 1 : 0) : null;
  const quantityVal = body.custom_quantity !== undefined ? Math.max(1, body.custom_quantity) : null;

  await c.env.DB.prepare(
    `UPDATE trip_items SET
      is_packed = COALESCE(?, is_packed),
      custom_quantity = COALESCE(?, custom_quantity),
      updated_at = ?
     WHERE id = ? AND trip_id = ?`
  )
    .bind(isPackedVal, quantityVal, now, itemId, tripId)
    .run();

  return c.json({
    code: 0,
    message: '打包状态更新成功',
  });
});

// 移出打包清单
tripRoutes.delete('/:id/items/:item_id', async (c) => {
  const currentUser = c.get('user');
  const tripId = c.req.param('id');
  const itemId = c.req.param('item_id');

  const trip = await c.env.DB.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ? AND is_deleted = 0')
    .bind(tripId, currentUser.id)
    .first();

  if (!trip) {
    return c.json({ code: 404, message: '行程不存在' }, 404);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    'UPDATE trip_items SET is_deleted = 1, updated_at = ? WHERE id = ? AND trip_id = ?'
  )
    .bind(now, itemId, tripId)
    .run();

  return c.json({
    code: 0,
    message: '已从清单中移除',
  });
});
