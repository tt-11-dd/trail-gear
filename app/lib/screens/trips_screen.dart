import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/trip.dart';
import '../services/api_service.dart';
import 'trip_detail_screen.dart';

class TripsScreen extends StatefulWidget {
  final ApiService apiService;
  const TripsScreen({super.key, required this.apiService});

  @override
  State<TripsScreen> createState() => _TripsScreenState();
}

class _TripsScreenState extends State<TripsScreen> {
  List<Trip> _trips = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadTrips();
  }

  Future<void> _loadTrips() async {
    setState(() => _isLoading = true);
    try {
      final trips = await widget.apiService.getTrips();
      setState(() {
        _trips = trips;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('获取行程失败: $e')));
      }
    }
  }

  Future<void> _showCreateTripDialog() async {
    final titleController = TextEditingController();
    final descController = TextEditingController();

    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('⛺️ 创建新行程'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: titleController,
              decoration: const InputDecoration(labelText: '行程标题 *', hintText: '如：武功山两日徒步'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descController,
              decoration: const InputDecoration(labelText: '描述备注', hintText: '路线与营地安排'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF2E7D32)),
            onPressed: () async {
              if (titleController.text.trim().isEmpty) return;
              Navigator.pop(ctx);
              final now = DateTime.now().millisecondsSinceEpoch;
              await widget.apiService.createTrip(
                title: titleController.text.trim(),
                description: descController.text.trim(),
                startDate: now,
                endDate: now + 86400000 * 2,
              );
              _loadTrips();
            },
            child: const Text('创建', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F9FB),
      appBar: AppBar(
        title: const Text(
          '🗺️ 行程记录与清单 Trips',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        backgroundColor: Colors.white,
        elevation: 0.5,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _trips.isEmpty
              ? _buildEmptyState()
              : RefreshIndicator(
                  onRefresh: _loadTrips,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _trips.length,
                    itemBuilder: (context, index) {
                      final trip = _trips[index];
                      return _buildTripCard(trip);
                    },
                  ),
                ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateTripDialog,
        backgroundColor: const Color(0xFF2E7D32),
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('创建行程', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildTripCard(Trip trip) {
    final dateFormat = DateFormat('MM/dd');
    final startDateStr = dateFormat.format(DateTime.fromMillisecondsSinceEpoch(trip.startDate));
    final endDateStr = dateFormat.format(DateTime.fromMillisecondsSinceEpoch(trip.endDate));

    final stats = trip.stats;
    final total = stats?.totalItems ?? 0;
    final packed = stats?.packedItems ?? 0;
    final progress = total == 0 ? 0.0 : packed / total;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      elevation: 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          await Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => TripDetailScreen(
                tripId: trip.id,
                apiService: widget.apiService,
              ),
            ),
          );
          _loadTrips();
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      trip.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE8F5E9),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '$startDateStr - $endDateStr',
                      style: const TextStyle(color: Color(0xFF2E7D32), fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
              if (trip.description != null && trip.description!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(trip.description!, style: TextStyle(color: Colors.grey[600], fontSize: 13)),
              ],
              const SizedBox(height: 14),

              // 打包进度条
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '打包进度: $packed / $total 件',
                    style: TextStyle(fontSize: 12, color: Colors.grey[700], fontWeight: FontWeight.w500),
                  ),
                  Text(
                    '基础重量: ${((stats?.baseWeightGrams ?? 0) / 1000).toStringAsFixed(2)} kg',
                    style: const TextStyle(fontSize: 12, color: Color(0xFF388E3C), fontWeight: FontWeight.bold),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              LinearProgressIndicator(
                value: progress,
                backgroundColor: Colors.grey[200],
                valueColor: AlwaysStoppedAnimation<Color>(
                  progress == 1.0 ? const Color(0xFF2E7D32) : const Color(0xFF66BB6A),
                ),
                borderRadius: BorderRadius.circular(4),
                minHeight: 6,
              ),
            ],
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
          Icon(Icons.terrain_outlined, size: 64, color: Colors.grey[300]),
          const SizedBox(height: 12),
          Text('暂无行程安排', style: TextStyle(color: Colors.grey[600], fontSize: 16)),
          const SizedBox(height: 6),
          Text('点击下方按钮创建行程，勾选打包清单', style: TextStyle(color: Colors.grey[400], fontSize: 13)),
        ],
      ),
    );
  }
}
