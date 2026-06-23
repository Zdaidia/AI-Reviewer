/**
 * Markdown 需求规格文件生成器
 *
 * 将完善后的需求数据生成 Markdown 格式的 need.txt 文件
 * 支持多模块结构 + 共通需求（来自已确认问题）
 */

class MarkdownGenerator {
  /**
   * 生成 Markdown 需求规格文件
   * @param {Object} analyzedData - 分析后的需求数据
   * @param {Array} confirmedIssues - 已确认的共通问题
   * @returns {string} Markdown 内容
   */
  generate(analyzedData, confirmedIssues = []) {
    const lines = [];

    // 1. 标题
    lines.push('# 需求规格文件');
    lines.push('');
    lines.push(`> 生成时间: ${new Date().toISOString()}`);
    lines.push(`> 来源: Google Sheets + Figma + 本地文件`);
    lines.push('');

    // 2. 功能模块（从 Sheets 数据）
    if (analyzedData.sheets && analyzedData.sheets.length > 0) {
      // 按模块分组
      const moduleGroups = this.groupByModule(analyzedData.sheets);

      for (const [moduleName, items] of Object.entries(moduleGroups)) {
        lines.push(`## ${moduleName || '未分类模块'}`);
        lines.push('');

        for (const item of items) {
          const req = item.original || {};
          const text = item.text || req.requirement || req.description || '';

          lines.push(`### ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
          lines.push('');

          if (text) {
            lines.push(`- 描述：${text}`);
          }

          const ac = req.acceptanceCriteria || req.AC || req.验收标准 || '';
          if (ac) {
            lines.push(`- 验收标准：${ac}`);
          }

          const priority = req.priority || req.优先级 || '';
          if (priority) {
            lines.push(`- 优先级：${priority}`);
          }

          const description = req.description || req.详细描述 || '';
          if (description && description !== text) {
            lines.push(`- 详细描述：${description}`);
          }

          lines.push('');
        }
      }
    }

    // 3. Figma 设计需求
    if (analyzedData.figma && analyzedData.figma.length > 0) {
      lines.push('## Figma 设计需求');
      lines.push('');

      // 按来源分组
      const sourceGroups = {};
      for (const item of analyzedData.figma) {
        const source = item.source || '其他';
        if (!sourceGroups[source]) sourceGroups[source] = [];
        sourceGroups[source].push(item);
      }

      const sourceLabels = {
        figma_page: '页面/模块',
        figma_ui: 'UI 元素',
        figma_interaction: '交互逻辑',
        figma_state: '状态/变体',
        figma_text: '界面文案',
      };

      for (const [source, items] of Object.entries(sourceGroups)) {
        lines.push(`### ${sourceLabels[source] || source}`);
        lines.push('');
        for (const item of items) {
          lines.push(`- ${item.text}`);
        }
        lines.push('');
      }
    }

    // 4. 本地文件需求
    if (analyzedData.localFiles) {
      lines.push('## 文件需求');
      lines.push('');
      const content = analyzedData.localFiles.text || '';
      if (content) {
        // 将文本内容整理为结构化描述
        const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
        for (const para of paragraphs) {
          lines.push(`- ${para.trim()}`);
        }
      }
      lines.push('');
    }

    // 5. 共通需求（来自已确认问题）
    if (confirmedIssues && confirmedIssues.length > 0) {
      lines.push('## 共通需求（来自已确认问题）');
      lines.push('');

      for (const issue of confirmedIssues) {
        const question = issue.question || issue.问题 || '';
        const reply = issue.reply || issue.回复 || issue.solution || '';
        const category = issue.category || issue.分类 || '';

        lines.push(`### ${question.substring(0, 50)}`);
        lines.push('');
        lines.push(`- 描述：${question}`);
        if (category) lines.push(`- 分类：${category}`);
        if (reply) lines.push(`- 解决方案：${reply}`);

        // 验收条件
        const ac = issue.acceptanceCriteria || '';
        if (ac) lines.push(`- 验收标准：${ac}`);

        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * 按模块分组需求
   */
  groupByModule(sheetsItems) {
    const groups = {};

    for (const item of sheetsItems) {
      const req = item.original || {};
      const moduleName = req.module || req.模块 || req.功能模块 || '未分类';
      if (!groups[moduleName]) groups[moduleName] = [];
      groups[moduleName].push(item);
    }

    return groups;
  }

  /**
   * 从完善后的需求 JSON/Markdown 数据生成最终文件
   * @param {Object} refinedRequirements - RequirementProcessor 的输出
   * @param {Array} confirmedIssues - 已确认问题
   * @returns {string} Markdown 内容
   */
  generateFromRefined(refinedRequirements, confirmedIssues = []) {
    if (refinedRequirements.format === 'markdown') {
      // 已经是 Markdown，只需追加共通需求
      let content = refinedRequirements.content || '';
      if (confirmedIssues.length > 0) {
        content += '\n\n## 共通需求（来自已确认问题）\n\n';
        for (const issue of confirmedIssues) {
          const question = issue.question || issue.问题 || '';
          const reply = issue.reply || issue.回复 || issue.solution || '';
          content += `### ${question.substring(0, 50)}\n`;
          content += `- 描述：${question}\n`;
          if (reply) content += `- 解决方案：${reply}\n`;
          content += '\n';
        }
      }
      return content;
    }

    if (refinedRequirements.format === 'json' && refinedRequirements.modules) {
      // JSON 格式 → 转为 Markdown
      let content = '# 需求规格文件\n\n';
      for (const module of refinedRequirements.modules) {
        content += `## ${module.name || '未命名模块'}\n\n`;
        for (const item of (module.items || [])) {
          content += `### ${item.name || '未命名功能'}\n\n`;
          for (const detail of (item.details || [])) {
            content += `- ${detail}\n`;
          }
          content += '\n';
        }
      }

      // 追加共通需求
      if (confirmedIssues.length > 0) {
        content += '\n## 共通需求（来自已确认问题）\n\n';
        for (const issue of confirmedIssues) {
          const question = issue.question || issue.问题 || '';
          const reply = issue.reply || issue.回复 || issue.solution || '';
          content += `### ${question.substring(0, 50)}\n`;
          content += `- 描述：${question}\n`;
          if (reply) content += `- 解决方案：${reply}\n`;
          content += '\n';
        }
      }

      return content;
    }

    // 其他格式，直接返回原始内容
    return refinedRequirements.content || '';
  }
}

module.exports = MarkdownGenerator;