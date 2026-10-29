import 'package:flutter/material.dart';
import 'screens/gear_closet_screen.dart';
import 'screens/login_screen.dart';
import 'screens/trips_screen.dart';
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
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF141210), // 黑曜石暗调底色
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFF3E8DD), // 香槟暖白
          surface: Color(0xFF211E1A), // 悬浮卡片深灰
          onPrimary: Color(0xFF141210),
          onSurface: Color(0xFFF3E8DD),
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF211E1A),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(24)),
          ),
        ),
        useMaterial3: true,
      ),
      home: const MainTabNavigator(),
    );
  }
}

class MainTabNavigator extends StatefulWidget {
  const MainTabNavigator({super.key});

  @override
  State<MainTabNavigator> createState() => _MainTabNavigatorState();
}

class _MainTabNavigatorState extends State<MainTabNavigator> {
  final ApiService _apiService = ApiService();
  int _currentIndex = 0;
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
        backgroundColor: Color(0xFF141210),
        body: Center(child: CircularProgressIndicator(color: Color(0xFFF3E8DD))),
      );
    }

    if (!_isLoggedIn) {
      return LoginScreen(
        apiService: _apiService,
        onLoginSuccess: () => setState(() => _isLoggedIn = true),
      );
    }

    final pages = [
      GearClosetScreen(apiService: _apiService),
      TripsScreen(apiService: _apiService),
    ];

    return Scaffold(
      backgroundColor: const Color(0xFF141210),
      body: pages[_currentIndex],
      bottomNavigationBar: Container(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 12),
        color: Colors.transparent,
        child: SafeArea(
          child: Container(
            height: 60,
            decoration: BoxDecoration(
              color: const Color(0xFF211E1A).withOpacity(0.88),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.4),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                IconButton(
                  icon: Icon(
                    Icons.inventory_2,
                    color: _currentIndex == 0 ? const Color(0xFFF3E8DD) : const Color(0xFF8E857A),
                  ),
                  onPressed: () => setState(() => _currentIndex = 0),
                ),
                IconButton(
                  icon: Icon(
                    Icons.bar_chart_rounded,
                    color: _currentIndex == 1 ? const Color(0xFFF3E8DD) : const Color(0xFF8E857A),
                  ),
                  onPressed: () => setState(() => _currentIndex = 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
