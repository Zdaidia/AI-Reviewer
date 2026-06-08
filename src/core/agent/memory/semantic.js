/**
 * Semantic Memory
 *
 * Stores and retrieves knowledge about code patterns, issues, and solutions.
 * Provides semantic search and knowledge base capabilities.
 */

const fs = require('fs');
const path = require('path');

class SemanticMemory {
  constructor(options = {}) {
    this.options = {
      maxEntries: options.maxEntries || 5000,
      persistToFile: options.persistToFile !== false,
      storagePath: options.storagePath || path.join(process.cwd(), '.agent-memory'),
      ...options
    };

    this.knowledge = new Map();
    this.embeddings = null; // Lazy load
    this.load();
  }

  /**
   * Store code pattern or knowledge
   */
  store(key, value, metadata = {}) {
    const entry = {
      key,
      value,
      metadata,
      timestamp: new Date().toISOString(),
      accessCount: 0,
      lastAccessed: null
    };

    this.knowledge.set(key, entry);

    // Persist if needed
    if (this.options.persistToFile) {
      this.save();
    }

    return entry;
  }

  /**
   * Retrieve a value by key
   */
  retrieve(key) {
    const entry = this.knowledge.get(key);

    if (entry) {
      entry.accessCount++;
      entry.lastAccessed = new Date().toISOString();
      return entry;
    }

    return null;
  }

  /**
   * Check if a key exists
   */
  has(key) {
    return this.knowledge.has(key);
  }

  /**
   * Delete a key
   */
  delete(key) {
    const deleted = this.knowledge.delete(key);

    if (deleted && this.options.persistToFile) {
      this.save();
    }

    return deleted;
  }

  /**
   * Search by key pattern
   */
  searchByPattern(pattern) {
    const regex = new RegExp(pattern, 'i');
    const results = [];

    for (const [key, entry] of this.knowledge.entries()) {
      if (regex.test(key)) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Search by metadata
   */
  searchByMetadata(metadataQuery) {
    const results = [];

    for (const entry of this.knowledge.values()) {
      let match = true;

      for (const [key, value] of Object.entries(metadataQuery)) {
        if (entry.metadata[key] !== value) {
          match = false;
          break;
        }
      }

      if (match) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Store code analysis result
   */
  storeCodeAnalysis(filePath, analysis) {
    return this.store(
      `code:${filePath}`,
      analysis,
      {
        type: 'code_analysis',
        filePath,
        language: analysis.language
      }
    );
  }

  /**
   * Get code analysis for a file
   */
  getCodeAnalysis(filePath) {
    return this.retrieve(`code:${filePath}`);
  }

  /**
   * Store issue pattern
   */
  storeIssuePattern(ruleId, pattern) {
    return this.store(
      `issue:${ruleId}`,
      pattern,
      {
        type: 'issue_pattern',
        ruleId,
        severity: pattern.severity
      }
    );
  }

  /**
   * Get issue pattern
   */
  getIssuePattern(ruleId) {
    return this.retrieve(`issue:${ruleId}`);
  }

  /**
   * Store solution pattern
   */
  storeSolution(ruleId, solution) {
    return this.store(
      `solution:${ruleId}`,
      solution,
      {
        type: 'solution',
        ruleId,
        autoFixable: solution.autoFixable
      }
    );
  }

  /**
   * Get solution for an issue
   */
  getSolution(ruleId) {
    return this.retrieve(`solution:${ruleId}`);
  }

  /**
   * Store project context
   */
  storeProjectContext(projectPath, context) {
    return this.store(
      `project:${projectPath}`,
      context,
      {
        type: 'project_context',
        projectPath,
        lastUpdated: new Date().toISOString()
      }
    );
  }

  /**
   * Get project context
   */
  getProjectContext(projectPath) {
    return this.retrieve(`project:${projectPath}`);
  }

  /**
   * Store dependency info
   */
  storeDependency(filePath, dependencies) {
    return this.store(
      `deps:${filePath}`,
      dependencies,
      {
        type: 'dependencies',
        filePath
      }
    );
  }

  /**
   * Get dependency info
   */
  getDependency(filePath) {
    return this.retrieve(`deps:${filePath}`);
  }

  /**
   * Store code graph for a project
   * @param {string} projectPath - Project root path
   * @param {Object} codeGraph - Generated code graph
   * @param {Object} metadata - Additional metadata
   */
  storeCodeGraph(projectPath, codeGraph, metadata = {}) {
    return this.store(
      `graph:${projectPath}`,
      codeGraph,
      {
        type: 'code_graph',
        projectPath,
        generatedAt: codeGraph.metadata?.generatedAt || new Date().toISOString(),
        totalNodes: codeGraph.metadata?.totalNodes || 0,
        totalEdges: codeGraph.metadata?.totalEdges || 0,
        languages: codeGraph.metadata?.languages || [],
        ...metadata
      }
    );
  }

  /**
   * Get code graph for a project
   * @param {string} projectPath - Project root path
   * @returns {Object} Code graph entry
   */
  getCodeGraph(projectPath) {
    return this.retrieve(`graph:${projectPath}`);
  }

  /**
   * Store file structure
   * @param {string} projectPath - Project root path
   * @param {Object} fileStructure - File structure tree
   */
  storeFileStructure(projectPath, fileStructure) {
    return this.store(
      `structure:${projectPath}`,
      fileStructure,
      {
        type: 'file_structure',
        projectPath,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Get file structure for a project
   * @param {string} projectPath - Project root path
   * @returns {Object} File structure entry
   */
  getFileStructure(projectPath) {
    return this.retrieve(`structure:${projectPath}`);
  }

  /**
   * Store dependency analysis result
   * @param {string} projectPath - Project root path
   * @param {Object} analysis - Dependency analysis result
   */
  storeDependencyAnalysis(projectPath, analysis) {
    return this.store(
      `dep-analysis:${projectPath}`,
      analysis,
      {
        type: 'dependency_analysis',
        projectPath,
        timestamp: new Date().toISOString()
      }
    );
  }

  /**
   * Get dependency analysis for a project
   * @param {string} projectPath - Project root path
   * @returns {Object} Dependency analysis entry
   */
  getDependencyAnalysis(projectPath) {
    return this.retrieve(`dep-analysis:${projectPath}`);
  }

  /**
   * Store scan results with AST info
   * @param {string} projectPath - Project root path
   * @param {Object} scanResults - Complete scan results
   */
  storeScanResults(projectPath, scanResults) {
    // Store code graph if available
    if (scanResults.codeGraph && !scanResults.codeGraph.error) {
      this.storeCodeGraph(projectPath, scanResults.codeGraph, {
        totalFiles: scanResults.totalFiles,
        filesWithIssues: scanResults.filesWithIssues
      });
    }

    // Store AST stats
    if (scanResults.astStats) {
      this.store(
        `ast-stats:${projectPath}`,
        scanResults.astStats,
        {
          type: 'ast_statistics',
          projectPath,
          timestamp: new Date().toISOString()
        }
      );
    }

    // Store summary
    return this.store(
      `scan-summary:${projectPath}`,
      {
        totalFiles: scanResults.totalFiles,
        filesWithIssues: scanResults.filesWithIssues,
        totalIssues: scanResults.totalIssues,
        issuesBySeverity: scanResults.issuesBySeverity,
        timestamp: new Date().toISOString()
      },
      {
        type: 'scan_summary',
        projectPath
      }
    );
  }

  /**
   * Get scan results summary for a project
   * @param {string} projectPath - Project root path
   * @returns {Object} Scan summary entry
   */
  getScanSummary(projectPath) {
    return this.retrieve(`scan-summary:${projectPath}`);
  }

  /**
   * Search for files by function name
   * @param {string} functionName - Function name to search
   * @returns {Array} Matching files
   */
  searchByFunction(functionName) {
    const results = [];

    for (const [key, entry] of this.knowledge.entries()) {
      if (entry.metadata.type === 'code_graph') {
        const graph = entry.value;
        if (graph.nodes) {
          const matchingNodes = graph.nodes.filter(
            n => n.type === 'function' && n.name === functionName
          );
          for (const node of matchingNodes) {
            const fileNode = graph.nodes.find(n => n.id === node.fileId);
            if (fileNode) {
              results.push({
                file: fileNode.filePath,
                function: node.name,
                line: node.line
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Search for files by class name
   * @param {string} className - Class name to search
   * @returns {Array} Matching files
   */
  searchByClass(className) {
    const results = [];

    for (const [key, entry] of this.knowledge.entries()) {
      if (entry.metadata.type === 'code_graph') {
        const graph = entry.value;
        if (graph.nodes) {
          const matchingNodes = graph.nodes.filter(
            n => n.type === 'class' && n.name === className
          );
          for (const node of matchingNodes) {
            const fileNode = graph.nodes.find(n => n.id === node.fileId);
            if (fileNode) {
              results.push({
                file: fileNode.filePath,
                class: node.name,
                superClass: node.superClass,
                line: node.line
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Find all API endpoints in a project
   * @param {string} projectPath - Project root path
   * @returns {Array} API endpoints
   */
  findApiEndpoints(projectPath) {
    const graphEntry = this.getCodeGraph(projectPath);
    if (!graphEntry) return [];

    const graph = graphEntry.value;
    const endpoints = [];

    // Find route nodes
    if (graph.nodes) {
      const routeNodes = graph.nodes.filter(n => n.type === 'route');
      for (const routeNode of routeNodes) {
        const fileNode = graph.nodes.find(n => n.id === routeNode.fileId);
        endpoints.push({
          path: routeNode.path,
          file: fileNode?.filePath,
          line: routeNode.line
        });
      }
    }

    // Find API calls
    if (graph.nodes) {
      const apiCallNodes = graph.nodes.filter(n => n.type === 'api_call');
      for (const apiNode of apiCallNodes) {
        const fileNode = graph.nodes.find(n => n.id === apiNode.fileId);
        endpoints.push({
          type: apiNode.apiType,
          method: apiNode.method,
          file: fileNode?.filePath,
          line: apiNode.line
        });
      }
    }

    return endpoints;
  }

  /**
   * Get project overview from knowledge base
   * @param {string} projectPath - Project root path
   * @returns {Object} Project overview
   */
  getProjectOverview(projectPath) {
    const overview = {
      projectPath,
      scan: this.getScanSummary(projectPath)?.value,
      fileStructure: this.getFileStructure(projectPath)?.value,
      dependencyAnalysis: this.getDependencyAnalysis(projectPath)?.value,
      codeGraph: this.getCodeGraph(projectPath)?.value,
    };

    return overview;
  }

  /**
   * Find similar code patterns (keyword-based)
   */
  findSimilarCode(query) {
    const keywords = query.toLowerCase().split(/\s+/);
    const results = [];

    for (const [key, entry] of this.knowledge.entries()) {
      if (entry.metadata.type === 'code_analysis') {
        const valueStr = JSON.stringify(entry.value).toLowerCase();
        const matchCount = keywords.filter(kw => valueStr.includes(kw)).length;

        if (matchCount > 0) {
          results.push({ entry, score: matchCount / keywords.length });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 10).map(r => r.entry);
  }

  /**
   * Get all entries of a specific type
   */
  getByType(type) {
    const results = [];

    for (const entry of this.knowledge.values()) {
      if (entry.metadata.type === type) {
        results.push(entry);
      }
    }

    return results;
  }

  /**
   * Get statistics
   */
  getStats() {
    const typeCounts = {};

    for (const entry of this.knowledge.values()) {
      const type = entry.metadata.type || 'unknown';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    const accessCounts = Array.from(this.knowledge.values())
      .map(e => e.accessCount);

    return {
      totalEntries: this.knowledge.size,
      typeCounts,
      totalAccess: accessCounts.reduce((a, b) => a + b, 0),
      averageAccess: accessCounts.length > 0
        ? accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length
        : 0,
      mostAccessed: this.getMostAccessed(5)
    };
  }

  /**
   * Get most accessed entries
   */
  getMostAccessed(limit = 10) {
    const entries = Array.from(this.knowledge.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries.map(e => ({
      key: e.key,
      accessCount: e.accessCount,
      type: e.metadata.type
    }));
  }

  /**
   * Prune old or rarely accessed entries
   */
  prune() {
    const entries = Array.from(this.knowledge.entries());

    // Sort by access count and time
    entries.sort((a, b) => {
      const scoreA = this.calculatePruneScore(a[1]);
      const scoreB = this.calculatePruneScore(b[1]);
      return scoreB - scoreA;
    });

    // Keep top entries
    this.knowledge = new Map(entries.slice(0, this.options.maxEntries));
  }

  /**
   * Calculate score for pruning (higher = keep)
   */
  calculatePruneScore(entry) {
    let score = entry.accessCount * 10;

    // Boost recent entries
    const age = Date.now() - new Date(entry.timestamp).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);
    score += Math.max(0, 100 - daysOld);

    return score;
  }

  /**
   * Save to disk
   */
  save() {
    try {
      if (!fs.existsSync(this.options.storagePath)) {
        fs.mkdirSync(this.options.storagePath, { recursive: true });
      }

      const filePath = path.join(this.options.storagePath, 'semantic.json');
      const data = Array.from(this.knowledge.entries());
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save semantic memory:', error.message);
    }
  }

  /**
   * Load from disk
   */
  load() {
    try {
      const filePath = path.join(this.options.storagePath, 'semantic.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.knowledge = new Map(parsed);

        // Prune if over limit
        if (this.knowledge.size > this.options.maxEntries) {
          this.prune();
        }
      }
    } catch (error) {
      console.error('Failed to load semantic memory:', error.message);
      this.knowledge = new Map();
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    this.knowledge.clear();

    if (this.options.persistToFile) {
      const filePath = path.join(this.options.storagePath, 'semantic.json');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  /**
   * Export to JSON
   */
  export() {
    return {
      stats: this.getStats(),
      entries: Array.from(this.knowledge.entries()).map(([key, entry]) => ({
        key,
        ...entry
      }))
    };
  }

  /**
   * Import from JSON
   */
  import(data) {
    if (data.entries) {
      for (const entry of data.entries) {
        const { key, ...rest } = entry;
        this.knowledge.set(key, rest);
      }
    }

    if (this.options.persistToFile) {
      this.save();
    }
  }
}

module.exports = SemanticMemory;
