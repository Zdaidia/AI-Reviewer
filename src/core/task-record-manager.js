/**
 * Task Record Manager
 *
 * 职责：
 * - 记录开发任务和修改
 * - 保存到 D 盘便于查找
 * - 支持任务的增删改查
 *
 * 存储位置：D:/dev-quality-inspector/tasks/
 */

const fs = require('fs');
const path = require('path');

class TaskRecordManager {
  constructor(options = {}) {
    this.baseDir = options.baseDir || 'D:/dev-quality-inspector/tasks';
    this.tasksDir = path.join(this.baseDir, 'tasks');
    this.changelogDir = path.join(this.baseDir, 'changelog');
    this.ensureDirectories();
  }

  /**
   * 确保目录存在
   */
  ensureDirectories() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.tasksDir)) {
      fs.mkdirSync(this.tasksDir, { recursive: true });
    }
    if (!fs.existsSync(this.changelogDir)) {
      fs.mkdirSync(this.changelogDir, { recursive: true });
    }
  }

  /**
   * 创建新任务
   * @param {Object} task - 任务对象
   * @returns {string} 任务ID
   */
  createTask(task) {
    const taskId = task.id || this.generateTaskId();
    const taskData = {
      id: taskId,
      title: task.title || '未命名任务',
      description: task.description || '',
      status: task.status || 'pending', // pending, in_progress, completed, cancelled
      priority: task.priority || 'medium', // low, medium, high, urgent
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      tags: task.tags || [],
      relatedFiles: task.relatedFiles || [],
      modifications: task.modifications || [],
      notes: task.notes || '',
    };

    const taskPath = path.join(this.tasksDir, `${taskId}.json`);
    fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');

    console.log(`[TaskRecord] 任务已创建: ${taskId} - ${taskData.title}`);
    return taskId;
  }

  /**
   * 更新任务
   * @param {string} taskId - 任务ID
   * @param {Object} updates - 更新内容
   */
  updateTask(taskId, updates) {
    const taskPath = path.join(this.tasksDir, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

    // 更新字段
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'status' && value === 'completed' && !taskData.completedAt) {
        taskData.completedAt = new Date().toISOString();
      }
      taskData[key] = value;
    }

    taskData.updatedAt = new Date().toISOString();

    fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');
    console.log(`[TaskRecord] 任务已更新: ${taskId}`);

    return taskData;
  }

  /**
   * 添加修改记录
   * @param {string} taskId - 任务ID
   * @param {Object} modification - 修改记录
   */
  addModification(taskId, modification) {
    const taskPath = path.join(this.tasksDir, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    const taskData = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

    const modRecord = {
      timestamp: new Date().toISOString(),
      file: modification.file,
      action: modification.action, // create, update, delete
      description: modification.description || '',
      changes: modification.changes || [],
    };

    taskData.modifications = taskData.modifications || [];
    taskData.modifications.push(modRecord);
    taskData.updatedAt = new Date().toISOString();

    fs.writeFileSync(taskPath, JSON.stringify(taskData, null, 2), 'utf-8');

    return modRecord;
  }

  /**
   * 获取任务
   * @param {string} taskId - 任务ID
   */
  getTask(taskId) {
    const taskPath = path.join(this.tasksDir, `${taskId}.json`);
    if (!fs.existsSync(taskPath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
  }

  /**
   * 列出所有任务
   * @param {Object} filters - 过滤条件
   */
  listTasks(filters = {}) {
    const tasks = [];
    const files = fs.readdirSync(this.tasksDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const taskData = JSON.parse(
        fs.readFileSync(path.join(this.tasksDir, file), 'utf-8')
      );

      // 应用过滤条件
      let match = true;
      if (filters.status && taskData.status !== filters.status) match = false;
      if (filters.priority && taskData.priority !== filters.priority) match = false;
      if (filters.tag && !taskData.tags.includes(filters.tag)) match = false;

      if (match) {
        tasks.push(taskData);
      }
    }

    // 按更新时间排序
    tasks.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return tasks;
  }

  /**
   * 添加变更日志条目
   * @param {Object} entry - 日志条目
   */
  addChangelogEntry(entry) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logPath = path.join(this.changelogDir, `${date}.jsonl`);

    const logEntry = {
      timestamp: new Date().toISOString(),
      type: entry.type || 'modification', // modification, feature, fix, refactor
      summary: entry.summary || '',
      details: entry.details || '',
      files: entry.files || [],
      taskId: entry.taskId || null,
    };

    // 追加到日志文件
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n', 'utf-8');

    console.log(`[TaskRecord] 变更日志已记录: ${logEntry.summary}`);
    return logEntry;
  }

  /**
   * 生成任务报告（Markdown格式）
   * @param {string} taskId - 任务ID
   */
  generateTaskReport(taskId) {
    const task = this.getTask(taskId);
    if (!task) {
      return null;
    }

    let md = `# 任务报告: ${task.title}\n\n`;
    md += `**任务ID**: ${task.id}\n`;
    md += `**状态**: ${this.getStatusEmoji(task.status)} ${task.status}\n`;
    md += `**优先级**: ${this.getPriorityEmoji(task.priority)} ${task.priority}\n`;
    md += `**创建时间**: ${task.createdAt}\n`;
    md += `**更新时间**: ${task.updatedAt}\n`;
    if (task.completedAt) {
      md += `**完成时间**: ${task.completedAt}\n`;
    }

    if (task.tags.length > 0) {
      md += `**标签**: ${task.tags.join(', ')}\n`;
    }

    md += `\n## 描述\n\n${task.description}\n`;

    if (task.relatedFiles.length > 0) {
      md += `\n## 相关文件\n\n`;
      for (const file of task.relatedFiles) {
        md += `- \`${file}\`\n`;
      }
    }

    if (task.modifications.length > 0) {
      md += `\n## 修改记录\n\n`;
      for (const mod of task.modifications) {
        md += `### ${mod.timestamp}\n`;
        md += `- **文件**: ${mod.file}\n`;
        md += `- **操作**: ${mod.action}\n`;
        if (mod.description) {
          md += `- **描述**: ${mod.description}\n`;
        }
        md += `\n`;
      }
    }

    if (task.notes) {
      md += `\n## 备注\n\n${task.notes}\n`;
    }

    return md;
  }

  /**
   * 生成今日变更报告
   */
  generateDailyReport() {
    const date = new Date().toISOString().split('T')[0];
    const logPath = path.join(this.changelogDir, `${date}.jsonl`);

    if (!fs.existsSync(logPath)) {
      return `# ${date} 变更报告\n\n今日暂无变更记录。`;
    }

    let md = `# ${date} 变更报告\n\n`;

    const entries = [];
    const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.trim()) {
        entries.push(JSON.parse(line));
      }
    }

    // 按类型分组
    const byType = {};
    for (const entry of entries) {
      byType[entry.type] = byType[entry.type] || [];
      byType[entry.type].push(entry);
    }

    for (const [type, typeEntries] of Object.entries(byType)) {
      md += `## ${this.getTypeLabel(type)} (${typeEntries.length})\n\n`;
      for (const entry of typeEntries) {
        const time = entry.timestamp.split('T')[1].substring(0, 8);
        md += `### [${time}] ${entry.summary}\n`;
        if (entry.details) {
          md += `${entry.details}\n`;
        }
        if (entry.files.length > 0) {
          md += `**涉及文件**:\n`;
          for (const file of entry.files) {
            md += `- \`${file}\`\n`;
          }
        }
        md += `\n`;
      }
    }

    return md;
  }

  /**
   * 生成任务ID
   */
  generateTaskId() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `TASK-${dateStr}-${timeStr}-${random}`;
  }

  /**
   * 获取状态对应的emoji
   */
  getStatusEmoji(status) {
    const emojis = {
      pending: '⏳',
      in_progress: '🔄',
      completed: '✅',
      cancelled: '❌',
    };
    return emojis[status] || '📝';
  }

  /**
   * 获取优先级对应的emoji
   */
  getPriorityEmoji(priority) {
    const emojis = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      urgent: '🔴',
    };
    return emojis[priority] || '⚪';
  }

  /**
   * 获取类型标签
   */
  getTypeLabel(type) {
    const labels = {
      modification: '🔧 修改',
      feature: '✨ 新功能',
      fix: '🐛 修复',
      refactor: '♻️ 重构',
      test: '🧪 测试',
    };
    return labels[type] || type;
  }
}

module.exports = TaskRecordManager;
