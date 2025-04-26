import React, { useState, useRef, useEffect } from 'react';
import './AIChatPanel.css';

const AIChatPanel = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const sendMessage = () => {
    if (!input.trim()) return;

    const userMessage = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);

    setTimeout(() => {
      const aiResponse = { sender: 'ai', text: `🤖 AI says: "${input}"` };
      setMessages(prev => [...prev, aiResponse]);
    }, 800);

    setInput('');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="ai-chat-container">
      <div className="ai-header">AI Assistant</div>
      
      <div className="ai-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`ai-message ${msg.sender}`}>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-input-area">
        <input 
          type="text"
          placeholder="Ask AI anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>➤</button>
      </div>
    </div>
  );
};

export default AIChatPanel;
