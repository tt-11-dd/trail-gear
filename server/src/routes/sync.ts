import { Hono } from 'hono';
import type { Env, HonoVariables, Gear, Trip, TripItem, Category } from '../types';
import { authMiddleware } from '../middleware/auth';

export const syncRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

syncRoutes.use('*', authMiddleware);

// 1. 增量拉取（客户端请求自 last_sync_time 以来的所有云端变更）
syncRoutes.post('/pull', async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{ last_sync_time?: number }>().catch(() => ({}))) as {
    last_sync_time?: number;
  };
  const lastSyncTime = body.last_sync_time || 0;
  const currentSyncTime = Date.now();

  // 分类变更
  const categories = await c.env.DB.prepare(
    `SELECT * FROM categories 
     WHERE (user_id IS NULL OR user_id = ?) AND updated_at > ?`
  )
    .bind(currentUser.id, lastSyncTime)
    .all<Category>();

  // 装备变更（含软删除）
  const gears = await c.env.DB.prepare(
    `SELECT * FROM gears WHERE user_id = ? AND updated_at > ?`
  )
    .bind(currentUser.id, lastSyncTime)
    .all<Gear>();

  // 行程变更（含软删除）
  const trips = await c.env.DB.prepare(
    `SELECT * FROM trips WHERE user_id = ? AND updated_at > ?`
  )
    .bind(currentUser.id, lastSyncTime)
    .all<Trip>();

  // 行程清单项目变更
  const tripItems = await c.env.DB.prepare(
    `SELECT ti.* FROM trip_items ti
     JOIN trips t ON ti.trip_id = t.id
     WHERE t.user_id = ? AND ti.updated_at > ?`
  )
    .bind(currentUser.id, lastSyncTime)
    .all<TripItem>();

  return c.json({
    code: 0,
    message: 'success',
    data: {
      sync_time: currentSyncTime,
      categories: categories.results,
      gears: gears.results,
      trips: trips.results,
      trip_items: tripItems.results,
    },
  });
});

// 2. 增量推送（客户端上传离线产生的变更）
syncRoutes.post('/push', async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{
    gears?: Gear[];
    trips?: Trip[];
    trip_items?: TripItem[];
  }>().catch(() => ({}))) as {
    gears?: Gear[];
    trips?: Trip[];
    trip_items?: TripItem[];
  };

  const { gears = [], trips = [], trip_items = [] } = body;
  const now = Date.now();
  type D1Stmt = ReturnType<D1Database['prepare']>;
  const statements: D1Stmt[] = [];

  // 合并装备
  for (const g of gears) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO gears (
          id, user_id, category_id, name, brand, model, weight_grams, 
          description, original_image_url, sticker_image_url, is_archived, 
          is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category_id = excluded.category_id,
          name = excluded.name,
          brand = excluded.brand,
          model = excluded.model,
          weight_grams = excluded.weight_grams,
          description = excluded.description,
          original_image_url = excluded.original_image_url,
          sticker_image_url = excluded.sticker_image_url,
          is_archived = excluded.is_archived,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= gears.updated_at`
      ).bind(
        g.id,
        currentUser.id,
        g.category_id,
        g.name,
        g.brand ?? null,
        g.model ?? null,
        g.weight_grams ?? 0,
        g.description ?? null,
        g.original_image_url ?? null,
        g.sticker_image_url ?? null,
        g.is_archived ?? 0,
        g.is_deleted ?? 0,
        g.created_at || now,
        g.updated_at || now
      )
    );
  }

  // 合并行程
  for (const t of trips) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO trips (
          id, user_id, title, description, start_date, end_date, 
          cover_image_url, status, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          start_date = excluded.start_date,
          end_date = excluded.end_date,
          cover_image_url = excluded.cover_image_url,
          status = excluded.status,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= trips.updated_at`
      ).bind(
        t.id,
        currentUser.id,
        t.title,
        t.description ?? null,
        t.start_date || now,
        t.end_date || (now + 86400000),
        t.cover_image_url ?? null,
        t.status || 'planning',
        t.is_deleted ?? 0,
        t.created_at || now,
        t.updated_at || now
      )
    );
  }

  // 合并行程清单
  for (const ti of trip_items) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO trip_items (
          id, trip_id, gear_id, is_packed, custom_quantity, 
          sort_order, is_deleted, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          is_packed = excluded.is_packed,
          custom_quantity = excluded.custom_quantity,
          sort_order = excluded.sort_order,
          is_deleted = excluded.is_deleted,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= trip_items.updated_at`
      ).bind(
        ti.id,
        ti.trip_id,
        ti.gear_id,
        ti.is_packed ?? 0,
        ti.custom_quantity ?? 1,
        ti.sort_order ?? 0,
        ti.is_deleted ?? 0,
        ti.updated_at || now
      )
    );
  }

  if (statements.length > 0) {
    // Cloudflare D1 batch 每次建议不超过 100 条
    const CHUNK_SIZE = 50;
    for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
      const chunk = statements.slice(i, i + CHUNK_SIZE);
      await c.env.DB.batch(chunk);
    }
  }

  return c.json({
    code: 0,
    message: '同步推送成功',
    data: {
      synced_at: now,
      pushed_counts: {
        gears: gears.length,
        trips: trips.length,
        trip_items: trip_items.length,
      },
    },
  });
});
