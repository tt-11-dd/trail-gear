import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, HonoVariables } from './types';
import { authRoutes } from './routes/auth';
import { categoryRoutes } from './routes/categories';
import { gearRoutes } from './routes/gears';
import { tripRoutes } from './routes/trips';
import { storageRoutes } from './routes/storage';
import { syncRoutes } from './routes/sync';

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 全局中间件
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// 统一健康检查
app.get('/api/v1/health', (c) => {
  return c.json({
    code: 0,
    status: 'ok',
    app: 'Trail Gear Cloudflare API',
    version: '1.0.0',
    timestamp: Date.now(),
  });
});

// 挂载各业务模块
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/categories', categoryRoutes);
app.route('/api/v1/gears', gearRoutes);
app.route('/api/v1/trips', tripRoutes);
app.route('/api/v1/storage', storageRoutes);
app.route('/api/v1/sync', syncRoutes);

// 全局 404 捕获
app.notFound((c) => {
  return c.json({ code: 404, message: `接口未找到: ${c.req.method} ${c.req.path}` }, 404);
});

// 全局错误捕获
app.onError((err, c) => {
  console.error('API Error:', err);
  return c.json({ code: 500, message: err.message || '内部服务异常' }, 500);
});

export default app;
