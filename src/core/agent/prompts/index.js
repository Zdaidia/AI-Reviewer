/**
 * Prompts Module Index
 *
 * Exports all prompt generators
 */

const taskPlanning = require('./task-planning');
const toolSelection = require('./tool-selection');

module.exports = {
  ...taskPlanning,
  ...toolSelection
};
