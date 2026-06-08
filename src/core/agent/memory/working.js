/**
 * Working Memory
 *
 * Manages the current task context and temporary state.
 * Provides a scratchpad for Agent operations.
 */

class WorkingMemory {
  constructor() {
    this.clear();
  }

  /**
   * Clear all working memory
   */
  clear() {
    this.state = {
      // Current task info
      currentTask: null,
      currentPlan: null,
      currentStep: null,

      // User context
      userRequest: null,
      originalRequest: null,

      // File context
      currentFile: null,
      currentProject: null,

      // Scan results
      lastScanResults: null,
      lastScanPath: null,

      // Fix results
      lastFixResult: null,
      pendingAIFixes: [],
      issuesFixed: 0,

      // Test results
      testResults: [],
      runningTests: [],

      // Project execution
      runningProjects: [],

      // Agent status
      agentStatus: 'idle',
      agentMessage: '',
      progress: 0,

      // Error tracking
      errors: [],
      warnings: [],

      // Tool outputs
      toolOutputs: [],

      // Metadata
      metadata: {},

      // Timestamps
      startTime: null,
      lastUpdate: null
    };
  }

  /**
   * Set the current user request
   */
  setUserRequest(request) {
    this.state.userRequest = request;
    this.state.originalRequest = this.state.originalRequest || request;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the original user request
   */
  getOriginalRequest() {
    return this.state.originalRequest;
  }

  /**
   * Set the current task
   */
  setCurrentTask(task) {
    this.state.currentTask = task;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current task
   */
  getCurrentTask() {
    return this.state.currentTask;
  }

  /**
   * Set the current plan
   */
  setCurrentPlan(plan) {
    this.state.currentPlan = plan;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current plan
   */
  getCurrentPlan() {
    return this.state.currentPlan;
  }

  /**
   * Set the current step
   */
  setCurrentStep(step) {
    this.state.currentStep = step;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current step
   */
  getCurrentStep() {
    return this.state.currentStep;
  }

  /**
   * Set the current file
   */
  setCurrentFile(file) {
    this.state.currentFile = file;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current file
   */
  getCurrentFile() {
    return this.state.currentFile;
  }

  /**
   * Set the current project
   */
  setCurrentProject(project) {
    this.state.currentProject = project;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get the current project
   */
  getCurrentProject() {
    return this.state.currentProject;
  }

  /**
   * Add scan results
   */
  addScanResults(results, path) {
    this.state.lastScanResults = results;
    this.state.lastScanPath = path;
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get last scan results
   */
  getLastScanResults() {
    return this.state.lastScanResults;
  }

  /**
   * Add fix result
   */
  addFixResult(result) {
    this.state.lastFixResult = result;
    if (result.summary?.fixedIssues) {
      this.state.issuesFixed += result.summary.fixedIssues;
    }
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Add pending AI fix
   */
  addPendingAIFix(fixId) {
    this.state.pendingAIFixes.push(fixId);
  }

  /**
   * Remove pending AI fix
   */
  removePendingAIFix(fixId) {
    const index = this.state.pendingAIFixes.indexOf(fixId);
    if (index > -1) {
      this.state.pendingAIFixes.splice(index, 1);
    }
  }

  /**
   * Add test result
   */
  addTestResult(result) {
    this.state.testResults.push(result);
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Add running test
   */
  addRunningTest(testInfo) {
    this.state.runningTests.push(testInfo);
  }

  /**
   * Remove running test
   */
  removeRunningTest(testId) {
    this.state.runningTests = this.state.runningTests.filter(t => t.testId !== testId);
  }

  /**
   * Add running project
   */
  addRunningProject(projectInfo) {
    this.state.runningProjects.push(projectInfo);
  }

  /**
   * Remove running project
   */
  removeRunningProject(projectId) {
    this.state.runningProjects = this.state.runningProjects.filter(p => p.projectId !== projectId);
  }

  /**
   * Set agent status
   */
  setAgentStatus(status, message = '', progress = null) {
    this.state.agentStatus = status;
    this.state.agentMessage = message;
    if (progress !== null) {
      this.state.progress = progress;
    }
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Get agent status
   */
  getAgentStatus() {
    return {
      status: this.state.agentStatus,
      message: this.state.agentMessage,
      progress: this.state.progress
    };
  }

  /**
   * Add error
   */
  addError(error) {
    this.state.errors.push({
      message: error.message || error,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get errors
   */
  getErrors() {
    return this.state.errors;
  }

  /**
   * Clear errors
   */
  clearErrors() {
    this.state.errors = [];
  }

  /**
   * Add warning
   */
  addWarning(warning) {
    this.state.warnings.push({
      message: warning,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get warnings
   */
  getWarnings() {
    return this.state.warnings;
  }

  /**
   * Add tool output
   */
  addToolOutput(tool, output) {
    this.state.toolOutputs.push({
      tool,
      output,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get tool outputs
   */
  getToolOutputs(tool = null) {
    if (tool) {
      return this.state.toolOutputs.filter(o => o.tool === tool);
    }
    return this.state.toolOutputs;
  }

  /**
   * Set metadata
   */
  setMetadata(key, value) {
    this.state.metadata[key] = value;
  }

  /**
   * Get metadata
   */
  getMetadata(key) {
    return this.state.metadata[key];
  }

  /**
   * Check if has metadata
   */
  hasMetadata(key) {
    return key in this.state.metadata;
  }

  /**
   * Get all metadata
   */
  getAllMetadata() {
    return { ...this.state.metadata };
  }

  /**
   * Get a snapshot of current state
   */
  getSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Restore from snapshot
   */
  restore(snapshot) {
    this.state = JSON.parse(JSON.stringify(snapshot));
  }

  /**
   * Get context summary for LLM prompting
   */
  getContextSummary() {
    const summary = [];

    if (this.state.userRequest) {
      summary.push(`User Request: ${this.state.userRequest}`);
    }

    if (this.state.currentFile) {
      summary.push(`Current File: ${this.state.currentFile}`);
    }

    if (this.state.currentProject) {
      summary.push(`Current Project: ${this.state.currentProject}`);
    }

    if (this.state.lastScanResults) {
      const { totalFiles, totalIssues } = this.state.lastScanResults;
      summary.push(`Last Scan: ${totalFiles} files, ${totalIssues} issues`);
    }

    if (this.state.issuesFixed > 0) {
      summary.push(`Issues Fixed: ${this.state.issuesFixed}`);
    }

    if (this.state.runningProjects.length > 0) {
      summary.push(`Running Projects: ${this.state.runningProjects.length}`);
    }

    if (this.state.runningTests.length > 0) {
      summary.push(`Running Tests: ${this.state.runningTests.length}`);
    }

    if (this.state.pendingAIFixes.length > 0) {
      summary.push(`Pending AI Fixes: ${this.state.pendingAIFixes.length}`);
    }

    return summary.join('\n');
  }

  /**
   * Check if Agent is idle
   */
  isIdle() {
    return this.state.agentStatus === 'idle';
  }

  /**
   * Check if Agent is working
   */
  isWorking() {
    return this.state.agentStatus === 'working' || this.state.agentStatus === 'thinking';
  }

  /**
   * Check if Agent has errors
   */
  hasErrors() {
    return this.state.errors.length > 0;
  }

  /**
   * Check if Agent has warnings
   */
  hasWarnings() {
    return this.state.warnings.length > 0;
  }

  /**
   * Get duration since start
   */
  getDuration() {
    if (!this.state.startTime) return 0;
    return (Date.now() - new Date(this.state.startTime).getTime()) / 1000;
  }

  /**
   * Start timer
   */
  start() {
    this.state.startTime = new Date().toISOString();
    this.state.lastUpdate = new Date().toISOString();
  }

  /**
   * Export to JSON
   */
  toJSON() {
    return this.getSnapshot();
  }
}

module.exports = WorkingMemory;
