import { Hono } from 'hono';
import type { Env, HonoVariables, User } from '../types';
import { hashPassword, verifyPassword, signJwt } from '../utils/crypto';
import { authMiddleware } from '../middleware/auth';

export const authRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 注册
authRoutes.post('/register', async (c) => {
  const body = (await c.req.json<{ email?: string; password?: string; nickname?: string }>().catch(() => ({}))) as {
    email?: string;
    password?: string;
    nickname?: string;
  };
  const { email, password, nickname } = body;

  if (!email || !password || !nickname) {
    return c.json({ code: 400, message: '邮箱、密码和昵称均不能为空' }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ code: 400, message: '邮箱格式不正确' }, 400);
  }

  if (password.length < 6) {
    return c.json({ code: 400, message: '密码长度至少需为 6 位' }, 400);
  }

  // 检查邮箱是否已存在
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) {
    return c.json({ code: 400, message: '该邮箱已被注册' }, 400);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, nickname, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(userId, email.toLowerCase(), passwordHash, nickname.trim(), null, now, now)
    .run();

  const token = await signJwt(
    { userId, email: email.toLowerCase() },
    c.env.JWT_SECRET || 'trail-gear-default-secret'
  );

  return c.json({
    code: 0,
    message: '注册成功',
    data: {
      token,
      user: {
        id: userId,
        email: email.toLowerCase(),
        nickname: nickname.trim(),
        avatar_url: null,
      },
    },
  });
});

// 登录
authRoutes.post('/login', async (c) => {
  const body = (await c.req.json<{ email?: string; password?: string }>().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const { email, password } = body;

  if (!email || !password) {
    return c.json({ code: 400, message: '请输入邮箱与密码' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first<User>();

  if (!user) {
    return c.json({ code: 400, message: '账号或密码错误' }, 400);
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return c.json({ code: 400, message: '账号或密码错误' }, 400);
  }

  const token = await signJwt(
    { userId: user.id, email: user.email },
    c.env.JWT_SECRET || 'trail-gear-default-secret'
  );

  return c.json({
    code: 0,
    message: '登录成功',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
      },
    },
  });
});

// 获取个人信息
authRoutes.get('/me', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const user = await c.env.DB.prepare('SELECT id, email, nickname, avatar_url, created_at FROM users WHERE id = ?')
    .bind(currentUser.id)
    .first();

  if (!user) {
    return c.json({ code: 404, message: '用户不存在' }, 404);
  }

  return c.json({
    code: 0,
    message: 'success',
    data: user,
  });
});

// 更新个人资料
authRoutes.put('/profile', authMiddleware, async (c) => {
  const currentUser = c.get('user');
  const body = (await c.req.json<{ nickname?: string; avatar_url?: string }>().catch(() => ({}))) as {
    nickname?: string;
    avatar_url?: string;
  };
  const { nickname, avatar_url } = body;

  const now = Date.now();
  await c.env.DB.prepare(
    'UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url), updated_at = ? WHERE id = ?'
  )
    .bind(nickname ? nickname.trim() : null, avatar_url ?? null, now, currentUser.id)
    .run();

  const updated = await c.env.DB.prepare('SELECT id, email, nickname, avatar_url FROM users WHERE id = ?')
    .bind(currentUser.id)
    .first();

  return c.json({
    code: 0,
    message: '个人资料更新成功',
    data: updated,
  });
});
