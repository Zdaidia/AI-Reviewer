# 项目运行功能增强说明

## 更新日期
2026-03-17

## 问题修复

### ❌ 原来的问题
```
选择项目后显示：Type: unknown
无法运行项目
```

**原因：** `ProjectRunner` 只支持基于 `package.json` 的 Node.js 项目，不支持 Flutter 项目。

---

## ✅ 已修复

### 新增 Flutter 项目支持

现在 `ProjectRunner` 支持以下项目类型：

| 项目类型 | 配置文件 | 检测标识 | 默认端口 |
|---------|---------|---------|---------|
| **Flutter Web** | `pubspec.yaml` | 📱 Flutter | 3000 |
| **React** | `package.json` | ⚛️ React | 3000 |
| **Vue** | `package.json` | 💚 Vue | 8080 |
| **Next.js** | `package.json` | ▲ Next.js | 3000 |
| **Vite** | `package.json` | ⚡ Vite | 5173 |
| **Node.js** | `package.json` | 📦 Node.js | 3000 |

---

## 🚀 Flutter 项目支持

### 检测机制
```javascript
// 检测 pubspec.yaml 文件
if (fs.existsSync('pubspec.yaml')) {
  return {
    type: 'flutter',
    framework: 'flutter',
    name: 'project-name',
    description: 'Flutter project'
  };
}
```

### 可用命令

选择 Flutter 项目后，可以运行以下命令：

| 命令 | 说明 | 类型 | 端口 |
|------|------|------|------|
| **Run Web** | 在浏览器中运行（默认） | web | 3000 |
| Run (Debug) | Debug 模式运行 | debug | - |
| Run (Release) | Release 模式运行 | release | - |
| Run (Profile) | Profile 模式运行 | profile | - |
| Build Web | 构建 Web 版本 | build | - |
| Run Tests | 运行测试 | test | - |

---

## 📝 使用示例

### Flutter 项目

```
1. 点击"运行项目"按钮
2. 选择 Flutter 项目文件夹
3. 显示信息：
   Type: flutter 📱
   Framework: flutter

4. 可用命令：
   - Run Web (默认选中)
   - Run (Debug)
   - Run (Release)
   - Build Web
   - Run Tests

5. 点击"Run Project"
6. 自动打开浏览器访问 http://localhost:3000
```

### Node.js 项目

```
1. 点击"运行项目"按钮
2. 选择项目文件夹
3. 显示信息：
   Type: react ⚛️
   Framework: react

4. 可用命令：
   - dev (默认选中)
   - start
   - build
   - test

5. 点击"Run Project"
6. 自动打开浏览器
```

---

## 🔧 技术实现

### 1. 项目类型检测
```javascript
detectProjectType(projectPath) {
  // 优先检测 Flutter
  if (hasPubspecYaml(projectPath)) {
    return detectFlutterProject(projectPath);
  }

  // 检测 Node.js 项目
  if (hasPackageJson(projectPath)) {
    return detectNodeProject(projectPath);
  }

  // 未知项目
  return {
    type: 'unknown',
    message: '不支持的类型'
  };
}
```

### 2. Flutter 命令支持
```javascript
findFlutterCommand(projectPath) {
  const commands = [
    { command: 'run', args: ['--web'], name: 'Run Web', port: 3000 },
    { command: 'run', args: [], name: 'Run (Debug)' },
    { command: 'run', args: ['--release'], name: 'Run (Release)' },
    { command: 'test', args: [], name: 'Run Tests' },
  ];

  return commands[0]; // 默认返回 Run Web
}
```

### 3. 进程管理
```javascript
runFlutterProject(projectPath, options) {
  // 使用 flutter run --web
  const process = spawn('flutter', ['run', '--web'], {
    cwd: projectPath,
    env: process.env
  });

  // 监听输出
  process.stdout.on('data', (data) => {
    if (data.includes('http://')) {
      openBrowser(data.match(/https?:\/\/[^\s]+/)[0]);
    }
  });
}
```

---

## 🎯 支持的项目类型

### Flutter 项目 ✅
- ✓ 使用 `pubspec.yaml` 配置
- ✓ 支持 Flutter Web 运行
- ✓ 支持多种运行模式
- ✓ 自动打开浏览器

### React 项目 ✅
- ✓ Create React App
- ✓ Next.js
- ✓ Vite + React
- ✓ 自定义脚本

### Vue 项目 ✅
- ✓ Vue CLI
- ✓ Nuxt.js
- ✓ Vite + Vue
- ✓ 自定义脚本

### 其他 Node.js 项目 ✅
- ✓ Express
- ✓ Koa
- ✓ 自定义 npm 脚本

---

## ⚠️ 不支持的项目类型

目前不支持：

| 项目类型 | 原因 | 解决方案 |
|---------|------|---------|
| Python | 缺少配置文件检测 | 需要手动运行 |
| Java | 缺少 Maven/Gradle 检测 | 需要手动运行 |
| Go | 缺少 go.mod 检测 | 需要手动运行 |
| .NET | 缺少 .csproj 检测 | 需要手动运行 |

---

## 🐛 故障排除

### 问题 1: Type: unknown（已修复 ✅）
**原因：** 项目没有被正确识别

**解决：**
- 确保 Flutter 项目有 `pubspec.yaml` 文件
- 确保 Node.js 项目有 `package.json` 文件
- 项目文件夹必须包含配置文件

### 问题 2: Flutter 命令无法运行
**原因：** Flutter 没有安装或不在 PATH 中

**解决：**
```bash
# 检查 Flutter 是否安装
flutter --version

# 如果未安装，访问 https://flutter.dev/docs/get-started/install
```

### 问题 3: 端口被占用
**原因：** 默认端口已被其他应用使用

**解决：**
- Flutter Web: 修改端口或关闭占用端口的进程
- Node.js: 修改 package.json 中的端口配置

### 问题 4: 浏览器没有自动打开
**原因：** 输出中没有检测到 URL

**解决：**
- 手动打开显示的端口地址
- 检查防火墙设置

---

## 📋 测试步骤

1. **准备测试项目**
   - 创建或打开一个 Flutter 项目
   - 确保 `pubspec.yaml` 存在

2. **测试项目检测**
   ```
   点击"运行项目"
   → 选择项目文件夹
   → 应该显示：Type: flutter 📱
   ```

3. **测试命令列表**
   ```
   应该看到以下命令：
   - Run Web
   - Run (Debug)
   - Run (Release)
   - Build Web
   - Run Tests
   ```

4. **测试运行**
   ```
   选择 "Run Web"
   → 点击 "Run Project"
   → 应该自动打开浏览器
   → 看到 Flutter 应用运行
   ```

---

## 🎉 总结

现在项目运行功能已经增强：

✅ 支持 Flutter 项目
✅ 支持 Node.js 生态（React、Vue、Next.js 等）
✅ 自动检测项目类型
✅ 显示正确的项目信息
✅ 提供合适的运行命令
✅ 自动打开浏览器

**如果仍然看到 "Type: unknown"，请检查：**
1. 项目文件夹是否包含配置文件（pubspec.yaml 或 package.json）
2. 配置文件格式是否正确
3. 是否有读取权限

---

**版本：** 2.0.0
**更新日期：** 2026-03-17
