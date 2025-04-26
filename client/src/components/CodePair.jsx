// components/CodePair.jsx
// npm install tesseract.js
// npm install html2canvas


import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar';
import './CodePair.css';

import Tesseract from 'tesseract.js';
import html2canvas from 'html2canvas'; 

const SOCKET_SERVER_URL = 'http://localhost:5001'; // Change this to your server URL

const CodePair = () => {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [partners, setPartners] = useState({}); // Changed to an object to store multiple users
  const [messages, setMessages] = useState([]);
  const [code, setCode] = useState('// Start coding here...');
  const [language, setLanguage] = useState('javascript');
  const [error, setError] = useState('');
  const [role, setRole] = useState('interviewee'); 
  const socketRef = useRef(null);
  

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

    socketRef.current.on('language-change', (data) => {
      setLanguage(data.language);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

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
    socketRef.current.emit('language-change', {
      roomId,
      language: newLanguage
    });
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

  const performOCR = async () => {
    console.log('Performing OCR...');

    const editorElement = document.querySelector('.editor-container .monaco-scrollable-element');
    if (!editorElement) {
      console.error('Code editor element not found');
      return;
    }

    const canvas = await html2canvas(editorElement);
    const imageData = canvas.toDataURL('image/png');
    Tesseract.recognize(imageData, 'eng', {
      logger: (info) => console.log(info),
    })
      .then(({ data: { text } }) => {
        console.log('Detected text:', text);
        saveTextForGemini(text);
      })
      .catch((error) => {
        console.error('OCR error:', error);
      });
  };

  const saveTextForGemini = (text) => {
    console.log('Saving text for Gemini:', text);
    // Do something with the text -> Gemini API
  };


  return (
    <div className="codepair-container">
      <div className="header">
        <div className="logo">CodePair</div>
        <div className="room-info">
          Room: <span className="room-id" onClick={copyRoomIdToClipboard} title="Click to copy">{roomId}</span>
          {renderPartnersInfo()}
        </div>

        <button onClick={performOCR} className="ocr-button">
          Perform OCR
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
      <div className="main-content">
        <CodeEditor 
          code={code} 
          onChange={updateCode} 
          language={language}
        />
        <Sidebar 
          messages={messages} 
          sendMessage={sendMessage}
          username={username}
          partners={partners} // Pass the partners object instead of single partner
          role={role}
        />
      </div>
    </div>
  );
};

export default CodePair;