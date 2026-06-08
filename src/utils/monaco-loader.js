/**
 * Monaco Editor Loader Configuration for Electron
 *
 * Configures Monaco Editor to work properly in Electron environment
 * by disabling CDN-based worker loading
 */

import * as monaco from 'monaco-editor';

// Configure Monaco environment for Electron
self.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    // In Electron, return a blob URL for the worker
    // This prevents the CDN loading issue
    if (label === 'json') {
      return '';
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return '';
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return '';
    }
    return '';
  }
};

// Disable web workers entirely for Electron
self.MonacoEnvironment.disableWorkerCreation = true;

export default monaco;
