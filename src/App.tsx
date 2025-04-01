import React, { useState, useRef } from 'react';
import './trace-item.css';

// Define trace interface
interface Trace {
  id: string;
  content: string;
  children: Trace[];
  depth: number;
  contractName: string | null;
  functionName: string | null;
  callType: string | null;
  isReturn: boolean;
  raw: string;
  rowIndex: number;
  parent?: Trace;
  stackId?: number;
}

const DarkEnhancedTraceViewer = () => {
  const [file, setFile] = useState<File | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedItems, setHighlightedItems] = useState<Set<string>>(new Set());
  const [lastExpandedTrace, setLastExpandedTrace] = useState<Trace | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Trace[]>([]);

  // Refs for scrolling to elements
  const traceRefs = useRef<Record<string, HTMLDivElement>>({});

  // Dark mode color palette for different call depths
  const depthColors = [
    'bg-gray-950',
    'bg-blue-950',
    'bg-green-950',
    'bg-purple-950',
    'bg-yellow-950',
    'bg-pink-950',
    'bg-indigo-950',
    'bg-red-950',
    'bg-orange-950',
    'bg-teal-950',
    'bg-cyan-950'
  ];
  const depthColors2 = [
    'bg-gray-900',
    'bg-blue-900',
    'bg-green-900',
    'bg-purple-900',
    'bg-yellow-900',
    'bg-pink-900',
    'bg-indigo-900',
    'bg-red-900',
    'bg-orange-900',
    'bg-teal-900',
    'bg-cyan-900'
  ];
  const textColors = [
    'text-purple-300',
    'text-yellow-300',
    'text-green-300',
    'text-pink-300',
    'text-indigo-300',
    'text-red-300',
    'text-orange-300',
    'text-teal-300',
    'text-cyan-300'
  ];

  // Process the file when it's uploaded
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseTraceFile(selectedFile);
    }
  };

  // Parse the trace file and convert it to a tree structure
  const parseTraceFile = async (file: File) => {
    setLoading(true);

    try {
      const text = await file.text();
      // Split by "Traces:" to handle multiple trace sections
      const traceSections = text.split(/Traces:\s*/g).filter(Boolean);

      const allTraces = [];
      let globalLineId = 0; // Global counter for unique IDs across all sections

      for (let section of traceSections) {
        const lines = section.split('\n');
        const sectionTraces = parseTraceLines(lines, globalLineId);
        // Update the global line ID counter based on the traces we've processed
        globalLineId += lines.length;
        allTraces.push(...sectionTraces);
      }

      // We no longer need to set stackId as we're using depth for coloring
      // But keeping this for backward compatibility
      allTraces.forEach((trace, index) => {
        trace.stackId = index;
        assignStackIds(trace.children, index);
      });

      setTraces(allTraces);

      // Auto-expand top level traces
      const topLevelIds = new Set(allTraces.map(trace => trace.id));
      setExpandedItems(topLevelIds);

      // Reset sidebar history
      setLastExpandedTrace(null);
      setExpandedHistory([]);

    } catch (error) {
      console.error("Error parsing trace file:", error);
    } finally {
      setLoading(false);
    }
  };

  // Assign stack IDs to all children recursively
  const assignStackIds = (traces: Trace[], stackId: number) => {
    traces.forEach(trace => {
      trace.stackId = stackId;
      if (trace.children && trace.children.length > 0) {
        assignStackIds(trace.children, stackId);
      }
    });
  };

  // Parse individual trace lines into a hierarchical structure
  const parseTraceLines = (lines: string[], startLineId = 0): Trace[] => {
    const rootTraces: Trace[] = [];
    let currentStack: Trace[] = [];
    let lineId = startLineId;

    for (let line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Determine indentation level by counting leading spaces, ├─, │, etc.
      const indentMatch = line.match(/^(\s*(?:[│├└]─?\s*)*)/);
      if (!indentMatch) continue;

      const indentPart = indentMatch[1];
      // Calculate depth based on indent characters
      const depth = (indentPart.match(/[│├└]/g) || []).length;

      // Trim the indentation characters and spaces
      const content = line.substring(indentPart.length).trim();
      if (!content) continue;

      // Extract function name and arguments if available
      let functionName = null;
      let contractName = null;
      let callType = null;

      const functionMatch = content.match(/([A-Za-z0-9_]+)::([A-Za-z0-9_]+)\((.*?)\)/);
      if (functionMatch) {
        contractName = functionMatch[1];
        functionName = functionMatch[2];
      }

      // Extract call type (staticcall, call, etc.)
      if (content.includes('[staticcall]')) {
        callType = 'staticcall';
      } else if (content.includes('[call]')) {
        callType = 'call';
      } else if (content.includes('[delegatecall]')) {
        callType = 'delegatecall';
      }

      // Check if this is a return line
      const isReturn = content.includes('← [Return]') || content.includes('← [Stop]');

      // Create trace object with unique ID and parsed data
      const trace: Trace = {
        id: `trace-${lineId++}`,
        content,
        children: [],
        depth,
        contractName,
        functionName,
        callType,
        isReturn,
        raw: content,
        rowIndex: lineId // For alternating row colors
      };

      // Add to appropriate level in the tree
      if (depth === 0) {
        // Root level trace
        rootTraces.push(trace);
        currentStack = [trace];
      } else if (depth <= currentStack.length) {
        // Going back up or staying at the same level
        currentStack = currentStack.slice(0, depth);
        currentStack[depth - 1].children.push(trace);
        currentStack.push(trace);
      } else if (depth > currentStack.length && currentStack.length > 0) {
        // Going deeper but potentially skipped levels
        const parent = currentStack[currentStack.length - 1];
        parent.children.push(trace);
        currentStack.push(trace);
      }
    }

    return rootTraces;
  };

  // Toggle expand/collapse for a trace item
  const toggleExpand = (traceId: string, trace: Trace) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(traceId)) {
        // When collapsing, remove this trace from expanded items
        newSet.delete(traceId);

        // Update the sidebar to show the parent's children if available
        if (expandedHistory.length > 1) {
          // Remove the current trace from history
          const newHistory = [...expandedHistory];
          newHistory.pop();
          // Set the previous trace as the current one
          const previousTrace = newHistory[newHistory.length - 1];
          setLastExpandedTrace(previousTrace);
          setExpandedHistory(newHistory);
        }
      } else {
        // When expanding, add this trace to expanded items
        newSet.add(traceId);
        // Update the last expanded trace when expanding
        setLastExpandedTrace(trace);
        // Add to history - check if this trace is already in history to avoid duplicates
        setExpandedHistory(prev => {
          // Check if this trace is already in the history by ID
          const traceExists = prev.some(historyTrace => historyTrace.id === trace.id);
          if (traceExists) {
            // If it exists, remove it first to avoid duplicates
            const filteredHistory = prev.filter(historyTrace => historyTrace.id !== trace.id);
            return [...filteredHistory, trace];
          }
          return [...prev, trace];
        });
      }
      return newSet;
    });
  };

  // Scroll to a specific trace item
  const scrollToTrace = (traceId: string) => {
    if (traceRefs.current[traceId]) {
      // Expand all parent traces to make sure the target is visible
      // Flatten the trace tree to find the target trace
      const flattenTraces = (traces: Trace[]): Trace[] => {
        return traces.reduce((acc: Trace[], trace: Trace) => {
          acc.push(trace);
          if (trace.children && trace.children.length > 0) {
            acc.push(...flattenTraces(trace.children));
          }
          return acc;
        }, []);
      };

      let currentTrace = flattenTraces(traces).find(t => t.id === traceId);
      while (currentTrace && currentTrace.parent) {
        setExpandedItems(prev => {
          const newSet = new Set(prev);
          if (currentTrace && currentTrace.parent) {
            newSet.add(currentTrace.parent.id);
          }
          return newSet;
        });
        currentTrace = currentTrace.parent;
      }

      // Small delay to allow DOM to update after expanding parents
      setTimeout(() => {
        if (traceRefs.current[traceId]) {
          traceRefs.current[traceId].scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Highlight the item briefly
          const element = traceRefs.current[traceId];
          element.classList.add('pulse-highlight');
          setTimeout(() => {
            element.classList.remove('pulse-highlight');
          }, 1500);
        }
      }, 50);
    }
  };

  // Expand all items
  const expandAll = () => {
    const allIds = getAllTraceIds(traces);
    setExpandedItems(new Set(allIds));

    // Keep the current expanded trace in the sidebar
    // We don't change the history here as it would be too complex to track
  };

  // Collapse all items
  const collapseAll = () => {
    // Keep only top-level traces expanded
    const topLevelIds = new Set(traces.map(trace => trace.id));
    setExpandedItems(topLevelIds);

    // Reset sidebar to show no expanded section
    setLastExpandedTrace(null);
    setExpandedHistory([]);
  };

  // Get all trace IDs recursively
  const getAllTraceIds = (traces: Trace[]): string[] => {
    const ids: string[] = [];

    const collectIds = (trace: Trace) => {
      ids.push(trace.id);
      trace.children.forEach(collectIds);
    };

    traces.forEach(collectIds);
    return ids;
  };

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);

    if (!term.trim()) {
      setHighlightedItems(new Set());
      return;
    }

    const matches = new Set<string>();

    const findMatches = (trace: Trace) => {
      if (trace.content.toLowerCase().includes(term.toLowerCase())) {
        matches.add(trace.id);

        // Also expand parents
        let currentTrace = trace;
        while (currentTrace && currentTrace.parent) {
          matches.add(currentTrace.parent.id);
          currentTrace = currentTrace.parent;
        }
      }

      trace.children.forEach((child: Trace) => {
        // Set parent reference for children
        child.parent = trace;
        findMatches(child);
      });
    };

    traces.forEach(findMatches);
    setHighlightedItems(matches);

    // Expand items with matches
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      matches.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Syntax highlighting for different types of trace content
  const highlightSyntax = (content: string, childCount: number) => {
    // Function to create spans with appropriate classes
    const createSpan = (text: string, className: string) => (
      <span key={Math.random()} className={className}>{text}</span>
    );

    // Match different parts of the trace
    if (content.includes('└─ ←') || content.includes('│   └─ ←') || content.includes('├─ ←')) {
      // Return values
      const parts = content.split('←');
      return (
        <>
          {createSpan(parts[0] + '←', 'text-gray-400')}
          {createSpan(parts.slice(1).join('←'), 'text-green-400 font-bold')}
        </>
      );
    } else if (content.includes('emit ')) {
      // Event emissions
      const parts = content.split('emit ');
      return (
        <>
          {createSpan(parts[0] + 'emit ', 'text-gray-400')}
          {createSpan(parts.slice(1).join('emit '), 'text-yellow-400')}
        </>
      );
    } else if (content.match(/([A-Za-z0-9_]+)::([A-Za-z0-9_]+)\((.*)\)/)) {
      // Function calls with contract::function(args) format
      const match = content.match(/([A-Za-z0-9_]+)::([A-Za-z0-9_]+)\((.*)\)/);
      if (match) {
        const [fullMatch, contractName, functionName, args] = match;
        const afterMatch = content.substring(content.indexOf(fullMatch) + fullMatch.length);

        // Handle multiple arguments by splitting by commas, but only at the top level
        // (not inside nested parentheses)
        const processArgs = (argsStr: string): string[] => {
          const result = [];
          let currentArg = '';
          let parenDepth = 0;

          for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];
            if (char === '(' || char === '[' || char === '{') {
              parenDepth++;
              currentArg += char;
            } else if (char === ')' || char === ']' || char === '}') {
              parenDepth--;
              currentArg += char;
            } else if (char === ',' && parenDepth === 0) {
              result.push(currentArg.trim());
              currentArg = '';
            } else {
              currentArg += char;
            }
          }

          if (currentArg.trim()) {
            result.push(currentArg.trim());
          }

          return result;
        };

        const argsList = processArgs(args);

        return (
          <>
            {`[${childCount}]` && <React.Fragment>{`[${childCount}]`} </React.Fragment>}
            <span className="text-blue-300">{contractName}</span>
            <span className="text-gray-400">::</span>
            <span className="text-white">{functionName}</span>
            <span className="text-gray-400">(</span>
            {argsList.map((arg: string, index: number) => (
              <React.Fragment key={`arg-${index}`}>
                {index > 0 && <span className="text-gray-400">, </span>}
                {<span className={`${textColors[index % textColors.length]}`}>{arg}</span>}
              </React.Fragment>
            ))}
            <span className="text-gray-400">)</span>
            {afterMatch && <React.Fragment>{afterMatch}</React.Fragment>}
          </>
        );
      }
      return content;
    }else if (content.includes('0x')) {
      // Highlight addresses and hashes
      const parts = content.split(/(0x[a-fA-F0-9]+)/);
      return (
        <>
          {parts.map((part: string, index: number) => {
            // Create a unique key for each part
            const partKey = `addr-${index}-${part.length}`;

            if (part.match(/0x[a-fA-F0-9]+/)) {
              return <span key={partKey} className="text-cyan-400">{part}</span>;
            } else {
              return <React.Fragment key={partKey}>{part}</React.Fragment>;
            }
          })}
        </>
      );
    }

    // Default rendering if no special syntax is detected
    return content;
  };

  // Recursively render a trace and its children
  const renderTrace = (trace: Trace, lineIndex = 0) => {
    const hasChildren = trace.children && trace.children.length > 0;
    const isExpanded = expandedItems.has(trace.id);
    const isHighlighted = highlightedItems.has(trace.id);

    // Get background color based on call depth instead of stack ID
    let depthColorLookup = depthColors;
    if (lineIndex % 2 === 0) {
      depthColorLookup = depthColors;
    }
    const depthColor = depthColorLookup[trace.depth % depthColors.length];

    // Special styling for returns
    const returnStyle = trace.isReturn ? 'border-l-2 border-green-500' : '';

    // Create a more unique key by combining the trace ID with its depth and content hash
    const contentHash = trace.content.length.toString(16);
    const uniqueKey = `${trace.id}-${trace.depth}-${contentHash}`;

    return (
      <div
        key={uniqueKey}
        ref={(el: HTMLDivElement | null) => {
          if (el) traceRefs.current[trace.id] = el;
        }}
        className={`trace-item ${depthColor} ${returnStyle} ${isHighlighted ? 'bg-purple-700 !bg-opacity-40' : ''}`}
      >
        <div className="flex break-all">
          <div
            className="trace-header flex items-start py-1 hover:bg-gray-900 hover:bg-opacity-50 cursor-pointer flex-grow"
            onClick={() => hasChildren && toggleExpand(trace.id, trace)}
            style={{ paddingLeft: `${trace.depth * 20}px` }}
          >
            {hasChildren && (
              <span className="mr-2 text-gray-400 w-4">
                {isExpanded ? '▼' : '►'}
              </span>
            )}
            {!hasChildren && <span className="mr-2 w-4"></span>}
            <div className="font-mono text-sm whitespace-pre-wrap text-gray-200">
              {highlightSyntax(trace.content, trace.children ? trace.children.length : 0)}
            </div>
          </div>

        </div>

        {hasChildren && isExpanded && (
          <div className="trace-children">
            {trace.children.map((child: Trace, idx: number) => {
              // Create a more unique key for each child element
              const childKey = `child-${child.id}-${idx}-${trace.id}`;
              // Pass the current trace's index as the parent index for the child
              return <React.Fragment key={childKey}>{renderTrace(child, lineIndex + idx + 1)}</React.Fragment>;
            })}
          </div>
        )}
      </div>
    );
  };

  // Render sidebar with children of last expanded trace
  const renderSidebar = () => {
    if (!lastExpandedTrace || !lastExpandedTrace.children || lastExpandedTrace.children.length === 0) {
      return (
        <div className="text-gray-500 text-sm p-4">
          No expanded section with children
        </div>
      );
    }

    return (
      <div className="p-2">
        <div className="text-sm font-medium text-gray-300 mb-2 border-b border-gray-700 pb-2 break-all max-h-24 overflow-y-auto">
          {highlightSyntax(lastExpandedTrace.content, lastExpandedTrace.children.length)}
        </div>
        <div className="space-y-1">
          {lastExpandedTrace.children.map((child: Trace, index: number) => {
            const depthColor = depthColors[child.depth % depthColors.length];
            const returnStyle = child.isReturn ? 'border-l-2 border-green-500' : '';
            // Create a more unique key by adding a timestamp or random value
            const uniqueSidebarKey = `sidebar-${child.id}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

            return (
              <div
                key={uniqueSidebarKey}
                onClick={() => scrollToTrace(child.id)}
                className={`${depthColor} ${returnStyle} p-2 rounded text-xs cursor-pointer hover:bg-gray-700 truncate mb-1`}
                title={child.content}
              >
                {highlightSyntax(child.content, child.children ? child.children.length : 0)}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render main component UI
  return (
    <div className="flex max-w-full bg-gray-900 text-gray-200 min-h-screen">
      {/* Sidebar - fixed position for entire viewport height */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 overflow-hidden font-mono text-sm fixed top-0 bottom-0 left-0 z-10">
        <div className="overflow-y-auto h-[calc(100%-20px)]">
          {lastExpandedTrace ? renderSidebar() : (
            <div className="text-gray-500 text-sm p-4">
              {traces.length > 0 ? (
                <>
                  <p className="mb-2">No expanded section with children</p>
                  <p className="text-xs">Click the ► icon next to a trace to expand it and see its children here.</p>
                </>
              ) : (
                <p>Upload a trace file to get started</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content area with left margin to accommodate sidebar */}
      <div className="flex-1 ml-64 p-4">
        <h1 className="text-2xl font-bold mb-4">Foundry Trace Viewer</h1>

        <div className="mb-6">
          <div className="bg-gray-800 p-3 rounded-md shadow border border-blue-700 inline-block">
            <label className="block">
              <span className="text-gray-100 font-medium text-sm flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Upload Trace File
              </span>
              <div className="mt-1 flex">
                <input
                  type="file"
                  id="file-upload"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".txt,.log,.trace"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-medium py-1 px-3 rounded-l flex items-center justify-center transition-colors duration-200 text-sm"
                >
                  <span>Choose File</span>
                </label>
                <div className="bg-gray-800 text-gray-300 py-1 px-3 rounded-r border-l border-blue-800 truncate max-w-xs text-sm">
                  {file ? file.name : 'No file selected'}
                </div>
              </div>
            </label>
          </div>
        </div>

      {loading && (
        <div className="text-blue-400">Loading traces...</div>
      )}

      {traces.length > 0 && (
        <>
          <div className="sticky top-0 z-20 flex justify-between mb-2 py-1 bg-gray-900 border-b border-gray-700 shadow-md">
            <div className="flex space-x-4">
              <button
                onClick={expandAll}
                className="px-2 py-0.5 bg-blue-700 text-white rounded hover:bg-blue-600 text-sm flex items-center"
              >
                🔍 Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-2 py-0.5 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm flex items-center"
              >
                🔼 Collapse to Root
              </button>
            </div>
            <div className="w-1/3">
              <input
                type="text"
                placeholder="Search traces..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full px-2 py-1 border border-gray-700 bg-gray-800 rounded text-gray-200 text-sm"
              />
            </div>
          </div>

          <div className="trace-container border border-gray-700 rounded-md overflow-auto font-mono text-sm mt-2">
            <div className="legend p-2 bg-gray-800 border-b border-gray-700 flex flex-wrap gap-2">
              <div className="flex flex-col w-full mb-2">
                <span className="text-sm font-bold">Call Depth Colors:</span>
                <span className="text-xs text-gray-400"><span className="text-purple-400 font-bold">[brackets]</span> show the number of direct children</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {depthColors.slice(0, 5).map((color, index) => (
                  <span key={index} className={`${color} px-2 py-1 rounded text-xs`}>
                    Depth {index}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4">
              {traces.map((trace, index) => {
                // For top-level traces, we pass -1 as the parent index to indicate it's a root trace
                return renderTrace(trace, index);
              })}
            </div>
          </div>
        </>
      )}

      {!loading && file && traces.length === 0 && (
        <div className="text-red-400">No valid traces found in the file.</div>
      )}
      </div>
    </div>
  );
};

export default DarkEnhancedTraceViewer;