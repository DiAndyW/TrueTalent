import React, { useRef, useEffect } from 'react';
import './AIChatPanel.css';
import ReactMarkdown from 'react-markdown';
// npm install react-markdown

const AIChatPanel = ({ messages }) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    console.log('Sending message:', input);
    messages.push({ sender: 'user', text: input });
    // messages.push({ sender: 'ai', text: `🤖 ${input}` });

    try {
      const response = await fetch('http://localhost:9999/process_text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input }),
      });
  
      const data = await response.json();
      const aiMessage = { sender: 'ai', text: data.response };
      messages.push(aiMessage);

    } catch (error) {
      console.error('Error processing text:', error);
      const errorMessage = { sender: 'ai', text: 'Sorry, something went wrong.' };
      messages.push(errorMessage);
    }
  
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
            <ReactMarkdown>{msg.text
          .replace(/^\s*\*\s+/gm, '\n') // Remove bullet points (lines starting with a *)
          .replace(/^\s*\d+\.\s+/gm, '\n') // Remove numbered list (lines starting with a number and a dot)
          .replace("* **", "")
          .replace("/ ", "")}</ReactMarkdown>
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
