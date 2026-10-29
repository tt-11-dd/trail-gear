import { Hono } from 'hono';
import type { Env, HonoVariables, Gear } from '../types';
import { authMiddleware } from '../middleware/auth';

export const gearRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

gearRoutes.use('*', authMiddleware);

// 获取装备列表
gearRoutes.get('/', async (c) => {
  const currentUser = c.get('user');
  const categoryId = c.req.query('category_id');
  const keyword = c.req.query('keyword');
  const isArchived = c.req.query('is_archived');

  let query = `
    SELECT g.*, c.name as category_name, c.icon as category_icon
    FROM gears g
    LEFT JOIN categories c ON g.category_id = c.id
    WHERE g.user_id = ? AND g.is_deleted = 0
  `;
  const params: unknown[] = [currentUser.id];

  if (categoryId) {
    query += ` AND g.category_id = ?`;
    params.push(categoryId);
  }

  if (isArchived !== undefined) {
    query += ` AND g.is_archived = ?`;
    params.push(isArchived === 'true' || isArchived === '1' ? 1 : 0);
  }

  if (keyword && keyword.trim()) {
    query += ` AND (g.name LIKE ? OR g.brand LIKE ? OR g.model LIKE ?)`;
    const searchPattern = `%${keyword.trim()}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY g.created_at DESC`;

  const { results } = await c.env.DB.prepare(query).bind(...params).all<Gear & { category_name?: string; category_icon?: string }>();

  // 统计总重量
  const totalWeight = results.reduce((sum, item) => sum + (item.weight_grams || 0), 0);

  return c.json({
    code: 0,
    message: 'success',
    data: {
      total_count: results.length,
      total_weight_grams: Math.round(totalWeight * 10) / 10,
      gears: results,
    },
  });
});

// 新增装备
gearRoutes.post('/', async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{
    category_id?: string;
    name?: string;
    brand?: string;
    model?: string;
    weight_grams?: number;
    description?: string;
    original_image_url?: string;
    sticker_image_url?: string;
  }>().catch(() => ({}))) as {
    category_id?: string;
    name?: string;
    brand?: string;
    model?: string;
    weight_grams?: number;
    description?: string;
    original_image_url?: string;
    sticker_image_url?: string;
  };

  const {
    category_id,
    name,
    brand,
    model,
    weight_grams = 0,
    description,
    original_image_url,
    sticker_image_url,
  } = body;

  if (!name || !name.trim()) {
    return c.json({ code: 400, message: '装备名称不能为空' }, 400);
  }

  if (!category_id) {
    return c.json({ code: 400, message: '请选择装备分类' }, 400);
  }

  const gearId = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO gears (
      id, user_id, category_id, name, brand, model, 
      weight_grams, description, original_image_url, sticker_image_url, 
      is_archived, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  )
    .bind(
      gearId,
      currentUser.id,
      category_id,
      name.trim(),
      brand ? brand.trim() : null,
      model ? model.trim() : null,
      weight_grams,
      description ? description.trim() : null,
      original_image_url ?? null,
      sticker_image_url ?? null,
      now,
      now
    )
    .run();

  const gear = await c.env.DB.prepare('SELECT * FROM gears WHERE id = ?').bind(gearId).first<Gear>();

  return c.json({
    code: 0,
    message: '装备添加成功',
    data: gear,
  });
});

// 获取装备详情
gearRoutes.get('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');

  const gear = await c.env.DB.prepare(
    `SELECT g.*, c.name as category_name, c.icon as category_icon
     FROM gears g
     LEFT JOIN categories c ON g.category_id = c.id
     WHERE g.id = ? AND g.user_id = ? AND g.is_deleted = 0`
  )
    .bind(id, currentUser.id)
    .first<Gear & { category_name?: string; category_icon?: string }>();

  if (!gear) {
    return c.json({ code: 404, message: '未找到该装备' }, 404);
  }

  return c.json({
    code: 0,
    message: 'success',
    data: gear,
  });
});

// 修改装备
gearRoutes.put('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');
  const body = (await c.req.json<{
    category_id?: string;
    name?: string;
    brand?: string;
    model?: string;
    weight_grams?: number;
    description?: string;
    original_image_url?: string;
    sticker_image_url?: string;
    is_archived?: boolean | number;
  }>().catch(() => ({}))) as {
    category_id?: string;
    name?: string;
    brand?: string;
    model?: string;
    weight_grams?: number;
    description?: string;
    original_image_url?: string;
    sticker_image_url?: string;
    is_archived?: boolean | number;
  };

  const existing = await c.env.DB.prepare('SELECT id FROM gears WHERE id = ? AND user_id = ? AND is_deleted = 0')
    .bind(id, currentUser.id)
    .first();

  if (!existing) {
    return c.json({ code: 404, message: '未找到该装备' }, 404);
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE gears SET
      category_id = COALESCE(?, category_id),
      name = COALESCE(?, name),
      brand = COALESCE(?, brand),
      model = COALESCE(?, model),
      weight_grams = COALESCE(?, weight_grams),
      description = COALESCE(?, description),
      original_image_url = COALESCE(?, original_image_url),
      sticker_image_url = COALESCE(?, sticker_image_url),
      is_archived = COALESCE(?, is_archived),
      updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      body.category_id ?? null,
      body.name ? body.name.trim() : null,
      body.brand !== undefined ? (body.brand ? body.brand.trim() : null) : null,
      body.model !== undefined ? (body.model ? body.model.trim() : null) : null,
      body.weight_grams !== undefined ? body.weight_grams : null,
      body.description !== undefined ? (body.description ? body.description.trim() : null) : null,
      body.original_image_url !== undefined ? body.original_image_url : null,
      body.sticker_image_url !== undefined ? body.sticker_image_url : null,
      body.is_archived !== undefined ? (body.is_archived ? 1 : 0) : null,
      now,
      id,
      currentUser.id
    )
    .run();

  const updated = await c.env.DB.prepare('SELECT * FROM gears WHERE id = ?').bind(id).first<Gear>();

  return c.json({
    code: 0,
    message: '装备修改成功',
    data: updated,
  });
});

// 软删除装备
gearRoutes.delete('/:id', async (c) => {
  const currentUser = c.get('user');
  const id = c.req.param('id');
  const now = Date.now();

  const result = await c.env.DB.prepare(
    'UPDATE gears SET is_deleted = 1, updated_at = ? WHERE id = ? AND user_id = ?'
  )
    .bind(now, id, currentUser.id)
    .run();

  if (!result.meta.changes) {
    return c.json({ code: 404, message: '装备不存在或已删除' }, 404);
  }

  // 同时软删除已关联的所有行程清单中的此装备
  await c.env.DB.prepare(
    'UPDATE trip_items SET is_deleted = 1, updated_at = ? WHERE gear_id = ?'
  )
    .bind(now, id)
    .run();

  return c.json({
    code: 0,
    message: '装备已删除',
  });
});
