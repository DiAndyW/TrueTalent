// components/Sidebar.jsx
import React, { useState, useRef, useEffect } from 'react';
import './SideBar.css';

const Sidebar = ({ messages, sendMessage, username, partners, role }) => {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      sendMessage(newMessage);
      setNewMessage('');
    }
  };

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render partners list
  const renderPartners = () => {
    if (!partners || Object.keys(partners).length === 0) {
      return null;
    }

    return Object.values(partners).map((partner, index) => (
      <div className="user-status" key={index}>
        <span className="status-dot online"></span>
        <span>{partner.username} ({partner.role})</span>
      </div>
    ));
  };

  console.log("Current partners:", partners); // Add this log to debug

  return (
    <div className="sidebar">
      <div className="chat-header">
        <h3>Chat</h3>
        <div className="user-status">
          <span className="status-dot online"></span>
          <span>{username} ({role}) (You)</span>
        </div>
        {renderPartners()}
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>No messages yet</p>
            {Object.keys(partners).length === 0 && <p>Waiting for someone to join...</p>}
          </div>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`message-container ${msg.type === 'self' ? 'self' : msg.type === 'system' ? 'system' : 'other'}`}
            >
              {msg.type === 'user' && <div className="message-username">{msg.username}</div>}
              <div className="message-content">{msg.content}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form className="chat-input" onSubmit={handleSendMessage}>
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Sidebar;