/**
 * YAML Loader for Rules
 *
 * Simple YAML parser for loading scanning rules
 * Falls back to JSON if yaml library is not available
 */

const fs = require('fs');

function loadYaml(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Try to use js-yaml if available
    try {
      const yaml = require('js-yaml');
      return yaml.load(content);
    } catch (e) {
      // Fallback: parse as JSON or simple YAML-like format
      return parseSimpleYaml(content);
    }
  } catch (error) {
    console.error('Error loading YAML file:', error.message);
    return [];
  }
}

function parseSimpleYaml(content) {
  // Simple YAML parser for basic rule format
  const lines = content.split('\n');
  const rules = [];
  let currentRule = null;

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('- id:')) {
      if (currentRule) {
        rules.push(currentRule);
      }
      currentRule = {
        id: trimmed.split(':')[1].trim(),
        languages: [],
        autoFix: false,
      };
    } else if (currentRule && trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (key === 'languages') {
        // Parse array format: [javascript, typescript]
        const match = value.match(/\[([^\]]+)\]/);
        if (match) {
          currentRule.languages = match[1].split(',').map(s => s.trim());
        }
      } else if (key === 'autoFix') {
        currentRule.autoFix = value === 'true';
      } else {
        currentRule[key.trim()] = value;
      }
    }
  });

  if (currentRule) {
    rules.push(currentRule);
  }

  return rules;
}

module.exports = { loadYaml };
