import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/category.dart';
import '../models/gear.dart';
import '../services/api_service.dart';
import '../widgets/sticker_card.dart';
import 'sticker_maker_screen.dart';

class GearClosetScreen extends StatefulWidget {
  final ApiService apiService;
  const GearClosetScreen({super.key, required this.apiService});

  @override
  State<GearClosetScreen> createState() => _GearClosetScreenState();
}

class _GearClosetScreenState extends State<GearClosetScreen> {
  List<GearCategory> _categories = [];
  List<Gear> _gears = [];
  bool _isLoading = true;
  bool _isTidyGrid = false; // false: 随性散落手账模式 | true: 一键整理网格模式
  double _totalWeightGrams = 0;

  // 物理坐标与独立角度池（从 -30° 到 +30°，保证落地后多角度自然错落）
  final Map<String, Offset> _positions = {};
  final Map<String, double> _rotations = {};
  final List<double> _anglePool = [-0.48, 0.35, -0.26, 0.52, -0.14, 0.40, -0.56, 0.24, -0.38, 0.44, -0.20, 0.30];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _initPositions() {
    for (int i = 0; i < _gears.length; i++) {
      final g = _gears[i];
      if (!_positions.containsKey(g.id)) {
        final col = i % 2;
        final row = i ~/ 2;
        final dx = col == 0 ? 18.0 + (i * 13 % 20) : 172.0 + (i * 17 % 20);
        final dy = row < 2 ? math.min(220.0, row * 130.0 + 16.0) : row * 130.0 + 16.0;
        _positions[g.id] = Offset(dx, dy);
        _rotations[g.id] = _anglePool[(i * 3 + g.name.hashCode.abs()) % _anglePool.length];
      }
    }
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final categories = await widget.apiService.getCategories();
      final gears = await widget.apiService.getGears();

      double weight = 0;
      for (final g in gears) {
        weight += g.weightGrams;
      }

      setState(() {
        _categories = categories;
        _gears = gears;
        _totalWeightGrams = weight;
        _initPositions();
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  void _showGearDetailSheet(Gear gear) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (gear.stickerImageUrl != null)
              Container(
                height: 160,
                padding: const EdgeInsets.all(8),
                child: Center(
                  child: Image.network(
                    gear.stickerImageUrl!,
                    fit: BoxFit.contain,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (gear.brand != null)
                        Text(
                          gear.brand!.toUpperCase(),
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFFC86237)),
                        ),
                      Text(
                        gear.name,
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF171615)),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1A382B).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    gear.formattedWeight,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Color(0xFF1A382B)),
                  ),
                ),
              ],
            ),
            if (gear.description != null && gear.description!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF6F2EA),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('备注说明', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF8F887C))),
                    const SizedBox(height: 2),
                    Text(
                      gear.description!,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF332F2A)),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.redAccent),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: () async {
                      Navigator.pop(ctx);
                      await widget.apiService.deleteGear(gear.id);
                      _loadData();
                    },
                    child: const Text('删除装备'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF1A382B),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('完成', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final kgStr = (_totalWeightGrams / 1000).toStringAsFixed(1);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F0E8),
      appBar: AppBar(
        backgroundColor: const Color(0xFFF4F0E8),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'TRAIL GEAR',
              style: TextStyle(fontWeight: FontWeight.black, fontSize: 16, color: Color(0xFF171615)),
            ),
            Text(
              '${_gears.length} 件装备 · 负重 $kgStr kg',
              style: const TextStyle(fontSize: 11, color: Color(0xFF756D63), fontWeight: FontWeight.w500),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: ActionChip(
              avatar: Icon(
                _isTidyGrid ? Icons.casino_outlined : Icons.grid_view_rounded,
                size: 16,
                color: const Color(0xFF1A382B),
              ),
              label: Text(
                _isTidyGrid ? '随性散落' : '一键整理',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Color(0xFF1A382B)),
              ),
              backgroundColor: Colors.white,
              side: const BorderSide(color: Color(0xFFD5D0C3)),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              onPressed: () => setState(() => _isTidyGrid = !_isTidyGrid),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF1A382B)))
          : _gears.isEmpty
              ? _buildEmptyState()
              : _isTidyGrid
                  ? GridView.builder(
                      padding: const EdgeInsets.all(16),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 0.82,
                      ),
                      itemCount: _gears.length,
                      itemBuilder: (context, index) {
                        final gear = _gears[index];
                        return GestureDetector(
                          onTap: () => _showGearDetailSheet(gear),
                          child: StickerCard(gear: gear, showWeight: true),
                        );
                      },
                    )
                  : Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Row(
                                children: [
                                  Icon(Icons.crop_free, size: 13, color: Color(0xFF1A382B)),
                                  SizedBox(width: 4),
                                  Text('装备收纳垫 · GEAR MAT', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF554F47))),
                                ],
                              ),
                              Text('${_gears.length} 件贴纸', style: const TextStyle(fontSize: 10, color: Color(0xFF8F887C), fontWeight: FontWeight.bold)),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Expanded(
                            child: Container(
                              decoration: BoxDecoration(
                                color: const Color(0xFFF6F2EA),
                                borderRadius: BorderRadius.circular(26),
                                border: Border.all(color: const Color(0xFFD5D0C3), width: 1.5),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(26),
                                child: SingleChildScrollView(
                                  padding: const EdgeInsets.only(bottom: 120),
                                  child: SizedBox(
                                    height: math.max(620, (_gears.length / 2).ceil() * 170.0 + 120),
                                    child: Stack(
                                      children: [
                                        for (final gear in _gears)
                                          _buildDraggableSticker(gear),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          final created = await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => StickerMakerScreen(
                apiService: widget.apiService,
                categories: _categories,
              ),
            ),
          );
          if (created == true) {
            _loadData();
          }
        },
        backgroundColor: const Color(0xFF171615),
        elevation: 6,
        icon: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white.withOpacity(0.12),
          ),
          child: const Icon(Icons.camera_alt, color: Color(0xFFF7E2A9), size: 14),
        ),
        label: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('拍照做贴纸', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.5)),
            Text('CAMERA TO STICKER', style: TextStyle(color: Color(0xFF9E978C), fontSize: 8, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildDraggableSticker(Gear gear) {
    final pos = _positions[gear.id] ?? const Offset(40, 40);
    final rot = _rotations[gear.id] ?? 0.0;

    return Positioned(
      left: pos.dx,
      top: pos.dy,
      child: Transform.rotate(
        angle: rot,
        child: GestureDetector(
          onPanUpdate: (details) {
            setState(() {
              final newDx = (pos.dx + details.delta.dx).clamp(10.0, 200.0);
              final newDy = (pos.dy + details.delta.dy).clamp(10.0, 2500.0);
              _positions[gear.id] = Offset(newDx, newDy);
            });
          },
          onTap: () => _showGearDetailSheet(gear),
          child: SizedBox(
            width: 155,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (gear.stickerImageUrl != null && gear.stickerImageUrl!.isNotEmpty)
                  Image.network(
                    gear.stickerImageUrl!,
                    height: 110,
                    fit: BoxFit.contain,
                  )
                else
                  Container(
                    width: 85,
                    height: 85,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0xFF1A382B), width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.12),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        gear.name.length > 2 ? gear.name.substring(0, 2) : gear.name,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                    ),
                  ),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFAF7EE),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFDDD5C4)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          gear.name,
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF262422)),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        gear.formattedWeight,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF1A382B)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.inventory_2_outlined, size: 54, color: Colors.grey[400]),
          const SizedBox(height: 12),
          const Text('桌面空空如也', style: TextStyle(color: Color(0xFF262422), fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text('点击下方按钮拍照，自动生成白色描边贴纸', style: TextStyle(color: Colors.grey[500], fontSize: 12)),
        ],
      ),
    );
  }
}
