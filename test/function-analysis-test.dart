/// Dart 函数分析测试文件
///
/// 这个文件包含各种类型的函数，用于测试 Dart 函数分析器

library test_function_analysis;

// 简单函数
int add(int a, int b) {
  return a + b;
}

// 异步函数
Future<UserData> fetchUserData(String url) async {
  final response = await http.get(Uri.parse(url));
  final json = jsonDecode(response.body);
  return UserData.fromJson(json);
}

// 箭头函数
String greet(String name) => 'Hello, $name';

// 高复杂度函数
List<User> processUsers(List<User> users, Map<String, dynamic> options,
    Map<String, dynamic> config, Settings settings, Params params) {
  final result = <User>[];

  for (final user in users) {
    if (user.isActive) {
      if (options.validate) {
        for (final key in user.data.keys) {
          final value = user.data[key];
          if (value != null) {
            if (config.strict) {
              if (value is String) {
                if (settings.trim) {
                  user.data[key] = value.trim();
                }
              } else if (value is num) {
                if (settings.format) {
                  user.data[key] = value.toDouble();
                }
              }
            }
          }
        }
      }
      result.add(user);
    }
  }

  return result;
}

// 事件处理函数
void handleClick(Event event) {
  event.preventDefault();
  print('Clicked');
}

// CRUD 操作
Future<User> createUser(UserData userData) async {
  final response = await http.post(
    Uri.parse('/api/users'),
    body: jsonEncode(userData),
  );
  return User.fromJson(jsonDecode(response.body));
}

Future<User> getUserById(String id) async {
  final response = await http.get(Uri.parse('/api/users/$id'));
  return User.fromJson(jsonDecode(response.body));
}

Future<User> updateUser(String id, UserUpdates updates) async {
  final response = await http.put(
    Uri.parse('/api/users/$id'),
    body: jsonEncode(updates),
  );
  return User.fromJson(jsonDecode(response.body));
}

Future<void> deleteUser(String id) async {
  await http.delete(Uri.parse('/api/users/$id'));
}

// 验证函数
bool isValidEmail(String email) {
  final regex = RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$');
  return regex.hasMatch(email);
}

bool isValidPassword(String password) {
  return password != null && password.length >= 8;
}

// 工具函数
String formatDate(DateTime date) {
  return date.toIso8601String();
}

Map<String, dynamic> parseJson(String jsonString) {
  return jsonDecode(jsonString);
}

// 递归函数
int factorial(int n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

// 间接递归
int functionA(int n) {
  if (n <= 0) return n;
  return functionB(n - 1);
}

int functionB(int n) {
  if (n <= 0) return n;
  return functionA(n - 2);
}

// 私有函数（Dart 约定）
void _privateHelper(int value) {
  print('Private: $value');
}

// 初始化函数
void initState() {
  _loadData();
}

// 构建函数（Flutter）
Widget build(BuildContext context) {
  return Container(
    child: Text('Hello'),
  );
}

// Widget 构建器
Widget userCard(User user) {
  return Card(
    child: ListTile(
      title: Text(user.name),
      subtitle: Text(user.email),
    ),
  );
}

// 类定义
class UserService {
  final HttpClient _apiClient;

  UserService(this._apiClient);

  Future<List<User>> getAllUsers() async {
    final response = await _apiClient.get('/users');
    return (response.data as List)
        .map((json) => User.fromJson(json))
        .toList();
  }

  Future<User> getUserById(String id) async {
    final response = await _apiClient.get('/users/$id');
    return User.fromJson(response.data);
  }

  Future<User> createUser(UserData userData) async {
    final response = await _apiClient.post('/users', data: userData);
    return User.fromJson(response.data);
  }

  // 私有方法
  void _logRequest(String method, String path) {
    print('$method $path');
  }
}

// 状态类
class UserState {
  List<User> users = [];
  bool isLoading = false;
  String? error;

  void setLoading(bool value) {
    isLoading = value;
  }

  void setError(String? message) {
    error = message;
  }

  void setUsers(List<User> newUsers) {
    users = newUsers;
  }
}

// 模型类
class User {
  final String id;
  final String name;
  final String email;
  final bool isActive;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.isActive = true,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      name: json['name'],
      email: json['email'],
      isActive: json['isActive'] ?? true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'isActive': isActive,
    };
  }

  // Getter
  String get displayName => '$name ($email)';

  // 方法
  void deactivate() {
    // User should be deactivated
  }
}

// 枚举
enum UserType {
  admin,
  user,
  guest,
}

// Extension
extension StringExtension on String {
  String get capitalized {
    if (isEmpty) return this;
    return this[0].toUpperCase() + substring(1);
  }
}

// Mixin
mixin ValidationMixin {
  bool isValidEmail(String email) {
    return RegExp(r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$').hasMatch(email);
  }
}

// 带注解的类
@immutable
class ImmutableConfig {
  final String apiKey;
  final String endpoint;

  const ImmutableConfig({
    required this.apiKey,
    required this.endpoint,
  });
}
