/**
 * Google Drive 文件管理器
 *
 * 负责从 Google Drive 获取文件：
 * - 搜索文件（PDF/DOCX/XLSX等）
 * - 下载文件到本地临时目录
 * - 解析文件内容
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');

class GoogleDriveManager {
  constructor(authManager) {
    this.authManager = authManager;
    this.tempDir = path.join(os.tmpdir(), 'dqi-drive-files');
  }

  /**
   * 确保临时目录存在
   */
  _ensureTempDir() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 在 Drive 中搜索文件
   * @param {string} query - 搜索关键词
   * @param {Object} options - 选项
   *   - mimeType: 文件类型过滤
   *   - maxResults: 最大结果数
   */
  async searchFiles(query, options = {}) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    // 构建搜索条件
    let q = '';
    if (query) {
      q += `name contains '${query}'`;
    }

    // 按文件类型过滤
    if (options.mimeType) {
      const mimeTypes = {
        pdf: "mimeType='application/pdf'",
        docx: "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
        xlsx: "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
        sheet: "mimeType='application/vnd.google-apps.spreadsheet'",
        doc: "mimeType='application/vnd.google-apps.document'",
      };
      if (q) q += ' and ';
      q += mimeTypes[options.mimeType] || `mimeType='${options.mimeType}'`;
    }

    const response = await drive.files.list({
      q: q || undefined,
      pageSize: options.maxResults || 20,
      fields: 'files(id, name, mimeType, modifiedTime, size, webContentLink)',
      orderBy: 'modifiedByMeTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    const files = response.data.files || [];

    return {
      success: true,
      totalFiles: files.length,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        size: f.size,
        downloadUrl: f.webContentLink,
        type: this._inferFileType(f.mimeType),
      })),
    };
  }

  /**
   * 列出最近修改的文件
   */
  async listRecentFiles(options = {}) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    const response = await drive.files.list({
      pageSize: options.maxResults || 10,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedByMeTime desc',
      q: "trashed=false",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
    });

    const files = response.data.files || [];

    return {
      success: true,
      totalFiles: files.length,
      files: files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        modifiedTime: f.modifiedTime,
        type: this._inferFileType(f.mimeType),
      })),
    };
  }

  /**
   * 列出 Drive 根目录下的文件夹 + 共享 Drive + "与我共享"的文件夹
   * @param {Object} options - 选项
   *   - maxResults: 最大结果数
   */
  async listRootFolders(options = {}) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    // 1. 个人 Drive 根目录下的文件夹
    const personalResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents",
      pageSize: options.maxResults || 50,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    // 2. 共享 Drive 列表
    let sharedDrives = [];
    try {
      const sharedDrivesResponse = await drive.drives.list({
        pageSize: options.maxResults || 50,
        fields: 'drives(id, name)',
      });
      sharedDrives = (sharedDrivesResponse.data.drives || []).map(d => ({
        id: d.id,
        name: d.name,
        modifiedTime: null,
        isSharedDrive: true,
        isSharedWithMe: false,
      }));
    } catch (e) {
      console.warn('[DriveManager] 获取共享 Drive 列表失败:', e.message);
    }

    // 3. "与我共享"的文件夹（别人直接共享给用户的，不在 root 下）
    let sharedWithMeFolders = [];
    try {
      const sharedWithMeResponse = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and trashed=false and sharedWithMe",
        pageSize: options.maxResults || 50,
        fields: 'files(id, name, mimeType, modifiedTime, sharingUser)',
        orderBy: 'name',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives',
      });
      sharedWithMeFolders = (sharedWithMeResponse.data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
        isSharedDrive: false,
        isSharedWithMe: true,
        sharingUser: f.sharingUser?.displayName || '',
      }));
    } catch (e) {
      console.warn('[DriveManager] 获取"与我共享"文件夹失败:', e.message);
    }

    const personalFolders = (personalResponse.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      isSharedDrive: false,
      isSharedWithMe: false,
    }));

    return {
      success: true,
      folders: [...personalFolders, ...sharedWithMeFolders, ...sharedDrives],
    };
  }

  /**
   * 浏览共享 Drive 根目录内容
   * 共享 Drive 的 driveId 不同于文件夹 ID，需要先获取 rootFolderId
   * @param {string} driveId - 共享 Drive ID（来自 drives.list）
   */
  async browseSharedDriveRoot(driveId) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    // 获取共享 Drive 名称（共享 Drive 的根文件夹 ID 就是 driveId 本身）
    const driveInfo = await drive.drives.get({
      driveId,
      fields: 'id, name',
    });

    // 共享 Drive 根文件夹 ID = driveId
    const rootFolderId = driveId;

    // 列出根文件夹内容
    const q = `'${rootFolderId}' in parents and trashed=false`;
    const response = await drive.files.list({
      q,
      pageSize: 100,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      orderBy: 'name',
      corpora: 'drive',
      driveId,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = (response.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      size: f.size,
      type: this._inferFileType(f.mimeType),
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    return {
      success: true,
      folderId: rootFolderId,
      driveId,
      driveName: driveInfo.data.name,
      totalFiles: files.length,
      files,
    };
  }

  /**
   * 列出指定文件夹内的文件和子文件夹
   * @param {string} folderId - 文件夹 ID
   * @param {Object} options - 选项
   *   - maxResults: 最大结果数
   *   - mimeType: 按类型过滤(pdf/docx/xlsx/sheet/doc)
   *   - driveId: 共享 Drive ID（在共享 Drive 内浏览时需要传入）
   */
  async listFilesInFolder(folderId, options = {}) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    let q = `'${folderId}' in parents and trashed=false`;

    // 按文件类型过滤
    if (options.mimeType) {
      const mimeMap = {
        pdf: "mimeType='application/pdf'",
        docx: "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
        xlsx: "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'",
        sheet: "mimeType='application/vnd.google-apps.spreadsheet'",
        doc: "mimeType='application/vnd.google-apps.document'",
      };
      if (mimeMap[options.mimeType]) {
        q += ` and ${mimeMap[options.mimeType]}`;
      }
    }

    const listParams = {
      q,
      pageSize: options.maxResults || 100,
      fields: 'files(id, name, mimeType, modifiedTime, size)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    };

    // 在共享 Drive 内浏览时，需要指定 corpora 和 driveId
    if (options.driveId) {
      listParams.corpora = 'drive';
      listParams.driveId = options.driveId;
    }

    const response = await drive.files.list(listParams);

    const files = (response.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      modifiedTime: f.modifiedTime,
      size: f.size,
      type: this._inferFileType(f.mimeType),
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }));

    return {
      success: true,
      folderId,
      totalFiles: files.length,
      files,
    };
  }

  /**
   * 下载 Drive 文件并解析内容
   * @param {string} fileId - Drive 文件 ID
   * @returns {Promise<Object>} 文件内容和解析结果
   */
  async downloadAndParse(fileId) {
    const client = await this.authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth: client });

    // 1. 获取文件元数据
    const metadata = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });

    const fileName = metadata.data.name;
    const mimeType = metadata.data.mimeType;
    const fileType = this._inferFileType(mimeType);

    this._ensureTempDir();

    // 2. 对于 Google Docs/Sheets 格式，需要导出
    if (mimeType === 'application/vnd.google-apps.document') {
      // Google Docs → 导出为 DOCX
      const exportMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const destPath = path.join(this.tempDir, `${fileId}.docx`);
      await this._exportFile(drive, fileId, exportMime, destPath);
      const content = await this._parseDocx(destPath);
      return { success: true, fileName, fileType: 'docx', content, filePath: destPath };

    } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets → 导出为 XLSX
      const exportMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const destPath = path.join(this.tempDir, `${fileId}.xlsx`);
      await this._exportFile(drive, fileId, exportMime, destPath);
      const content = await this._parseXlsx(destPath);
      return { success: true, fileName, fileType: 'xlsx', content, filePath: destPath };

    } else {
      // 非 Google 格式，直接下载
      const destPath = path.join(this.tempDir, fileName);
      await this._downloadFile(drive, fileId, destPath);

      // 3. 根据文件类型解析内容
      if (fileType === 'pdf') {
        const content = await this._parsePdf(destPath);
        return { success: true, fileName, fileType, content, filePath: destPath };
      } else if (fileType === 'docx') {
        const content = await this._parseDocx(destPath);
        return { success: true, fileName, fileType, content, filePath: destPath };
      } else if (fileType === 'xlsx') {
        const content = await this._parseXlsx(destPath);
        return { success: true, fileName, fileType, content, filePath: destPath };
      } else if (fileType === 'txt' || fileType === 'md') {
        const content = fs.readFileSync(destPath, 'utf8');
        return { success: true, fileName, fileType, content, filePath: destPath };
      } else {
        return { success: true, fileName, fileType, content: '(不支持解析此文件类型)', filePath: destPath };
      }
    }
  }

  /**
   * 导出 Google Docs/Sheets 文件到指定格式
   */
  async _exportFile(drive, fileId, exportMime, destPath) {
    const response = await drive.files.export({
      fileId,
      mimeType: exportMime,
      supportsAllDrives: true,
    }, { responseType: 'stream' });

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      response.data
        .on('end', () => resolve(destPath))
        .on('error', reject)
        .pipe(dest);
    });
  }

  /**
   * 直接下载文件
   */
  async _downloadFile(drive, fileId, destPath) {
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(destPath);
      response.data
        .on('end', () => resolve(destPath))
        .on('error', reject)
        .pipe(dest);
    });
  }

  /**
   * 解析 PDF 文件内容
   */
  async _parsePdf(filePath) {
    try {
      // pdf-parse v2.x polyfill（同 req-analyzer.js）
      if (typeof globalThis.DOMMatrix === 'undefined') {
        try {
          const { DOMMatrix } = require('dommatrix');
          globalThis.DOMMatrix = DOMMatrix;
        } catch (e) {
          globalThis.DOMMatrix = class DOMMatrix {
            constructor(init) { this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0; }
            is2D() { return true; }
            isIdentity() { return this.a === 1 && this.d === 1 && this.e === 0 && this.f === 0; }
          };
        }
      }
      if (typeof globalThis.ImageData === 'undefined') {
        globalThis.ImageData = class ImageData {
          constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
        };
      }
      if (typeof globalThis.Path2D === 'undefined') {
        globalThis.Path2D = class Path2D {
          constructor() { this.ops = []; }
          addPath() {} moveTo() {} lineTo() {} closePath() {}
        };
      }
      const { PDFParse } = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      await parser.load();
      const result = await parser.getText();
      return result.text;
    } catch (e) {
      console.warn(`[DriveManager] PDF 解析失败: ${e.message}`);
      return `(PDF 解析失败: ${e.message})`;
    }
  }

  /**
   * 解析 DOCX 文件内容
   */
  async _parseDocx(filePath) {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (e) {
      console.warn(`[DriveManager] DOCX 解析失败: ${e.message}`);
      return `(DOCX 解析失败: ${e.message})`;
    }
  }

  /**
   * 解析 XLSX 文件内容
   */
  async _parseXlsx(filePath) {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(filePath);
      const result = {};

      workbook.SheetNames.forEach(name => {
        const sheet = workbook.Sheets[name];
        result[name] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      });

      return JSON.stringify(result, null, 2);
    } catch (e) {
      console.warn(`[DriveManager] XLSX 解析失败: ${e.message}`);
      return `(XLSX 解析失败: ${e.message})`;
    }
  }

  /**
   * 根据 mimeType 推断文件类型
   */
  _inferFileType(mimeType) {
    const map = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/plain': 'txt',
      'text/markdown': 'md',
      'application/vnd.google-apps.document': 'doc',
      'application/vnd.google-apps.spreadsheet': 'sheet',
      'application/vnd.google-apps.presentation': 'slides',
    };
    return map[mimeType] || 'download';
  }

  /**
   * 清理临时文件
   */
  cleanup() {
    if (fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[DriveManager] 清理临时文件失败: ${e.message}`);
      }
    }
  }
}

module.exports = GoogleDriveManager;