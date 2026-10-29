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
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2E7D32),
          primary: const Color(0xFF2E7D32),
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF9F9FB),
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
        body: Center(child: CircularProgressIndicator()),
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
      body: pages[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) => setState(() => _currentIndex = index),
        indicatorColor: const Color(0xFFC8E6C9),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2, color: Color(0xFF1B5E20)),
            label: '装备柜',
          ),
          NavigationDestination(
            icon: Icon(Icons.checklist_outlined),
            selectedIcon: Icon(Icons.checklist, color: Color(0xFF1B5E20)),
            label: '行程清单',
          ),
        ],
      ),
    );
  }
}
