// components/CodePair.jsx

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import CodeEditor from './CodeEditor';
import Sidebar from './SideBar'; // Ensure correct import path/name
import CodeOutput from './CodeOutput';
import ProblemSidebar from './ProblemSidebar';
import './CodePair.css';
import AIChatPanel from './AIChatPanel'; // Import the AI chat panel
import Recorder from 'recorder-js';  // `npm install recorder-js`

const SOCKET_SERVER_URL = 'http://localhost:5001'; // Your Socket.IO server
const VIDEO_ANALYSIS_URL = 'http://localhost:5000/analyze_video'; // Your Python Flask backend URL
const GEMINI_TEXT_ANALYSIS_URL = 'http://localhost:9999/process_text'; // Optional: URL for separate text analysis

const CodePair = () => {
  // --- State ---
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
  const audioRecorderRef = useRef(null);
  
  const socketRef = useRef(null);

  // --- Recording State & Refs ---
  const [isRecording, setIsRecording] = useState(false);
  const [isAudioRecording, setIsAudioRecording] = useState(false); // State for audio recording
  const [analysisLoading, setAnalysisLoading] = useState(false); // Loading state for video analysis
  const [analysisError, setAnalysisError] = useState(null); // Error state for video analysis/recording
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const streamRef = useRef(null);
  const selectedMimeTypeRef = useRef('');


  const [qDetail, setQDetail] = useState({});
  

  // Initialize socket connection
  useEffect(() => {
    // Socket setup and listeners (same as before)
    socketRef.current = io(SOCKET_SERVER_URL);
    socketRef.current.on('connect', () => console.log('Connected to Socket.IO server'));
    socketRef.current.on('error', (data) => { console.error('Socket Error:', data); setError(data.message || 'Connection error'); setTimeout(() => setError(''), 5000); });
    socketRef.current.on('room-joined', (data) => { console.log('Room joined:', data); setConnected(true); setRoomId(data.roomId); if (data.initialCode) setCode(data.initialCode); if (data.language) setLanguage(data.language); if (data.users) setPartners(data.users); setRole(data.role); });
    socketRef.current.on('user-joined', (data) => { console.log('User joined:', data); setPartners(prev => ({ ...prev, [data.userId]: { username: data.username, role: data.role }})); setMessages(prev => [...prev, { type: 'system', content: `${data.username} has joined` }]); });
    socketRef.current.on('user-left', (data) => { console.log('User left:', data); setPartners(prev => { const newPartners = { ...prev }; delete newPartners[data.userId]; return newPartners; }); setMessages(prev => [...prev, { type: 'system', content: `${data.username} has left` }]); });
    socketRef.current.on('code-update', (data) => setCode(data.code));
    socketRef.current.on('chat-message', (data) => setMessages(prev => [...prev, { type: 'user', username: data.username, content: data.message }]));
    socketRef.current.on('question-selected', (data) => { console.log('Question selected received:', data); setSelectedQuestion(data.problem || data.question); });
    socketRef.current.on('language-change', (data) => { setLanguage(data.language); setOutput(''); setOutputError(null); });
    socketRef.current.on('code-execution-result', (data) => { setIsExecuting(false); if (data.error) { setOutputError(data.error); setOutput(''); } else { setOutput(data.result); setOutputError(null); } });
    socketRef.current.on('code-execution-started', () => { setIsExecuting(true); setOutput(''); setOutputError(null); });

    // Cleanup
    return () => {
      console.log('CodePair component unmounting...');
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') { try { mediaRecorderRef.current.stop(); } catch (e) { console.error("Error stopping recorder on unmount:", e); } }
      if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); console.log('Camera stream stopped on unmount.'); } else { console.log('No active stream to stop on unmount.'); }
      if (socketRef.current) { socketRef.current.disconnect(); console.log('Socket disconnected on unmount.'); }
    };
  }, []);

  useEffect(() => {
    // Fetch problems if interviewer
    if (connected && role === 'interviewer') { fetchProblems(); }
  }, [connected, role]);

  // --- Functions ---
  const fetchProblems = async () => {
    // Same fetchProblems function as before...
    try {
      const response = await fetch(`${SOCKET_SERVER_URL}/api/problems`);
      if (response.ok) { const data = await response.json(); setProblems(data); }
      else { console.error('Failed to fetch problems, using fallback'); setProblems([ { title: 'Two Sum' }, { title: 'Reverse Linked List' } ]); }
    } catch (error) { console.error('Error fetching problems:', error); setProblems([ { title: 'Two Sum' }, { title: 'Reverse Linked List' } ]); }
  };

  const joinRoom = (roomToJoin) => { /* Same as before */ if (username && roomToJoin && role) { socketRef.current.emit('join-room', { roomId: roomToJoin, username, role }); } else { setError("Please enter username, room ID, and select a role."); } };
  const createRoom = () => { /* Same as before */ if (username && role) { socketRef.current.emit('create-room', { username, role }); } else { setError("Please enter username and select a role."); } };
  const updateCode = (newCode) => { /* Same as before */ setCode(newCode); socketRef.current.emit('code-update', { roomId, code: newCode }); };
  const pickQuestion = (question) => { /* Same as before */ console.log('Picking question:', question); setSelectedQuestion(question); if (socketRef.current && roomId) { socketRef.current.emit('question-selected', { roomId, problem: question }); } };
  const sendMessage = (message) => { /* Same as before */ if (message.trim() !== '' && roomId) { socketRef.current.emit('chat-message', { roomId, username, message }); setMessages(prev => [...prev, { type: 'self', content: message }]); } };
  const changeLanguage = (newLanguage) => { /* Same as before */ setLanguage(newLanguage); setOutput(''); setOutputError(null); if (socketRef.current && roomId) { socketRef.current.emit('language-change', { roomId, language: newLanguage }); } };
  const executeCode = () => { /* Same as before */ if (!roomId) return; setIsExecuting(true); socketRef.current.emit('execute-code', { roomId, code, language }); };
  const copyRoomIdToClipboard = () => { /* Same as before */ if (!roomId) return; navigator.clipboard.writeText(roomId).then(() => { const notification = document.createElement('div'); notification.className = 'copy-notification'; notification.textContent = 'Room ID copied!'; document.body.appendChild(notification); setTimeout(() => { if (document.body.contains(notification)) { document.body.removeChild(notification); } }, 2000); }).catch(err => console.error('Failed to copy Room ID:', err)); };
  const renderPartnersInfo = () => { /* Same as before */ const partnersArray = Object.values(partners).filter(p => p.username !== username); const count = partnersArray.length; if (count === 0) return <span className="waiting">Waiting for partner...</span>; if (count === 1) return <span className="partner">With: {partnersArray[0].username} ({partnersArray[0].role})</span>; return <span className="partners">With: {partnersArray.map(p => `${p.username}(${p.role})`).join(', ')}</span>; };
  const analyzeCodeText = async () => { /* Same as before */ console.log('Analyzing current code text...'); if (!code) { setAIChatMessages((prev) => [...prev, { sender: 'ai', text: 'No code entered to analyze.'}]); return; } const prompt = "Analyze this code snippet submitted by a candidate. Focus on correctness, efficiency, style, and potential plagiarism or LLM generation indicators:\n\n```" + language + "\n" + code + "\n```"; await processTextWithGemini(prompt); console.log('Finished processing code text for analysis'); };
  const processTextWithGemini = async (message) => { /* Same as before */ console.log('Sending text to Gemini analysis backend:', message); setAIChatMessages((prev) => [...prev, { sender: 'user', text: "Analyzing code text..." }]); try { const response = await fetch(GEMINI_TEXT_ANALYSIS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }), }); if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); const data = await response.json(); console.log('Gemini Text Response:', data.response); setAIChatMessages((prevMsg) => [...prevMsg.slice(0, -1), { sender: 'ai', text: data.response }]); } catch (error) { console.error("Failed to process text with Gemini:", error); setAIChatMessages((prevMsg) => [...prevMsg.slice(0, -1), { sender: 'ai', text: `Error analyzing text: ${error.message}` }]); } };


  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new Recorder(new (window.AudioContext || window.webkitAudioContext)());
      await rec.init(stream);
      await rec.start();       
  
      audioRecorderRef.current = rec;
      setIsAudioRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopAudioRecording = async () => {
    if (audioRecorderRef.current) {
      try {
        const { blob } = await audioRecorderRef.current.stop();
        audioRecorderRef.current = null; // Clear the Recorder instance
        setIsAudioRecording(false);
    
        // Send the final audio blob to the Flask API
        const formData = new FormData();
        formData.append('audio', blob, 'recording.wav');
  
        try {
          const response = await fetch('http://localhost:9999/recognize', {
            method: 'POST',
            body: formData,
          });
          const data = await response.json();

          console.log('Final recognized text:', data.transcription);
          
          const sus_prompt = "I'm an interviewer and my interviewee just said this. Does anything sound suspicious, like it might have been generated by a LLM or recited from the internet? What are some follow-up questions I can ask to understand this interviewee candidate better? Give me a brief summary.\n";
          const gemini_response = await fetch('http://localhost:9999/process_text', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: sus_prompt + data.transcription }),
          });
      
          const gemini_data = await gemini_response.json();          
          console.log("Gemini's reply", gemini_data.response);
  
          // Add the final transcription to AI chat messages
          setAIChatMessages((prevMsg) => [
            ...prevMsg,
            { sender: 'ai', text: gemini_data.response },
          ]);
        } catch (error) {
          console.error('Error during final recognition:', error);
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
    }
  }; 

  // --- Video Recording Functions (Modified Toggle Logic) ---

  const handleStartRecording = async () => {
    // Start logic remains the same as before
    if (isRecording) return;
    setAnalysisError(null);
    setAnalysisLoading(false);
    try {
      console.log("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      console.log("Camera access granted.");

      const mimeTypes = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

      if (!supportedMimeType) {
        console.error("No supported MIME type found (MP4 or WebM).");
        setAnalysisError("Browser doesn't support MP4 or WebM recording.");
        alert("Browser doesn't support MP4 or WebM recording.");
        streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null;
        return;
      }
      selectedMimeTypeRef.current = supportedMimeType;
      console.log("Using MIME Type:", supportedMimeType);

      recordedChunksRef.current = [];
      const options = { mimeType: supportedMimeType };
      mediaRecorderRef.current = new MediaRecorder(stream, options);

      mediaRecorderRef.current.ondataavailable = (event) => { if (event.data && event.data.size > 0) { recordedChunksRef.current.push(event.data); } };
      mediaRecorderRef.current.onstop = () => { console.log("onstop event triggered."); sendVideoForAnalysis(); if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); console.log('Camera stream stopped.'); streamRef.current = null; } else { console.log('Stream already cleaned up before onstop.'); } mediaRecorderRef.current = null; };
      mediaRecorderRef.current.onerror = (event) => { console.error("MediaRecorder Error:", event.error); let errorMsg = `Recording error: ${event.error.name}`; if (event.error.message) errorMsg += ` - ${event.error.message}`; setAnalysisError(errorMsg); alert(errorMsg); setIsRecording(false); if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; } mediaRecorderRef.current = null; };

      mediaRecorderRef.current.start();
      setIsRecording(true); // Update state AFTER successful start
      console.log("Recording started...");
      setAIChatMessages((prev) => [...prev, { sender: 'system', text: 'Video recording started.' }]);
    } catch (err) {
      console.error("Error accessing webcam or starting recording:", err);
      let errorMsg = `Failed to start recording: ${err.name || 'Unknown Error'}.`; if (err.message) errorMsg += ` ${err.message}`; errorMsg += " Check camera permissions."; setAnalysisError(errorMsg); alert(errorMsg); setIsRecording(false); if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    }
  };

  const handleStopRecording = () => {
    // Stop logic remains the same as before
    console.log("handleStopRecording called.");
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
        console.log("Stop recording requested via stop()...");
        // Analysis will be triggered by onstop
        // Set loading state immediately for feedback
        setAnalysisLoading(true);
        setAIChatMessages((prev) => [...prev, { sender: 'system', text: 'Video recording stopped. Analyzing...' }]);
      } catch (e) {
        console.error("Error explicitly stopping MediaRecorder:", e);
        setIsRecording(false); setAnalysisLoading(false); if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; } mediaRecorderRef.current = null;
      }
    } else {
      console.warn("Stop called but not recording or recorder not ready. State:", mediaRecorderRef.current?.state);
      setIsRecording(false); setAnalysisLoading(false); // Correct state if called unexpectedly
    }
  };

  const sendVideoForAnalysis = async () => {
    // Analysis logic remains the same as before
    if (recordedChunksRef.current.length === 0) {
      console.warn("No video data recorded.");
      setAnalysisError("No video data was captured to analyze.");
      setIsRecording(false); setAnalysisLoading(false);
      setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: 'No video captured.' }]);
      return;
    }

    // Ensure loading is true when starting analysis, turn off recording state
    setAnalysisLoading(true);
    setAnalysisError(null);
    setIsRecording(false); // Officially stopped recording now

    const blob = new Blob(recordedChunksRef.current, { type: selectedMimeTypeRef.current });
    recordedChunksRef.current = [];

    console.log(`Sending video blob. Size: ${blob.size} bytes, Type: ${blob.type}`);
    if (blob.size === 0) {
      console.error("Blob size is 0."); setAnalysisError("Created video blob has size 0."); setAnalysisLoading(false);
      setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: 'Error: Video blob empty.' }]);
      return;
    }

    try {
      const response = await fetch(VIDEO_ANALYSIS_URL, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error || `Server error ${response.status} (${response.statusText})`;
        console.error('Video analysis failed:', errorMsg); setAnalysisError(`Analysis Error: ${errorMsg}`);
        setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: `Video Analysis Failed: ${errorMsg}` }]);
        alert(`Video Analysis Failed:\n${errorMsg}`);
      } else {
        console.log('Video analysis successful:', data.analysis);
        setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'ai', text: `Video Analysis Result:\n${data.analysis}` }]);
        // alert(`Video Analysis Result:\n\n${data.analysis}`); // Optional alert
      }
    } catch (error) {
      console.error('Network or fetch error during video analysis:', error);
      const errorMsg = `Network Error: ${error.message || 'Could not reach analysis server.'}`;
      setAnalysisError(errorMsg);
      setAIChatMessages((prev) => [...prev.filter(m => m.text !== 'Video recording stopped. Analyzing...'), { sender: 'system', text: `Network Error during Analysis: ${errorMsg}` }]);
      alert(`Network Error during Analysis:\n${errorMsg}`);
    } finally {
      setAnalysisLoading(false); // Turn off loading state
      console.log("sendVideoForAnalysis finished.");
    }
  };

  // --- NEW Combined Toggle Handler ---
  const handleToggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  const handleToggleAudioRecording = () => { 
    if (isAudioRecording) {
      stopAudioRecording();
    } else {
      startAudioRecording();
    }
  };


  // --- Render Logic ---

  if (!connected) {
    // Login Screen (same as before)
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
          {/* --- Combined Video Recording Toggle Button (Interviewer Only) --- */}
          {role === 'interviewer' && (
            <><button
              // Apply base class and dynamic class based on state
              className={`recording-button ${isRecording ? 'stop-recording-button' : 'start-recording-button'}`}
              onClick={handleToggleRecording}
              disabled={analysisLoading} // Disable only when analyzing
              title={isRecording ? 'Stop recording and send video for analysis' : 'Start recording interviewee video for analysis'}
            >
              {/* Dynamic button text */}
              {analysisLoading ? 'Analyzing...' : (isRecording ? 'Stop Video' : 'Start Video')}
            </button>
            
            <button 
                className={`audio-record-button ${isAudioRecording ? 'stop-audio-recording-button' : 'start-audio-recording-button'}`}
                onClick={handleToggleAudioRecording} 
                title={isAudioRecording ? 'Stop audio recording' : 'Start audio recording'}>
                {isAudioRecording ? 'Stop Audio' : 'Start Audio'}
            </button>

            
            <button onClick={analyzeCodeText} className="analyze-code-button">
                Analyze Code Text
            </button></>
          )}
          {/* --- END Combined Recording Button --- */}

          {role === 'interviewee' && (
          <div className="language-selector">
            <select value={language} onChange={(e) => changeLanguage(e.target.value)}>
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
            </select>
          </div>
          )}
        </div>
      </div>

       {/* Display Video Analysis Error below header (same as before) */}
       {analysisError && role === 'interviewer' && (
          <div style={{ color: '#ff9999', textAlign: 'center', padding: '5px 10px', backgroundColor: 'rgba(255, 70, 70, 0.2)', borderBottom: '1px solid #ff5a5a' }}>
            <span role="alert">Video Analysis Error: {analysisError}</span>
          </div>
        )}

      {/* Main Content Area (Layout same as before) */}
      <div className="main-content">

        {/* Problem sidebar should be to the left */}
        <div className="sidebar-container">
          <ProblemSidebar 
            problems={problems} 
            role={role}
            selectedQuestion={selectedQuestion}
            qDetail={qDetail}
            pickQuestion={pickQuestion}
          />
        </div>
        

        <div className="editor-output-container">
          <CodeEditor code={code} onChange={updateCode} language={language} />
          
          {role === 'interviewer' && (
            <div className="interviewer-tools">
              
              <button className="chat-toggle-button" onClick={() => setIsChatOpen(!isChatOpen)}>
                {isChatOpen ? 'Close Comm Chat' : 'Open Comm Chat'}
              </button>
            </div>
          )}
        </div>
        {role === 'interviewer' && (<div className="ai-chat-panel"><AIChatPanel messages={aiChatMessages} /></div>)}
        {role !== 'interviewer' && (<button className="chat-toggle-button_interviewee" onClick={() => setIsChatOpen(!isChatOpen)}>{isChatOpen ? 'Close Chat' : 'Open Chat'}</button>)}
      </div>

      {/* Communication Chat Popup (same as before) */}
      {isChatOpen && (
         <div className={`chat-popup ${role === 'interviewer' ? 'chat-popup-interviewer' : ''}`}>
          <Sidebar messages={messages} sendMessage={sendMessage} username={username} partners={partners} role={role} />
        </div>
      )}
    </div>
  );
};

export default CodePair;