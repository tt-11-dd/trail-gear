import 'dart:math';
import 'package:flutter/material.dart';
import '../models/gear.dart';

class StickerCard extends StatelessWidget {
  final Gear gear;
  final VoidCallback? onTap;
  final bool isSelected;
  final bool showWeight;

  const StickerCard({
    super.key,
    required this.gear,
    this.onTap,
    this.isSelected = false,
    this.showWeight = true,
  });

  @override
  Widget build(BuildContext context) {
    // 根据装备 ID 的哈希值生成微小而稳定的手账微倾斜角度 (-2° ~ +2°)
    final randomAngle = ((gear.id.hashCode % 100) / 100.0 * 4.0 - 2.0) * (pi / 180.0);

    return Transform.rotate(
      angle: randomAngle,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isSelected ? const Color(0xFF2E7D32) : Colors.black.withOpacity(0.06),
              width: isSelected ? 2.5 : 1.0,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 贴纸展示区
              Expanded(
                child: Center(
                  child: gear.stickerImageUrl != null && gear.stickerImageUrl!.isNotEmpty
                      ? Image.network(
                          gear.stickerImageUrl!,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => _buildPlaceholder(),
                        )
                      : _buildPlaceholder(),
                ),
              ),
              const SizedBox(height: 8),

              // 品牌与型号
              if (gear.brand != null && gear.brand!.isNotEmpty)
                Text(
                  gear.brand!,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.grey[600],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),

              // 装备名称
              Text(
                gear.name,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF212121),
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),

              const SizedBox(height: 6),

              // 底部重量与分类
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (showWeight)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F8E9),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        gear.formattedWeight,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF33691E),
                        ),
                      ),
                    ),
                  if (gear.categoryName != null)
                    Text(
                      gear.categoryName!,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey[500],
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlaceholder() {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF5F5F5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Center(
        child: Icon(
          Icons.backpack_outlined,
          size: 48,
          color: Colors.grey[400],
        ),
      ),
    );
  }
}
