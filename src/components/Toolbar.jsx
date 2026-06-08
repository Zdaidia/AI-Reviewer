/**
 * Toolbar Component
 *
 * Contains all function buttons
 */

import React, { useState, useEffect } from 'react';

const toolbarButtons = [
  { id: 'addFile', label: 'Add File/Folder', icon: '📁' },
  { id: 'scanCode', label: 'Scan Code', icon: '🔍' },
  { id: 'addTodo', label: 'Code Review', icon: '📝' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'agentChat', label: 'Agent Chat', icon: '💬' },
  { id: 'aiTest', label: 'AI Test', icon: '🧪' },
];

function Toolbar({ onAction, runningTestsCount = 0, activeButton = null }) {
  const [currentActive, setCurrentActive] = useState(activeButton);

  useEffect(() => {
    setCurrentActive(activeButton);
  }, [activeButton]);

  const handleClick = (buttonId) => {
    setCurrentActive(buttonId);
    onAction(buttonId);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 overflow-x-auto">
      {toolbarButtons.map((button) => {
        const isActive = currentActive === button.id;
        return (
          <button
            key={button.id}
            onClick={() => handleClick(button.id)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors duration-150 text-sm font-medium whitespace-nowrap ${
              isActive
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
            }`}
            title={button.label}
          >
            <span className="text-base">{button.icon}</span>
            <span>{button.label}</span>
            {button.id === 'test' && runningTestsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600 text-xs rounded-full animate-pulse">
                {runningTestsCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Toolbar;
