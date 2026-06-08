import 'package:json_annotation/json_annotation.dart';

part 'user.g.dart';

/// 用户模型
@JsonSerializable()
class User {
  final String id;
  final String name;
  final String email;
  final DateTime? createdAt;
  final int? age;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.createdAt,
    this.age,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
      age: json['age'] as int?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'created_at': createdAt?.toIso8601String(),
      'age': age,
    };
  }

  User copyWith({
    String? id,
    String? name,
    String? email,
    DateTime? createdAt,
    int? age,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      createdAt: createdAt ?? this.createdAt,
      age: age ?? this.age,
    );
  }
}

/// 产品实体
class ProductEntity {
  final String id;
  final String name;
  final double price;
  final String description;
  final String? imageUrl;
  final List<String> tags;

  ProductEntity({
    required this.id,
    required this.name,
    required this.price,
    required this.description,
    this.imageUrl,
    required this.tags,
  });

  factory ProductEntity.fromJson(Map<String, dynamic> json) {
    return ProductEntity(
      id: json['id'] as String,
      name: json['name'] as String,
      price: (json['price'] as num).toDouble(),
      description: json['description'] as String,
      imageUrl: json['image_url'] as String?,
      tags: (json['tags'] as List<dynamic>).map((e) => e as String).toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'description': description,
      'image_url': imageUrl,
      'tags': tags,
    };
  }
}

/// 订单请求 DTO
class CreateOrderRequestDto {
  final String userId;
  final List<OrderItemDto> items;
  final String? couponCode;

  CreateOrderRequestDto({
    required this.userId,
    required this.items,
    this.couponCode,
  });

  Map<String, dynamic> toJson() {
    return {
      'user_id': userId,
      'items': items.map((e) => e.toJson()).toList(),
      'coupon_code': couponCode,
    };
  }
}

/// 订单项 DTO
class OrderItemDto {
  final String productId;
  final int quantity;

  OrderItemDto({
    required this.productId,
    required this.quantity,
  });

  Map<String, dynamic> toJson() {
    return {
      'product_id': productId,
      'quantity': quantity,
    };
  }
}

/// API 响应
class ApiResponse<T> {
  final bool success;
  final String? message;
  final T? data;
  final String? error;

  ApiResponse({
    required this.success,
    this.message,
    this.data,
    this.error,
  });

  factory ApiResponse.fromJson(Map<String, dynamic> json, T Function(Object?) fromJsonT) {
    return ApiResponse<T>(
      success: json['success'] as bool,
      message: json['message'] as String?,
      data: json['data'] != null ? fromJsonT(json['data']) : null,
      error: json['error'] as String?,
    );
  }
}

/// 分页响应
class PagedResponse<T> {
  final List<T> items;
  final int currentPage;
  final int totalPages;
  final int totalItems;

  PagedResponse({
    required this.items,
    required this.currentPage,
    required this.totalPages,
    required this.totalItems,
  });

  factory PagedResponse.fromJson(Map<String, dynamic> json, T Function(Object?) fromJsonT) {
    return PagedResponse<T>(
      items: (json['items'] as List<dynamic>).map((e) => fromJsonT(e)).toList(),
      currentPage: json['current_page'] as int,
      totalPages: json['total_pages'] as int,
      totalItems: json['total_items'] as int,
    );
  }
}

/// 地址模型
class AddressModel {
  String? street;
  String? city;
  String? state;
  String? zipCode;
  String? country;

  AddressModel();

  AddressModel.fromJson(Map<String, dynamic> json) {
    street = json['street'] as String?;
    city = json['city'] as String?;
    state = json['state'] as String?;
    zipCode = json['zip_code'] as String?;
    country = json['country'] as String?;
  }

  Map<String, dynamic> toJson() {
    return {
      'street': street,
      'city': city,
      'state': state,
      'zip_code': zipCode,
      'country': country,
    };
  }
}

/// 用户配置实体（带关系）
class UserPreferencesEntity {
  final String id;
  final UserEntity user;
  final AddressModel address;
  final List<String> favoriteProducts;

  UserPreferencesEntity({
    required this.id,
    required this.user,
    required this.address,
    required this.favoriteProducts,
  });
}

/// 用户实体
class UserEntity {
  final String id;
  final String name;
}

// ==================== 带验证的模型 ====================

/// 注册请求
class RegisterRequest {
  final String email;
  final String password;
  final String confirmPassword;

  RegisterRequest({
    required this.email,
    required this.password,
    required this.confirmPassword,
  });

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'password': password,
      'confirm_password': confirmPassword,
    };
  }

  String? validateEmail() {
    if (email.isEmpty) {
      return 'Email is required';
    }
    final emailRegex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
    if (!emailRegex.hasMatch(email)) {
      return 'Invalid email format';
    }
    return null;
  }

  String? validatePassword() {
    if (password.isEmpty) {
      return 'Password is required';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  String? validate() {
    if (password != confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }
}
