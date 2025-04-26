// components/CodeEditor.jsx
import React from 'react';
import Editor from '@monaco-editor/react';
import './CodeEditor.css';

const CodeEditor = ({ code, onChange, language }) => {
  const handleEditorChange = (value) => {
    onChange(value);
  };

  return (
    <div className="editor-container">
      <Editor
        height="100%"
        width="100%"
        language={language}
        value={code}
        onChange={handleEditorChange}
        theme="vs-dark"
        options={{
          automaticLayout: true,
          fontSize: 14,
          wordWrap: 'on',
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          glyphMargin: true,
          folding: true,
        }}
      />
    </div>
  );
};

export default CodeEditor;