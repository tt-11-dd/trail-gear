class Gear {
  final String id;
  final String userId;
  final String categoryId;
  final String name;
  final String? brand;
  final String? model;
  final double weightGrams;
  final String? description;
  final String? originalImageUrl;
  final String? stickerImageUrl;
  final bool isArchived;
  final bool isDeleted;
  final int createdAt;
  final int updatedAt;

  // 联表冗余字段
  final String? categoryName;
  final String? categoryIcon;

  Gear({
    required this.id,
    required this.userId,
    required this.categoryId,
    required this.name,
    this.brand,
    this.model,
    required this.weightGrams,
    this.description,
    this.originalImageUrl,
    this.stickerImageUrl,
    this.isArchived = false,
    this.isDeleted = false,
    required this.createdAt,
    required this.updatedAt,
    this.categoryName,
    this.categoryIcon,
  });

  factory Gear.fromJson(Map<String, dynamic> json) {
    return Gear(
      id: json['id'] as String,
      userId: json['user_id'] as String? ?? '',
      categoryId: json['category_id'] as String,
      name: json['name'] as String,
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      weightGrams: (json['weight_grams'] as num?)?.toDouble() ?? 0.0,
      description: json['description'] as String?,
      originalImageUrl: json['original_image_url'] as String?,
      stickerImageUrl: json['sticker_image_url'] as String?,
      isArchived: (json['is_archived'] as num?) == 1,
      isDeleted: (json['is_deleted'] as num?) == 1,
      createdAt: (json['created_at'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updated_at'] as num?)?.toInt() ?? 0,
      categoryName: json['category_name'] as String?,
      categoryIcon: json['category_icon'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'category_id': categoryId,
      'name': name,
      'brand': brand,
      'model': model,
      'weight_grams': weightGrams,
      'description': description,
      'original_image_url': originalImageUrl,
      'sticker_image_url': stickerImageUrl,
      'is_archived': isArchived ? 1 : 0,
      'is_deleted': isDeleted ? 1 : 0,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }

  String get formattedWeight {
    if (weightGrams >= 1000) {
      return '${(weightGrams / 1000).toStringAsFixed(2)} kg';
    }
    return '${weightGrams.toStringAsFixed(0)} g';
  }
}
