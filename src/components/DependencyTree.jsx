/**
 * Dependency Tree Component
 *
 * Displays project dependencies in a tree structure
 */

import React, { useState, useEffect } from 'react';

function DependencyTree({ tree, onNodeSelect, expandedPaths, onToggle }) {
  const [localExpanded, setLocalExpanded] = useState(new Set());

  useEffect(() => {
    if (tree) {
      setLocalExpanded(new Set([tree.id]));
    }
  }, [tree]);

  const toggleNode = (nodeId) => {
    setLocalExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
    if (onToggle) {
      onToggle(nodeId);
    }
  };

  const renderNode = (node, depth = 0) => {
    const isExpanded = localExpanded.has(node.id);
    const paddingLeft = `${depth * 16 + 12}px`;
    const hasChildren = node.children && node.children.length > 0;

    const getIcon = () => {
      switch (node.type) {
        case 'folder': return isExpanded ? '📂' : '📁';
        case 'file': return '📄';
        case 'config': return '⚙️';
        case 'package': return '📦';
        default: return '📄';
      }
    };

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-1 hover:bg-gray-700 transition-colors cursor-pointer"
          style={{ paddingLeft }}
          onClick={() => {
            if (hasChildren) toggleNode(node.id);
            if (onNodeSelect) onNodeSelect(node);
          }}
        >
          <span className="text-sm">{getIcon()}</span>
          <span className="text-sm">{node.name}</span>
          {node.stats && (
            <span className="text-xs text-gray-500">
              ({node.stats.fileCount || node.dependencies?.length || 0})
            </span>
          )}
          {node.version && (
            <span className="text-xs text-gray-500">v{node.version}</span>
          )}
        </div>
        {hasChildren && isExpanded && node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  if (!tree) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No dependency tree available. Add files or folders to load dependencies.
      </div>
    );
  }

  return <div className="p-2">{renderNode(tree)}</div>;
}

export default DependencyTree;
