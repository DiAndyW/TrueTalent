// components/CodePair.jsx
import React, { useState } from 'react';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar';
import './CodePair.css';

const CodePair = () => {
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [code, setCode] = useState('// Start coding here...');
  const [language, setLanguage] = useState('javascript');

  // Simulate joining a room
  const joinRoom = (roomToJoin) => {
    if (username && roomToJoin) {
      setConnected(true);
      setRoomId(roomToJoin);
      // Simulate system message
      setMessages([{
        type: 'system',
        content: `You joined room ${roomToJoin}`
      }]);
    }
  };

  // Simulate creating a room
  const createRoom = () => {
    if (username) {
      // Generate a mock room ID
      const mockRoomId = Math.random().toString(36).substring(2, 10);
      setConnected(true);
      setRoomId(mockRoomId);
      // Simulate system message
      setMessages([{
        type: 'system',
        content: `Room ${mockRoomId} created`
      }]);
    }
  };

  // Simulate partner joining (for demo purposes)
  const simulatePartnerJoin = () => {
    setPartner('Jane Doe');
    setMessages(prev => [...prev, {
      type: 'system',
      content: `Jane Doe has joined the room`
    }]);
  };

  const updateCode = (newCode) => {
    setCode(newCode);
    // In a real app, you would emit this change to the server
  };

  const sendMessage = (message) => {
    if (message.trim() !== '') {
      setMessages(prev => [...prev, {
        type: 'self',
        content: message
      }]);
      
      // Simulate partner response after a delay (for demo purposes)
      if (partner) {
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'user',
            username: partner,
            content: `Thanks for your message: "${message.substring(0, 20)}${message.length > 20 ? '...' : ''}"`
          }]);
        }, 2000);
      }
    }
  };

  const changeLanguage = (newLanguage) => {
    setLanguage(newLanguage);
  };

  if (!connected) {
    return (
      <div className="login-container">
        <h1>CodePair</h1>
        <div className="login-form">
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
          Room: <span className="room-id">{roomId}</span>
          {partner && <span className="partner">Coding with: {partner}</span>}
          {!partner && (
            <button className="invite-button" onClick={simulatePartnerJoin}>
              Simulate Partner Join
            </button>
          )}
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