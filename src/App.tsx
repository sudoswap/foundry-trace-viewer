import { useState } from 'react';

const DarkEnhancedTraceViewer = () => {
  const [file, setFile] = useState(null);
  const [traces, setTraces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedItems, setHighlightedItems] = useState(new Set());
  const [selectedTraceDetails, setSelectedTraceDetails] = useState(null);
  
  // Dark mode color palette for different callstacks
  const stackColors = [
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

  // Process the file when it's uploaded
  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseTraceFile(selectedFile);
    }
  };

  // Parse the trace file and convert it to a tree structure
  const parseTraceFile = async (file) => {
    setLoading(true);
    
    try {
      const text = await file.text();
      // Split by "Traces:" to handle multiple trace sections
      const traceSections = text.split(/Traces:\s*/g).filter(Boolean);
      
      const allTraces = [];
      
      for (let section of traceSections) {
        const lines = section.split('\n');
        const sectionTraces = parseTraceLines(lines);
        allTraces.push(...sectionTraces);
      }
      
      // Set unique stackId for each top-level trace
      allTraces.forEach((trace, index) => {
        trace.stackId = index;
        assignStackIds(trace.children, index);
      });
      
      setTraces(allTraces);
      
      // Auto-expand top level traces
      const topLevelIds = new Set(allTraces.map(trace => trace.id));
      setExpandedItems(topLevelIds);
      
    } catch (error) {
      console.error("Error parsing trace file:", error);
    } finally {
      setLoading(false);
    }
  };
  
  // Assign stack IDs to all children recursively
  const assignStackIds = (traces, stackId) => {
    traces.forEach(trace => {
      trace.stackId = stackId;
      if (trace.children && trace.children.length > 0) {
        assignStackIds(trace.children, stackId);
      }
    });
  };
  
  // Parse individual trace lines into a hierarchical structure
  const parseTraceLines = (lines) => {
    const rootTraces = [];
    let currentStack = [];
    let lineId = 0;
    
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
      const trace = {
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
  const toggleExpand = (traceId) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(traceId)) {
        newSet.delete(traceId);
      } else {
        newSet.add(traceId);
      }
      return newSet;
    });
  };
  
  // Expand all items
  const expandAll = () => {
    const allIds = getAllTraceIds(traces);
    setExpandedItems(new Set(allIds));
  };
  
  // Collapse all items
  const collapseAll = () => {
    // Keep only top-level traces expanded
    const topLevelIds = new Set(traces.map(trace => trace.id));
    setExpandedItems(topLevelIds);
  };
  
  // Get all trace IDs recursively
  const getAllTraceIds = (traces) => {
    const ids = [];
    
    const collectIds = (trace) => {
      ids.push(trace.id);
      trace.children.forEach(collectIds);
    };
    
    traces.forEach(collectIds);
    return ids;
  };
  
  // Handle search
  const handleSearch = (e) => {
    const term = e.target.value;
    setSearchTerm(term);
    
    if (!term.trim()) {
      setHighlightedItems(new Set());
      return;
    }
    
    const matches = new Set();
    
    const findMatches = (trace) => {
      if (trace.content.toLowerCase().includes(term.toLowerCase())) {
        matches.add(trace.id);
        
        // Also expand parents
        let currentTrace = trace;
        while (currentTrace && currentTrace.parent) {
          matches.add(currentTrace.parent.id);
          currentTrace = currentTrace.parent;
        }
      }
      
      trace.children.forEach(child => {
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
  
  // Show detailed view for a trace
  const showTraceDetails = (trace) => {
    setSelectedTraceDetails(trace);
  };

  // Syntax highlighting for different types of trace content
  const highlightSyntax = (content) => {
    // Function to create spans with appropriate classes
    const createSpan = (text, className) => (
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
    } else if (content.match(/\[\d+\]/)) {
      // Function calls with gas usage
      const parts = content.split(/(\[\d+\])/);
      return (
        <>
          {parts.map((part, i) => {
            if (part.match(/\[\d+\]/)) {
              return createSpan(part, 'text-purple-400');
            } else if (part.includes('staticcall')) {
              return createSpan(part, 'text-blue-400');
            } else if (part.includes('[call]')) {
              return createSpan(part, 'text-blue-300');
            } else if (part.includes('[delegatecall]')) {
              return createSpan(part, 'text-blue-200');
            } else if (part.includes('[Return]')) {
              return createSpan(part, 'text-green-400');
            } else if (part.includes('[Stop]')) {
              return createSpan(part, 'text-red-400');
            } else {
              return part;
            }
          })}
        </>
      );
    } else if (content.includes('0x')) {
      // Highlight addresses and hashes
      const parts = content.split(/(0x[a-fA-F0-9]+)/);
      return (
        <>
          {parts.map((part, i) => {
            if (part.match(/0x[a-fA-F0-9]+/)) {
              return createSpan(part, 'text-cyan-400');
            } else {
              return part;
            }
          })}
        </>
      );
    }
    
    // Default rendering if no special syntax is detected
    return content;
  };

  // Recursively render a trace and its children
  const renderTrace = (trace, lineIndex = 0) => {
    const hasChildren = trace.children && trace.children.length > 0;
    const isExpanded = expandedItems.has(trace.id);
    const isHighlighted = highlightedItems.has(trace.id);
    
    // Get background color for this stack
    const stackColor = stackColors[trace.stackId % stackColors.length];
    
    // Alternate row colors within the same stack
    const rowColor = lineIndex % 2 === 0 ? 'bg-opacity-40' : 'bg-opacity-20';
    
    // Special styling for returns
    const returnStyle = trace.isReturn ? 'border-l-2 border-green-500' : '';
    
    return (
      <div 
        key={trace.id} 
        className={`trace-item ${stackColor} ${rowColor} ${returnStyle} ${isHighlighted ? 'bg-yellow-600 !bg-opacity-30' : ''}`}
      >
        <div className="flex">
          <div 
            className="trace-header flex items-start py-1 hover:bg-white hover:bg-opacity-10 cursor-pointer flex-grow"
            onClick={() => hasChildren && toggleExpand(trace.id)}
            style={{ paddingLeft: `${trace.depth * 20}px` }}
          >
            {hasChildren && (
              <span className="mr-2 text-gray-400 w-4">
                {isExpanded ? '▼' : '►'}
              </span>
            )}
            {!hasChildren && <span className="mr-2 w-4"></span>}
            <div className="font-mono text-sm whitespace-pre-wrap text-gray-200">
              {highlightSyntax(trace.content)}
            </div>
          </div>
          <div className="flex-shrink-0 px-2">
            <button 
              className="text-xs text-blue-400 hover:text-blue-300"
              onClick={(e) => {
                e.stopPropagation();
                showTraceDetails(trace);
              }}
            >
              Details
            </button>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="trace-children">
            {trace.children.map((child, idx) => renderTrace(child, lineIndex + idx + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render trace details panel
  const renderTraceDetails = () => {
    if (!selectedTraceDetails) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-20">
        <div className="bg-gray-800 text-gray-200 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">Trace Details</h3>
            <button 
              onClick={() => setSelectedTraceDetails(null)}
              className="text-gray-400 hover:text-gray-200"
            >
              &times;
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {selectedTraceDetails.contractName && (
              <div>
                <span className="font-bold text-gray-400">Contract:</span> {selectedTraceDetails.contractName}
              </div>
            )}
            
            {selectedTraceDetails.functionName && (
              <div>
                <span className="font-bold text-gray-400">Function:</span> {selectedTraceDetails.functionName}
              </div>
            )}
            
            {selectedTraceDetails.callType && (
              <div>
                <span className="font-bold text-gray-400">Call Type:</span> {selectedTraceDetails.callType}
              </div>
            )}
            
            <div>
              <span className="font-bold text-gray-400">Stack ID:</span> {selectedTraceDetails.stackId}
            </div>
          </div>
          
          <div className="mt-4">
            <h4 className="font-bold text-gray-400">Raw Trace:</h4>
            <div className="bg-gray-900 p-2 rounded mt-2 font-mono text-sm whitespace-pre-wrap">
              {selectedTraceDetails.raw}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render main component UI
  return (
    <div className="p-4 max-w-full bg-gray-900 text-gray-200 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Foundry Trace Viewer</h1>
      
      <div className="mb-6">
        <label className="block mb-2">
          <span className="text-gray-300">Upload trace file:</span>
          <input 
            type="file" 
            onChange={handleFileChange}
            className="mt-1 block w-full py-2 px-3 border border-gray-700 bg-gray-800 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-200"
          />
        </label>
      </div>
      
      {loading && (
        <div className="text-blue-400">Loading traces...</div>
      )}
      
      {traces.length > 0 && (
        <>
          <div className="flex justify-between mb-4">
            <div className="flex space-x-4">
              <button 
                onClick={expandAll}
                className="px-3 py-1 bg-blue-700 text-white rounded hover:bg-blue-600"
              >
                Expand All
              </button>
              <button 
                onClick={collapseAll}
                className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
              >
                Collapse to Root
              </button>
            </div>
            <div className="w-1/3">
              <input
                type="text"
                placeholder="Search traces..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full px-3 py-2 border border-gray-700 bg-gray-800 rounded text-gray-200"
              />
            </div>
          </div>
          
          <div className="trace-container border border-gray-700 rounded-md overflow-auto font-mono text-sm">
            <div className="legend p-2 bg-gray-800 border-b border-gray-700 flex flex-wrap gap-2">
              <span className="text-sm font-bold">Call Stack Colors:</span>
              {stackColors.map((color, index) => (
                <span key={index} className={`${color} px-2 py-1 rounded text-xs`}>
                  Stack {index}
                </span>
              ))}
            </div>
            <div className="p-4">
              {traces.map((trace, index) => renderTrace(trace, index))}
            </div>
          </div>
          
          {selectedTraceDetails && renderTraceDetails()}
        </>
      )}
      
      {!loading && file && traces.length === 0 && (
        <div className="text-red-400">No valid traces found in the file.</div>
      )}
    </div>
  );
};

export default DarkEnhancedTraceViewer;