/**
 * 分段策略定义
 *
 * 定义分段策略的接口和枚举
 */

/**
 * 分段策略枚举
 */
const SegmentStrategy = {
  // 按功能模块分段（推荐）
  BY_FEATURE: 'by_feature',

  // 按文件分段
  BY_FILE: 'by_file',

  // 按依赖层级分段
  BY_DEPENDENCY: 'by_dependency',

  // 按代码行数分段
  BY_LINES: 'by_lines',

  // 智能分段（AI 判断）
  SMART: 'smart',
};

/**
 * 分段状态枚举
 */
const SegmentStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/**
 * 分段优先级枚举
 */
const SegmentPriority = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * 分段类
 */
class Segment {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.name = options.name || 'Unnamed Segment';
    this.description = options.description || '';

    // 分段内容
    this.files = options.files || [];
    this.features = options.features || [];
    this.lines = options.lines || { start: 0, end: 0 };

    // 元数据（组件列表、i18n 文件等附加信息）
    this.metadata = options.metadata || {};

    // 状态
    this.status = SegmentStatus.PENDING;
    this.priority = options.priority || SegmentPriority.MEDIUM;

    // 依赖关系
    this.dependsOn = options.dependsOn || [];
    this.blocks = options.blocks || [];

    // 执行结果
    this.result = null;
    this.error = null;

    // 时间信息
    this.createdAt = options.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.duration = 0;
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return `seg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 标记为开始执行
   */
  start() {
    this.status = SegmentStatus.RUNNING;
    this.startedAt = new Date().toISOString();
  }

  /**
   * 标记为完成
   */
  complete(result) {
    this.status = SegmentStatus.COMPLETED;
    this.completedAt = new Date().toISOString();
    this.result = result;

    if (this.startedAt) {
      this.duration = new Date(this.completedAt) - new Date(this.startedAt);
    }
  }

  /**
   * 标记为失败
   */
  fail(error) {
    this.status = SegmentStatus.FAILED;
    this.completedAt = new Date().toISOString();
    this.error = error;
  }

  /**
   * 标记为跳过
   */
  skip(reason) {
    this.status = SegmentStatus.SKIPPED;
    this.completedAt = new Date().toISOString();
    this.error = reason;
  }

  /**
   * 检查是否可以执行（依赖是否满足）
   */
  canExecute(completedSegments) {
    if (this.dependsOn.length === 0) {
      return true;
    }

    return this.dependsOn.every(depId =>
      completedSegments.includes(depId)
    );
  }

  /**
   * 获取估算的 Token 数量
   */
  estimateTokens() {
    // 粗略估算：每行代码约 10 tokens
    const lineCount = this.lines.end - this.lines.start;
    return lineCount * 10;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      files: this.files,
      features: this.features,
      lines: this.lines,
      status: this.status,
      priority: this.priority,
      dependsOn: this.dependsOn,
      blocks: this.blocks,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.duration,
    };
  }

  /**
   * 从 JSON 创建
   */
  static fromJSON(json) {
    const segment = new Segment();
    Object.assign(segment, json);
    return segment;
  }
}

/**
 * 分段计划
 */
class SegmentPlan {
  constructor(options = {}) {
    this.id = options.id || this.generateId();
    this.name = options.name || 'Review Plan';
    this.projectPath = options.projectPath || '';

    // 分段列表
    this.segments = options.segments || [];

    // 策略配置
    this.strategy = options.strategy || SegmentStrategy.BY_FEATURE;
    this.maxParallel = options.maxParallel || 2;

    // 元数据
    this.totalSegments = this.segments.length;
    this.totalFiles = options.totalFiles || 0;
    this.estimatedDuration = options.estimatedDuration || 0;

    // 状态
    this.status = 'pending';
    this.createdAt = options.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
  }

  generateId() {
    return `plan-${Date.now()}`;
  }

  /**
   * 获取待执行的分段
   */
  getPendingSegments() {
    return this.segments.filter(s => s.status === SegmentStatus.PENDING);
  }

  /**
   * 获取可执行的分段（依赖已满足）
   */
  getExecutableSegments() {
    const completedIds = this.segments
      .filter(s => s.status === SegmentStatus.COMPLETED)
      .map(s => s.id);

    return this.segments.filter(s =>
      s.status === SegmentStatus.PENDING &&
      s.canExecute(completedIds)
    );
  }

  /**
   * 获取正在执行的分段
   */
  getRunningSegments() {
    return this.segments.filter(s => s.status === SegmentStatus.RUNNING);
  }

  /**
   * 获取已完成的分段
   */
  getCompletedSegments() {
    return this.segments.filter(s => s.status === SegmentStatus.COMPLETED);
  }

  /**
   * 获取进度
   */
  getProgress() {
    const completed = this.getCompletedSegments().length;
    const total = this.segments.length;

    return {
      completed,
      total,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * 添加分段
   */
  addSegment(segment) {
    this.segments.push(segment);
    this.totalSegments = this.segments.length;
  }

  /**
   * 转换为 JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      projectPath: this.projectPath,
      segments: this.segments.map(s => s.toJSON()),
      strategy: this.strategy,
      maxParallel: this.maxParallel,
      totalSegments: this.totalSegments,
      totalFiles: this.totalFiles,
      estimatedDuration: this.estimatedDuration,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * 从 JSON 创建
   */
  static fromJSON(json) {
    const plan = new SegmentPlan();
    Object.assign(plan, json);
    plan.segments = json.segments.map(s => Segment.fromJSON(s));
    return plan;
  }
}

module.exports = {
  SegmentStrategy,
  SegmentStatus,
  SegmentPriority,
  Segment,
  SegmentPlan,
};
