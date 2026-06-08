import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:get/get.dart';

// ==================== Provider 示例 ====================

class UserProvider extends ChangeNotifier {
  User? _currentUser;
  bool _isLoading = false;

  User? get currentUser => _currentUser;
  bool get isLoading => _isLoading;

  Future<void> loadUser(String id) async {
    _isLoading = true;
    notifyListeners();

    try {
      // 模拟加载用户
      await Future.delayed(Duration(seconds: 1));
      _currentUser = User(id: id, name: 'John Doe');
      _isLoading = false;
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      notifyListeners();
    }
  }

  void updateUser(User user) {
    _currentUser = user;
    notifyListeners();
  }

  void clearUser() {
    _currentUser = null;
    notifyListeners();
  }
}

// ==================== Bloc/Cubit 示例 ====================

// 用户状态
abstract class UserState {}

class UserInitial extends UserState {}

class UserLoading extends UserState {}

class UserLoaded extends UserState {
  final User user;
  UserLoaded(this.user);
}

class UserError extends UserState {
  final String message;
  UserError(this.message);
}

// 用户事件
abstract class UserEvent {}

class LoadUserEvent extends UserEvent {
  final String id;
  LoadUserEvent(this.id);
}

class UpdateUserEvent extends UserEvent {
  final User user;
  UpdateUserEvent(this.user);
}

// 用户 Bloc
class UserBloc extends Bloc<UserEvent, UserState> {
  UserBloc() : super(UserInitial()) {
    on<LoadUserEvent>((event, emit) async {
      emit(UserLoading());
      try {
        await Future.delayed(Duration(seconds: 1));
        final user = User(id: event.id, name: 'John Doe');
        emit(UserLoaded(user));
      } catch (e) {
        emit(UserError('Failed to load user'));
      }
    });

    on<UpdateUserEvent>((event, emit) {
      emit(UserLoaded(event.user));
    });
  }
}

// 用户 Cubit
class AuthCubit extends Cubit<AuthState> {
  AuthCubit() : super(AuthInitial());

  Future<void> login(String username, String password) async {
    emit(AuthLoading());
    await Future.delayed(Duration(seconds: 1));
    emit(AuthAuthenticated('token_123'));
  }

  void logout() {
    emit(AuthUnauthenticated());
  }
}

abstract class AuthState {}

class AuthInitial extends AuthState {}
class AuthLoading extends AuthState {}
class AuthAuthenticated extends AuthState {
  final String token;
  AuthAuthenticated(this.token);
}
class AuthUnauthenticated extends AuthState {}

// ==================== GetX 示例 ====================

class HomeController extends GetxController {
  final count = 0.obs;
  final items = <String>[].obs;

  @override
  void onInit() {
    super.onInit();
    loadItems();
  }

  void increment() {
    count.value++;
    update();
  }

  void loadItems() {
    items.assignAll(['Item 1', 'Item 2', 'Item 3']);
  }

  @override
  void onClose() {
    count.close();
    items.close();
    super.onClose();
  }
}

class ProductController extends GetxController {
  final products = <Product>[].obs;
  final isLoading = false.obs;

  Future<void> fetchProducts() async {
    isLoading.value = true;
    update(['products']);

    await Future.delayed(Duration(seconds: 1));

    products.assignAll([
      Product(id: '1', name: 'Product 1', price: 10.0),
      Product(id: '2', name: 'Product 2', price: 20.0),
    ]);

    isLoading.value = false;
    update(['products']);
  }
}

class Product {
  final String id;
  final String name;
  final double price;

  Product({required this.id, required this.name, required this.price});
}

// ==================== ValueNotifier 示例 ====================

class CounterNotifier extends ValueNotifier<int> {
  CounterNotifier() : super(0);

  void increment() {
    value++;
  }

  void decrement() {
    if (value > 0) {
      value--;
    }
  }

  void reset() {
    value = 0;
  }
}

// ==================== 状态模型 ====================

class User {
  final String id;
  final String name;

  User({required this.id, required this.name});

  User copyWith({String? id, String? name}) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
    );
  }
}

class AppState {
  final bool isLoading;
  final String? error;

  AppState({
    this.isLoading = false,
    this.error,
  });

  AppState copyWith({bool? isLoading, String? error}) {
    return AppState(
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

// ==================== 使用示例的 Widget ====================

class UserPage extends StatefulWidget {
  @override
  _UserPageState createState() => _UserPageState();
}

class _UserPageState extends State<UserPage> {
  @override
  Widget build(BuildContext context) {
    return Container();
  }
}

class ProductListPage extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ProductController());

    return Container();
  }
}

// ==================== 简单的 setState 示例 ====================

class SimpleCounterWidget extends StatefulWidget {
  @override
  _SimpleCounterWidgetState createState() => _SimpleCounterWidgetState();
}

class _SimpleCounterWidgetState extends State<SimpleCounterWidget> {
  int _counter = 0;

  void _increment() {
    setState(() {
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container();
  }
}
