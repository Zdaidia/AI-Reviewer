import 'package:sqflite/sqflite.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 用户仓库 - 示例
class UserRepository {
  final UserLocalDataSource _localDataSource;
  final UserRemoteDataSource _remoteDataSource;
  final CacheService _cacheService;

  UserRepository(
    this._localDataSource,
    this._remoteDataSource,
    this._cacheService,
  );

  /// 获取所有用户
  Future<List<User>> findAll() async {
    // 先从缓存获取
    final cached = await _cacheService.get('users');
    if (cached != null) {
      return cached;
    }

    // 从本地数据库获取
    final localUsers = await _localDataSource.getAllUsers();
    if (localUsers.isNotEmpty) {
      await _cacheService.set('users', localUsers);
      return localUsers;
    }

    // 从远程 API 获取
    final remoteUsers = await _remoteDataSource.fetchUsers();
    await _localDataSource.saveUsers(remoteUsers);
    await _cacheService.set('users', remoteUsers);
    return remoteUsers;
  }

  /// 根据ID查找用户
  Future<User?> findById(String id) async {
    // 先查缓存
    final cached = await _cacheService.get('user_$id');
    if (cached != null) {
      return cached;
    }

    // 查本地数据库
    final user = await _localDataSource.getUserById(id);
    if (user != null) {
      await _cacheService.set('user_$id', user);
      return user;
    }

    // 查远程API
    final remoteUser = await _remoteDataSource.fetchUserById(id);
    if (remoteUser != null) {
      await _localDataSource.saveUser(remoteUser);
      await _cacheService.set('user_$id', remoteUser);
    }
    return remoteUser;
  }

  /// 保存用户
  Future<User> save(User user) async {
    // 保存到本地
    await _localDataSource.insertUser(user);
    // 同步到远程
    final saved = await _remoteDataSource.createUser(user);
    // 更新缓存
    await _cacheService.set('user_${user.id}', saved);
    return saved;
  }

  /// 更新用户
  Future<User> update(User user) async {
    await _localDataSource.updateUser(user);
    final updated = await _remoteDataSource.updateUser(user);
    await _cacheService.set('user_${user.id}', updated);
    return updated;
  }

  /// 删除用户
  Future<void> delete(String id) async {
    await _localDataSource.deleteUser(id);
    await _remoteDataSource.deleteUser(id);
    await _cacheService.remove('user_$id');
  }

  /// 查询用户数量
  Future<int> count() async {
    return await _localDataSource.getUserCount();
  }
}

/// 用户本地数据源
class UserLocalDataSource {
  final Database _database;

  UserLocalDataSource(this._database);

  Future<List<User>> getAllUsers() async {
    final maps = await _database.query('users');
    return maps.map((map) => User.fromJson(map)).toList();
  }

  Future<User?> getUserById(String id) async {
    final maps = await _database.query(
      'users',
      where: 'id = ?',
      whereArgs: [id],
    );

    if (maps.isEmpty) return null;
    return User.fromJson(maps.first);
  }

  Future<void> saveUsers(List<User> users) async {
    final batch = _database.batch();
    for (final user in users) {
      batch.insert('users', user.toJson());
    }
    await batch.commit(noResult: true);
  }

  Future<void> saveUser(User user) async {
    await _database.insert('users', user.toJson());
  }

  Future<void> insertUser(User user) async {
    await _database.insert('users', user.toJson(),
      conflictAlgorithm: ConflictAlgorithm.replace);
  }

  Future<void> updateUser(User user) async {
    await _database.update('users', user.toJson(),
      where: 'id = ?',
      whereArgs: [user.id]);
  }

  Future<void> deleteUser(String id) async {
    await _database.delete('users',
      where: 'id = ?',
      whereArgs: [id]);
  }

  Future<int> getUserCount() async {
    final result = await _database.rawQuery('SELECT COUNT(*) FROM users');
    return Sqflite.firstIntValue(result) ?? 0;
  }
}

/// 用户远程数据源
class UserRemoteDataSource {
  final ApiClient _apiClient;

  UserRemoteDataSource(this._apiClient);

  Future<List<User>> fetchUsers() async {
    final response = await _apiClient.get('/users');
    final data = response.data['items'] as List;
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<User?> fetchUserById(String id) async {
    final response = await _apiClient.get('/users/$id');
    if (response.data == null) return null;
    return User.fromJson(response.data);
  }

  Future<User> createUser(User user) async {
    final response = await _apiClient.post('/users', user.toJson());
    return User.fromJson(response.data);
  }

  Future<User> updateUser(User user) async {
    final response = await _apiClient.put('/users/${user.id}', user.toJson());
    return User.fromJson(response.data);
  }

  Future<void> deleteUser(String id) async {
    await _apiClient.delete('/users/$id');
  }
}

/// 缓存服务
class CacheService {
  final Map<String, dynamic> _memoryCache = {};
  final SharedPreferences? _prefs;

  CacheService(this._prefs);

  Future<T?> get<T>(String key) async {
    // 先查内存缓存
    if (_memoryCache.containsKey(key)) {
      return _memoryCache[key] as T?;
    }

    // 再查持久化缓存
    if (_prefs != null) {
      final value = _prefs!.get(key);
      if (value != null) {
        _memoryCache[key] = value;
        return value as T?;
      }
    }

    return null;
  }

  Future<void> set(String key, dynamic value) async {
    // 存入内存缓存
    _memoryCache[key] = value;

    // 存入持久化缓存
    if (_prefs != null) {
      if (value is String) {
        await _prefs!.setString(key, value);
      } else if (value is int) {
        await _prefs!.setInt(key, value);
      } else if (value is bool) {
        await _prefs!.setBool(key, value);
      } else if (value is double) {
        await _prefs!.setDouble(key, value);
      }
    }
  }

  Future<void> remove(String key) async {
    _memoryCache.remove(key);
    if (_prefs != null) {
      await _prefs!.remove(key);
    }
  }

  Future<void> clear() async {
    _memoryCache.clear();
    if (_prefs != null) {
      await _prefs!.clear();
    }
  }

  Future<bool> has(String key) async {
    return _memoryCache.containsKey(key) ||
        (_prefs?.containsKey(key) ?? false);
  }
}

/// API 客户端
class ApiClient {
  final String baseUrl;

  ApiClient(this.baseUrl);

  Future<Response> get(String path) async {
    // 模拟 HTTP GET 请求
    return Response();
  }

  Future<Response> post(String path, dynamic data) async {
    // 模拟 HTTP POST 请求
    return Response();
  }

  Future<Response> put(String path, dynamic data) async {
    // 模拟 HTTP PUT 请求
    return Response();
  }

  Future<Response> delete(String path) async {
    // 模拟 HTTP DELETE 请求
    return Response();
  }
}

/// 响应类
class Response {
  final Map<String, dynamic>? data;

  Response({this.data});
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
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'created_at': createdAt?.toIso8601String(),
    };
  }
}
