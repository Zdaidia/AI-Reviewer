import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Flutter Test Demo',
      home: const HomePage(),
      routes: {
        '/detail': (context) => const DetailPage(),
        '/profile': (context) => const ProfilePage(),
        '/settings': (context) => const SettingsPage(),
      },
    );
  }
}

/// 首页
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('首页'),
        actions: [
          // 搜索按钮
          IconButton(
            key: const Key('home_search_button'),
            icon: const Icon(Icons.search),
            onPressed: () {
              // 显示搜索对话框
              showSearchDialog(context);
            },
          ),
          // 通知按钮
          IconButton(
            key: const Key('home_notification_button'),
            icon: const Icon(Icons.notifications),
            onPressed: () {
              Navigator.pushNamed(context, '/notifications');
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // 搜索框
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              key: const Key('home_search_field'),
              controller: _searchController,
              decoration: const InputDecoration(
                labelText: '搜索',
                hintText: '请输入搜索关键词',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) {
                setState(() {
                  _searchQuery = value;
                });
              },
              onSubmitted: (value) {
                _performSearch(value);
              },
            ),
          ),
          // 快速操作按钮
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Wrap(
              spacing: 8,
              children: [
                ElevatedButton(
                  key: const Key('home_create_button'),
                  onPressed: () {
                    Navigator.pushNamed(context, '/create');
                  },
                  child: const Text('创建'),
                ),
                OutlinedButton(
                  key: const Key('home_refresh_button'),
                  onPressed: () {
                    _refreshData();
                  },
                  child: const Text('刷新'),
                ),
                TextButton(
                  key: const Key('home_filter_button'),
                  onPressed: () {
                    _showFilterDialog();
                  },
                  child: const Text('筛选'),
                ),
              ],
            ),
          ),
          // 列表
          Expanded(
            child: ListView.builder(
              itemCount: 10,
              itemBuilder: (context, index) {
                return ListTile(
                  key: Key('home_item_$index'),
                  leading: const Icon(Icons.article),
                  title: Text('项目 $index'),
                  subtitle: Text('描述 $index'),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    // 跳转到详情页
                    Navigator.pushNamed(
                      context,
                      '/detail',
                      arguments: {'id': index},
                    );
                  },
                  onLongPress: () {
                    // 显示操作菜单
                    _showItemMenu(context, index);
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        key: const Key('home_fab'),
        onPressed: () {
          Navigator.pushNamed(context, '/create');
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  void _performSearch(String query) {
    // 执行搜索
  }

  void _refreshData() {
    // 刷新数据
  }

  void _showFilterDialog() {
    // 显示筛选对话框
  }

  void _showItemMenu(BuildContext context, int index) {
    // 显示项目菜单
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
              Navigator.pushNamed(context, '/edit');
            },
          ),
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: () {
              _showDeleteDialog(context);
            },
          ),
        ],
      ),
      body: Center(
        child: Column(
          children: [
            if (args != null)
              Text('项目 ID: ${args['id']}')
            else
              const Text('详情页面'),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context);
              },
              child: const Text('返回'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pushNamed(context, '/profile');
              },
              child: const Text('查看资料'),
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('确认删除'),
        content: const Text('确定要删除此项目吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('已删除')),
              );
            },
            child: const Text('删除'),
          ),
        ],
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
            leading: const Icon(Icons.person),
            title: const Text('个人信息'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.pushNamed(context, '/profile/info');
            },
          ),
          ListTile(
            leading: const Icon(Icons.settings),
            title: const Text('设置'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.pushNamed(context, '/settings');
            },
          ),
          ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('退出登录'),
            onTap: () {
              _showLogoutDialog(context);
            },
          ),
        ],
      ),
    );
  }

  void _showLogoutDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('退出登录'),
        content: const Text('确定要退出登录吗？'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('确定'),
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
      body: ListView(
        children: [
          SwitchListTile(
            title: const Text('深色模式'),
            subtitle: const Text('启用深色主题'),
            value: false,
            onChanged: (value) {
              // 切换主题
            },
          ),
          SwitchListTile(
            title: const Text('通知'),
            subtitle: const Text('接收推送通知'),
            value: true,
            onChanged: (value) {
              // 切换通知
            },
          ),
          ListTile(
            title: const Text('语言'),
            subtitle: const Text('中文'),
            onTap: () {
              _showLanguageDialog(context);
            },
          ),
          ListTile(
            title: const Text('清除缓存'),
            onTap: () {
              _clearCache();
            },
          ),
        ],
      ),
    );
  }

  void _showLanguageDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('选择语言'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('中文'),
              onTap: () => Navigator.pop(context),
            ),
            ListTile(
              title: const Text('English'),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }

  void _clearCache() {
    // 清除缓存
  }
}

void showSearchDialog(BuildContext context) {
  showDialog(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('搜索'),
      content: const TextField(
        decoration: InputDecoration(
          hintText: '请输入搜索内容',
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('取消'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('搜索'),
        ),
      ],
    ),
  );
}
