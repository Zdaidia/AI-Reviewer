/**
 * Google Sheets 管理器
 *
 * 负责读写 Google Sheets：
 * - 从指定 Sheet URL 读取需求数据
 * - 将问题清单写入指定 Sheet
 * - 读取用户回复
 * - 智能解析列名和自定义映射
 */

const { google } = require('googleapis');

class GoogleSheetsManager {
  constructor(authManager) {
    this.authManager = authManager;
  }

  /**
   * 从 Google Sheets URL 解析 spreadsheetId 和 gid
   * 支持格式：
   *   https://docs.google.com/spreadsheets/d/{id}/edit
   *   https://docs.google.com/spreadsheets/d/{id}/edit#gid={gid}
   *   https://docs.google.com/spreadsheets/d/{id}/edit?gid={gid}
   */
  parseSheetsUrl(url) {
    if (!url) throw new Error('Sheets URL 不能为空');

    const idMatch = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) throw new Error('无法从 URL 中解析 spreadsheetId。请确认 URL 格式正确。');

    const gidMatch = url.match(/gid=(\d+)/);
    return {
      spreadsheetId: idMatch[1],
      gid: gidMatch ? parseInt(gidMatch[1]) : 0,
    };
  }

  /**
   * 读取指定 Sheet 的数据
   * @param {string} sheetsUrl - Google Sheets URL
   * @param {Object} options - 选项
   *   - columnMapping: 自定义列名映射
   *   - range: 指定读取范围（如 "A1:Z100"）
   *   - sheetName: 指定 Sheet 名称
   * @returns {Promise<Object>} 结构化数据
   */
  async readSheet(sheetsUrl, options = {}) {
    try {
      const client = await this.authManager.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth: client });

      const { spreadsheetId, gid } = this.parseSheetsUrl(sheetsUrl);

      // 确定读取范围
      let range;
      if (options.range) {
        range = options.range;
      } else if (options.sheetName) {
        range = `${options.sheetName}`;
      } else {
        // 先获取 spreadsheet metadata 找到 gid 对应的 sheet 名称
        const metadata = await sheets.spreadsheets.get({ spreadsheetId });
        const targetSheet = metadata.data.sheets.find(s => s.properties.sheetId === gid);
        const sheetTitle = targetSheet ? targetSheet.properties.title : metadata.data.sheets[0].properties.title;
        range = sheetTitle;
      }

      // 读取数据
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      if (values.length === 0) {
        return {
          success: true,
          totalRows: 0,
          columns: [],
          data: [],
        };
      }

      // 智能解析列名
      const headers = values[0];
      const parsedData = this.parseSheetData(values, options.columnMapping || {});

      console.log(`[SheetsManager] 读取成功: ${parsedData.length}行, 列头: ${headers.join(', ')}`);

      return {
        success: true,
        spreadsheetId,
        sheetTitle: range,
        totalRows: parsedData.length,
        columns: headers,
        data: parsedData,
      };
    } catch (error) {
      console.error(`[SheetsManager] 读取 Sheet 失败: ${error.message}`);

      // 检测 scope 不足错误
      if (error.message && error.message.includes('insufficient authentication scopes')) {
        console.warn('[SheetsManager] 读取时检测到 scope 不足，清除 token');
        try { await this.authManager.revokeAuth(); } catch (e) { /* ignore */ }
        return {
          success: false,
          error: 'Google 认证权限不足。请重新登录 Google 账号，确保授权时允许"查看您的 Google Sheets"权限。',
        };
      }

      if (error.code === 404) {
        return { success: false, error: '找不到指定的 Google Sheets，请检查 URL 是否正确。' };
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 解析 Sheet 数据为结构化对象数组
   * 第一行为列头，使用 columnMapping 映射到标准字段名
   */
  parseSheetData(values, columnMapping = {}) {
    if (values.length < 2) return [];

    const headers = values[0];

    // 默认列名映射（支持简体中文、繁体中文和英文）
    const defaultMapping = {
      'requirement': 'requirement',
      '需求': 'requirement',
      '需求描述': 'requirement',
      '需求名称': 'requirement',
      '需求内容': 'requirement',
      '功能需求': 'requirement',
      'description': 'description',
      '描述': 'description',
      '详细描述': 'description',
      '功能描述': 'description',
      '描述内容': 'description',
      'module': 'module',
      '模块': 'module',
      '功能模块': 'module',
      '功能模组': 'module',
      '关联模块': 'module',
      'priority': 'priority',
      '优先级': 'priority',
      '优先度': 'priority',
      '级别': 'priority',
      '優先級': 'priority',
      '優先度': 'priority',
      '級別': 'priority',
      'page': 'page',
      '页面': 'page',
      '頁面': 'page',
      'acceptance': 'acceptanceCriteria',
      '验收标准': 'acceptanceCriteria',
      '验收条件': 'acceptanceCriteria',
      'AC': 'acceptanceCriteria',
      '驗收標準': 'acceptanceCriteria',
      '驗收條件': 'acceptanceCriteria',
      'status': 'status',
      '状态': 'status',
      '狀態': 'status',
      'question': 'question',
      '问题': 'question',
      '问题描述': 'question',
      '問題': 'question',
      '問題描述': 'question',
      'reply': 'reply',
      '回复': 'reply',
      '回复内容': 'reply',
      'answer': 'reply',
      '回覆': 'reply',
      '回覆內容': 'reply',
      'severity': 'severity',
      '严重程度': 'severity',
      '嚴重程度': 'severity',
      'suggestion': 'suggestion',
      '建议': 'suggestion',
      '建议方案': 'suggestion',
      '建議': 'suggestion',
      '建議方案': 'suggestion',
      'id': 'id',
      '序号': 'id',
      '序號': 'id',
      'reqId': 'reqId',
      '编号': 'reqId',
      '需求编号': 'reqId',
      '編號': 'reqId',
      '需求編號': 'reqId',
      'category': 'category',
      '分类': 'category',
      '类型': 'category',
      '分類': 'category',
      '類型': 'category',
      'notes': 'notes',
      '备注': 'notes',
      '备注说明': 'notes',
      '说明': 'notes',
      '備註': 'notes',
      '備註說明': 'notes',
      '說明': 'notes',
      'owner': 'owner',
      '负责人': 'owner',
      '开发人员': 'owner',
      '责任人': 'owner',
      '負責人': 'owner',
      '開發人員': 'owner',
      '責任人': 'owner',
      'source': 'source',
      '需求来源': 'source',
      '需求來源': 'source',
      'dependencies': 'dependencies',
      '依赖': 'dependencies',
      '依賴': 'dependencies',
      'risk': 'risk',
      '风险': 'risk',
      '風險': 'risk',
      'version': 'version',
      '版本': 'version',
      'targetUser': 'targetUser',
      '目标用户': 'targetUser',
      '目標用戶': 'targetUser',
      'userScenario': 'userScenario',
      '用户场景': 'userScenario',
      '用戶場景': 'userScenario',
      'precondition': 'precondition',
      '前置条件': 'precondition',
      '前置條件': 'precondition',
    };

    // 合合用户自定义映射
    const mapping = { ...defaultMapping, ...columnMapping };

    // 将列头映射到标准字段名
    const mappedHeaders = headers.map(h => {
      const trimmed = (h || '').toString().trim();
      return mapping[trimmed] || mapping[trimmed.toLowerCase()] || trimmed;
    });

    // 解析数据行
    const result = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const obj = {};
      mappedHeaders.forEach((key, idx) => {
        obj[key] = (row[idx] || '').toString().trim();
      });
      // 跳过完全空行
      if (Object.values(obj).some(v => v !== '')) {
        obj._rowIndex = i; // 保留原始行号
        result.push(obj);
      }
    }

    return result;
  }

  /**
   * 将问题清单写入 Google Sheets
   * @param {string} sheetsUrl - 写入目标的 Sheets URL
   * @param {Array} questionList - 问题清单数组
   * @param {Object} options - 选项
   *   - sheetName: 写入的 Sheet tab 名称（默认 "问题清单"）
   *   - append: 是否追加模式（默认 false，创建新 tab）
   */
  async writeSheet(sheetsUrl, questionList, options = {}) {
    try {
      const client = await this.authManager.getAuthenticatedClient();
      const sheets = google.sheets({ version: 'v4', auth: client });

      const { spreadsheetId } = this.parseSheetsUrl(sheetsUrl);
      const sheetName = options.sheetName || `${options.moduleName || '未命名'}-规格问题`;

      // 1. 检查是否需要创建新 Sheet tab
      const metadata = await sheets.spreadsheets.get({ spreadsheetId });
      const existingSheet = metadata.data.sheets.find(
        s => s.properties.title === sheetName
      );

    if (!existingSheet) {
      // 创建新 tab
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [{
            addSheet: {
              properties: {
                title: sheetName,
              },
            },
          }],
        },
      });
      console.log(`[SheetsManager] 创建新 Sheet tab: ${sheetName}`);
    }

    // 2. 准备写入数据
    // 根据语言设置表头和状态文案
    const lang = options.language || 'zh-TW';
    const headersByLang = {
      'zh-TW': ['序號', '需求編號', '分類', '問題描述', '嚴重程度', '狀態', '回覆', '建議'],
      'zh-CN': ['序号', '需求编号', '分类', '问题描述', '严重程度', '状态', '回复', '建议'],
      'en': ['No.', 'Req ID', 'Category', 'Question', 'Severity', 'Status', 'Reply', 'Suggestion'],
    };
    const pendingStatusByLang = {
      'zh-TW': '待回覆',
      'zh-CN': '待回复',
      'en': 'Pending',
    };
    const headers = headersByLang[lang] || headersByLang['zh-TW'];
    const rows = questionList.map((q, idx) => [
      idx + 1,
      q.reqId || '',
      q.category || '',
      q.question || '',
      q.severity || 'medium',
      pendingStatusByLang[lang] || '待回覆',
      '', // 回复列留空
      q.suggestion || '',
    ]);

    const allValues = [headers, ...rows];

    // 3. 写入数据
    if (options.append && existingSheet) {
      // 追加模式：在已有 tab 末尾追加
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: sheetName,
        valueInputOption: 'USER_ENTERED',
        resource: { values: rows },
      });
    } else {
      // 全量写入：覆盖整个 tab
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: allValues },
      });
    }

    console.log(`[SheetsManager] 写入 ${questionList.length} 个问题到 Sheet: ${sheetName}`);

    return {
      success: true,
      spreadsheetId,
      sheetName,
      rowsWritten: questionList.length,
    };
    } catch (error) {
      console.error(`[SheetsManager] 写入失败: ${error.message}`);

      // 检测 scope 不足错误，自动清除 token 强制重新授权
      if (error.message && error.message.includes('insufficient authentication scopes')) {
        console.warn('[SheetsManager] 检测到 scope 不足错误，将清除 token 并提示重新登录');
        try {
          await this.authManager.revokeAuth();
        } catch (revokeErr) {
          // 撤销失败也继续，至少清除本地 token
          console.warn(`[SheetsManager] 撤销认证失败: ${revokeErr.message}`);
        }
        throw new Error('Google 认证权限不足（缺少 Sheets 写入权限）。请重新登录 Google 账号，授权时请允许"查看和编辑您的 Google Sheets"权限。');
      }

      // 其他 Google API 错误，提供更友好的提示
      if (error.code === 403) {
        throw new Error(`Google Sheets 访问被拒绝: ${error.message}。请检查您是否有该 Sheet 的编辑权限。`);
      }
      if (error.code === 404) {
        throw new Error(`找不到指定的 Google Sheets，请检查 URL 是否正确。`);
      }

      throw error;
    }
  }

  /**
   * 读取问题回复
   * 从指定 Sheet 读取，解析"回复"列
   * @param {string} sheetsUrl - Sheets URL
   * @param {Object} options - 选项
   *   - sheetName: 指定 Sheet tab 名称
   *   - iteration: 迭代轮次（用于确定 tab 名称）
   */
  async readReplies(sheetsUrl, options = {}) {
    const sheetName = options.sheetName || `${options.moduleName || '未命名'}-规格问题`;

    const result = await this.readSheet(sheetsUrl, {
      sheetName,
      columnMapping: {
        '序号': 'id',
        '需求编号': 'reqId',
        '分类': 'category',
        '问题描述': 'question',
        '严重程度': 'severity',
        '状态': 'status',
        '回复': 'reply',
        '建议': 'suggestion',
      },
    });

    if (!result.success) {
      return result;
    }

    // 筛选有回复的行
    const replies = result.data.filter(row => row.reply && row.reply.trim() !== '');

    return {
      success: true,
      totalQuestions: result.data.length,
      repliedQuestions: replies.length,
      data: result.data, // 包含所有行（回复和未回复的）
      replies, // 仅已回复的行
    };
  }

  /**
   * 读取已确认的共通问题
   * 从指定 Sheet 筛选状态为"已确认"的问题
   */
  async readConfirmedIssues(sheetsUrl, options = {}) {
    const result = await this.readSheet(sheetsUrl, options);

    if (!result.success) {
      console.error(`[SheetsManager] 读取已确认问题失败: ${result.error}`);
      return result;
    }

    // 筛选已确认状态的问题（宽松匹配，支持简繁体中文和英文）
    const confirmed = result.data.filter(row => {
      const status = (row.status || '').toString().trim();
      const normalized = status.toLowerCase();
      // 简体：已确认/已解决/完成/闭环/已关闭
      // 繁体：已確認/已解決/閉環/已關閉
      // 英文：confirmed/resolved/completed/closed/done
      return [
        '已确认', '已確認', 'confirmed', 'resolved', '已解决', '已解決',
        '完成', 'completed', '闭环', '閉環', 'closed', 'done', '已关闭', '已關閉',
      ].some(s => normalized === s.toLowerCase());
    });

    // 如果没有匹配到任何"已确认"状态的问题，但有数据行，
    // 则返回全部数据（可能 Sheet 没有"状态"列或使用其他状态值）
    const finalData = confirmed.length > 0 ? confirmed : result.data;

    console.log(`[SheetsManager] 已确认问题: 总${result.data.length}条, 状态匹配${confirmed.length}条, 最终返回${finalData.length}条`);

    return {
      success: true,
      totalIssues: result.data.length,
      confirmedIssues: confirmed.length,
      data: finalData,
    };
  }

  /**
   * 追加行到 Sheet
   */
  async appendRows(sheetsUrl, rows, options = {}) {
    const client = await this.authManager.getAuthenticatedClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const { spreadsheetId } = this.parseSheetsUrl(sheetsUrl);
    const sheetName = options.sheetName || 'Sheet1';

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rows },
    });

    return { success: true, rowsAppended: rows.length };
  }
}

module.exports = GoogleSheetsManager;