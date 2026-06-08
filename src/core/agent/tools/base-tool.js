/**
 * Base Tool Class
 *
 * Abstract base class for all Agent tools.
 * Provides a unified interface for tool execution and validation.
 */

class BaseTool {
  /**
   * @param {string} name - Tool name (snake_case)
   * @param {string} description - Human-readable description
   * @param {Array} parameters - Parameter schema definitions
   * @param {Object} options - Tool options
   */
  constructor(name, description, parameters = [], options = {}) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.options = {
      requiresApproval: false,
      dangerous: false,
      ...options
    };
  }

  /**
   * Execute the tool with given parameters
   * @param {Object} params - Execution parameters
   * @param {Object} context - Execution context (working memory)
   * @returns {Promise<Object>} Execution result
   * @abstract
   */
  async execute(params, context = {}) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Validate input parameters
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validate(params) {
    const errors = [];

    for (const param of this.parameters) {
      const { name, required, type } = param;

      if (required && !(name in params)) {
        errors.push(`Missing required parameter: ${name}`);
        continue;
      }

      if (name in params) {
        const value = params[name];

        // Type validation
        switch (type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Parameter "${name}" must be a string`);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`Parameter "${name}" must be a number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Parameter "${name}" must be a boolean`);
            }
            break;
          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`Parameter "${name}" must be an array`);
            }
            break;
          case 'object':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) {
              errors.push(`Parameter "${name}" must be an object`);
            }
            break;
        }

        // Custom validation
        if (param.validate && typeof param.validate === 'function') {
          const customError = param.validate(value, params);
          if (customError) {
            errors.push(customError);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get tool schema for LLM prompting
   * @returns {Object} Tool schema
   */
  getSchema() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters.map(p => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required || false,
        default: p.default
      })),
      requiresApproval: this.options.requiresApproval,
      dangerous: this.options.dangerous
    };
  }

  /**
   * Create a success result
   * @param {*} data - Result data
   * @returns {Object} Success result
   */
  success(data) {
    return {
      success: true,
      tool: this.name,
      data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create an error result
   * @param {string} error - Error message
   * @returns {Object} Error result
   */
  error(error) {
    return {
      success: false,
      tool: this.name,
      error,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create a progress update
   * @param {string} message - Progress message
   * @param {number} progress - Progress percentage (0-100)
   * @returns {Object} Progress update
   */
  progress(message, progress = null) {
    return {
      type: 'progress',
      tool: this.name,
      message,
      progress,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BaseTool;
