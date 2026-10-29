class GearCategory {
  final String id;
  final String? userId;
  final String name;
  final String icon;
  final int sortOrder;
  final int isDeleted;
  final int updatedAt;

  GearCategory({
    required this.id,
    this.userId,
    required this.name,
    required this.icon,
    this.sortOrder = 0,
    this.isDeleted = 0,
    required this.updatedAt,
  });

  factory GearCategory.fromJson(Map<String, dynamic> json) {
    return GearCategory(
      id: json['id'] as String,
      userId: json['user_id'] as String?,
      name: json['name'] as String,
      icon: json['icon'] as String? ?? 'category',
      sortOrder: (json['sort_order'] as num?)?.toInt() ?? 0,
      isDeleted: (json['is_deleted'] as num?)?.toInt() ?? 0,
      updatedAt: (json['updated_at'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'name': name,
      'icon': icon,
      'sort_order': sortOrder,
      'is_deleted': isDeleted,
      'updated_at': updatedAt,
    };
  }
}
