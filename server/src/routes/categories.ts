import { Hono } from 'hono';
import type { Env, HonoVariables, Category } from '../types';
import { authMiddleware } from '../middleware/auth';

export const categoryRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

categoryRoutes.use('*', authMiddleware);

// 获取分类列表（包含内置系统分类与用户自定义分类）
categoryRoutes.get('/', async (c) => {
  const currentUser = c.get('user');

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM categories 
     WHERE (user_id IS NULL OR user_id = ?) AND is_deleted = 0 
     ORDER BY sort_order ASC, updated_at ASC`
  )
    .bind(currentUser.id)
    .all<Category>();

  return c.json({
    code: 0,
    message: 'success',
    data: results,
  });
});

// 新增用户自定义分类
categoryRoutes.post('/', async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{ name?: string; icon?: string; sort_order?: number }>().catch(() => ({}))) as {
    name?: string;
    icon?: string;
    sort_order?: number;
  };
  const { name, icon, sort_order } = body;

  if (!name || !name.trim()) {
    return c.json({ code: 400, message: '分类名称不能为空' }, 400);
  }

  const categoryId = `cat_custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO categories (id, user_id, name, icon, sort_order, is_deleted, updated_at) 
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
    .bind(
      categoryId,
      currentUser.id,
      name.trim(),
      icon || 'category',
      sort_order ?? 100,
      now
    )
    .run();

  const created = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
    .bind(categoryId)
    .first<Category>();

  return c.json({
    code: 0,
    message: '分类创建成功',
    data: created,
  });
});
