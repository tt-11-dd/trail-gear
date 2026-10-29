export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  PUBLIC_R2_URL?: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  nickname: string;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string;
  sort_order: number;
  is_deleted: number;
  updated_at: number;
}

export interface Gear {
  id: string;
  user_id: string;
  category_id: string;
  name: string;
  brand: string | null;
  model: string | null;
  weight_grams: number;
  description: string | null;
  original_image_url: string | null;
  sticker_image_url: string | null;
  is_archived: number;
  is_deleted: number;
  created_at: number;
  updated_at: number;
}

export interface Trip {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_date: number;
  end_date: number;
  cover_image_url: string | null;
  status: 'planning' | 'active' | 'completed';
  is_deleted: number;
  created_at: number;
  updated_at: number;
}

export interface TripItem {
  id: string;
  trip_id: string;
  gear_id: string;
  is_packed: number;
  custom_quantity: number;
  sort_order: number;
  is_deleted: number;
  updated_at: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
  exp: number;
  iat: number;
}

export interface HonoVariables {
  user: {
    id: string;
    email: string;
  };
}
