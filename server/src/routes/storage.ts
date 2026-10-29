import { Hono } from 'hono';
import type { Env, HonoVariables } from '../types';
import { authMiddleware } from '../middleware/auth';

export const storageRoutes = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 公共图片访问代理（利用 Cloudflare 边缘缓存，无需用户提前绑定 R2 自定义域名）
storageRoutes.get('/file/*', async (c) => {
  // 提取 key
  const path = c.req.path.replace(/^\/api\/v1\/storage\/file\//, '');
  if (!path) {
    return c.text('Not found', 404);
  }

  const object = await c.env.BUCKET.get(path);
  if (!object) {
    return c.text('File not found', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
});

// 需要登录的上传接口
storageRoutes.use('/upload', authMiddleware);
storageRoutes.use('/upload-url', authMiddleware);

// 直接上传接口 (支持 FormData: file, type: 'gear_sticker' | 'gear_original' | 'trip_cover' | 'avatar')
storageRoutes.post('/upload', async (c) => {
  const currentUser = c.get('user');
  const formData = await c.req.formData().catch(() => null);

  if (!formData) {
    return c.json({ code: 400, message: '无效的表单数据' }, 400);
  }

  const file = formData.get('file');
  const type = (formData.get('type') as string) || 'gear_sticker';

  if (!file || !(file instanceof File)) {
    return c.json({ code: 400, message: '请选择要上传的文件' }, 400);
  }

  // 限制 10MB
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ code: 400, message: '文件大小不能超过 10MB' }, 400);
  }

  // 文件后缀与路径规划
  const ext = file.name.split('.').pop() || (file.type === 'image/png' ? 'png' : 'webp');
  const fileId = crypto.randomUUID();
  const key = `users/${currentUser.id}/${type}/${fileId}.${ext}`;

  // 存入 Cloudflare R2
  await c.env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
    },
  });

  // 生成公共访问 URL
  const origin = new URL(c.req.url).origin;
  const publicUrl = c.env.PUBLIC_R2_URL 
    ? `${c.env.PUBLIC_R2_URL.replace(/\/$/, '')}/${key}`
    : `${origin}/api/v1/storage/file/${key}`;

  return c.json({
    code: 0,
    message: '上传成功',
    data: {
      key,
      url: publicUrl,
      size: file.size,
      contentType: file.type,
    },
  });
});
