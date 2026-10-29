import 'package:flutter/material.dart';
import '../models/gear.dart';
import '../models/trip.dart';
import '../services/api_service.dart';

class TripDetailScreen extends StatefulWidget {
  final String tripId;
  final ApiService apiService;

  const TripDetailScreen({
    super.key,
    required this.tripId,
    required this.apiService,
  });

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends State<TripDetailScreen> {
  Trip? _trip;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadTripDetail();
  }

  Future<void> _loadTripDetail() async {
    setState(() => _isLoading = true);
    try {
      final trip = await widget.apiService.getTripDetail(widget.tripId);
      setState(() {
        _trip = trip;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('加载详情失败: $e')));
      }
    }
  }

  Future<void> _togglePacked(TripItemDetail item) async {
    final newState = !item.isPacked;
    setState(() {
      item.isPacked = newState;
    });
    try {
      await widget.apiService.toggleItemPacked(widget.tripId, item.tripItemId, newState);
      _loadTripDetail();
    } catch (e) {
      setState(() {
        item.isPacked = !newState;
      });
    }
  }

  Future<void> _showAddGearSheet() async {
    final allGears = await widget.apiService.getGears();
    final existingGearIds = _trip?.items?.map((i) => i.gearId).toSet() ?? {};
    final availableGears = allGears.where((g) => !existingGearIds.contains(g.id)).toList();

    if (!mounted) return;

    final selectedIds = <String>{};

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) {
          return SizedBox(
            height: MediaQuery.of(context).size.height * 0.7,
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('从装备柜挑选装备', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                Expanded(
                  child: availableGears.isEmpty
                      ? const Center(child: Text('没有更多可选装备了'))
                      : ListView.builder(
                          itemCount: availableGears.length,
                          itemBuilder: (context, index) {
                            final g = availableGears[index];
                            final isChecked = selectedIds.contains(g.id);
                            return CheckboxListTile(
                              title: Text(g.name),
                              subtitle: Text('${g.brand ?? ""} · ${g.formattedWeight}'),
                              value: isChecked,
                              onChanged: (val) {
                                setModalState(() {
                                  if (val == true) {
                                    selectedIds.add(g.id);
                                  } else {
                                    selectedIds.remove(g.id);
                                  }
                                });
                              },
                            );
                          },
                        ),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2E7D32),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  onPressed: selectedIds.isEmpty
                      ? null
                      : () async {
                          Navigator.pop(ctx);
                          await widget.apiService.addItemsToTrip(widget.tripId, selectedIds.toList());
                          _loadTripDetail();
                        },
                  child: Text(
                    '添加已选 (${selectedIds.length}) 件装备',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_trip == null) {
      return const Scaffold(body: Center(child: Text('行程未找到')));
    }

    final stats = _trip!.stats;
    final items = _trip!.items ?? [];

    return Scaffold(
      backgroundColor: const Color(0xFFF9F9FB),
      appBar: AppBar(
        title: Text(_trip!.title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: Column(
        children: [
          // 顶部汇总统计看板
          Container(
            padding: const EdgeInsets.all(16),
            color: Colors.white,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildStatItem('已打包', '${stats?.packedItems ?? 0}/${stats?.totalItems ?? 0} 件'),
                _buildStatItem('基础重量', '${((stats?.baseWeightGrams ?? 0) / 1000).toStringAsFixed(2)} kg'),
                _buildStatItem('总重量', '${((stats?.totalWeightGrams ?? 0) / 1000).toStringAsFixed(2)} kg'),
              ],
            ),
          ),
          const Divider(height: 1),

          // 打包清单列表
          Expanded(
            child: items.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.checklist_rtl, size: 56, color: Colors.grey[300]),
                        const SizedBox(height: 10),
                        Text('清单中暂无装备', style: TextStyle(color: Colors.grey[600])),
                        const SizedBox(height: 6),
                        Text('点击下方按钮从装备柜挑选需要带的物品', style: TextStyle(color: Colors.grey[400], fontSize: 12)),
                      ],
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: items.length,
                    itemBuilder: (context, index) {
                      final item = items[index];
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0.5,
                        child: ListTile(
                          leading: Checkbox(
                            value: item.isPacked,
                            activeColor: const Color(0xFF2E7D32),
                            onChanged: (_) => _togglePacked(item),
                          ),
                          title: Text(
                            item.gearName,
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              decoration: item.isPacked ? TextDecoration.lineThrough : null,
                              color: item.isPacked ? Colors.grey : Colors.black87,
                            ),
                          ),
                          subtitle: Text(
                            '${item.gearBrand ?? ""} · ${item.weightGrams}g',
                            style: TextStyle(color: Colors.grey[500], fontSize: 12),
                          ),
                          trailing: item.isPacked
                              ? const Text('已打包 ✅', style: TextStyle(color: Color(0xFF2E7D32), fontSize: 12, fontWeight: FontWeight.bold))
                              : const Text('未打包 ⏳', style: TextStyle(color: Colors.orange, fontSize: 12)),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showAddGearSheet,
        backgroundColor: const Color(0xFF2E7D32),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('添加装备', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildStatItem(String label, String value) {
    return Column(
      children: [
        Text(label, style: TextStyle(color: Colors.grey[600], fontSize: 12)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFF212121))),
      ],
    );
  }
}
