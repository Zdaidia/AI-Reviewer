/**
 * Diff Viewer
 *
 * Generates and displays code diffs for AI fixes
 */

class DiffViewer {
  /**
   * Generate unified diff
   * @param {string} original - Original content
   * @param {string} modified - Modified content
   * @param {string} filePath - File path
   * @returns {Object} Diff object
   */
  generateDiff(original, modified, filePath) {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');

    const hunks = this.computeHunks(originalLines, modifiedLines);

    return {
      filePath,
      original,
      modified,
      hunks,
      stats: {
        additions: hunks.reduce((sum, h) => sum + h.additions, 0),
        deletions: hunks.reduce((sum, h) => sum + h.deletions, 0),
        modifications: hunks.reduce((sum, h) => sum + h.modifications, 0),
      },
    };
  }

  /**
   * Compute diff hunks using simple line-by-line comparison
   * @param {Array} originalLines - Original lines
   * @param {Array} modifiedLines - Modified lines
   * @returns {Array} Array of hunks
   */
  computeHunks(originalLines, modifiedLines) {
    const hunks = [];
    const maxLines = Math.max(originalLines.length, modifiedLines.length);
    let currentHunk = null;
    let hunkIndex = 0;

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];
      const lineNum = i + 1;

      let changeType = null;
      if (originalLine === undefined) {
        changeType = 'add';
      } else if (modifiedLine === undefined) {
        changeType = 'delete';
      } else if (originalLine !== modifiedLine) {
        changeType = 'modify';
      }

      if (changeType) {
        if (!currentHunk) {
          currentHunk = {
            index: hunkIndex++,
            originalStart: lineNum,
            modifiedStart: lineNum,
            lines: [],
            additions: 0,
            deletions: 0,
            modifications: 0,
          };
        }

        currentHunk.lines.push({
          type: changeType,
          originalNumber: originalLine ? lineNum : null,
          modifiedNumber: modifiedLine ? lineNum : null,
          original: originalLine || '',
          modified: modifiedLine || '',
        });

        if (changeType === 'add') currentHunk.additions++;
        if (changeType === 'delete') currentHunk.deletions++;
        if (changeType === 'modify') currentHunk.modifications++;
      } else {
        // Add context line if there's an active hunk
        if (currentHunk) {
          currentHunk.lines.push({
            type: 'context',
            originalNumber: lineNum,
            modifiedNumber: lineNum,
            original: originalLine,
            modified: modifiedLine,
          });

          // Close hunk if we have enough context after changes
          const contextLines = currentHunk.lines.filter(l => l.type === 'context');
          if (contextLines.length >= 3) {
            hunks.push(currentHunk);
            currentHunk = null;
          }
        }
      }
    }

    // Push remaining hunk
    if (currentHunk) {
      hunks.push(currentHunk);
    }

    return hunks;
  }

  /**
   * Format diff for display
   * @param {Object} diff - Diff object
   * @returns {string} Formatted diff string
   */
  formatDiff(diff) {
    let output = `--- a/${diff.filePath}\n`;
    output += `+++ b/${diff.filePath}\n`;

    for (const hunk of diff.hunks) {
      output += `@@ -${hunk.originalStart},${hunk.lines.length} +${hunk.modifiedStart},${hunk.lines.length} @@\n`;

      for (const line of hunk.lines) {
        switch (line.type) {
          case 'add':
            output += `+${line.modified}\n`;
            break;
          case 'delete':
            output += `-${line.original}\n`;
            break;
          case 'modify':
            output += `-${line.original}\n`;
            output += `+${line.modified}\n`;
            break;
          case 'context':
            output += ` ${line.original}\n`;
            break;
        }
      }
    }

    return output;
  }

  /**
   * Format diff for HTML rendering
   * @param {Object} diff - Diff object
   * @returns {Array} Array of formatted lines
   */
  formatForHTML(diff) {
    const lines = [];

    for (const hunk of diff.hunks) {
      // Add hunk header
      lines.push({
        type: 'hunk-header',
        content: `@@ -${hunk.originalStart},${hunk.lines.length} +${hunk.modifiedStart},${hunk.lines.length} @@`,
      });

      for (const line of hunk.lines) {
        lines.push({
          type: line.type,
          originalNumber: line.originalNumber,
          modifiedNumber: line.modifiedNumber,
          original: line.original,
          modified: line.modified,
        });
      }
    }

    return lines;
  }

  /**
   * Apply diff to original content
   * @param {string} original - Original content
   * @param {Object} diff - Diff object
   * @param {boolean} accepted - Whether to accept the diff
   * @returns {string} Modified content
   */
  applyDiff(original, diff, accepted = true) {
    if (!accepted) {
      return original;
    }

    // For now, just return the modified content from diff
    // A more sophisticated implementation would apply patches
    return diff.modified;
  }

  /**
   * Generate inline diff for a single line
   * @param {string} original - Original line
   * @param {string} modified - Modified line
   * @returns {Object} Inline diff
   */
  generateInlineDiff(original, modified) {
    const changes = [];
    let i = 0;
    let j = 0;

    while (i < original.length || j < modified.length) {
      if (i < original.length && j < modified.length && original[i] === modified[j]) {
        changes.push({ type: 'same', value: original[i] });
        i++;
        j++;
      } else {
        // Find the longest common subsequence for the rest
        const lcs = this.findLCS(original.slice(i), modified.slice(j));

        // Handle deletions
        while (i < original.length && (j >= modified.length || original[i] !== modified[j])) {
          changes.push({ type: 'delete', value: original[i] });
          i++;
        }

        // Handle additions
        while (j < modified.length && (i >= original.length || original[i] !== modified[j])) {
          changes.push({ type: 'add', value: modified[j] });
          j++;
        }
      }
    }

    return { original, modified, changes };
  }

  /**
   * Find longest common subsequence
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {string} LCS
   */
  findLCS(a, b) {
    const dp = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(''));

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + a[i - 1];
        } else {
          dp[i][j] = dp[i - 1][j].length > dp[i][j - 1].length ? dp[i - 1][j] : dp[i][j - 1];
        }
      }
    }

    return dp[a.length][b.length];
  }

  /**
   * Generate summary text for diff
   * @param {Object} diff - Diff object
   * @returns {string} Summary text
   */
  generateSummary(diff) {
    const { stats } = diff;
    const parts = [];

    if (stats.additions > 0) {
      parts.push(`${stats.additions} addition${stats.additions > 1 ? 's' : ''}`);
    }
    if (stats.deletions > 0) {
      parts.push(`${stats.deletions} deletion${stats.deletions > 1 ? 's' : ''}`);
    }
    if (stats.modifications > 0) {
      parts.push(`${stats.modifications} modification${stats.modifications > 1 ? 's' : ''}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No changes';
  }
}

module.exports = DiffViewer;
