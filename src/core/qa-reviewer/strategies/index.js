/**
 * 分段策略入口
 */

const { SegmentStrategy, SegmentStatus, SegmentPriority, Segment, SegmentPlan } = require('./segment-strategy');
const FeatureSegmentStrategy = require('./feature-strategy');

module.exports = {
  // 枚举
  SegmentStrategy,
  SegmentStatus,
  SegmentPriority,

  // 类
  Segment,
  SegmentPlan,

  // 策略
  FeatureSegmentStrategy,
};
