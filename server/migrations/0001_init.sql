-- 1. 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. 装备分类表
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT,                              -- NULL 表示系统预设默认分类
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 装备柜（装备明细表）
CREATE TABLE IF NOT EXISTS gears (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    weight_grams REAL NOT NULL DEFAULT 0,
    description TEXT,
    original_image_url TEXT,
    sticker_image_url TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_gears_user_updated ON gears(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_gears_category ON gears(category_id);

-- 4. 行程表
CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_date INTEGER NOT NULL,
    end_date INTEGER NOT NULL,
    cover_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'planning',   -- planning | active | completed
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trips_user_updated ON trips(user_id, updated_at);

-- 5. 行程打包清单明细表
CREATE TABLE IF NOT EXISTS trip_items (
    id TEXT PRIMARY KEY,
    trip_id TEXT NOT NULL,
    gear_id TEXT NOT NULL,
    is_packed INTEGER NOT NULL DEFAULT 0,
    custom_quantity INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
    FOREIGN KEY(gear_id) REFERENCES gears(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_items_trip ON trip_items(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_gear ON trip_items(gear_id);

-- 插入默认系统分类 (user_id 为 NULL)
INSERT OR IGNORE INTO categories (id, user_id, name, icon, sort_order, is_deleted, updated_at) VALUES
('cat_shelter', NULL, '庇护所 (Shelter)', 'tent', 1, 0, 1730000000000),
('cat_sleep', NULL, '睡眠系统 (Sleep)', 'bed', 2, 0, 1730000000000),
('cat_pack', NULL, '背包与收纳 (Pack)', 'backpack', 3, 0, 1730000000000),
('cat_cook', NULL, '厨具与炉炊 (Cook)', 'cooking_pot', 4, 0, 1730000000000),
('cat_wear', NULL, '衣物与穿戴 (Wear)', 'shirt', 5, 0, 1730000000000),
('cat_electronics', NULL, '电子与照明 (Electronics)', 'flashlight', 6, 0, 1730000000000),
('cat_consumable', NULL, '消耗品与餐食 (Consumables)', 'coffee', 7, 0, 1730000000000),
('cat_safety', NULL, '导航与急救 (Safety)', 'first_aid', 8, 0, 1730000000000),
('cat_other', NULL, '其他好物 (Other)', 'category', 9, 0, 1730000000000);
