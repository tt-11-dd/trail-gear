import 'package:flutter/material.dart';
import 'screens/gear_closet_screen.dart';
import 'screens/login_screen.dart';
import 'services/api_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const TrailGearApp());
}

class TrailGearApp extends StatelessWidget {
  const TrailGearApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Trail Gear',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        scaffoldBackgroundColor: const Color(0xFFF4F0E8),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1A382B),
          primary: const Color(0xFF1A382B),
        ),
        useMaterial3: true,
      ),
      home: const MainRoot(),
    );
  }
}

class MainRoot extends StatefulWidget {
  const MainRoot({super.key});

  @override
  State<MainRoot> createState() => _MainRootState();
}

class _MainRootState extends State<MainRoot> {
  final ApiService _apiService = ApiService();
  bool _isLoggedIn = false;
  bool _isCheckingAuth = true;

  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final user = await _apiService.getMe();
    setState(() {
      _isLoggedIn = user != null;
      _isCheckingAuth = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isCheckingAuth) {
      return const Scaffold(
        backgroundColor: Color(0xFFF4F0E8),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF1A382B))),
      );
    }

    if (!_isLoggedIn) {
      return LoginScreen(
        apiService: _apiService,
        onLoginSuccess: () => setState(() => _isLoggedIn = true),
      );
    }

    // 核心纯粹主界面：贴纸装备墙 (拍照 -> 生成贴纸 -> 展示)
    return GearClosetScreen(apiService: _apiService);
  }
}
