/**
 * 需求分析整理模块 - 入口文件
 *
 * 导出所有核心类，供 main.js 使用
 */

const ReqAnalyzer = require('./req-analyzer');
const ReqAnalyzerConfig = require('./config');
const GoogleOAuth2Manager = require('./google/auth-manager');
const GoogleSheetsManager = require('./google/sheets-manager');
const GoogleDriveManager = require('./google/drive-manager');
const FigmaReqExtractor = require('./figma/req-extractor');
const RequirementProcessor = require('./ai/requirement-processor');
const MarkdownGenerator = require('./output/markdown-generator');

module.exports = {
  ReqAnalyzer,
  ReqAnalyzerConfig,
  GoogleOAuth2Manager,
  GoogleSheetsManager,
  GoogleDriveManager,
  FigmaReqExtractor,
  RequirementProcessor,
  MarkdownGenerator,
};