import 'dart:io';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/category.dart';
import '../models/gear.dart';
import '../models/trip.dart';
import '../models/user.dart';

class ApiService {
  static const String defaultBaseUrl = 'https://trail-gear-api.liuziting.workers.dev/api/v1';
  final Dio _dio = Dio();
  String? _token;

  ApiService({String baseUrl = defaultBaseUrl}) {
    _dio.options.baseUrl = baseUrl;
    _dio.options.connectTimeout = const Duration(seconds: 10);
    _dio.options.receiveTimeout = const Duration(seconds: 15);

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (_token == null) {
            final prefs = await SharedPreferences.getInstance();
            _token = prefs.getString('auth_token');
          }
          if (_token != null) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          return handler.next(options);
        },
        onError: (DioException e, handler) {
          if (e.response?.statusCode == 401) {
            // Token 过期或未登录
            _token = null;
          }
          return handler.next(e);
        },
      ),
    );
  }

  // ======================== Auth ========================

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    final data = res.data['data'] as Map<String, dynamic>;
    _token = data['token'] as String;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    return data;
  }

  Future<Map<String, dynamic>> register(String email, String password, String nickname) async {
    final res = await _dio.post('/auth/register', data: {
      'email': email,
      'password': password,
      'nickname': nickname,
    });
    final data = res.data['data'] as Map<String, dynamic>;
    _token = data['token'] as String;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', _token!);
    return data;
  }

  Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  Future<User?> getMe() async {
    try {
      final res = await _dio.get('/auth/me');
      return User.fromJson(res.data['data'] as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  // ======================== Categories ========================

  Future<List<GearCategory>> getCategories() async {
    final res = await _dio.get('/categories');
    final list = res.data['data'] as List<dynamic>;
    return list.map((e) => GearCategory.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ======================== Gears ========================

  Future<List<Gear>> getGears({String? categoryId, String? keyword}) async {
    final query = <String, dynamic>{};
    if (categoryId != null) query['category_id'] = categoryId;
    if (keyword != null && keyword.isNotEmpty) query['keyword'] = keyword;

    final res = await _dio.get('/gears', queryParameters: query);
    final data = res.data['data'] as Map<String, dynamic>;
    final list = data['gears'] as List<dynamic>;
    return list.map((e) => Gear.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Gear> createGear({
    required String categoryId,
    required String name,
    String? brand,
    String? model,
    required double weightGrams,
    String? description,
    String? stickerImageUrl,
    String? originalImageUrl,
  }) async {
    final res = await _dio.post('/gears', data: {
      'category_id': categoryId,
      'name': name,
      'brand': brand,
      'model': model,
      'weight_grams': weightGrams,
      'description': description,
      'sticker_image_url': stickerImageUrl,
      'original_image_url': originalImageUrl,
    });
    return Gear.fromJson(res.data['data'] as Map<String, dynamic>);
  }

  Future<void> deleteGear(String id) async {
    await _dio.delete('/gears/$id');
  }

  // ======================== Trips ========================

  Future<List<Trip>> getTrips() async {
    final res = await _dio.get('/trips');
    final list = res.data['data'] as List<dynamic>;
    return list.map((e) => Trip.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Trip> createTrip({
    required String title,
    String? description,
    required int startDate,
    required int endDate,
    String? coverImageUrl,
  }) async {
    final res = await _dio.post('/trips', data: {
      'title': title,
      'description': description,
      'start_date': startDate,
      'end_date': endDate,
      'cover_image_url': coverImageUrl,
    });
    return Trip.fromJson(res.data['data'] as Map<String, dynamic>);
  }

  Future<Trip> getTripDetail(String id) async {
    final res = await _dio.get('/trips/$id');
    return Trip.fromJson(res.data['data'] as Map<String, dynamic>);
  }

  Future<void> addItemsToTrip(String tripId, List<String> gearIds) async {
    await _dio.post('/trips/$tripId/items', data: {
      'gear_ids': gearIds,
    });
  }

  Future<void> toggleItemPacked(String tripId, String itemId, bool isPacked) async {
    await _dio.patch('/trips/$tripId/items/$itemId', data: {
      'is_packed': isPacked,
    });
  }

  Future<void> deleteTrip(String tripId) async {
    await _dio.delete('/trips/$tripId');
  }

  // ======================== Storage ========================

  Future<String> uploadImage(File file, {String type = 'gear_sticker'}) async {
    final fileName = file.path.split('/').last;
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: fileName),
      'type': type,
    });

    final res = await _dio.post('/storage/upload', data: formData);
    return res.data['data']['url'] as String;
  }
}
