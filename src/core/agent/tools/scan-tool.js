/**
 * Scan Tool
 *
 * Wraps the existing CodeScanner module for Agent use.
 * Scans files and directories for code quality issues.
 */

const BaseTool = require('./base-tool');

class ScanTool extends BaseTool {
  constructor(codeScanner) {
    super(
      'scan',
      'Scan code files and directories for quality issues based on configured rules',
      [
        {
          name: 'targetPath',
          type: 'string',
          description: 'Path to the file or directory to scan',
          required: true
        },
        {
          name: 'targetType',
          type: 'string',
          description: 'Type of target: "file" or "directory"',
          required: false,
          default: 'auto'
        },
        {
          name: 'excludeDirs',
          type: 'array',
          description: 'Directory names to exclude from scan',
          required: false,
          default: ['node_modules', '.git', 'dist', 'build', 'coverage']
        },
        {
          name: 'excludeFiles',
          type: 'array',
          description: 'File patterns to exclude from scan',
          required: false,
          default: ['.min.js', '.min.css']
        }
      ]
    );
    this.codeScanner = codeScanner;
  }

  /**
   * Execute scan operation
   */
  async execute(params, context) {
    const { targetPath, targetType = 'auto', excludeDirs, excludeFiles } = params;

    // Validate
    const validation = this.validate(params);
    if (!validation.valid) {
      return this.error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      // Detect target type if auto
      let type = targetType;
      if (type === 'auto') {
        const fs = require('fs');
        const stats = fs.statSync(targetPath);
        type = stats.isDirectory() ? 'directory' : 'file';
      }

      // Execute scan
      let results;
      if (type === 'file') {
        results = await this.codeScanner.scanFile(targetPath);
        results = [results];
      } else {
        results = await this.codeScanner.scanDirectory(targetPath, {
          excludeDirs: excludeDirs || this.parameters[2].default,
          excludeFiles: excludeFiles || this.parameters[3].default
        });
      }

      // Format results
      const formatted = this.codeScanner.formatResults(results);

      // Update context with scan results
      if (context) {
        context.lastScanResults = formatted;
        context.lastScanPath = targetPath;
      }

      return this.success({
        target: { path: targetPath, type },
        summary: formatted.summary,
        totalFiles: formatted.totalFiles,
        filesWithIssues: formatted.filesWithIssues,
        totalIssues: formatted.totalIssues,
        issuesBySeverity: formatted.issuesBySeverity,
        issues: formatted.issues,
        rawResults: results
      });
    } catch (error) {
      return this.error(`Scan failed: ${error.message}`);
    }
  }
}

module.exports = ScanTool;
