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

  @override
  void initState() {
    super.initState();
    _loadData();
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
                  : GridView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 16,
                        childAspectRatio: 0.9,
                      ),
                      itemCount: _gears.length,
                      itemBuilder: (context, index) {
                        final gear = _gears[index];
                        return GestureDetector(
                          onTap: () => _showGearDetailSheet(gear),
                          child: StickerCard(gear: gear, showWeight: true),
                        );
                      },
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
        backgroundColor: const Color(0xFF1A382B),
        icon: const Icon(Icons.camera_alt, color: Colors.white),
        label: const Text('做贴纸', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
