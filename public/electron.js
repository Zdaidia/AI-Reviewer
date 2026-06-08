// Electron entry point wrapper for electron-builder
// Required by electron-builder's default configuration
// Redirects to the actual main process file

const path = require('path');
const mainPath = path.resolve(__dirname, '../src/core/electron/main.js');
require(mainPath);