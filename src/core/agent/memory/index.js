/**
 * Memory Module Index
 *
 * Exports all memory types and creates a unified memory manager
 */

const EpisodicMemory = require('./episodic');
const SemanticMemory = require('./semantic');
const WorkingMemory = require('./working');

/**
 * Unified Memory Manager
 * Coordinates all memory types for the Agent
 */
class MemoryManager {
  constructor(options = {}) {
    this.episodic = new EpisodicMemory({
      ...options.episodic,
      onEvent: options.onEvent
    });
    this.semantic = new SemanticMemory(options.semantic);
    this.working = new WorkingMemory();
  }

  /**
   * Start a new task episode
   */
  startTask(userRequest, metadata = {}) {
    this.working.clear();
    this.working.start();
    this.working.setUserRequest(userRequest);

    return this.episodic.startEpisode(userRequest, metadata);
  }

  /**
   * Add a step to the current episode
   */
  addStep(step) {
    return this.episodic.addStep(step);
  }

  /**
   * Complete the current task
   */
  completeTask(result) {
    this.working.setAgentStatus('idle', 'Task completed');
    return this.episodic.endEpisode(result, 'completed');
  }

  /**
   * Fail the current task
   */
  failTask(error) {
    this.working.setAgentStatus('error', `Task failed: ${error.message}`);
    this.working.addError(error);
    return this.episodic.endEpisode({ error }, 'failed');
  }

  /**
   * Get current context for LLM prompting
   */
  getContext() {
    return {
      working: this.working.getSnapshot(),
      recentEpisodes: this.episodic.getRecentEpisodes(5),
      relevantKnowledge: this.getRelevantKnowledge()
    };
  }

  /**
   * Get relevant knowledge from semantic memory
   */
  getRelevantKnowledge() {
    const knowledge = {};

    if (this.working.getCurrentFile()) {
      const codeAnalysis = this.semantic.getCodeAnalysis(this.working.getCurrentFile());
      if (codeAnalysis) {
        knowledge.currentFile = codeAnalysis;
      }
    }

    if (this.working.getCurrentProject()) {
      const projectContext = this.semantic.getProjectContext(this.working.getCurrentProject());
      if (projectContext) {
        knowledge.project = projectContext;
      }
    }

    return knowledge;
  }

  /**
   * Store code analysis result
   */
  storeCodeAnalysis(filePath, analysis) {
    return this.semantic.storeCodeAnalysis(filePath, analysis);
  }

  /**
   * Store project context
   */
  storeProjectContext(projectPath, context) {
    return this.semantic.storeProjectContext(projectPath, context);
  }

  /**
   * Find similar past tasks
   */
  findSimilarTasks(request) {
    return this.episodic.findSimilar(request);
  }

  /**
   * Get memory statistics
   */
  getStats() {
    return {
      episodic: this.episodic.getStats(),
      semantic: this.semantic.getStats(),
      working: {
        status: this.working.getAgentStatus(),
        hasErrors: this.working.hasErrors(),
        hasWarnings: this.working.hasWarnings(),
        duration: this.working.getDuration()
      }
    };
  }

  /**
   * Clear all memories
   */
  clearAll() {
    this.working.clear();
    this.episodic.clear();
    this.semantic.clear();
  }

  /**
   * Export all memories
   */
  export() {
    return {
      episodic: this.episodic.episodes,
      semantic: this.semantic.export(),
      working: this.working.toJSON()
    };
  }
}

module.exports = {
  EpisodicMemory,
  SemanticMemory,
  WorkingMemory,
  MemoryManager
};
