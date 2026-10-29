import type { Context, Next } from 'hono';
import type { Env, HonoVariables } from '../types';
import { verifyJwt } from '../utils/crypto';

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ code: 401, message: '请先登录' }, 401);
  }

  const token = authHeader.substring(7);
  const secret = c.env.JWT_SECRET || 'trail-gear-default-secret';
  const payload = await verifyJwt(token, secret);

  if (!payload) {
    return c.json({ code: 401, message: '登录态无效或已过期，请重新登录' }, 401);
  }

  c.set('user', {
    id: payload.userId,
    email: payload.email,
  });

  await next();
}
