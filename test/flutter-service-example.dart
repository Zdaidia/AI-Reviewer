import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// API 服务示例
class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  final Dio _dio = Dio(BaseOptions(baseUrl: 'https://api.example.com'));

  Future<Map<String, dynamic>> get(String path) async {
    final response = await _dio.get(path);
    return response.data;
  }

  Future<Map<String, dynamic>> post(String path, dynamic data) async {
    final response = await _dio.post(path, data: data);
    return response.data;
  }

  Future<void> delete(String path) async {
    await _dio.delete(path);
  }
}

/// 用户数据仓库
class UserRepository {
  final ApiService _apiService;
  final CacheService _cacheService;

  UserRepository(this._apiService, this._cacheService);

  Future<List<User>> findAll() async {
    // 先从缓存获取
    final cached = await _cacheService.get('users');
    if (cached != null) {
      return cached;
    }

    // 从 API 获取
    final data = await _apiService.get('/users');
    final users = (data['items'] as List).map((e) => User.fromJson(e)).toList();

    // 缓存结果
    await _cacheService.set('users', users);
    return users;
  }

  Future<User?> findById(String id) async {
    final data = await _apiService.get('/users/$id');
    return User.fromJson(data);
  }

  Future<User> save(User user) async {
    final data = await _apiService.post('/users', user.toJson());
    return User.fromJson(data);
  }

  Future<void> delete(String id) async {
    await _apiService.delete('/users/$id');
  }

  Future<int> count() async {
    final data = await _apiService.get('/users/count');
    return data['count'] as int;
  }
}

/// 缓存服务
class CacheService {
  final Map<String, dynamic> _cache = {};

  Future<T?> get<T>(String key) async {
    return _cache[key] as T?;
  }

  Future<void> set(String key, dynamic value) async {
    _cache[key] = value;
  }

  Future<void> clear() async {
    _cache.clear();
  }
}

/// 用户状态管理 (Provider)
class UserProvider extends ChangeNotifier {
  final UserRepository _repository;

  User? _currentUser;
  bool _isLoading = false;
  String? _error;

  UserProvider(this._repository);

  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> loadUser(String id) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _currentUser = await _repository.findById(id);
      _error = null;
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> updateUser(User user) async {
    _isLoading = true;
    notifyListeners();

    try {
      _currentUser = await _repository.save(user);
      _error = null;
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}

/// 认证管理器
class AuthManager {
  final ApiService _apiService;
  final CacheService _cacheService;

  AuthManager(this._apiService, this._cacheService);

  Future<bool> login(String username, String password) async {
    try {
      final response = await _apiService.post('/auth/login', {
        'username': username,
        'password': password,
      });

      final token = response['token'] as String;
      await _cacheService.set('auth_token', token);
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> logout() async {
    await _cacheService.clear();
  }

  Future<bool> isAuthenticated() async {
    final token = await _cacheService.get('auth_token');
    return token != null;
  }
}

/// 数据转换工具
class DataConverter {
  static DateTime? parseDateTime(String? value) {
    if (value == null) return null;
    return DateTime.parse(value);
  }

  static String formatDateTime(DateTime? date) {
    if (date == null) return '';
    return date.toIso8601String();
  }

  static List<T>? parseList<T>(dynamic value, T Function(dynamic) converter) {
    if (value == null) return null;
    return (value as List).map(converter).toList();
  }
}

/// 表单验证器
class FormValidator {
  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入邮箱';
    }
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!emailRegex.hasMatch(value)) {
      return '请输入有效的邮箱';
    }
    return null;
  }

  static String? validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return '请输入密码';
    }
    if (value.length < 6) {
      return '密码至少6位';
    }
    return null;
  }

  static String? validateRequired(String? value, String fieldName) {
    if (value == null || value.isEmpty) {
      return '请输入$fieldName';
    }
    return null;
  }
}

/// 用户实体
class User {
  final String id;
  final String name;
  final String email;
  final DateTime? createdAt;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      createdAt: DataConverter.parseDateTime(json['created_at'] as String?),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'created_at': DataConverter.formatDateTime(createdAt),
    };
  }
}

/// 订单处理器
class OrderHandler {
  final UserRepository _userRepository;
  final ApiService _apiService;

  OrderHandler(this._userRepository, this._apiService);

  Future<void> processOrder(String orderId) async {
    // 获取用户信息
    final user = await _userRepository.findById('current_user');

    // 处理订单
    await _apiService.post('/orders/$orderId/process', {
      'user_id': user?.id,
    });
  }

  Future<void> cancelOrder(String orderId) async {
    await _apiService.post('/orders/$orderId/cancel', {});
  }
}
