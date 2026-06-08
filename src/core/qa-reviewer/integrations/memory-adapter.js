/**
 * Memory 适配器
 *
 * 复用现有的 Memory 系统，为 QA Reviewer 提供：
 * - 增量审查（只审查变更文件）
 * - 进度保存和恢复
 * - 审查历史记录
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class MemoryAdapter {
  constructor(options = {}) {
    this.memoryManager = options.memoryManager || null;
    this.memory = null;
    this.projectPath = null;
    this.reviewHistoryPath = options.reviewHistoryPath ||
      path.join(os.homedir(), '.qa-reviewer', 'history');
  }

  /**
   * 加载项目 Memory
   */
  async load(projectPath) {
    this.projectPath = projectPath;

    try {
      // 尝试加载 Memory（如果 memoryManager 可用）
      if (this.memoryManager) {
        this.memory = await this.memoryManager.load(projectPath);
        return this.memory;
      }
    } catch (e) {
      console.warn('[MemoryAdapter] Memory 加载失败:', e.message);
    }

    // 创建简单的内存结构
    this.memory = {
      projectPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      files: {},
      reviews: [],
    };
    return this.memory;
  }

  /**
   * 确保 Memory 存在
   */
  async ensureMemory() {
    if (!this.memory) {
      this.memory = {
        projectPath: this.projectPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        files: {},
        reviews: [],
        changelog: [],
        fileHashes: {},  // 使用普通对象，序列化/反序列化更安全
      };
      return this.memory;
    }

    // 确保必需的字段存在（处理从 JSON 加载的情况）
    if (!this.memory.changelog) {
      this.memory.changelog = [];
    }
    if (!this.memory.fileHashes) {
      this.memory.fileHashes = {};
    }
    if (!this.memory.files) {
      this.memory.files = {};
    }
    if (!this.memory.reviews) {
      this.memory.reviews = [];
    }

    return this.memory;
  }

  /**
   * 获取变更的文件（增量审查）
   * @param {string} sinceRevision - 基准版本（可选）
   * @returns {Array} 变更文件列表
   */
  async getChangedFiles(sinceRevision = null) {
    await this.ensureMemory();

    const changes = {
      added: [],
      modified: [],
      deleted: [],
    };

    const currentHashes = await this.scanFileHashes(this.projectPath);
    const savedHashes = this.memory.fileHashes || {};

    // 检测修改和新增的文件
    for (const [filePath, hash] of Object.entries(currentHashes)) {
      const savedHash = savedHashes[filePath];

      if (!savedHash) {
        changes.added.push({
          file: filePath,
          type: 'added',
          hash,
        });
      } else if (hash !== savedHash) {
        changes.modified.push({
          file: filePath,
          type: 'modified',
          oldHash: savedHash,
          newHash: hash,
        });
      }
    }

    // 检测删除的文件
    for (const [filePath, hash] of Object.entries(savedHashes)) {
      if (!currentHashes[filePath]) {
        changes.deleted.push({
          file: filePath,
          type: 'deleted',
        });
      }
    }

    return changes;
  }

  /**
   * 更新文件哈希值（审查完成后）
   */
  async updateFileHashes(files) {
    if (!this.memory) {
      await this.ensureMemory();
    }

    if (!this.memory.fileHashes) {
      this.memory.fileHashes = {};
    }

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const hash = crypto.createHash('md5').update(content).digest('hex');
        this.memory.fileHashes[file] = hash;
      } catch (e) {
        console.warn(`[MemoryAdapter] 无法读取文件: ${file}`);
      }
    }

    this.memory.updatedAt = new Date().toISOString();
  }

  /**
   * 保存审查记录
   * @param {Object} reviewResult - 审查结果
   * @returns {string} 记录 ID
   */
  async saveReviewRecord(reviewResult) {
    if (!this.memory) {
      await this.ensureMemory();
    }

    const record = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      projectPath: this.projectPath,
      summary: reviewResult.summary || {},
      segments: reviewResult.segments || [],
      issues: this.extractIssueFingerprints(reviewResult.issues || []),
      metrics: reviewResult.metrics || {},
    };

    // 确保 changelog 存在
    if (!this.memory.changelog) {
      this.memory.changelog = [];
    }

    // 添加到变更日志
    this.memory.changelog.push({
      timestamp: record.timestamp,
      type: 'review',
      recordId: record.id,
      summary: record.summary,
    });

    // 保存 Memory（如果有 memoryManager）
    if (this.memoryManager) {
      try {
        await this.memoryManager.save(this.memory);
      } catch (e) {
        console.warn('[MemoryAdapter] 保存 Memory 失败:', e.message);
      }
    }

    // 同时保存详细的审查记录
    await this.saveReviewDetail(record);

    return record.id;
  }

  /**
   * 保存详细的审查记录
   */
  async saveReviewDetail(record) {
    const historyDir = path.join(
      this.reviewHistoryPath,
      path.basename(this.projectPath)
    );

    // 确保目录存在
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    const recordFile = path.join(
      historyDir,
      `${record.timestamp.split('T')[0]}_${record.id}.json`
    );

    fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
  }

  /**
   * 加载审查记录
   * @param {string} recordId - 记录 ID
   */
  async loadReviewRecord(recordId) {
    const historyDir = path.join(
      this.reviewHistoryPath,
      path.basename(this.projectPath)
    );

    const files = fs.readdirSync(historyDir).filter(f => f.includes(recordId));

    if (files.length === 0) {
      return null;
    }

    const recordFile = path.join(historyDir, files[0]);
    return JSON.parse(fs.readFileSync(recordFile, 'utf8'));
  }

  /**
   * 获取最近的审查记录
   * @param {number} limit - 最大数量
   */
  async getRecentReviews(limit = 10) {
    if (!this.memory) {
      await this.load(this.projectPath);
    }

    const reviewRecords = this.memory.changelog
      .filter(log => log.type === 'review')
      .slice(-limit)
      .reverse();

    return Promise.all(
      reviewRecords.map(log => this.loadReviewRecord(log.recordId))
    );
  }

  /**
   * 对比两次审查结果
   * @param {string} recordId1 - 第一次审查 ID
   * @param {string} recordId2 - 第二次审查 ID
   */
  async compareReviews(recordId1, recordId2) {
    const review1 = await this.loadReviewRecord(recordId1);
    const review2 = await this.loadReviewRecord(recordId2);

    if (!review1 || !review2) {
      return null;
    }

    const fingerprints1 = new Set(review1.issues.map(i => i.fingerprint));
    const fingerprints2 = new Set(review2.issues.map(i => i.fingerprint));

    return {
      newIssues: review2.issues.filter(i => !fingerprints1.has(i.fingerprint)),
      fixedIssues: review1.issues.filter(i => !fingerprints2.has(i.fingerprint)),
      recurringIssues: review2.issues.filter(i => fingerprints1.has(i.fingerprint)),
      totalCount1: review1.issues.length,
      totalCount2: review2.issues.length,
      trend: this.analyzeTrend(review1, review2),
    };
  }

  /**
   * 分析趋势
   */
  analyzeTrend(oldReview, newReview) {
    const oldCount = oldReview.issues.length;
    const newCount = newReview.issues.length;

    if (newCount === 0) return 'excellent';
    if (newCount < oldCount * 0.5) return 'improving';
    if (newCount < oldCount) return 'progressing';
    if (newCount === oldCount) return 'stable';
    return 'regressing';
  }

  /**
   * 扫描文件哈希值
   */
  async scanFileHashes(projectPath) {
    const hashes = {};

    const scanDir = (dir) => {
      try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            // 跳过 node_modules 等目录
            if (!['node_modules', '.git', 'dist', 'build', '.dart_tool'].includes(file)) {
              scanDir(filePath);
            }
          } else if (file.match(/\.(dart|js|ts|jsx|tsx|vue)$/)) {
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const hash = crypto.createHash('md5').update(content).digest('hex');
              hashes[filePath] = hash;
            } catch (e) {
              // 忽略读取失败的文件
            }
          }
        });
      } catch (e) {
        // 忽略无法访问的目录
      }
    };

    scanDir(projectPath);
    return hashes;
  }

  /**
   * 提取问题指纹（用于追踪同一问题）
   */
  extractIssueFingerprints(issues) {
    return issues.map(issue => ({
      ...issue,
      fingerprint: this.generateIssueFingerprint(issue),
    }));
  }

  /**
   * 生成问题指纹
   */
  generateIssueFingerprint(issue) {
    const data = `${issue.ruleId}:${issue.filePath}:${issue.message}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 生成唯一 ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }

  /**
   * 获取 Memory 统计信息
   */
  getMemoryStats() {
    if (!this.memory) {
      return null;
    }

    return {
      createdAt: this.memory.createdAt,
      updatedAt: this.memory.updatedAt,
      scanCount: this.memory.scanCount || 0,
      fileCount: Object.keys(this.memory.fileHashes || {}).length,
      changelogCount: (this.memory.changelog || []).length,
      reviewCount: (this.memory.changelog || []).filter(l => l.type === 'review').length,
    };
  }
}

module.exports = MemoryAdapter;
