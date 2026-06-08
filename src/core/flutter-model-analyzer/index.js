/**
 * Flutter Model/Entity Layer Analyzer
 *
 * 职责:
 * - 识别 Model/Entity 类
 * - 分析字段定义和类型
 * - 识别序列化方法
 * - 分析数据关系
 * - 检测数据验证逻辑
 * - 分析 JSON 转换
 * - 识别注解和元数据
 *
 * 支持的 Model 类型:
 * - Model (数据模型)
 * - Entity (实体)
 * - DTO (数据传输对象)
 * - Response (API 响应)
 * - Request (API 请求)
 */

const path = require('path');

class FlutterModelAnalyzer {
  constructor() {
    this.models = new Map(); // 模型注册表
    this.modelFields = new Map(); // 模型字段
    this.serializations = new Map(); // 序列化方法
    this.modelRelations = new Map(); // 模型关系
    this.modelValidations = new Map(); // 数据验证
    this.modelAnnotations = new Map(); // 注解元数据
  }

  /**
   * 初始化模型模式注册表
   */
  initModelRegistry() {
    // Model 命名模式
    this.modelPatterns = {
      model: {
        patterns: ['Model', 'DataModel', 'ViewModel'],
        description: '数据模型',
      },
      entity: {
        patterns: ['Entity', 'UserEntity', 'ProductEntity'],
        description: '实体',
      },
      dto: {
        patterns: ['Dto', 'RequestDto', 'ResponseDto', 'UserDto'],
        description: '数据传输对象',
      },
      response: {
        patterns: ['Response', 'ApiResponse', 'BaseResponse'],
        description: 'API 响应',
      },
      request: {
        patterns: ['Request', 'CreateRequest', 'UpdateRequest'],
        description: 'API 请求',
      },
    };

    // 字段类型映射
    this.fieldTypeMapping = {
      string: 'String',
      int: 'int',
      double: 'double',
      bool: 'bool',
      datetime: 'DateTime',
      list: 'List',
      map: 'Map',
      dynamic: 'dynamic',
    };

    // 序列化方法模式
    this.serializationPatterns = {
      fromJson: ['fromJson', 'fromMap', 'deserialize'],
      toJson: ['toJson', 'toMap', 'serialize'],
    };

    // 常见注解
    this.annotationPatterns = {
      json_serializable: ['JsonSerializable', 'JsonValue'],
      freezed: ['freezed', 'immutable'],
      built_value: ['Built', 'BuiltValue'],
      hive: ['HiveField', 'HiveType'],
      sqflite: ['toJson', 'fromJson'],
    };

    // 关系模式
    this.relationPatterns = {
      oneToOne: ['hasOne', 'belongsTo', 'reference', 'ref'],
      oneToMany: ['hasMany', 'list', 'collection'],
      manyToMany: ['manyToMany', 'belongsToMany'],
    };
  }

  /**
   * 分析项目中的 Model 层
   * @param {Array} files - Dart 文件列表
   * @returns {Object} Model 层分析结果
   */
  analyzeModelLayer(files) {
    this.clearCache();
    this.initModelRegistry();

    // 1. 识别所有 Model 类
    this.identifyModels(files);

    // 2. 分析模型字段
    this.analyzeModelFields(files);

    // 3. 分析序列化方法
    this.analyzeSerializations(files);

    // 4. 分析模型关系
    this.analyzeModelRelations(files);

    // 5. 分析数据验证
    this.analyzeModelValidations(files);

    // 6. 分析注解元数据
    this.analyzeModelAnnotations(files);

    // 7. 生成统计信息
    const statistics = this.generateStatistics();

    return {
      models: Array.from(this.models.values()),
      fields: this.getFieldsList(),
      serializations: this.getSerializationsList(),
      relations: this.getRelationsList(),
      validations: this.getValidationsList(),
      annotations: this.getAnnotationsList(),
      statistics,
    };
  }

  /**
   * 识别所有 Model 类
   */
  identifyModels(files) {
    let modelId = 0;

    for (const file of files) {
      const content = file.content;
      const filePath = file.path;

      // 匹配类定义
      const classPattern = /class\s+(\w+)\s*(?:extends\s+(\w+)(?:<[^>]+>)?)?(?:\s+with\s+([\w\s<>,]+))?\s*\{/g;
      let match;

      while ((match = classPattern.exec(content)) !== null) {
        const className = match[1];
        const superClass = match[2] || null;
        const mixins = match[3] || null;

        const modelType = this.classifyModel(className, superClass, mixins, content);

        if (modelType || this.isModelClass(className, content)) {
          const line = this.getLineNumber(content, match.index);
          const classBody = this.extractClassBody(content, match.index);

          const model = {
            id: `mdl_${modelId++}`,
            name: className,
            superClass,
            mixins,
            modelType: modelType || 'model',
            filePath,
            fileName: path.basename(filePath),
            line,
            body: classBody,
            isAbstract: superClass?.toLowerCase().includes('abstract'),
            isImmutable: this.checkImmutable(classBody),
            hasConstructor: this.hasConstructor(classBody),
            fields: [],
          };

          this.models.set(className, model);
        }
      }
    }
  }

  /**
   * 分类模型类型
   */
  classifyModel(className, superClass, mixins, content) {
    const name = className.toLowerCase();
    const parent = superClass ? superClass.toLowerCase() : '';
    const contentLower = content.toLowerCase();

    for (const [type, config] of Object.entries(this.modelPatterns)) {
      for (const pattern of config.patterns) {
        if (name.endsWith(pattern.toLowerCase()) || name.includes(pattern.toLowerCase())) {
          return type;
        }
      }
    }

    // 检查是否有序列化方法
    if (contentLower.includes('fromjson') || contentLower.includes('tojson')) {
      return 'model';
    }

    return null;
  }

  /**
   * 判断是否是模型类
   */
  isModelClass(className, content) {
    const name = className.toLowerCase();
    const contentLower = content.toLowerCase();

    // 排除 Widget 类
    if (name.endsWith('widget') || name.endsWith('page') || name.endsWith('screen')) {
      return false;
    }

    // 检查是否有字段定义
    const fieldPattern = /\w+\s+\w+\s*;/g;
    const fields = content.match(fieldPattern);
    if (!fields || fields.length < 2) {
      return false;
    }

    // 检查是否有构造函数
    const hasConstructor = /constructor\s*\(/.test(content);

    // 检查是否有序列化方法
    const hasSerialization = contentLower.includes('fromjson') || contentLower.includes('tojson');

    return hasConstructor || hasSerialization;
  }

  /**
   * 检查是否是不可变类
   */
  checkImmutable(classBody) {
    // 检查所有字段是否都是 final
    const lines = classBody.split('\n');
    let hasNonFinalField = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^\w+\s+\w+\s+/) && !trimmed.startsWith('final')) {
        hasNonFinalField = true;
        break;
      }
    }

    return !hasNonFinalField;
  }

  /**
   * 检查是否有构造函数
   */
  hasConstructor(classBody) {
    return /constructor\s*\(/.test(classBody);
  }

  /**
   * 分析模型字段
   */
  analyzeModelFields(files) {
    for (const [modelName, model] of this.models) {
      const fields = this.extractFields(model);
      this.modelFields.set(modelName, fields);
      model.fields = fields;
    }
  }

  /**
   * 提取字段
   */
  extractFields(model) {
    const fields = [];
    const body = model.body;

    // 匹配字段定义
    const patterns = [
      // final String name;
      /(?:final|const)\s+(\w+(?:<[^>]+>)?)\s+(?!this\.)(\w+)\s*(?:=\s*([^;]+))?;?/g,
      // late String name;
      /late\s+(?:final\s+)?(\w+(?:<[^>]+>)?)\s+(?!this\.)(\w+)\s*(?:=\s*([^;]+))?;?/g,
      // String name; (非 final)
      /(\w+(?:<[^>]+>)?)\s+(?!this\.|_)(\w+)\s*(?:=\s*([^;]+))?;?/g,
    ];

    for (const pattern of patterns) {
      let match;
      // 重置 regex 的 lastIndex
      pattern.lastIndex = 0;

      while ((match = pattern.exec(body)) !== null) {
        let fieldType, fieldName, defaultValue;

        if (match[0].includes('final') || match[0].includes('late') || match[0].includes('const')) {
          fieldType = match[1];
          fieldName = match[2];
          defaultValue = match[3];
        } else {
          // 对于非 final 字段，需要更仔细的匹配
          if (match[1] && match[2] && this.isValidDartType(match[1])) {
            fieldType = match[1];
            fieldName = match[2];
            defaultValue = match[3];
          }
        }

        // 跳过私有字段和特殊字段
        if (!fieldName || fieldName.startsWith('_')) continue;
        if (fieldName === 'hashCode' || fieldName === 'runtimeType') continue;

        // 避免重复添加
        if (fields.some(f => f.name === fieldName)) continue;

        fields.push({
          name: fieldName,
          type: fieldType || 'dynamic',
          defaultValue: defaultValue?.trim(),
          isFinal: match[0].includes('final') || match[0].includes('const'),
          isLate: match[0].includes('late'),
          hasDefault: defaultValue !== undefined,
        });
      }
    }

    return fields;
  }

  /**
   * 验证是否是有效的 Dart 类型
   */
  isValidDartType(type) {
    const validTypes = [
      'String', 'int', 'double', 'bool', 'DateTime', 'Duration',
      'List', 'Map', 'Set', 'dynamic', 'void', 'Null',
      'BigInt', 'Uri', 'ObjectId'
    ];
    const typeLower = type.toLowerCase();

    // 检查基本类型
    if (validTypes.includes(type) || validTypes.some(t => typeLower.includes(t.toLowerCase()))) {
      return true;
    }

    // 检查泛型类型 List<T>
    if (type.includes('<') && type.includes('>')) {
      return true;
    }

    return false;
  }

  /**
   * 分析序列化方法
   */
  analyzeSerializations(files) {
    for (const [modelName, model] of this.models) {
      const serializations = this.extractSerializations(model);
      this.serializations.set(modelName, serializations);
    }
  }

  /**
   * 提取序列化方法
   */
  extractSerializations(model) {
    const serializations = {
      hasFromJson: false,
      hasToJson: false,
      fromJsonMethod: null,
      toJsonMethod: null,
      fields: [],
    };

    const body = model.body;

    // 检查 fromJson 方法
    const fromJsonPattern = /(?:factory\s+)?(\w+)\s+fromJson\s*\(\s*(?:Map<String,\s*dynamic>|dynamic)\s+(\w+)\s*\)/;
    const fromJsonMatch = body.match(fromJsonPattern);
    if (fromJsonMatch) {
      serializations.hasFromJson = true;
      serializations.fromJsonMethod = fromJsonMatch[0];
    }

    // 检查 toJson 方法
    const toJsonPattern = /(?:Map<String,\s*dynamic>\s*)?toJson\s*\(\s*\)/;
    const toJsonMatch = body.match(toJsonPattern);
    if (toJsonMatch) {
      serializations.hasToJson = true;
      serializations.toJsonMethod = 'toJson';
    }

    // 分析哪些字段参与序列化
    if (serializations.hasFromJson || serializations.hasToJson) {
      for (const field of model.fields) {
        const isInJson = body.includes(`"${field.name}"`) ||
                         body.includes(`'${field.name}'`) ||
                         body.includes(`${field.name}:`);
        if (isInJson) {
          serializations.fields.push(field.name);
        }
      }
    }

    return serializations;
  }

  /**
   * 分析模型关系
   */
  analyzeModelRelations(files) {
    for (const [modelName, model] of this.models) {
      const relations = this.extractRelations(model);
      if (relations.length > 0) {
        this.modelRelations.set(modelName, relations);
      }
    }
  }

  /**
   * 提取关系
   */
  extractRelations(model) {
    const relations = [];

    for (const field of model.fields) {
      // 检查字段类型是否是其他模型
      for (const [otherModelName, otherModel] of this.models) {
        if (otherModelName === model.name) continue;

        const fieldType = field.type.toLowerCase();
        const modelNameLower = otherModelName.toLowerCase();

        // 一对一关系：直接引用
        if (fieldType === modelNameLower ||
            fieldType.includes(`<${modelNameLower}>`) ||
            fieldType.includes(`<${otherModelName}>`)) {
          relations.push({
            type: 'oneToOne',
            field: field.name,
            relatedModel: otherModelName,
            isRequired: !field.type.includes('?'),
          });
        }

        // 一对多关系：List
        if (fieldType.includes('list<') || fieldType.includes('List<')) {
          if (fieldType.includes(modelNameLower) ||
              fieldType.includes(otherModelName)) {
            relations.push({
              type: 'oneToMany',
              field: field.name,
              relatedModel: otherModelName,
              isRequired: !field.type.includes('?'),
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * 分析数据验证
   */
  analyzeModelValidations(files) {
    for (const [modelName, model] of this.models) {
      const validations = this.extractValidations(model);
      if (validations.length > 0) {
        this.modelValidations.set(modelName, validations);
      }
    }
  }

  /**
   * 提取验证逻辑
   */
  extractValidations(model) {
    const validations = [];
    const body = model.body;

    // 检查验证方法
    const validationMethods = body.match(/\w+\s+validate\s*\([^)]*\)\s*:/g);
    if (validationMethods) {
      for (const method of validationMethods) {
        validations.push({
          type: 'method',
          name: method.trim().replace(':', ''),
        });
      }
    }

    // 检查构造函数中的验证参数
    const requiredPattern = /@required\s+/g;
    let match;
    while ((match = requiredPattern.exec(body)) !== null) {
      validations.push({
        type: 'annotation',
        name: '@required',
      });
    }

    return validations;
  }

  /**
   * 分析注解元数据
   */
  analyzeModelAnnotations(files) {
    for (const [modelName, model] of this.models) {
      const annotations = this.extractAnnotations(model);
      if (annotations.length > 0) {
        this.modelAnnotations.set(modelName, annotations);
      }
    }
  }

  /**
   * 提取注解
   */
  extractAnnotations(model) {
    const annotations = [];
    const body = model.body;

    // 常见注解
    const annotationPatterns = [
      { pattern: /@JsonSerializable\(\)/, name: 'JsonSerializable' },
      { pattern: /@HiveType\((\d+)\)/, name: 'HiveType' },
      { pattern: /@HiveField\((\d+)\)/, name: 'HiveField' },
      { pattern: /@immutable/, name: 'immutable' },
      { pattern: /@required/, name: 'required' },
      { pattern: /@Default\(([^)]+)\)/, name: 'Default' },
    ];

    for (const { pattern, name } of annotationPatterns) {
      let match;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(body)) !== null) {
        annotations.push({
          name,
          value: match[1] || '',
          line: this.getLineNumber(body, match.index),
        });
      }
    }

    return annotations;
  }

  /**
   * 生成统计信息
   */
  generateStatistics() {
    const stats = {
      totalModels: this.models.size,
      byType: {},
      totalFields: 0,
      avgFieldsPerModel: 0,
      immutableModels: 0,
      abstractModels: 0,
      withSerialization: 0,
      withRelations: 0,
      withValidations: 0,
      fieldTypes: {},
    };

    let totalFields = 0;

    for (const model of this.models.values()) {
      // 按类型统计
      stats.byType[model.modelType] = (stats.byType[model.modelType] || 0) + 1;

      // 字段统计
      totalFields += model.fields.length;

      // 不可变模型
      if (model.isImmutable) stats.immutableModels++;

      // 抽象模型
      if (model.isAbstract) stats.abstractModels++;

      // 序列化
      const serialization = this.serializations.get(model.name);
      if (serialization && (serialization.hasFromJson || serialization.hasToJson)) {
        stats.withSerialization++;
      }

      // 关系
      const relations = this.modelRelations.get(model.name);
      if (relations && relations.length > 0) {
        stats.withRelations++;
      }

      // 验证
      const validations = this.modelValidations.get(model.name);
      if (validations && validations.length > 0) {
        stats.withValidations++;
      }

      // 字段类型统计
      for (const field of model.fields) {
        const baseType = this.getBaseType(field.type);
        stats.fieldTypes[baseType] = (stats.fieldTypes[baseType] || 0) + 1;
      }
    }

    stats.totalFields = totalFields;
    stats.avgFieldsPerModel = this.models.size > 0
      ? Math.round(totalFields / this.models.size)
      : 0;

    return stats;
  }

  /**
   * 获取基础类型
   */
  getBaseType(type) {
    const lower = type.toLowerCase();
    if (lower.includes('string')) return 'String';
    if (lower.includes('int')) return 'int';
    if (lower.includes('double')) return 'double';
    if (lower.includes('bool')) return 'bool';
    if (lower.includes('datetime')) return 'DateTime';
    if (lower.includes('list')) return 'List';
    if (lower.includes('map')) return 'Map';
    return 'other';
  }

  /**
   * 获取字段列表
   */
  getFieldsList() {
    const list = [];

    for (const [modelName, fields] of this.modelFields) {
      for (const field of fields) {
        list.push({
          model: modelName,
          ...field,
        });
      }
    }

    return list;
  }

  /**
   * 获取序列化列表
   */
  getSerializationsList() {
    const list = [];

    for (const [modelName, serialization] of this.serializations) {
      list.push({
        model: modelName,
        ...serialization,
      });
    }

    return list;
  }

  /**
   * 获取关系列表
   */
  getRelationsList() {
    const list = [];

    for (const [modelName, relations] of this.modelRelations) {
      for (const relation of relations) {
        list.push({
          model: modelName,
          ...relation,
        });
      }
    }

    return list;
  }

  /**
   * 获取验证列表
   */
  getValidationsList() {
    const list = [];

    for (const [modelName, validations] of this.modelValidations) {
      for (const validation of validations) {
        list.push({
          model: modelName,
          ...validation,
        });
      }
    }

    return list;
  }

  /**
   * 获取注解列表
   */
  getAnnotationsList() {
    const list = [];

    for (const [modelName, annotations] of this.modelAnnotations) {
      for (const annotation of annotations) {
        list.push({
          model: modelName,
          ...annotation,
        });
      }
    }

    return list;
  }

  /**
   * 生成 Mermaid 格式的实体关系图
   */
  toMermaid() {
    const lines = ['graph TD'];

    // 添加节点
    for (const [name, model] of this.models) {
      let label = name;
      let style = '';

      // 根据类型设置样式
      switch (model.modelType) {
        case 'entity':
          style = ':::entity';
          break;
        case 'dto':
          style = ':::dto';
          break;
        case 'response':
          style = ':::response';
          break;
        case 'request':
          style = ':::request';
          break;
        default:
          style = ':::model';
      }

      lines.push(`  "${name}"[${label}]${style}`);
    }

    // 添加关系边
    for (const [modelName, relations] of this.modelRelations) {
      for (const relation of relations) {
        let lineStyle = '';
        let label = '';

        switch (relation.type) {
          case 'oneToOne':
            lineStyle = '--';
            label = '1:1';
            break;
          case 'oneToMany':
            lineStyle = '.."';
            label = '1:N';
            break;
          case 'manyToMany':
            lineStyle = '-.';
            label = 'N:M';
            break;
        }

        lines.push(`  "${modelName}" ${lineStyle}>|"${relation.field}" (${label})| "${relation.relatedModel}"`);
      }
    }

    // 添加样式定义
    lines.push('');
    lines.push('classDef model fill:#e6f7ff,stroke:#1890ff,stroke-width:2px');
    lines.push('classDef entity fill:#f6ffed,stroke:#52c41a,stroke-width:2px');
    lines.push('classDef dto fill:#fff7e6,stroke:#fa8c16,stroke-width:2px');
    lines.push('classDef response fill:#f9f0ff,stroke:#722ed1,stroke-width:2px');
    lines.push('classDef request fill:#fff1f0,stroke:#f5222d,stroke-width:2px');
    lines.push('classDef default fill:#f0f0f0,stroke:#999,stroke-width:1px');

    return lines.join('\n');
  }

  /**
   * 提取类体
   */
  extractClassBody(content, startPos) {
    let braceCount = 0;
    let foundStart = false;
    let endPos = startPos;
    let firstBrace = -1;

    for (let i = startPos; i < content.length; i++) {
      if (content[i] === '{') {
        if (firstBrace === -1) {
          firstBrace = i;
        }
        foundStart = true;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && foundStart) {
          endPos = i + 1;
          break;
        }
      }
    }

    const start = firstBrace >= 0 ? firstBrace + 1 : startPos;
    return content.substring(start, endPos);
  }

  /**
   * 获取行号
   */
  getLineNumber(content, index) {
    const before = content.substring(0, index);
    return before.split('\n').length;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.models.clear();
    this.modelFields.clear();
    this.serializations.clear();
    this.modelRelations.clear();
    this.modelValidations.clear();
    this.modelAnnotations.clear();
  }
}

module.exports = FlutterModelAnalyzer;
