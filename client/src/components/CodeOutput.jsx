import React from 'react';
import './CodeOutput.css';

const CodeOutput = ({ output, isLoading, error }) => {
  return (
    <div className="code-output">
      <div className="output-header">
        <h3>Output</h3>
        {isLoading && <span className="loading-indicator">Running...</span>}
      </div>
      <div className="output-content">
        {error ? (
          <div className="output-error">{error}</div>
        ) : (
          <pre>{output}</pre>
        )}
      </div>
    </div>
  );
};

export default CodeOutput;