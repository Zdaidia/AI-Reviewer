# Flutter 项目运行测试指南

## 快速测试

### 1. 测试 Flutter 项目检测

```
步骤：
1. 打开应用
2. 点击工具栏的"🚀 运行项目"按钮
3. 浏览并选择你的 Flutter 项目文件夹（包含 pubspec.yaml 的文件夹）
4. 查看项目信息显示

预期结果：
✓ Type: flutter 📱
✓ Framework: flutter
✓ 可以看到项目描述（如果有）
```

### 2. 测试可用命令

选择项目后，应该看到以下可用命令：

```
Flutter 项目命令：
├── Run Web (默认)        → 在浏览器中运行
├── Run (Debug)           → Debug 模式
├── Run (Release)         → Release 模式
├── Run (Profile)         → Profile 模式
├── Build Web             → 构建 Web 应用
└── Run Tests             → 运行测试
```

### 3. 测试运行 Flutter 项目

```
步骤：
1. 选择 "Run Web"
2. 点击 "Run Project" 按钮
3. 等待应用启动

预期结果：
✓ Flutter 开始运行
✓ 显示运行输出
✓ 自动打开浏览器到 http://localhost:3000（或其他端口）
✓ 看到 Flutter 应用运行在浏览器中
```

---

## Node.js 项目测试

### 1. React 项目

```
选择包含 package.json 的 React 项目

预期显示：
Type: react ⚛️
Framework: react

可用命令：
├── dev / start
├── build
├── test
└── 其他自定义脚本
```

### 2. Vue 项目

```
选择包含 package.json 的 Vue 项目

预期显示：
Type: vue 💚
Framework: vue

可用命令：
├── dev / serve
├── build
└── 其他自定义脚本
```

---

## 常见问题

### Q: 仍然显示 "Type: unknown"

**A:** 检查以下几点：

1. **Flutter 项目：**
   ```
   ✓ 项目文件夹中是否有 pubspec.yaml 文件？
   ✓ pubspec.yaml 是否在项目根目录？
   ✓ 文件格式是否正确？
   ```

2. **Node.js 项目：**
   ```
   ✓ 项目文件夹中是否有 package.json 文件？
   ✓ package.json 是否在项目根目录？
   ✓ JSON 格式是否正确（可以尝试在线 JSON 验证器）？
   ```

3. **文件路径：**
   ```
   ✓ 路径是否包含特殊字符？
   ✓ 是否有读取权限？
   ```

### Q: 运行失败，提示找不到 flutter 命令

**A:** Flutter 需要在系统 PATH 中

**Windows:**
```bash
# 检查 Flutter 是否安装
flutter --version

# 如果显示 "command not found"，需要：
# 1. 安装 Flutter SDK
# 2. 将 Flutter/bin 添加到系统 PATH
```

**安装 Flutter:**
- 访问：https://flutter.dev/docs/get-started/install/windows
- 下载并安装 Flutter SDK
- 重启终端/IDE
- 运行 `flutter doctor` 检查环境

### Q: 浏览器没有自动打开

**A:** 可能的原因：

1. **输出中没有检测到 URL**
   - 查看运行输出面板
   - 手动复制 URL 到浏览器

2. **端口被占用**
   - 关闭占用端口的进程
   - 或使用不同的端口

3. **浏览器被阻止**
   - 检查浏览器设置
   - 尝试手动打开显示的 URL

### Q: Flutter Web 运行很慢

**A:** 首次运行需要：

```
1. 编译 Web 应用（可能需要几分钟）
2. 下载必要的依赖
3. 首次启动会比较慢，后续会快很多
```

**建议：**
- 耐心等待，第一次运行确实需要时间
- 查看输出面板了解进度
- 等待编译完成后会自动打开浏览器

---

## 调试技巧

### 查看运行输出

```
点击工具栏的"🖥 运行"面板"
→ 可以看到项目的运行日志
→ 检查是否有错误信息
```

### 检查进程状态

```
应用会显示所有正在运行的项目
包括：
- 项目 ID
- 运行的命令
- 启动时间
- 端口号
```

### 停止运行

```
方法 1: 点击运行面板的"停止"按钮
方法 2: 关闭运行输出面板
方法 3: 在终端中按 Ctrl+C
```

---

## 支持的配置文件

| 项目类型 | 配置文件 | 检测内容 |
|---------|---------|---------|
| Flutter | `pubspec.yaml` | Flutter SDK, 插件 |
| React | `package.json` | react, react-scripts |
| Vue | `package.json` | vue, @vue/cli-service |
| Next.js | `package.json` | next |
| Vite | `package.json` | vite |
| Angular | `package.json` | @angular/cli |
| Svelte | `package.json` | svelte |

---

## 高级用法

### 自定义运行命令

对于特殊项目，可以手动输入命令：

```
Node.js: npm run custom-script
Flutter: flutter run --custom-args
```

### 多个项目同时运行

应用支持同时运行多个项目：
- 每个项目有独立的项目 ID
- 可以在运行面板中查看所有项目
- 每个项目可以单独停止

---

## 成功示例

### Flutter Web 运行成功

```
输出面板显示：
✓ Flutter run --web
✓ Building Flutter application...
✓ Launching on http://localhost:3000
✓ 自动打开浏览器

浏览器显示：
[Flutter 应用界面]
```

### React 运行成功

```
输出面板显示：
✓ npm run dev
✓ Starting development server...
✓ Compiled successfully!
✓ Local: http://localhost:3000
✓ 自动打开浏览器

浏览器显示：
[React 应用界面]
```

---

## 总结

现在项目运行功能已经完全支持 Flutter 项目！

✅ 自动检测 Flutter 项目
✅ 显示正确的项目类型
✅ 提供多个运行选项
✅ 自动打开浏览器
✅ 支持多种运行模式

**如果遇到问题，请检查：**
1. Flutter SDK 是否已安装
2. Flutter 是否在系统 PATH 中
3. pubspec.yaml 是否存在且格式正确
4. 是否有必要的权限

---

**祝测试愉快！** 🎉

生成时间：2026-03-17
版本：2.0.0
