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
  String? _selectedCategoryId;
  String _searchQuery = '';
  bool _isLoading = true;
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
      final gears = await widget.apiService.getGears(
        categoryId: _selectedCategoryId,
        keyword: _searchQuery.isEmpty ? null : _searchQuery,
      );

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
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('加载装备失败: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F9FB),
      appBar: AppBar(
        title: const Text(
          '🎒 装备柜 Gear Closet',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: Column(
        children: [
          // 搜索框
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: TextField(
              decoration: InputDecoration(
                hintText: '搜索装备名称、品牌或型号...',
                prefixIcon: const Icon(Icons.search, size: 20, color: Colors.grey),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.withOpacity(0.2)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: Colors.grey.withOpacity(0.2)),
                ),
              ),
              onChanged: (val) {
                _searchQuery = val;
                _loadData();
              },
            ),
          ),

          // 分类横滑胶囊条
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              children: [
                _buildCategoryChip(null, '全部'),
                ..._categories.map((c) => _buildCategoryChip(c.id, c.name)),
              ],
            ),
          ),

          // 重量统计栏
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '共 ${_gears.length} 件装备',
                  style: TextStyle(color: Colors.grey[700], fontSize: 13, fontWeight: FontWeight.w500),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F5E9),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '总重 ${_totalWeightGrams >= 1000 ? (_totalWeightGrams / 1000).toStringAsFixed(2) : _totalWeightGrams.toStringAsFixed(0)} ${_totalWeightGrams >= 1000 ? "kg" : "g"}',
                    style: const TextStyle(color: Color(0xFF2E7D32), fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),

          // 装备贴纸卡片网格
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _gears.isEmpty
                    ? _buildEmptyState()
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        child: GridView.builder(
                          padding: const EdgeInsets.all(16),
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            crossAxisSpacing: 14,
                            mainAxisSpacing: 14,
                            childAspectRatio: 0.78,
                          ),
                          itemCount: _gears.length,
                          itemBuilder: (context, index) {
                            final gear = _gears[index];
                            return StickerCard(
                              gear: gear,
                              onTap: () => _showGearActionSheet(gear),
                            );
                          },
                        ),
                      ),
          ),
        ],
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
        backgroundColor: const Color(0xFF2E7D32),
        icon: const Icon(Icons.add_a_photo, color: Colors.white),
        label: const Text('拍照做贴纸', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildCategoryChip(String? id, String name) {
    final isSelected = _selectedCategoryId == id;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: ChoiceChip(
        label: Text(
          name,
          style: TextStyle(
            fontSize: 12,
            color: isSelected ? Colors.white : Colors.black89,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
        selected: isSelected,
        selectedColor: const Color(0xFF2E7D32),
        backgroundColor: Colors.white,
        onSelected: (_) {
          setState(() => _selectedCategoryId = id);
          _loadData();
        },
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.inventory_2_outlined, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 12),
          Text('装备柜还是空的', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
          const SizedBox(height: 6),
          Text('点击下方按钮拍照，自动生成白色描边贴纸卡片', style: TextStyle(color: Colors.grey[400], fontSize: 13)),
        ],
      ),
    );
  }

  void _showGearActionSheet(Gear gear) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(gear.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              if (gear.brand != null) Text('${gear.brand} ${gear.model ?? ""}', style: TextStyle(color: Colors.grey[600])),
              const SizedBox(height: 8),
              Text('重量: ${gear.formattedWeight}', style: const TextStyle(color: Color(0xFF2E7D32), fontWeight: FontWeight.bold)),
              if (gear.description != null && gear.description!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(gear.description!, style: TextStyle(color: Colors.grey[700])),
              ],
              const Divider(height: 24),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: Colors.red),
                title: const Text('删除此装备', style: TextStyle(color: Colors.red)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await widget.apiService.deleteGear(gear.id);
                  _loadData();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
