import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:get/get.dart';

/// 主应用入口
void main() {
  runApp(MyApp());
}

/// 使用 MaterialApp 的应用
class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Demo',
      // 初始路由
      initialRoute: '/',
      // 路由配置
      routes: {
        '/': (context) => const HomePage(),
        '/home': (context) => const HomePage(),
        '/detail': (context) => const DetailPage(),
        '/profile': (context) => const ProfilePage(),
        '/settings': (context) => const SettingsPage(),
      },
      // 动态路由生成器
      onGenerateRoute: (settings) {
        // 处理动态路由
        if (settings.name == '/user') {
          final userId = settings.arguments as String?;
          return MaterialPageRoute(
            builder: (context) => UserDetailPage(userId: userId),
          );
        }
        return null;
      },
      // 未知路由处理
      onUnknownRoute: (settings) {
        return MaterialPageRoute(
          builder: (context) => const NotFoundPage(),
        );
      },
    );
  }
}

/// 首页
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('首页'),
      ),
      body: ListView(
        children: [
          ListTile(
            title: const Text('用户详情'),
            onTap: () {
              // 命名路由导航
              Navigator.pushNamed(
                context,
                '/detail',
                arguments: {'id': '123'},
              );
            },
          ),
          ListTile(
            title: const Text('个人资料'),
            onTap: () {
              // 直接使用 Navigator.push
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => const ProfilePage(),
                ),
              );
            },
          ),
          ListTile(
            title: const Text('用户页面'),
            onTap: () {
              // 传递参数导航
              Navigator.pushNamed(
                context,
                '/user',
                arguments: 'user123',
              );
            },
          ),
          ListTile(
            title: const Text('设置'),
            onTap: () {
              // 替换当前路由
              Navigator.pushReplacementNamed(context, '/settings');
            },
          ),
          ListTile(
            title: const Text('对话框'),
            onTap: () {
              // 显示对话框
              showDialog(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('确认'),
                  content: const Text('确定要执行此操作吗？'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('取消'),
                    ),
                    TextButton(
                      onPressed: () {
                        Navigator.pop(context);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('操作已执行')),
                        );
                      },
                      child: const Text('确定'),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// 详情页
class DetailPage extends StatelessWidget {
  const DetailPage({super.key});

  @override
  Widget build(BuildContext context) {
    // 获取传递的参数
    final args = ModalRoute.of(context)?.settings.arguments as Map?;

    return Scaffold(
      appBar: AppBar(
        title: const Text('详情'),
        actions: [
          IconButton(
            icon: const Icon(Icons.edit),
            onPressed: () {
              // 导航到编辑页面
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => EditPage(id: args?['id'] ?? ''),
                ),
              );
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          children: [
            Text('详情页面'),
            if (args != null) Text('参数: ${args.toString()}'),
            ElevatedButton(
              onPressed: () {
                // 返回并传递结果
                Navigator.pop(context, {'result': 'success'});
              },
              child: const Text('返回'),
            ),
            ElevatedButton(
              onPressed: () {
                // 返回到首页
                Navigator.popUntil(context, ModalRoute.withName('/'));
              },
              child: const Text('返回首页'),
            ),
          ],
        ),
      ),
    );
  }
}

/// 编辑页
class EditPage extends StatelessWidget {
  final String id;

  const EditPage({super.key, required this.id});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('编辑 $id'),
      ),
      body: Center(
        child: ElevatedButton(
          onPressed: () {
            // 保存后返回
            Navigator.pop(context);
          },
          child: const Text('保存'),
        ),
      ),
    );
  }
}

/// 个人资料页
class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('个人资料'),
      ),
      body: ListView(
        children: [
          ListTile(
            title: const Text('设置'),
            onTap: () {
              Navigator.pushNamed(context, '/settings');
            },
          ),
          ListTile(
            title: const Text('返回'),
            onTap: () {
              Navigator.pop(context);
            },
          ),
          ListTile(
            title: const Text('返回首页'),
            onTap: () {
              Navigator.popUntil(context, ModalRoute.withName('/'));
            },
          ),
        ],
      ),
    );
  }
}

/// 设置页
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
      ),
      body: const Center(
        child: Text('设置页面'),
      ),
    );
  }
}

/// 用户详情页
class UserDetailPage extends StatelessWidget {
  final String? userId;

  const UserDetailPage({super.key, this.userId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('用户 $userId'),
      ),
      body: Center(
        child: Text('用户 ID: $userId'),
      ),
    );
  }
}

/// 404 页面
class NotFoundPage extends StatelessWidget {
  const NotFoundPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('页面未找到'),
      ),
      body: const Center(
        child: Text('404 - 页面未找到'),
      ),
    );
  }
}

// ==================== GoRouter 示例 ====================

/// 使用 GoRouter 的应用
class GoRouterApp extends StatelessWidget {
  GoRouterApp({super.key});

  final _router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const HomePage(),
      ),
      GoRoute(
        path: '/products',
        builder: (context, state) => const ProductsListPage(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (context, state) {
              final id = state.pathParameters['id'];
              return ProductDetailPage(productId: id);
            },
          ),
          GoRoute(
            path: 'new',
            builder: (context, state) => const ProductCreatePage(),
          ),
        ],
      ),
      GoRoute(
        path: '/orders',
        builder: (context, state) => const OrdersPage(),
      ),
      GoRoute(
        path: '/profile',
        builder: (context, state) => const ProfilePage(),
      ),
    ],
    errorBuilder: (context, state) => const NotFoundPage(),
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      routerConfig: _router,
    );
  }
}

/// 产品列表页
class ProductsListPage extends StatelessWidget {
  const ProductsListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('产品列表'),
      ),
      body: ListView.builder(
        itemCount: 10,
        itemBuilder: (context, index) {
          return ListTile(
            title: Text('产品 $index'),
            onTap: () {
              // 使用 GoRouter 导航
              context.go('/products/$index');
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          context.go('/products/new');
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}

/// 产品详情页
class ProductDetailPage extends StatelessWidget {
  final String? productId;

  const ProductDetailPage({super.key, this.productId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('产品 $productId'),
      ),
      body: Center(
        child: ElevatedButton(
          onPressed: () {
            context.go('/');
          },
          child: const Text('返回首页'),
        ),
      ),
    );
  }
}

/// 产品创建页
class ProductCreatePage extends StatelessWidget {
  const ProductCreatePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('创建产品'),
      ),
      body: const Center(
        child: Text('产品创建表单'),
      ),
    );
  }
}

/// 订单页
class OrdersPage extends StatelessWidget {
  const OrdersPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('订单'),
      ),
      body: const Center(
        child: Text('订单列表'),
      ),
    );
  }
}

// ==================== GetX 路由示例 ====================

/// GetX 路由配置
class AppPages {
  static final routes = [
    GetPage(
      name: '/',
      page: () => const HomePage(),
    ),
    GetPage(
      name: '/dashboard',
      page: () => const DashboardPage(),
    ),
    GetPage(
      name: '/users',
      page: () => const UsersListPage(),
    ),
    GetPage(
      name: '/users/:id',
      page: () => const UserDetailPage(),
    ),
  ];
}

/// 仪表板页
class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('仪表板'),
      ),
      body: Center(
        child: Column(
          children: [
            ElevatedButton(
              onPressed: () {
                // GetX 导航
                Get.toNamed('/users');
              },
              child: const Text('用户列表'),
            ),
            ElevatedButton(
              onPressed: () {
                Get.to(() => const SettingsPage());
              },
              child: const Text('设置页面'),
            ),
            ElevatedButton(
              onPressed: () {
                Get.back();
              },
              child: const Text('返回'),
            ),
            ElevatedButton(
              onPressed: () {
                Get.offAllNamed('/');
              },
              child: const Text('返回首页并清除所有'),
            ),
          ],
        ),
      ),
    );
  }
}

/// 用户列表页
class UsersListPage extends StatelessWidget {
  const UsersListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('用户列表'),
      ),
      body: ListView.builder(
        itemCount: 5,
        itemBuilder: (context, index) {
          return ListTile(
            title: Text('用户 $index'),
            onTap: () {
              // 动态路由导航
              Get.toNamed('/users/$index');
            },
          );
        },
      ),
    );
  }
}

// ==================== 自定义路由类 ====================

/// 自定义路由管理类
class AppRouter {
  static const String home = '/';
  static const String detail = '/detail';
  static const String profile = '/profile';
  static const String settings = '/settings';

  static Map<String, WidgetBuilder> getRoutes() {
    return {
      home: (context) => const HomePage(),
      detail: (context) => const DetailPage(),
      profile: (context) => const ProfilePage(),
      settings: (context) => const SettingsPage(),
    };
  }

  static void navigateToDetail(BuildContext context, {Object? arguments}) {
    Navigator.pushNamed(
      context,
      detail,
      arguments: arguments,
    );
  }

  static void navigateToProfile(BuildContext context) {
    Navigator.pushNamed(context, profile);
  }

  static void goBack(BuildContext context, {Object? result}) {
    Navigator.pop(context, result);
  }
}

// ==================== AutoRoute 示例 ====================

@AutoRoute(
  path: '/home',
  name: 'HomeRoute',
)
class HomePageAuto extends StatelessWidget {
  const HomePageAuto({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Text('AutoRoute Home Page'),
      ),
    );
  }
}

@AutoRoute(
  path: '/products/:id',
  name: 'ProductDetailRoute',
)
class ProductDetailPageAuto extends StatelessWidget {
  final String productId;

  const ProductDetailPageAuto({super.key, @PathParam('id') required this.productId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('产品 $productId'),
      ),
      body: Center(
        child: Text('AutoRoute 产品详情'),
      ),
    );
  }
}

@AutoRoute(
  path: '/cart',
  name: 'CartRoute',
)
class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('购物车'),
      ),
      body: const Center(
        child: Text('购物车页面'),
      ),
    );
  }
}

// 忽略未导入的类型
typedef GetPage = dynamic;
typedef Get = dynamic;
