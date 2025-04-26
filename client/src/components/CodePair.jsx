// components/CodePair.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar';
import './CodePair.css';

const SOCKET_SERVER_URL = 'http://localhost:5000'; // Change this to your server URL

const CodePair = () => {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [code, setCode] = useState('// Start coding here...');
  const [language, setLanguage] = useState('javascript');
  const [error, setError] = useState('');
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
    });

    socketRef.current.on('user-joined', (data) => {
      setPartner(data.username);
      setMessages(prev => [...prev, {
        type: 'system',
        content: `${data.username} has joined the room`
      }]);
    });

    socketRef.current.on('user-left', (data) => {
      setPartner(null);
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
        username
      });
    }
  };

  const createRoom = () => {
    if (username) {
      socketRef.current.emit('create-room', {
        username
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
        <div className="logo">CodePair</div>
        <div className="room-info">
          Room: <span className="room-id" onClick={copyRoomIdToClipboard} title="Click to copy">{roomId}</span>
          {partner && <span className="partner">Coding with: {partner}</span>}
          {!partner && <span className="waiting">Waiting for someone to join...</span>}
        </div>
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
          partner={partner}
        />
      </div>
    </div>
  );
};

export default CodePair;