// components/Sidebar.jsx
import React, { useState, useRef, useEffect } from 'react';
import './SideBar.css';

const Sidebar = ({ messages, sendMessage, username, partner, partnerRole, role }) => {
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

  console.log('Role in Sidebar:', role);
  console.log('Partner in Sidebar:', partner);
  console.log('Partner Role in Sidebar:', partnerRole);

  return (
    <div className="sidebar">
      <div className="chat-header">
        <h3>Chat</h3>
        <div className="user-status">
          <span className="status-dot online"></span>
          <span>{username} (You)</span>
        </div>
        {partner && (
          <div className="user-status">
            <span className="status-dot online"></span>
            <span>{partner} {partnerRole && `(${partnerRole})`}</span>
          </div>
        )}
      </div>
      
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <p>No messages yet</p>
            {!partner && <p>Waiting for someone to join...</p>}
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