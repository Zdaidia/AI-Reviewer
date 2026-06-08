/**
 * QA Reviewer 入口
 *
 * 需求符合性验证工具
 */

const QAReviewer = require('./qa-reviewer');
const { getProjectConfig, detectProjectType } = require('./config/default-config');
const { CodeGraphAdapter, AIContextAdapter, MemoryAdapter } = require('./integrations');
const { FeatureSegmentStrategy, SegmentStrategy, Segment, SegmentPlan } = require('./strategies');
const { SegmentExecutor } = require('./executor');
const { PromptTemplates } = require('./prompts');
const { ReportGenerator } = require('./output');

module.exports = {
  // 主类
  QAReviewer,

  // 配置
  getProjectConfig,
  detectProjectType,

  // 集成适配器
  CodeGraphAdapter,
  AIContextAdapter,
  MemoryAdapter,

  // 分段策略
  FeatureSegmentStrategy,
  SegmentStrategy,
  Segment,
  SegmentPlan,

  // 执行器
  SegmentExecutor,

  // 提示词和报告
  PromptTemplates,
  ReportGenerator,
};
