// components/CodePair.jsx

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar';
import CodeOutput from './CodeOutput';
import ProblemSidebar from './ProblemSidebar';
import './CodePair.css';
import AIChatPanel from './AIChatPanel'; // Import the AI chat panel
import ProblemSearch from './ProblemSearch';

const SOCKET_SERVER_URL = 'http://localhost:5001'; // Change this to your server URL

//have this fetch all problems from leetcode graphql
// then allow you to search through it
// const problems = [
//   { title: 'Two Sum' },
//   { title: 'Reverse Linked List' },
//   { title: 'Valid Parentheses' },
//   { title: 'Merge Intervals' },
//   { title: 'Binary Search' },
//   // Add more problems!
// ];

const CodePair = () => {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [partners, setPartners] = useState({});
  const [messages, setMessages] = useState([]);
  const [code, setCode] = useState('// Start coding here...');
  const [language, setLanguage] = useState('javascript');
  const [error, setError] = useState('');
  const [role, setRole] = useState('interviewee');
  const [output, setOutput] = useState('');
  const [outputError, setOutputError] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [aiChatMessages, setAIChatMessages] = useState([]);
  const socketRef = useRef(null);
  const [problems, setProblems] = useState([]);
  
  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);
    
    socketRef.current.on('connect', () => {
      console.log('Connected to server');
    });

    socketRef.current.on('error', (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 5000); // Clear error after 5 seconds
    });

    socketRef.current.on('room-joined', (data) => {
      setConnected(true);
      setRoomId(data.roomId);
      if (data.initialCode) {
        setCode(data.initialCode);
      }
      if (data.language) {
        setLanguage(data.language);
      }
      setRole(data.role);
    });
    
    socketRef.current.on('user-joined', (data) => {
      console.log('User joined event received:', data);
      
      // Add new user to partners list
      setPartners(prev => {
        const newPartners = {
          ...prev,
          [data.userId]: {
            username: data.username,
            role: data.role
          }
        };
        console.log('Updated partners:', newPartners);
        return newPartners;
      });
      
      setMessages(prev => [...prev, {
        type: 'system',
        content: `${data.username} has joined the room`
      }]);
    });

    socketRef.current.on('user-left', (data) => {
      // Remove user from partners list
      setPartners(prev => {
        const newPartners = { ...prev };
        delete newPartners[data.userId];
        return newPartners;
      });
      
      setMessages(prev => [...prev, {
        type: 'system',
        content: `${data.username} has left the room`
      }]);
    });

    socketRef.current.on('code-update', (data) => {
      setCode(data.code);
    });

    socketRef.current.on('chat-message', (data) => {
      setMessages(prev => [...prev, {
        type: 'user',
        username: data.username,
        content: data.message
      }]);
    });

    socketRef.current.on('question-selected', (data) => {
      console.log('Question selected event received:', data);
      // Check if data contains problem or question property
      if (data.problem) {
        setSelectedQuestion(data.problem);
      } else if (data.question) {
        setSelectedQuestion(data.question);
      }
    });

    socketRef.current.on('language-change', (data) => {
      setLanguage(data.language);
      // Clear output when language changes
      setOutput('');
      setOutputError(null);
    });
    
    // Add new event listeners for code execution
    socketRef.current.on('code-execution-result', (data) => {
      setIsExecuting(false);
      if (data.error) {
        setOutputError(data.error);
        setOutput('');
      } else {
        setOutput(data.result);
        setOutputError(null);
      }
    });

    socketRef.current.on('code-execution-started', () => {
      setIsExecuting(true);
      setOutput('');
      setOutputError(null);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Add this useEffect to fetch problems from backend
  useEffect(() => {
    // Only fetch problems if connected and role is interviewer
    if (connected && role === 'interviewer') {
      fetchProblems();
    }
  }, [connected, role]);

  const fetchProblems = async () => {
    try {
      const response = await fetch('http://localhost:5001/api/problems');
      if (response.ok) {
        const data = await response.json();
        setProblems(data);
      } else {
        console.error('Failed to fetch problems');
        // Set some default problems as fallback
        setProblems([
          { title: 'Two Sum' },
          { title: 'Reverse Linked List' },
          { title: 'Valid Parentheses' },
          { title: 'Merge Intervals' },
          { title: 'Binary Search' },
        ]);
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
      // Set some default problems as fallback
      setProblems([
        { title: 'Two Sum' },
        { title: 'Reverse Linked List' },
        { title: 'Valid Parentheses' },
        { title: 'Merge Intervals' },
        { title: 'Binary Search' },
      ]);
    }
  };

  const joinRoom = (roomToJoin) => {
    if (username && roomToJoin) {
      socketRef.current.emit('join-room', {
        roomId: roomToJoin,
        username,
        role
      });
    }
  };

  const createRoom = () => {
    if (username) {
      socketRef.current.emit('create-room', {
        username,
        role
      });
    }
  };

  const updateCode = (newCode) => {
    setCode(newCode);
    socketRef.current.emit('code-update', {
      roomId,
      code: newCode
    });
  };

  const pickQuestion = (question) => {
    console.log('CodePair picking question:', question);
    setSelectedQuestion(question);
    if (socketRef.current) {
      socketRef.current.emit('question-selected', {
        roomId,
        problem: question,  
      });
    }
  };

  const sendMessage = (message) => {
    if (message.trim() !== '') {
      socketRef.current.emit('chat-message', {
        roomId,
        username,
        message
      });
      setMessages(prev => [...prev, {
        type: 'self',
        content: message
      }]);
    }
  };

  const changeLanguage = (newLanguage) => {
    setLanguage(newLanguage);
    // Clear output when language changes
    setOutput('');
    setOutputError(null);
    
    socketRef.current.emit('language-change', {
      roomId,
      language: newLanguage
    });
  };
  
  // New function to execute code
  const executeCode = () => {
    setIsExecuting(true);
    socketRef.current.emit('execute-code', {
      roomId,
      code,
      language
    });
    
    // Also send a system message to chat that code is being executed
    setMessages(prev => [...prev, {
      type: 'system',
      content: `${username} executed the code`
    }]);
  };

  const copyRoomIdToClipboard = () => {
    navigator.clipboard.writeText(roomId);
    // Show copied notification
    const notification = document.createElement('div');
    notification.className = 'copy-notification';
    notification.textContent = 'Room ID copied to clipboard!';
    document.body.appendChild(notification);
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 2000);
  };

  // Function to display partner information
  const renderPartnersInfo = () => {
    const partnersCount = Object.keys(partners).length;
    
    if (partnersCount === 0) {
      return <span className="waiting">Waiting for someone to join...</span>;
    }
    
    if (partnersCount === 1) {
      const partnerId = Object.keys(partners)[0];
      return <span className="partner">Coding with: {partners[partnerId].username}</span>;
    }
    
    return (
      <span className="partners">
        Coding with: {Object.values(partners).map(p => p.username).join(', ')} 
        ({partnersCount} users)
      </span>
    );
  };


  const analyzeCode = async () => {
    console.log('Analyzing current code...');
  
    if (!code) {
      console.error('No code to analyze');
      return;
    }
  
    const geminiCodeAnalysisPrompt = "I'm an interviewer and my interviewee just gave me this code snippet. Does anything look suspicious, like it might have been generated by a LLM or copied from the internet?\n";
  
    await processText(geminiCodeAnalysisPrompt + code);
  
    console.log('Finished processing code for analysis');
  };

  const processText = async (message) => {
    console.log('Processing text:', message);

    const response = await fetch('http://localhost:9999/process_text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    console.log('Gemini Response:', data.response);

    setAIChatMessages((prevMsg) => [
      ...prevMsg,
      { sender: 'ai', text: data.response }
    ])

    console.log('AI Chat Messages:', aiChatMessages);
  };

  // Example: Call /process_audio endpoint
  const processAudio = async (message) => {
    console.log('Processing audio for message:', message);

    const response = await fetch('http://localhost:9999/process_audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    console.log('Audio Processing Status:', data.status);
  };

  
  if (!connected) {
    return (
      <div className="login-container">
        <h1>CodePair</h1>
        <div className="login-form">
          {error && <div className="error-message">{error}</div>}
          <input
            type="text"
            placeholder="Your Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div className="role-select">
            <label>Select your role:</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="interviewee">Interviewee</option>
              <option value="interviewer">Interviewer</option>
            </select>
          </div>
          <div className="room-actions">
            <div className="action-group">
              <input
                type="text"
                placeholder="Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
              <button onClick={() => joinRoom(roomId)}>Join Room</button>
            </div>
            <div className="action-divider">or</div>
            <button onClick={createRoom}>Create New Room</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="codepair-container">
      <div className="header">
        <div className="logo">
          CodePair - {role === 'interviewer' ? 'Interviewer' : 'Interviewee'}
        </div>
        <div className="room-info">
          Room: <span className="room-id" onClick={copyRoomIdToClipboard} title="Click to copy">{roomId}</span>
          {renderPartnersInfo()}
        </div>

        <div className="controls">
          <button 
            className="execute-button" 
            onClick={executeCode}
            disabled={isExecuting}
          >
            {isExecuting ? 'Running...' : 'Run Code'}
          </button>
          <div className="language-selector">
            <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="java">Java</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        {/* Problem sidebar should be to the left */}
        <ProblemSidebar 
          problems={problems} 
          role={role}
          selectedQuestion={selectedQuestion}
          pickQuestion={pickQuestion}
        />
        
        <div className="editor-output-container">
          {/* Code editor in the middle */}
          <CodeEditor 
            code={code} 
            onChange={updateCode} 
            language={language}
          />
          
          {/* Output below the editor */}
          <CodeOutput 
            output={output}
            isLoading={isExecuting}
            error={outputError}
          />

          {/* For Interviewer: Chat button inside output panel */}
          {role === 'interviewer' && (
            <div>
              <button onClick={analyzeCode} className="analyze-code-button">
                Analyze Code
              </button>
                  
              <button className="chat-toggle-button" onClick={() => setIsChatOpen(!isChatOpen)}>
                {isChatOpen ? 'Close Chat' : 'Open Chat'}
              </button>
            </div>
          )}
        </div>
        
          {/* For Interviewee: Chat button outside as usual */}
          {role !== 'interviewer' && (
            <button className="chat-toggle-button_interviewee" onClick={() => setIsChatOpen(!isChatOpen)}>
              {isChatOpen ? 'Close Chat' : 'Open Chat'}
            </button>
          )}

        {/* For interviewer: AI chat panel to the right */}
        {role === 'interviewer' && (
          <div className="ai-chat-panel">
            <AIChatPanel messages={aiChatMessages}/>
          </div>
        )}
      
      {/* Chat popup */}
      {isChatOpen && (
        <div className={`chat-popup ${role === 'interviewer' ? 'chat-popup-interviewer' : ''}`}>
          <Sidebar 
            messages={messages} 
            sendMessage={sendMessage}
            username={username}
            partners={partners}
            role={role}
          />
        </div>
      )}
    </div>

    </div>
  );
};

export default CodePair;