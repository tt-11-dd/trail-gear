class Trip {
  final String id;
  final String userId;
  final String title;
  final String? description;
  final int startDate;
  final int endDate;
  final String? coverImageUrl;
  final String status;
  final bool isDeleted;
  final int createdAt;
  final int updatedAt;
  final TripStats? stats;
  final List<TripItemDetail>? items;

  Trip({
    required this.id,
    required this.userId,
    required this.title,
    this.description,
    required this.startDate,
    required this.endDate,
    this.coverImageUrl,
    this.status = 'planning',
    this.isDeleted = false,
    required this.createdAt,
    required this.updatedAt,
    this.stats,
    this.items,
  });

  factory Trip.fromJson(Map<String, dynamic> json) {
    return Trip(
      id: json['id'] as String,
      userId: json['user_id'] as String? ?? '',
      title: json['title'] as String,
      description: json['description'] as String?,
      startDate: (json['start_date'] as num?)?.toInt() ?? 0,
      endDate: (json['end_date'] as num?)?.toInt() ?? 0,
      coverImageUrl: json['cover_image_url'] as String?,
      status: json['status'] as String? ?? 'planning',
      isDeleted: (json['is_deleted'] as num?) == 1,
      createdAt: (json['created_at'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updated_at'] as num?)?.toInt() ?? 0,
      stats: json['stats'] != null ? TripStats.fromJson(json['stats'] as Map<String, dynamic>) : null,
      items: (json['items'] as List<dynamic>?)
          ?.map((e) => TripItemDetail.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'title': title,
      'description': description,
      'start_date': startDate,
      'end_date': endDate,
      'cover_image_url': coverImageUrl,
      'status': status,
      'is_deleted': isDeleted ? 1 : 0,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }
}

class TripStats {
  final int totalItems;
  final int packedItems;
  final double totalWeightGrams;
  final double baseWeightGrams;

  TripStats({
    required this.totalItems,
    required this.packedItems,
    required this.totalWeightGrams,
    required this.baseWeightGrams,
  });

  factory TripStats.fromJson(Map<String, dynamic> json) {
    return TripStats(
      totalItems: (json['total_items'] as num?)?.toInt() ?? 0,
      packedItems: (json['packed_items'] as num?)?.toInt() ?? 0,
      totalWeightGrams: (json['total_weight_grams'] as num?)?.toDouble() ?? 0.0,
      baseWeightGrams: (json['base_weight_grams'] as num?)?.toDouble() ?? 0.0,
    );
  }

  double get progress => totalItems == 0 ? 0 : packedItems / totalItems;
}

class TripItemDetail {
  final String tripItemId;
  bool isPacked;
  final int customQuantity;
  final int sortOrder;
  final String gearId;
  final String gearName;
  final String? gearBrand;
  final String? gearModel;
  final double weightGrams;
  final String categoryId;
  final String? categoryName;
  final String? categoryIcon;
  final String? stickerImageUrl;

  TripItemDetail({
    required this.tripItemId,
    required this.isPacked,
    required this.customQuantity,
    required this.sortOrder,
    required this.gearId,
    required this.gearName,
    this.gearBrand,
    this.gearModel,
    required this.weightGrams,
    required this.categoryId,
    this.categoryName,
    this.categoryIcon,
    this.stickerImageUrl,
  });

  factory TripItemDetail.fromJson(Map<String, dynamic> json) {
    return TripItemDetail(
      tripItemId: json['trip_item_id'] as String,
      isPacked: (json['is_packed'] as num?) == 1,
      customQuantity: (json['custom_quantity'] as num?)?.toInt() ?? 1,
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      gearId: json['gear_id'] as String,
      gearName: json['gear_name'] as String,
      gearBrand: json['gear_brand'] as String?,
      gearModel: json['gear_model'] as String?,
      weightGrams: (json['weight_grams'] as num?)?.toDouble() ?? 0.0,
      categoryId: json['category_id'] as String,
      categoryName: json['category_name'] as String?,
      categoryIcon: json['category_icon'] as String?,
      stickerImageUrl: json['sticker_image_url'] as String?,
    );
  }
}
