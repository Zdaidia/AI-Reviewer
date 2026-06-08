/**
 * 文件类型推断工具（统一版本）
 * 从 main.js 第6726-6846行提取，支持 Flutter/Vue/React/Angular 三层判断
 */

const path = require('path');

/**
 * 推断文件类型（跨框架通用）
 * @param {string} filePath - 文件路径
 * @param {string} projectType - 项目类型 (flutter/vue/react/angular/universal)
 * @returns {string} 文件类型: view/controller/model/service/component/binding/api/route/config/i18n/test/generated/hook/state/util/other
 */
function inferFileType(filePath, projectType) {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // === 第一层：跨框架通用规则 ===

  // 测试文件
  if (fileName.includes('.test.') || fileName.includes('.spec.') ||
      fileName.includes('_test.') || fileName.endsWith('_test.dart') ||
      normalizedPath.includes('/test/') || normalizedPath.includes('/tests/') ||
      normalizedPath.includes('__tests__')) {
    return 'test';
  }

  // 生成的文件
  if (fileName.includes('.generated.') || fileName.includes('.g.') ||
      fileName.includes('.freezed.') || fileName.includes('.mock.')) {
    return 'generated';
  }

  // 路由文件
  if (fileName.includes('route') || fileName.includes('router') ||
      normalizedPath.includes('/route/') || normalizedPath.includes('/router/')) {
    return 'route';
  }

  // 配置文件
  if (fileName.includes('config') || fileName.includes('setting') ||
      ext === '.json' || ext === '.yaml' || ext === '.yml' ||
      ext === '.env' || fileName.startsWith('.')) {
    return 'config';
  }

  // 多语言文件
  if (fileName.includes('i18n') || fileName.includes('locale') ||
      fileName.includes('lang') || fileName.includes('translation') ||
      normalizedPath.includes('/locale/') || normalizedPath.includes('/i18n/')) {
    return 'i18n';
  }

  // === 第二层：按项目类型区分 ===

  if (projectType === 'flutter') {
    if (normalizedPath.includes('/pages/') || normalizedPath.includes('/views/') ||
        normalizedPath.includes('/screens/')) return 'view';
    if (normalizedPath.includes('/controllers/') || normalizedPath.includes('/viewmodels/')) return 'controller';
    if (normalizedPath.includes('/models/') || normalizedPath.includes('/entities/')) return 'model';
    if (normalizedPath.includes('/services/') || normalizedPath.includes('/providers/') ||
        normalizedPath.includes('/repositories/')) return 'service';
    if (normalizedPath.includes('/widgets/') || normalizedPath.includes('/components/')) return 'component';
    if (normalizedPath.includes('/bindings/') || normalizedPath.includes('/di/')) return 'binding';
    if (normalizedPath.includes('/api/') || normalizedPath.includes('/datasources/')) return 'api';
  } else if (projectType === 'react' || projectType === 'vue' || projectType === 'angular') {
    if (normalizedPath.includes('/pages/') || normalizedPath.includes('/views/') ||
        ext === '.vue' || normalizedPath.includes('/screens/')) return 'view';
    if (normalizedPath.includes('/hooks/') || normalizedPath.includes('/composables/')) return 'hook';
    if (normalizedPath.includes('/stores/') || normalizedPath.includes('/state/') ||
        normalizedPath.includes('/redux/') || normalizedPath.includes('/context/')) return 'state';
    if (normalizedPath.includes('/services/') || normalizedPath.includes('/api/')) return 'service';
    if (normalizedPath.includes('/components/') || normalizedPath.includes('/ui/')) return 'component';
    if (normalizedPath.includes('/models/') || normalizedPath.includes('/types/') ||
        normalizedPath.includes('/interfaces/')) return 'model';
    if (normalizedPath.includes('/utils/') || normalizedPath.includes('/helpers/')) return 'util';
  }

  // === 第三层：通用文件名模式推断（兜底） ===
  const viewPatterns = [/page/, /view/, /screen/, /form/];
  const controllerPatterns = [/controller/, /controller$/, /handler/, /presenter/];
  const modelPatterns = [/model$/, /entity/, /dto$/, /vo$/, /type/, /interface/];
  const servicePatterns = [/service$/, /api$/, /client$/, /provider$/, /repository$/];
  const componentPatterns = [/component/, /widget/, /control/, /element/];

  const baseName = path.basename(filePath, ext);

  for (const pattern of viewPatterns) {
    if (pattern.test(baseName)) return 'view';
  }
  for (const pattern of controllerPatterns) {
    if (pattern.test(baseName)) return 'controller';
  }
  for (const pattern of modelPatterns) {
    if (pattern.test(baseName)) return 'model';
  }
  for (const pattern of servicePatterns) {
    if (pattern.test(baseName)) return 'service';
  }
  for (const pattern of componentPatterns) {
    if (pattern.test(baseName)) return 'component';
  }

  return 'other';
}

module.exports = { inferFileType };