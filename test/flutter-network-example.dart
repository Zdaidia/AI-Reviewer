import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;

/// API 服务类
class ApiService {
  late final Dio _dio;
  static const String baseUrl = 'https://api.example.com/v1';

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 5),
      receiveTimeout: const Duration(seconds: 10),
      sendTimeout: const Duration(seconds: 5),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        // 添加认证 token
        final token = 'your_access_token';
        options.headers['Authorization'] = 'Bearer $token';
        return handler.next(options);
      },
      onError: (error, handler) {
        // 全局错误处理
        if (error.response?.statusCode == 401) {
          // 处理未授权
          print('Unauthorized: Please login');
        } else if (error.response?.statusCode == 429) {
          // 处理请求过多
          print('Too many requests');
        }
        return handler.next(error);
      },
    ));
  }

  /// 获取用户列表
  Future<List<User>> getUsers() async {
    try {
      final response = await _dio.get(
        '/users',
        queryParameters: {
          'page': 1,
          'limit': 20,
        },
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = response.data['data'];
        return data.map((json) => User.fromJson(json)).toList();
      } else {
        throw Exception('Failed to load users');
      }
    } on DioException catch (e) {
      if (DioExceptionType.connectionTimeout == e.type) {
        throw Exception('Connection timeout');
      } else if (DioExceptionType.receiveTimeout == e.type) {
        throw Exception('Receive timeout');
      } else if (e.response?.statusCode == 404) {
        throw Exception('Resource not found');
      } else if (e.response?.statusCode == 500) {
        throw Exception('Server error');
      }
      throw Exception('Failed to load users: $e');
    } catch (e) {
      throw Exception('Unexpected error: $e');
    }
  }

  /// 获取用户详情
  Future<User> getUserDetail(String userId) async {
    try {
      final response = await _dio.get(
        '/users/$userId',
      );

      return User.fromJson(response.data['data']);
    } catch (e) {
      throw Exception('Failed to load user: $e');
    }
  }

  /// 创建用户
  Future<User> createUser(CreateUserRequest request) async {
    try {
      final response = await _dio.post(
        '/users',
        data: request.toJson(),
      );

      if (response.statusCode == 201) {
        return User.fromJson(response.data['data']);
      } else {
        throw Exception('Failed to create user');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 400) {
        throw Exception('Bad request: Invalid data');
      } else if (e.response?.statusCode == 409) {
        throw Exception('User already exists');
      } else if (e.response?.statusCode == 422) {
        throw Exception('Validation error');
      }
      throw Exception('Failed to create user: $e');
    }
  }

  /// 更新用户
  Future<User> updateUser(String userId, UpdateUserRequest request) async {
    try {
      final response = await _dio.put(
        '/users/$userId',
        data: request.toJson(),
      );

      return User.fromJson(response.data['data']);
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        throw Exception('User not found');
      }
      throw Exception('Failed to update user: $e');
    }
  }

  /// 删除用户
  Future<void> deleteUser(String userId) async {
    try {
      final response = await _dio.delete('/users/$userId');

      if (response.statusCode != 204) {
        throw Exception('Failed to delete user');
      }
    } catch (e) {
      throw Exception('Failed to delete user: $e');
    }
  }

  /// 搜索用户
  Future<List<User>> searchUsers(String query) async {
    try {
      final response = await _dio.get(
        '/users/search',
        queryParameters: {'q': query},
      );

      final data = response.data['data'] as List;
      return data.map((json) => User.fromJson(json)).toList();
    } catch (e) {
      throw Exception('Search failed: $e');
    }
  }

  /// 用户登录
  Future<LoginResponse> login(String email, String password) async {
    try {
      final response = await _dio.post(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
        },
      );

      return LoginResponse.fromJson(response.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        throw Exception('Invalid credentials');
      }
      throw Exception('Login failed: $e');
    }
  }

  /// 刷新 Token
  Future<TokenResponse> refreshToken(String refreshToken) async {
    try {
      final response = await _dio.post(
        '/auth/refresh',
        data: {'refresh_token': refreshToken},
      );

      return TokenResponse.fromJson(response.data);
    } catch (e) {
      throw Exception('Token refresh failed: $e');
    }
  }

  /// 上传文件
  Future<String> uploadFile(String filePath) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath),
      });

      final response = await _dio.post(
        '/files/upload',
        data: formData,
      );

      return response.data['data']['url'];
    } catch (e) {
      throw Exception('Upload failed: $e');
    }
  }
}

/// 使用 package:http 的实现
class HttpApiService {
  final client = http.Client();
  static const String baseUrl = 'https://api.example.com/v1';

  /// 获取产品列表
  Future<List<Product>> getProducts() async {
    try {
      final response = await client.get(
        Uri.parse('$baseUrl/products'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
        },
      ).timeout(
        const Duration(seconds: 10),
        onTimeout: () {
          throw Exception('Request timeout');
        },
      );

      if (response.statusCode == 200) {
        // 解析响应
        return [];
      } else {
        throw Exception('Failed to load products');
      }
    } on SocketException catch (e) {
      throw Exception('Network error: $e');
    } on HttpException catch (e) {
      throw Exception('HTTP error: $e');
    } catch (e) {
      throw Exception('Unexpected error: $e');
    }
  }

  /// 创建产品
  Future<Product> createProduct(CreateProductRequest request) async {
    try {
      final response = await client.post(
        Uri.parse('$baseUrl/products'),
        headers: {'Content-Type': 'application/json'},
        body: request.toJson(),
      );

      if (response.statusCode == 201) {
        return Product.fromJson(response.body);
      } else if (response.statusCode == 400) {
        throw Exception('Invalid product data');
      } else {
        throw Exception('Failed to create product');
      }
    } catch (e) {
      throw Exception('Create product failed: $e');
    }
  }

  /// 更新产品
  Future<Product> updateProduct(String productId, Product product) async {
    final response = await client.put(
      Uri.parse('$baseUrl/products/$productId'),
      headers: {'Content-Type': 'application/json'},
      body: product.toJson(),
    );

    if (response.statusCode == 200) {
      return Product.fromJson(response.body);
    } else {
      throw Exception('Update failed');
    }
  }

  /// 删除产品
  Future<void> deleteProduct(String productId) async {
    final response = await client.delete(
      Uri.parse('$baseUrl/products/$productId'),
    );

    if (response.statusCode != 204) {
      throw Exception('Delete failed');
    }
  }
}

/// 自定义 API 仓储
class UserRepository {
  final ApiService _apiService;

  UserRepository(this._apiService);

  /// 获取用户 Feed
  Future<List<Post>> getUserFeed(String userId, {int page = 1}) async {
    final endpoint = '/users/$userId/feed';
    final response = await _apiService._dio.get(
      endpoint,
      queryParameters: {'page': page},
    );

    final data = response.data['data'] as List;
    return data.map((json) => Post.fromJson(json)).toList();
  }

  /// 关注用户
  Future<void> followUser(String userId) async {
    await _apiService._dio.post('/users/$userId/follow');
  }

  /// 取消关注
  Future<void> unfollowUser(String userId) async {
    await _apiService._dio.delete('/users/$userId/follow');
  }

  /// 获取关注列表
  Future<List<User>> getFollowers(String userId) async {
    final response = await _apiService._dio.get('/users/$userId/followers');
    final data = response.data['data'] as List;
    return data.map((json) => User.fromJson(json)).toList();
  }
}

/// 订单服务
class OrderService {
  final Dio _dio;

  OrderService(this._dio);

  /// 创建订单
  Future<Order> createOrder(CreateOrderRequest request) async {
    try {
      final response = await _dio.post(
        '/orders',
        data: request.toJson(),
        options: Options(
          headers: {
            'Authorization': 'Bearer token',
            'X-Request-ID': 'unique-id',
          },
        ),
      );

      if (response.statusCode == 201) {
        return Order.fromJson(response.data);
      } else if (response.statusCode == 400) {
        throw BadRequestException('Invalid order data');
      } else if (response.statusCode == 409) {
        throw ConflictException('Order conflict');
      } else {
        throw ApiException('Failed to create order');
      }
    } on DioException catch (e) {
      switch (e.type) {
        case DioExceptionType.connectionTimeout:
          throw TimeoutException('Connection timeout');
        case DioExceptionType.receiveTimeout:
          throw TimeoutException('Receive timeout');
        case DioExceptionType.badResponse:
          switch (e.response?.statusCode) {
            case 401:
              throw UnauthorizedException('Unauthorized');
            case 403:
              throw ForbiddenException('Forbidden');
            case 404:
              throw NotFoundException('Resource not found');
            case 500:
              throw ServerException('Server error');
            default:
              throw ApiException('API error: ${e.message}');
          }
        default:
          throw ApiException('Unexpected error: ${e.message}');
      }
    }
  }

  /// 获取订单详情
  Future<Order> getOrderDetail(String orderId) async {
    final response = await _dio.get('/orders/$orderId');
    return Order.fromJson(response.data['data']);
  }

  /// 取消订单
  Future<void> cancelOrder(String orderId) async {
    try {
      await _dio.post('/orders/$orderId/cancel');
    } catch (e) {
      throw Exception('Cancel order failed');
    }
  }

  /// 获取订单列表
  Future<List<Order>> getOrders(OrderFilter filter) async {
    final response = await _dio.get(
      '/orders',
      queryParameters: filter.toMap(),
    );

    final data = response.data['data'] as List;
    return data.map((json) => Order.fromJson(json)).toList();
  }
}

// ==================== 模型类 ====================

/// 用户模型
class User {
  final String id;
  final String name;
  final String email;

  User({required this.id, required this.name, required this.email});

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
    };
  }
}

/// 产品模型
class Product {
  final String id;
  final String name;
  final double price;

  Product({required this.id, required this.name, required this.price});

  factory Product.fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'price': price,
    };
  }
}

/// 订单模型
class Order {
  final String id;
  final String userId;
  final double total;
  final String status;

  Order({
    required this.id,
    required this.userId,
    required this.total,
    required this.status,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] as String,
      userId: json['user_id'] as String,
      total: (json['total'] as num).toDouble(),
      status: json['status'] as String,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'total': total,
      'status': status,
    };
  }
}

/// 帖子模型
class Post {
  final String id;
  final String content;
  final DateTime createdAt;

  Post({required this.id, required this.content, required this.createdAt});

  factory Post.fromJson(Map<String, dynamic> json) {
    return Post(
      id: json['id'] as String,
      content: json['content'] as String,
      createdAt: DateTime.parse(json['created_at'] as String),
    );
  }
}

// ==================== 请求 DTO ====================

class CreateUserRequest {
  final String name;
  final String email;
  final String password;

  CreateUserRequest({required this.name, required this.email, required this.password});

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'email': email,
      'password': password,
    };
  }
}

class UpdateUserRequest {
  final String? name;
  final String? email;

  UpdateUserRequest({this.name, this.email});

  Map<String, dynamic> toJson() {
    return {
      if (name != null) 'name': name,
      if (email != null) 'email': email,
    };
  }
}

class CreateProductRequest {
  final String name;
  final double price;
  final String description;

  CreateProductRequest({
    required this.name,
    required this.price,
    required this.description,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'price': price,
      'description': description,
    };
  }
}

class CreateOrderRequest {
  final List<OrderItem> items;
  final String? couponCode;

  CreateOrderRequest({required this.items, this.couponCode});

  Map<String, dynamic> toJson() {
    return {
      'items': items.map((i) => i.toJson()).toList(),
      if (couponCode != null) 'coupon_code': couponCode,
    };
  }
}

class OrderItem {
  final String productId;
  final int quantity;

  OrderItem({required this.productId, required this.quantity});

  Map<String, dynamic> toJson() {
    return {
      'product_id': productId,
      'quantity': quantity,
    };
  }
}

class OrderFilter {
  final String? status;
  final int? page;
  final int? limit;

  OrderFilter({this.status, this.page, this.limit});

  Map<String, dynamic> toMap() {
    return {
      if (status != null) 'status': status,
      if (page != null) 'page': page,
      if (limit != null) 'limit': limit,
    };
  }
}

// ==================== 响应 DTO ====================

class LoginResponse {
  final String accessToken;
  final String refreshToken;
  final User user;

  LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  factory LoginResponse.fromJson(Map<String, dynamic> json) {
    return LoginResponse(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      user: User.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

class TokenResponse {
  final String accessToken;
  final String refreshToken;

  TokenResponse({required this.accessToken, required this.refreshToken});

  factory TokenResponse.fromJson(Map<String, dynamic> json) {
    return TokenResponse(
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
    );
  }
}

// ==================== 自定义异常 ====================

class ApiException implements Exception {
  final String message;
  ApiException(this.message);

  @override
  String toString() => message;
}

class BadRequestException extends ApiException {
  BadRequestException(super.message);
}

class UnauthorizedException extends ApiException {
  UnauthorizedException(super.message);
}

class ForbiddenException extends ApiException {
  ForbiddenException(super.message);
}

class NotFoundException extends ApiException {
  NotFoundException(super.message);
}

class ConflictException extends ApiException {
  ConflictException(super.message);
}

class ServerException extends ApiException {
  ServerException(super.message);
}

class TimeoutException implements Exception {
  final String message;
  TimeoutException(this.message);

  @override
  String toString() => message;
}

// 忽略导入，仅用于示例
typedef SocketException = dynamic;
typedef HttpException = dynamic;
