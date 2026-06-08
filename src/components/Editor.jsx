/**
 * Editor Component
 *
 * Monaco Editor integration
 * Displays code with syntax highlighting
 * Shows TODO annotations
 */

import React from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// Configure Monaco loader to use local files instead of CDN
// This prevents Electron from trying to load files from CDN as local paths
loader.config({
  monaco,
  // Use local Monaco Editor - do not load from CDN
});

// Configure Monaco Environment for Electron
if (typeof window !== 'undefined') {
  // Set up Monaco Environment before any editor loads
  window.MonacoEnvironment = {
    getWorker: function (_workerId, _label) {
      // Create a dummy worker to prevent CDN loading issues
      // In Electron, we don't use web workers for language features
      const dummyWorkerCode = `
        self.onmessage = function(e) {
          // Empty message handler - this is a dummy worker
        };
        self.postMessage({ ready: true });
      `;
      const blob = new Blob([dummyWorkerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      return new Worker(workerUrl);
    }
  };
}

function CodeEditor({ file, content, language, onChange, todos, diffData, onApplyDiff, onRejectDiff, highlightLine }) {
  const [editor, setEditor] = React.useState(null);
  const [monaco, setMonaco] = React.useState(null);
  const [currentDecorations, setCurrentDecorations] = React.useState([]);

  const handleEditorWillMount = (monaco) => {
    // Configure Monaco for Electron environment
    monaco.editor.setTheme('vs-dark');

    // Register custom CSS for diff decorations
    defineDiffTheme(monaco);

    // Disable worker-dependent language features
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    });

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false
    });
  };

  const handleEditorDidMount = (editor, monaco) => {
    setEditor(editor);
    setMonaco(monaco);

    // Apply decorations if TODOs exist
    applyTodoDecorations(editor, monaco, todos);
  };

  React.useEffect(() => {
    if (editor && monaco) {
      applyTodoDecorations(editor, monaco, todos);
    }
  }, [todos, editor, monaco]);

  React.useEffect(() => {
    if (editor && monaco) {
      if (diffData) {
        applyDiffDecorations(editor, monaco, diffData);
      } else {
        clearDiffDecorations(editor, monaco);
      }
    }
  }, [diffData, editor, monaco]);

  // Handle highlight line prop
  React.useEffect(() => {
    if (editor && monaco && highlightLine !== null && highlightLine !== undefined) {
      // Clear previous highlight
      editor.deltaDecorations(currentDecorations, []);

      // Add highlight decoration
      const highlightDecoration = {
        range: new monaco.Range(highlightLine, 1, highlightLine, 1),
        options: {
          isWholeLine: true,
          className: 'highlight-line-decoration',
          glyphMarginClassName: 'highlight-glyph-decoration',
          glyphMarginHoverMessage: { value: '问题所在行' },
        }
      };

      const newDecorations = [highlightDecoration];
      setCurrentDecorations(editor.deltaDecorations([], newDecorations));

      // Reveal and scroll to line
      editor.revealLineInCenter(highlightLine);
      editor.setPosition({ lineNumber: highlightLine, column: 1 });
      editor.focus();
    }
  }, [highlightLine, editor, monaco]);

  const defineDiffTheme = (monaco) => {
    // Define CSS for diff decorations via Monaco
    monaco.editor.defineTheme('diff-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'diff-add', background: '1e4620', foreground: 'd4edda' },
        { token: 'diff-remove', background: '4c1515', foreground: 'f8d7da' },
        { token: 'highlight-line', background: '4a2c00', foreground: 'ffffff' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
      }
    });
  };

  const applyTodoDecorations = (editor, monaco, todoList) => {
    // Skip if diff is being shown
    if (diffData) return;

    if (!todoList || todoList.length === 0) return;

    // Create new decorations
    const decorations = todoList
      .filter(todo => todo.file === file?.path)
      .map(todo => ({
        range: new monaco.Range(todo.line, 1, todo.line, 1),
        options: {
          isWholeLine: true,
          className: 'todo-line-decoration',
          glyphMarginClassName: 'todo-glyph-decoration',
          glyphMarginHoverMessage: { value: `[${todo.code}] ${todo.description}` },
        },
      }));

    const newDecorations = [...decorations];
    setCurrentDecorations(editor.deltaDecorations(currentDecorations, newDecorations));
  };

  const applyDiffDecorations = (editor, monaco, diff) => {
    if (!diff || !diff.hunks) return;

    const decorations = [];

    for (const hunk of diff.hunks || []) {
      for (const line of hunk.lines || []) {
        const lineNumber = line.modifiedNumber || line.originalNumber;
        if (!lineNumber) continue;

        let decoration = {
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            overviewRuler: {
              color: line.type === 'add' ? '#4caf50' : line.type === 'delete' ? '#f44336' : '#ff9800',
              position: monaco.editor.OverviewRulerLane.Full
            },
            glyphMarginClassName: line.type === 'add' ? 'diff-add-glyph' : line.type === 'delete' ? 'diff-remove-glyph' : '',
          }
        };

        switch (line.type) {
          case 'add':
            decoration.options.className = 'diff-add-line';
            decoration.options.afterContentClassName = 'diff-add-widget';
            decoration.options.minimap = {
              color: '#4caf50',
              position: monaco.editor.MinimapPosition.Inline
            };
            break;
          case 'delete':
            decoration.options.className = 'diff-remove-line';
            decoration.options.beforeContentClassName = 'diff-remove-widget';
            decoration.options.minimap = {
              color: '#f44336',
              position: monaco.editor.MinimapPosition.Inline
            };
            break;
          case 'modify':
            decoration.options.className = 'diff-modify-line';
            decoration.options.minimap = {
              color: '#ff9800',
              position: monaco.editor.MinimapPosition.Inline
            };
            break;
        }

        decorations.push(decoration);
      }
    }

    const newDecorations = editor.deltaDecorations(currentDecorations, decorations);
    setCurrentDecorations(newDecorations);

    // Reveal first diff
    if (decorations.length > 0) {
      editor.revealLineInCenter(decorations[0].range.startLineNumber);
    }
  };

  const clearDiffDecorations = (editor, monaco) => {
    editor.deltaDecorations(currentDecorations, []);
    setCurrentDecorations([]);
    // Re-apply todo decorations
    applyTodoDecorations(editor, monaco, todos);
  };

  const getLanguageFromFile = (fileName, defaultLang) => {
    if (!fileName) return defaultLang || 'typescript';
    const ext = fileName.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'vue': 'html',
      'dart': 'dart',
      'json': 'json',
      'md': 'markdown',
    };
    return langMap[ext] || defaultLang || 'typescript';
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Editor Tabs */}
      <div className="flex bg-gray-800 border-b border-gray-700">
        <div className="flex items-center px-4 py-2 bg-gray-700 border-r border-gray-600 flex-1">
          <span className="text-sm">{file?.name || '未选择文件'}</span>
          {diffData && (
            <span className="ml-3 px-2 py-0.5 bg-purple-600/30 text-purple-300 text-xs rounded-full border border-purple-500/50">
              AI 修复预览
            </span>
          )}
        </div>
      </div>

      {/* Diff Action Bar */}
      {diffData && (
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-900 to-gray-800 border-b border-purple-700/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-gray-300 font-medium">AI 建议的修复</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-red-600 rounded"></span>
                <span className="text-gray-400">删除 {diffData.stats?.deletions || 0}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-green-600 rounded"></span>
                <span className="text-gray-400">新增 {diffData.stats?.additions || 0}</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 bg-yellow-600 rounded"></span>
                <span className="text-gray-400">修改 {diffData.stats?.modifications || 0}</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRejectDiff && onRejectDiff()}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-sm font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              拒绝
            </button>
            <button
              onClick={() => onApplyDiff && onApplyDiff()}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              应用修复
            </button>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={getLanguageFromFile(file?.name, language)}
          value={content}
          onChange={(value) => onChange(value)}
          beforeMount={handleEditorWillMount}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          loading={<div className="flex items-center justify-center h-full text-gray-400">加载编辑器...</div>}
          options={{
            minimap: { enabled: true },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            glyphMargin: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            renderWhitespace: 'selection',
            glyphMarginHover: true,
            // Disable worker-dependent features for Electron
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false
            },
            suggestOnTriggerCharacters: false,
          }}
        />
      </div>
    </div>
  );
}

export default CodeEditor;
