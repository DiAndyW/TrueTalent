// components/CodePair.jsx

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar'; // Renamed? Ensure correct import path/name
import CodeOutput from './CodeOutput';
import ProblemSidebar from './ProblemSidebar';
import './CodePair.css';
import AIChatPanel from './AIChatPanel'; // Import the AI chat panel

const SOCKET_SERVER_URL = 'http://localhost:5001'; // Your Socket.IO server
const VIDEO_ANALYSIS_URL = 'http://localhost:5000/analyze_video'; // Your Python Flask backend URL
const GEMINI_TEXT_ANALYSIS_URL = 'http://localhost:9999/process_text'; // URL for your separate Gemini text analysis backend (if used)

const CodePair = () => {
  // --- Existing State ---
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [partners, setPartners] = useState({});
  const [messages, setMessages] = useState([]); // Communication messages
  const [code, setCode] = useState('// Start coding here...');
  const [language, setLanguage] = useState('javascript');
  const [error, setError] = useState(''); // General/Login error
  const [role, setRole] = useState('interviewee');
  const [output, setOutput] = useState(''); // Code execution output
  const [outputError, setOutputError] = useState(null); // Code execution error
  const [isExecuting, setIsExecuting] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false); // Communication chat state
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [aiChatMessages, setAIChatMessages] = useState([]); // AI analysis messages
  const [problems, setProblems] = useState([]);
  const socketRef = useRef(null);

  // --- NEW Recording State & Refs ---
  const [isRecording, setIsRecording] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false); // Loading state for video analysis
  const [analysisError, setAnalysisError] = useState(null); // Error state for video analysis/recording
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);
  const selectedMimeTypeRef = useRef(''); // To store the MIME type used for recording

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io(SOCKET_SERVER_URL);

    socketRef.current.on('connect', () => console.log('Connected to Socket.IO server'));
    socketRef.current.on('error', (data) => {
      console.error('Socket Error:', data);
      setError(data.message || 'Connection error');
      setTimeout(() => setError(''), 5000);
    });
    socketRef.current.on('room-joined', (data) => {
      console.log('Room joined:', data);
      setConnected(true);
      setRoomId(data.roomId);
      if (data.initialCode) setCode(data.initialCode);
      if (data.language) setLanguage(data.language);
      if (data.users) setPartners(data.users); // Initialize partners list from server
      setRole(data.role);
    });
    socketRef.current.on('user-joined', (data) => {
      console.log('User joined:', data);
      setPartners(prev => ({ ...prev, [data.userId]: { username: data.username, role: data.role }}));
      setMessages(prev => [...prev, { type: 'system', content: `${data.username} has joined` }]);
    });
    socketRef.current.on('user-left', (data) => {
       console.log('User left:', data);
      setPartners(prev => { const newPartners = { ...prev }; delete newPartners[data.userId]; return newPartners; });
      setMessages(prev => [...prev, { type: 'system', content: `${data.username} has left` }]);
    });
    socketRef.current.on('code-update', (data) => setCode(data.code));
    socketRef.current.on('chat-message', (data) => setMessages(prev => [...prev, { type: 'user', username: data.username, content: data.message }]));
    socketRef.current.on('question-selected', (data) => {
        console.log('Question selected received:', data);
        setSelectedQuestion(data.problem || data.question); // Handle both potential keys
    });
    socketRef.current.on('language-change', (data) => {
      setLanguage(data.language);
      setOutput(''); setOutputError(null); // Clear output
    });
    socketRef.current.on('code-execution-result', (data) => {
      setIsExecuting(false);
      if (data.error) { setOutputError(data.error); setOutput(''); }
      else { setOutput(data.result); setOutputError(null); }
    });
    socketRef.current.on('code-execution-started', () => {
      setIsExecuting(true); setOutput(''); setOutputError(null);
    });

    // Cleanup on component unmount
    return () => {
      console.log('CodePair component unmounting...');
      // Stop recording and stream if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          try { mediaRecorderRef.current.stop(); } catch (e) { console.error("Error stopping recorder on unmount:", e); }
      }
      if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          console.log('Camera stream stopped on unmount.');
      } else {
          console.log('No active stream to stop on unmount.');
      }
      if (socketRef.current) {
          socketRef.current.disconnect();
          console.log('Socket disconnected on unmount.');
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Fetch problems
  useEffect(() => {
    if (connected && role === 'interviewer') {
      fetchProblems();
    }
  }, [connected, role]);

  const fetchProblems = async () => {
    try {
      const response = await fetch(`${SOCKET_SERVER_URL}/api/problems`); // Use base URL
      if (response.ok) {
        const data = await response.json();
        setProblems(data);
      } else {
        console.error('Failed to fetch problems, using fallback');
        setProblems([ { title: 'Two Sum' }, { title: 'Reverse Linked List' } ]); // Minimal fallback
      }
    } catch (error) {
      console.error('Error fetching problems:', error);
      setProblems([ { title: 'Two Sum' }, { title: 'Reverse Linked List' } ]); // Minimal fallback
    }
  };

  // --- Existing Functions ---
  const joinRoom = (roomToJoin) => {
    if (username && roomToJoin && role) {
      socketRef.current.emit('join-room', { roomId: roomToJoin, username, role });
    } else {
        setError("Please enter username, room ID, and select a role.");
    }
  };

  const createRoom = () => {
    if (username && role) {
      socketRef.current.emit('create-room', { username, role });
    } else {
        setError("Please enter username and select a role.");
    }
  };

  const updateCode = (newCode) => {
    setCode(newCode);
    socketRef.current.emit('code-update', { roomId, code: newCode });
  };

  const pickQuestion = (question) => {
    console.log('Picking question:', question);
    setSelectedQuestion(question);
    if (socketRef.current && roomId) {
      socketRef.current.emit('question-selected', { roomId, problem: question });
    }
  };

  const sendMessage = (message) => { // For communication chat
    if (message.trim() !== '' && roomId) {
      socketRef.current.emit('chat-message', { roomId, username, message });
      // Add message locally immediately for better UX
      setMessages(prev => [...prev, { type: 'self', content: message }]);
    }
  };

  const changeLanguage = (newLanguage) => {
    setLanguage(newLanguage);
    setOutput(''); setOutputError(null); // Clear output on language change
    if (socketRef.current && roomId) {
        socketRef.current.emit('language-change', { roomId, language: newLanguage });
    }
  };

  const executeCode = () => {
    if (!roomId) return;
    setIsExecuting(true);
    socketRef.current.emit('execute-code', { roomId, code, language });
    // Optionally add system message to communication chat
    // setMessages(prev => [...prev, { type: 'system', content: `${username} executed the code` }]);
  };

  const copyRoomIdToClipboard = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId).then(() => {
      const notification = document.createElement('div');
      notification.className = 'copy-notification';
      notification.textContent = 'Room ID copied!';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
            document.body.removeChild(notification);
        }
      }, 2000);
    }).catch(err => console.error('Failed to copy Room ID:', err));
  };

  const renderPartnersInfo = () => {
    const partnersArray = Object.values(partners).filter(p => p.username !== username); // Exclude self
    const count = partnersArray.length;
    if (count === 0) return <span className="waiting">Waiting for partner...</span>;
    if (count === 1) return <span className="partner">With: {partnersArray[0].username} ({partnersArray[0].role})</span>;
    return <span className="partners">With: {partnersArray.map(p => `${p.username}(${p.role})`).join(', ')}</span>;
  };

  // --- Text Analysis Function (Optional - Requires separate backend) ---
  const analyzeCodeText = async () => {
    console.log('Analyzing current code text...');
    if (!code) {
        setAIChatMessages((prev) => [...prev, { sender: 'ai', text: 'No code entered to analyze.'}]);
        return;
    }
    const geminiCodeAnalysisPrompt = "As an interviewer, analyze this code snippet submitted by a candidate. Focus on correctness, efficiency, style, and potential plagiarism or LLM generation indicators:\n\n```" + language + "\n" + code + "\n```";
    await processTextWithGemini(geminiCodeAnalysisPrompt);
    console.log('Finished processing code text for analysis');
  };

  const processTextWithGemini = async (message) => {
    console.log('Sending text to Gemini analysis backend:', message);
    setAIChatMessages((prev) => [...prev, { sender: 'user', text: "Analyzing code text..." }]); // Show user prompt
    try {
      const response = await fetch(GEMINI_TEXT_ANALYSIS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }), // Send the prompt
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      console.log('Gemini Text Response:', data.response);
      // Replace "Analyzing..." with the actual response
      setAIChatMessages((prevMsg) => [
          ...prevMsg.slice(0, -1), // Remove the "Analyzing..." message
          { sender: 'ai', text: data.response }
      ]);
    } catch (error) {
      console.error("Failed to process text with Gemini:", error);
      // Replace "Analyzing..." with the error message
      setAIChatMessages((prevMsg) => [
        ...prevMsg.slice(0, -1),
        { sender: 'ai', text: `Error analyzing text: ${error.message}` }
      ]);
    }
  };

  // --- NEW Video Recording Functions ---

  const handleStartRecording = async () => {
    if (isRecording) return;

    setAnalysisError(null); // Clear previous errors
    setAnalysisLoading(false); // Ensure loading is false initially

    try {
      // 1. Get Media Stream
      console.log("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      console.log("Camera access granted.");

      // 2. Choose MIME type (prioritize mp4, fallback webm)
      const mimeTypes = [
        'video/mp4;codecs=avc1.42E01E', // Try specific MP4 (H.264)
        'video/mp4',                   // Generic MP4
        'video/webm;codecs=vp9,opus', // VP9 often better quality/compression
        'video/webm;codecs=vp8,opus', // VP8 wider support
        'video/webm',                  // Generic WebM
      ];
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        console.error("No supported MIME type found for recording (MP4 or WebM).");
        setAnalysisError("Browser doesn't support MP4 or WebM recording.");
        alert("Your browser doesn't support MP4 or WebM recording needed for analysis.");
        streamRef.current.getTracks().forEach(track => track.stop()); // Release stream
        streamRef.current = null;
        return;
      }
      selectedMimeTypeRef.current = supportedMimeType; // Store the chosen type
      console.log("Using MIME Type for recording:", supportedMimeType);


      // 3. Create MediaRecorder
      recordedChunksRef.current = []; // Clear previous chunks
      const options = { mimeType: supportedMimeType };
      mediaRecorderRef.current = new MediaRecorder(stream, options);

      // 4. Setup Event Listeners
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        //   console.log(`Recorded chunk size: ${event.data.size}`); // Can be verbose
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log("Recording stopped via onstop event.");
        // IMPORTANT: Call analysis AFTER state is fully stopped
        // Call sendVideoForAnalysis directly here can lead to race conditions if called elsewhere too
        sendVideoForAnalysis();

        // Clean up stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            console.log('Camera stream stopped.');
            streamRef.current = null;
        } else {
            console.log('Stream already cleaned up before onstop.');
        }
        mediaRecorderRef.current = null; // Clear recorder instance
        // Don't set isRecording false here, it's handled in handleStopRecording or after sendVideo
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error("MediaRecorder Error:", event.error);
        let errorMsg = `Recording error: ${event.error.name}`;
        if (event.error.message) errorMsg += ` - ${event.error.message}`;
        setAnalysisError(errorMsg);
        alert(errorMsg); // Notify user
        setIsRecording(false); // Force stop state
         // Clean up stream on error too
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
      };

      // 5. Start Recording
      mediaRecorderRef.current.start(); // Start recording indefinitely until stop() is called
      setIsRecording(true);
      console.log("Recording started...");
      // Add message to AI chat
      setAIChatMessages((prev) => [...prev, { sender: 'system', text: 'Video recording started.' }]);


    } catch (err) {
      console.error("Error accessing webcam or starting recording:", err);
      let errorMsg = `Failed to start recording: ${err.name || 'Unknown Error'}.`;
      if (err.message) errorMsg += ` ${err.message}`;
      errorMsg += " Check camera permissions.";
      setAnalysisError(errorMsg);
      alert(errorMsg);
      setIsRecording(false);
      // Ensure stream is cleaned up if partially obtained
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const handleStopRecording = () => {
    console.log("handleStopRecording called.");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop(); // This will trigger the 'onstop' event where analysis is called
        console.log("Stop recording requested via stop()...");
        // Do NOT set isRecording false here, wait for onstop or sendVideoForAnalysis completion
        setAIChatMessages((prev) => [...prev, { sender: 'system', text: 'Video recording stopped. Analyzing...' }]);

      } catch (e) {
        console.error("Error explicitly stopping MediaRecorder:", e);
        // Force cleanup if stop fails
        setIsRecording(false);
        setAnalysisLoading(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        mediaRecorderRef.current = null;
      }
    } else {
      console.warn("Stop called but not recording or recorder not ready. Current state:", mediaRecorderRef.current?.state);
      // Ensure states are correct if stop is called unexpectedly
      setIsRecording(false);
      setAnalysisLoading(false);
    }
  };

  const sendVideoForAnalysis = async () => {
    if (recordedChunksRef.current.length === 0) {
      console.warn("No video data recorded.");
      setAnalysisError("No video data was captured to analyze.");
      setIsRecording(false); // Ensure recording state is off
      setAnalysisLoading(false);
      setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: 'No video captured.' }]);
      return;
    }

    setAnalysisLoading(true); // Set loading true HERE
    setAnalysisError(null);
    setIsRecording(false); // Set recording state false HERE, after check

    // Create a Blob from the recorded chunks
    const blob = new Blob(recordedChunksRef.current, { type: selectedMimeTypeRef.current });
    recordedChunksRef.current = []; // Clear chunks after creating blob

    console.log(`Sending video blob. Size: ${blob.size} bytes, Type: ${blob.type}`);
    if (blob.size === 0) {
        console.error("Blob size is 0, cannot send.");
        setAnalysisError("Created video blob has size 0.");
        setAnalysisLoading(false);
        setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: 'Error: Video blob empty.' }]);
        return;
    }

    try {
      const response = await fetch(VIDEO_ANALYSIS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type, // Send the correct MIME type
        },
        body: blob,
      });

      const data = await response.json(); // Assume server always returns JSON

      if (!response.ok) {
        // Handle server-side errors (like 4xx, 5xx) reported in JSON
        const errorMsg = data.error || `Server error ${response.status} (${response.statusText})`;
        console.error('Video analysis failed:', errorMsg);
        setAnalysisError(`Analysis Error: ${errorMsg}`);
        // Update AI Chat
        setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: `Video Analysis Failed: ${errorMsg}` }]);
        alert(`Video Analysis Failed:\n${errorMsg}`); // Also notify user via alert
      } else {
        // Success
        console.log('Video analysis successful:', data.analysis);
        // Display the analysis result in AI Chat Panel
        setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'ai', text: `Video Analysis Result:\n${data.analysis}` }]);
        // Optionally, still show alert for immediate feedback
        // alert(`Video Analysis Result:\n\n${data.analysis}`);
      }
    } catch (error) {
      console.error('Network or fetch error during video analysis:', error);
      const errorMsg = `Network Error: ${error.message || 'Could not reach analysis server.'}`;
      setAnalysisError(errorMsg);
      // Update AI Chat
      setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: `Network Error during Analysis: ${errorMsg}` }]);
      alert(`Network Error during Analysis:\n${errorMsg}`); // Notify user via alert
    } finally {
      setAnalysisLoading(false); // Ensure loading is turned off
      console.log("sendVideoForAnalysis finished.");
    }
  };


  // --- Render Logic ---

  if (!connected) {
    // Login Screen
    return (
      <div className="login-container">
        <h1>CodePair</h1>
        <div className="login-form">
          {error && <div className="error-message">{error}</div>}
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required/>
          <div className="role-select">
            <label htmlFor="role-select-id">Role:</label>
            <select id="role-select-id" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="interviewee">Interviewee</option>
              <option value="interviewer">Interviewer</option>
            </select>
          </div>
          <div className="room-actions">
            <div className="action-group">
              <input type="text" placeholder="Room ID to Join" value={roomId} onChange={(e) => setRoomId(e.target.value)} />
              <button onClick={() => joinRoom(roomId)} disabled={!username || !roomId || !role}>Join Room</button>
            </div>
            <div className="action-divider">or</div>
            <button onClick={createRoom} disabled={!username || !role}>Create New Room</button>
          </div>
        </div>
      </div>
    );
  }

  // Main CodePair Screen
  return (
    <div className="codepair-container">
      <div className="header">
        <div className="logo">
          CodePair - {role === 'interviewer' ? 'Interviewer' : 'Interviewee'} View
        </div>
        <div className="room-info">
          Room: <span className="room-id" onClick={copyRoomIdToClipboard} title="Click to copy">{roomId || 'N/A'}</span>
          {renderPartnersInfo()}
        </div>

        <div className="controls">
          {/* --- Video Recording Buttons (Interviewer Only) --- */}
          {role === 'interviewer' && (
            <>
              <button
                className="recording-button start-recording-button"
                onClick={handleStartRecording}
                disabled={isRecording || analysisLoading}
                title="Start recording interviewee video for analysis"
              >
                {isRecording ? 'Recording...' : 'Start Rec'}
              </button>
              <button
                className="recording-button stop-recording-button"
                onClick={handleStopRecording}
                disabled={!isRecording || analysisLoading}
                title="Stop recording and send video for analysis"
              >
                {analysisLoading ? 'Analyzing...' : 'Stop Rec'}
              </button>
            </>
          )}
          {/* --- END Recording Buttons --- */}

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
              <option value="java">Java</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>
          </div>
        </div>
      </div>

       {/* Display Video Analysis Error below header */}
       {analysisError && role === 'interviewer' && (
          <div style={{ color: '#ff9999', textAlign: 'center', padding: '5px 10px', backgroundColor: 'rgba(255, 70, 70, 0.2)', borderBottom: '1px solid #ff5a5a' }}>
            <span role="alert">Video Analysis Error: {analysisError}</span>
          </div>
        )}

      <div className="main-content">
        {/* Left: Problem Sidebar */}
        <ProblemSidebar
          problems={problems}
          role={role}
          selectedQuestion={selectedQuestion}
          pickQuestion={pickQuestion}
        />

        {/* Center: Editor and Output */}
        <div className="editor-output-container">
          <CodeEditor
            code={code}
            onChange={updateCode}
            language={language}
          />
          <CodeOutput
            output={output}
            isLoading={isExecuting}
            error={outputError}
          />

          {/* Buttons below Output (Interviewer only) */}
          {role === 'interviewer' && (
            <div className="interviewer-tools" style={{ padding: '10px', borderTop: '1px solid #383838', display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
              <button onClick={analyzeCodeText} className="analyze-code-button">
                Analyze Code Text
              </button>
              {/* Communication Chat Toggle Button (for Interviewer) */}
              <button className="chat-toggle-button" onClick={() => setIsChatOpen(!isChatOpen)}>
                {isChatOpen ? 'Close Comm Chat' : 'Open Comm Chat'}
              </button>
            </div>
          )}
        </div>

        {/* Right: AI Chat Panel (Interviewer only) */}
        {role === 'interviewer' && (
          <div className="ai-chat-panel">
            <AIChatPanel messages={aiChatMessages} />
          </div>
        )}

         {/* Communication Chat Toggle Button (for Interviewee, fixed bottom right) */}
         {role !== 'interviewer' && (
            <button className="chat-toggle-button_interviewee" onClick={() => setIsChatOpen(!isChatOpen)}>
              {isChatOpen ? 'Close Chat' : 'Open Chat'}
            </button>
          )}

      </div> {/* End main-content */}

      {/* Communication Chat Popup (Conditional Render) */}
      {isChatOpen && (
         <div className={`chat-popup ${role === 'interviewer' ? 'chat-popup-interviewer' : ''}`}>
          {/* Ensure Sidebar component is correctly named and imported */}
          <Sidebar
            messages={messages}
            sendMessage={sendMessage}
            username={username}
            partners={partners}
            role={role}
          />
        </div>
      )}

    </div> // End codepair-container
  );
};

export default CodePair;