/**
 * Episodic Memory
 *
 * Stores execution history and task sequences.
 * Provides the ability to recall past executions and learn from them.
 */

const fs = require('fs');
const path = require('path');

class EpisodicMemory {
  constructor(options = {}) {
    this.options = {
      maxEpisodes: options.maxEpisodes || 1000,
      persistToFile: options.persistToFile !== false,
      storagePath: options.storagePath || path.join(process.cwd(), '.agent-memory'),
      ...options
    };

    this.episodes = [];
    this.currentEpisode = null;
    this.load();
  }

  /**
   * Start a new episode
   */
  startEpisode(userRequest, metadata = {}) {
    this.currentEpisode = {
      id: this.generateId(),
      startTime: new Date().toISOString(),
      userRequest,
      metadata,
      steps: [],
      result: null,
      endTime: null,
      status: 'in_progress'
    };

    return this.currentEpisode.id;
  }

  /**
   * Add a step to the current episode
   */
  addStep(step) {
    if (!this.currentEpisode) {
      throw new Error('No active episode. Call startEpisode() first.');
    }

    const stepRecord = {
      timestamp: new Date().toISOString(),
      ...step
    };

    this.currentEpisode.steps.push(stepRecord);

    // Emit progress event
    this.emit('step', stepRecord);

    return stepRecord;
  }

  /**
   * End the current episode with a result
   */
  endEpisode(result, status = 'completed') {
    if (!this.currentEpisode) {
      throw new Error('No active episode to end.');
    }

    this.currentEpisode.result = result;
    this.currentEpisode.endTime = new Date().toISOString();
    this.currentEpisode.status = status;
    this.currentEpisode.duration = this.calculateDuration(
      this.currentEpisode.startTime,
      this.currentEpisode.endTime
    );

    // Store episode
    this.episodes.push(this.currentEpisode);

    // Prune old episodes if needed
    this.prune();

    // Persist to disk
    if (this.options.persistToFile) {
      this.save();
    }

    // Emit completion event
    this.emit('complete', this.currentEpisode);

    const episode = this.currentEpisode;
    this.currentEpisode = null;
    return episode;
  }

  /**
   * Get an episode by ID
   */
  getEpisode(episodeId) {
    return this.episodes.find(ep => ep.id === episodeId);
  }

  /**
   * Get recent episodes
   */
  getRecentEpisodes(count = 10) {
    return this.episodes.slice(-count);
  }

  /**
   * Search episodes by user request
   */
  searchByRequest(query) {
    const lowerQuery = query.toLowerCase();
    return this.episodes.filter(ep =>
      ep.userRequest.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Search episodes by tool usage
   */
  searchByTool(toolName) {
    return this.episodes.filter(ep =>
      ep.steps.some(step => step.tool === toolName)
    );
  }

  /**
   * Get successful episodes
   */
  getSuccessfulEpisodes() {
    return this.episodes.filter(ep => ep.status === 'completed');
  }

  /**
   * Get failed episodes
   */
  getFailedEpisodes() {
    return this.episodes.filter(ep => ep.status === 'failed');
  }

  /**
   * Find similar episodes based on user request
   */
  findSimilar(request, limit = 5) {
    const similarities = this.episodes.map(ep => ({
      episode: ep,
      similarity: this.calculateSimilarity(request, ep.userRequest)
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities
      .filter(s => s.similarity > 0.3)
      .slice(0, limit)
      .map(s => s.episode);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalEpisodes: this.episodes.length,
      completed: this.episodes.filter(ep => ep.status === 'completed').length,
      failed: this.episodes.filter(ep => ep.status === 'failed').length,
      inProgress: this.episodes.filter(ep => ep.status === 'in_progress').length,
      averageSteps: this.average(this.episodes.map(ep => ep.steps.length)),
      averageDuration: this.average(
        this.episodes
          .filter(ep => ep.duration)
          .map(ep => ep.duration)
      ),
      toolUsage: this.getToolUsageStats()
    };
  }

  /**
   * Get tool usage statistics
   */
  getToolUsageStats() {
    const usage = {};

    for (const ep of this.episodes) {
      for (const step of ep.steps) {
        if (step.tool) {
          usage[step.tool] = (usage[step.tool] || 0) + 1;
        }
      }
    }

    return usage;
  }

  /**
   * Calculate simple similarity between two strings
   */
  calculateSimilarity(str1, str2) {
    // Validate inputs
    if (!str1 || !str2) return 0;
    if (typeof str1 !== 'string' || typeof str2 !== 'string') {
      str1 = String(str1 || '');
      str2 = String(str2 || '');
    }

    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }

    const union = new Set([...words1, ...words2]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Calculate duration between two ISO timestamps
   */
  calculateDuration(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return (endDate - startDate) / 1000; // seconds
  }

  /**
   * Calculate average of numbers
   */
  average(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((a, b) => a + b, 0) / numbers.length;
  }

  /**
   * Prune old episodes if over limit
   */
  prune() {
    while (this.episodes.length > this.options.maxEpisodes) {
      this.episodes.shift();
    }
  }

  /**
   * Save episodes to disk
   */
  save() {
    try {
      if (!fs.existsSync(this.options.storagePath)) {
        fs.mkdirSync(this.options.storagePath, { recursive: true });
      }

      const filePath = path.join(this.options.storagePath, 'episodes.json');
      fs.writeFileSync(filePath, JSON.stringify(this.episodes, null, 2));
    } catch (error) {
      console.error('Failed to save episodic memory:', error.message);
    }
  }

  /**
   * Load episodes from disk
   */
  load() {
    try {
      const filePath = path.join(this.options.storagePath, 'episodes.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        this.episodes = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load episodic memory:', error.message);
      this.episodes = [];
    }
  }

  /**
   * Clear all episodes
   */
  clear() {
    this.episodes = [];
    this.currentEpisode = null;

    if (this.options.persistToFile) {
      const filePath = path.join(this.options.storagePath, 'episodes.json');
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `ep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Simple event emitter
   */
  emit(event, data) {
    // Integrate with proper event system if needed
    if (this.options.onEvent) {
      this.options.onEvent(event, data);
    }
  }
}

module.exports = EpisodicMemory;
