import os
import base64
import google.generativeai as genai
from flask import Flask, request, jsonify, Response
from dotenv import load_dotenv
import datetime
import traceback # For detailed error logging
import tempfile # For handling temporary files
import cv2      # OpenCV for video processing
import math     # For frame rate calculations
# Removed: import subprocess, import time

# --- Configuration ---
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file or environment variables.")

genai.configure(api_key=API_KEY)

MODEL_NAME = "gemini-2.5-flash-preview-04-17"

try:
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"Gemini model '{MODEL_NAME}' loaded successfully.")
except Exception as e:
    print(f"Fatal Error: Could not load Gemini model '{MODEL_NAME}': {e}")
    traceback.print_exc()
    exit(1)

app = Flask(__name__)

# --- Gemini Prompt (Frame Analysis) ---
# Prompt remains the same as the previous frame-analysis version
GEMINI_PROMPT = """
Analyze this sequence of image frames, extracted approximately one second apart from a short video clip (around 5-10 seconds) of an online technical interview.
Based *only* on the visual information in these frames, identify potential cheating behaviors or indicators of dishonesty. Focus on:

1.  **Sustained Off-Screen Gaze:** Across multiple frames, is the interviewee consistently looking significantly away from the screen (up, down, far left/right), suggesting reading external material? Note the duration implied by the number of frames showing this. Differentiate from brief thinking glances visible in only one or two frames.
2.  **Eye Movement:** Across the frames, is the interviewee making minor eye moevements or not directly looking straight. Any iris movements indicating reading or searching up.
3.  **Interaction with Hidden Items:** Do any frames show hands moving towards or interacting with unseen objects/devices below camera view? Does body posture change suspiciously across frames in a way that suggests hidden interaction?
4.  **Suspicious Lip Movement:** In frames where the interviewee shouldn't be speaking, is there evidence of subtle lip movement or mouthing words, potentially indicating reading or receiving input?
5.  **Anomalous Activity Correlation:** Do the frames show patterns like intently looking away *just before* or *during* visible pauses in activity (e.g., stopping typing, looking static before code appears)?
6.  **Other Highly Suspicious Actions:** Any frames showing attempts to obscure the face/screen, frequent camera blockage, clear presence of others (reflections/shadows), or actions clearly inconsistent with a focused interview setting.

**Output Format:**
- Provide a concise summary of visual observations based on the sequence of frames.
- Rate the likelihood of suspicious behavior depicted across these frames: 'Low', 'Medium', or 'High'.
- **If 'Medium' or 'High', briefly state the specific observed behavior(s)** and across which frames (if discernible) it occurred.
- If 'Low', state 'Low - No specific visual concerns noted in this frame sequence.' OR 'Low - Could not process video chunk [reason].' if processing failed.
- Be objective. Avoid definitive accusations. Base the rating *only* on this image sequence.
"""

# --- Constants ---
FRAMES_PER_SECOND_TO_EXTRACT = 1

# --- Helper Function to Safely Delete Files ---
def safe_delete(filepath):
    if filepath and os.path.exists(filepath):
        try:
            os.remove(filepath)
            print(f"Cleaned up temporary file: {filepath}")
        except OSError as e:
            print(f"Error deleting temporary file {filepath}: {e}")

# --- API Endpoint for Analysis (Direct OpenCV Frame Extraction) ---
@app.route('/analyze_chunk', methods=['POST'])
def analyze_video_chunk():
    """
    Receives video chunk, saves temporarily, attempts frame extraction with OpenCV,
    sends frames to Gemini, returns analysis. Tolerates OpenCV failures on chunks.
    """
    if not request.data:
        print("Error: Received request with no data.")
        return jsonify({"error": "No video data received."}), 400

    content_type = request.content_type
    if not content_type or not content_type.startswith('video/'):
        print(f"Error: Invalid Content-Type: {content_type}")
        return jsonify({"error": f"Invalid Content-Type: '{content_type}'. Expected video/*."}), 400

    video_data = request.data
    print(f"Received video chunk. Size: {len(video_data)} bytes, Type: {content_type}")

    temp_filename = None
    cap = None # Initialize capture object

    try:
        # 1. Save blob to a temporary file
        suffix = '.bin' # Use generic suffix initially
        if 'mp4' in content_type: suffix = '.mp4'
        elif 'webm' in content_type: suffix = '.webm'
        elif 'ogg' in content_type: suffix = '.ogv'
        # Create temp file - delete=False needed for OpenCV to access by path
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_video_file:
            temp_filename = temp_video_file.name
            temp_video_file.write(video_data)
        print(f"Video chunk saved to temporary file: {temp_filename}")

        # 2. Attempt to open with OpenCV (This is the potentially failing step)
        print(f"Attempting to open with OpenCV: {temp_filename}")
        cap = cv2.VideoCapture(temp_filename)

        # *** CRITICAL CHECK: Did OpenCV open the file? ***
        if not cap or not cap.isOpened():
            print(f"Error: OpenCV could not open temporary video file: {temp_filename}. Skipping analysis for this chunk.")
            # Return a specific 'Low' status indicating processing failure for this chunk
            return jsonify({
                "analysis": "Low - Could not process video chunk (OpenCV failed to open file).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 3. Check video metadata (FPS, Frame Count)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) # Cast to int
        print(f"Video properties reported by OpenCV: FPS={fps:.2f}, TotalFrames={total_frames}")

        # *** CRITICAL CHECK: Is metadata valid? ***
        # Check for non-positive FPS or unrealistic frame count (negative or zero)
        if fps <= 0 or total_frames <= 0:
            print(f"Warning: Video has invalid metadata (FPS={fps}, Frames={total_frames}). Skipping analysis for this chunk.")
            cap.release() # Release the capture object
            cap = None
            return jsonify({
                "analysis": "Low - Could not process video chunk (Invalid metadata detected).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # Metadata seems okay, proceed with frame extraction
        frame_interval = max(1, int(math.ceil(fps / FRAMES_PER_SECOND_TO_EXTRACT)))
        print(f"Extracting frame every {frame_interval} frames (approx {FRAMES_PER_SECOND_TO_EXTRACT}/sec).")

        extracted_frames_base64 = []
        frame_count = 0
        extracted_count = 0

        while True:
            try:
                ret, frame = cap.read() # Read next frame
            except Exception as read_err:
                # Catch potential errors during frame reading itself
                print(f"Error reading frame {frame_count} from video: {read_err}")
                traceback.print_exc()
                break # Stop processing this chunk on read error

            if not ret:
                print(f"End of video stream reached after reading {frame_count} frames.")
                break # End of video

            # Extract frame at the calculated interval
            if frame_count % frame_interval == 0:
                # Encode frame as JPEG
                success, encoded_image = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if success:
                    # Base64 encode the JPEG frame
                    frame_base64 = base64.b64encode(encoded_image).decode('utf-8')
                    extracted_frames_base64.append(frame_base64)
                    extracted_count += 1
                else:
                     print(f"Warning: Failed to encode frame {frame_count} as JPEG.")
            frame_count += 1

        # Release capture object after loop
        cap.release()
        cap = None
        print(f"Successfully attempted extraction, {extracted_count} frames encoded.")

        if not extracted_frames_base64:
            # This could happen if the video was valid but shorter than one frame_interval
            print("Warning: No frames were extracted based on interval (video might be short or interval too large).")
            # Return a specific 'Low' status
            return jsonify({
                "analysis": "Low - No frames extracted (video chunk too short?).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 4. Prepare API request with image parts
        image_parts = [ {"mime_type": "image/jpeg", "data": frame_b64} for frame_b64 in extracted_frames_base64 ]

        # --- Call Gemini API ---
        # (API call and response processing logic remains the same)
        print(f"Sending request with {len(image_parts)} image frames to Gemini model '{MODEL_NAME}'...")
        generation_config = genai.types.GenerationConfig(temperature=0.2)
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
        ]

        response = model.generate_content(
            [GEMINI_PROMPT] + image_parts,
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=False
        )

        # --- Process Gemini Response ---
        analysis_text = "Error: Analysis could not be generated."
        try:
            if not response.parts:
                feedback_reason = str(response.prompt_feedback) if hasattr(response, 'prompt_feedback') and response.prompt_feedback else "Unknown reason."
                analysis_text = f"Analysis blocked or Gemini returned no content. Reason: {feedback_reason}"
                print(f"Gemini response issue: {analysis_text}. Full response object: {response}")
            else:
                 analysis_text = response.text
                 print(f"Gemini Analysis Result: {analysis_text}")
        except (ValueError, AttributeError) as e:
             print(f"Error accessing Gemini response text or unexpected structure: {e}")
             analysis_text = "Error processing Gemini response."
             if hasattr(response, 'prompt_feedback') and response.prompt_feedback: analysis_text += f" (Prompt Feedback: {str(response.prompt_feedback)})"
             print(f"Full Gemini response object: {response}")

        # --- Return Result ---
        return jsonify({"analysis": analysis_text, "timestamp": datetime.datetime.now().isoformat()})

    except genai.types.generation_types.BlockedPromptException as bpe:
         print(f"--- Gemini API Blocked Prompt ---"); print(f"Error: {bpe}")
         reason = str(bpe.response.prompt_feedback) if hasattr(bpe, 'response') and hasattr(bpe.response, 'prompt_feedback') else "details unavailable"
         return jsonify({"error": f"Analysis blocked by safety filter: {reason}"}), 400
    except Exception as e:
        print(f"--- Error during analysis (Outer Try Block) ---")
        traceback.print_exc()
        error_message = f"Server error during analysis: {str(e)}"
        status_code = 500
        # Basic error type check based on string content
        if "invalid argument" in str(e).lower(): error_message = f"Server error: Gemini reported 'Invalid Argument'. Original error: {str(e)}"; status_code = 400
        elif "internal error" in str(e).lower(): error_message = f"Server error: Gemini reported an 'Internal Error'. Original error: {str(e)}"; status_code = 502
        return jsonify({"error": error_message}), status_code

    finally:
        # Clean up temporary file ALWAYS
        if cap and cap.isOpened(): # Ensure release if error happened mid-processing
            cap.release()
            print("Released OpenCV capture object in finally block.")
        safe_delete(temp_filename)


# --- HTML Frontend Route ---
@app.route('/')
def index():
    """Serves the HTML page with webcam capture and analysis display."""
    # HTML includes updated JavaScript to prioritize MP4
    html_content = """
<!DOCTYPE html>
<html>
<head>
    <title>Live Interview Analysis (Pip Only)</title>
    <meta charset="UTF-8">
    <style>
        /* CSS styles remain the same as before */
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        .container { display: flex; width: 90%; max-width: 1200px; gap: 20px; }
        #capture-area { flex: 2; border: 1px solid #ccc; padding: 15px; background-color: #f0f0f0; }
        #analysis-area { flex: 1; border: 1px solid #ccc; padding: 15px; background-color: #f9f9f9; display: flex; flex-direction: column; }
        video { display: block; margin-bottom: 10px; background-color: #333; max-width: 100%; border: 1px solid black; }
        #results { flex-grow: 1; overflow-y: auto; border-top: 1px solid #ddd; margin-top: 10px; padding-top: 10px; min-height: 300px;}
        .entry { border-bottom: 1px dashed #eee; padding: 8px 5px; margin-bottom: 8px; font-size: 0.9em; }
        .entry time { font-size: 0.8em; color: #777; display: block; margin-bottom: 3px; }
        .entry p { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
        .entry.medium { border-left: 4px solid orange; padding-left: 8px; background-color: #fff3e0; }
        .entry.high { border-left: 4px solid red; padding-left: 8px; font-weight: bold; background-color: #ffebee; }
        .entry.error { border-left: 4px solid black; padding-left: 8px; color: red; background-color: #eee; }
        .entry.warning { border-left: 4px solid grey; padding-left: 8px; color: #555; background-color: #eee; } /* Style for processing issues */
        button { padding: 10px 15px; font-size: 1em; cursor: pointer; margin-right: 10px; }
        button:disabled { cursor: not-allowed; background-color: #ccc; }
        #status { margin-top: 10px; font-style: italic; min-height: 1.2em; }
        .status-recording { color: red; font-weight: bold; }
        .status-processing { color: blue; }
        .status-idle { color: grey; }
        .status-error { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Live Interview Analysis Feed (Pip Only Mode)</h1>
    <p><strong>Consent Required:</strong> Video is recorded and analyzed by AI for integrity purposes.</p>
    <p><i>Using direct OpenCV processing (no FFmpeg). Some video chunks might fail processing.</i></p>

    <div class="container">
        <div id="capture-area">
            <h2>Interviewee View</h2>
            <video id="webcam" autoplay muted playsinline width="640" height="480"></video>
            <div>
                <button id="startButton">Start Recording</button>
                <button id="stopButton" disabled>Stop Recording</button>
            </div>
            <div id="status" class="status-idle">Please grant webcam access and click Start.</div>
        </div>

        <div id="analysis-area">
            <h2>Analysis Feed (Updates periodically)</h2>
            <div id="results">
                <!-- Analysis results appear here -->
            </div>
        </div>
    </div>

    <script>
        // --- Frontend JavaScript (Prioritizes MP4) ---
        const videoElement = document.getElementById('webcam');
        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        const statusElement = document.getElementById('status');
        const resultsDiv = document.getElementById('results');
        const UPLOAD_INTERVAL = 8000; // 8 seconds
        const BACKEND_UPLOAD_URL = '/analyze_chunk';
        let mediaRecorder; let recordedChunks = []; let stream; let uploadIntervalId = null; let isRecording = false; let forceStop = false; let currentMimeType = '';

        async function initWebcam() { /* ... same as before ... */ try { statusElement.textContent = "Requesting webcam access..."; stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); videoElement.srcObject = stream; await videoElement.play(); statusElement.textContent = 'Webcam ready. Click Start Recording.'; statusElement.className = 'status-idle'; startButton.disabled = false; console.log("Webcam stream acquired."); } catch (err) { console.error("Error accessing webcam:", err); statusElement.textContent = `ERROR: Webcam access denied or unavailable - ${err.message}`; statusElement.className = 'status-error'; startButton.disabled = true; alert(`Could not access webcam. Please ensure permission is granted and no other application is using it.\nError: ${err.message}`); } }

        function startRecording() {
            if (!stream || isRecording) { return; }
            forceStop = false;

            // *** MIME TYPE PRIORITIZATION ***
            const mimeTypes = [
                // Try MP4 first if supported - might be more robust for OpenCV direct read
                'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // Common H.264/AAC MP4
                'video/mp4;codecs=h264,aac',             // Simpler MP4 definition
                'video/mp4',                             // Generic MP4
                // Fallback to WebM VP8/VP9
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8',
                'video/webm',
            ];
            currentMimeType = mimeTypes.find(type => {
                 console.log(`Checking support for: ${type}`); // Log check
                 return MediaRecorder.isTypeSupported(type);
            });
            // *** END MIME TYPE PRIORITIZATION ***

            if (!currentMimeType) {
                console.error("No suitable MIME type found (MP4 or WebM).");
                statusElement.textContent = "ERROR: Cannot record video in a supported format."; statusElement.className = 'status-error';
                alert("Your browser doesn't support MP4 or WebM recording needed for this tool."); return;
            }
            console.log("Using MIME Type:", currentMimeType); // Log the selected type

            try {
                // Recording logic remains the same as before
                recordedChunks = []; const options = { mimeType: currentMimeType }; mediaRecorder = new MediaRecorder(stream, options);
                mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) { console.log(`Data available: ${event.data.size} bytes`); recordedChunks.push(event.data); sendChunkToServer(); } else { console.log("Empty data chunk."); } };
                mediaRecorder.onstart = () => { isRecording = true; startButton.disabled = true; stopButton.disabled = false; statusElement.textContent = 'Recording... Waiting for first segment.'; statusElement.className = 'status-recording'; console.log('MediaRecorder started.'); if (uploadIntervalId) clearInterval(uploadIntervalId); uploadIntervalId = setInterval(() => { if (mediaRecorder && mediaRecorder.state === 'recording') { console.log(`Requesting data chunk at ${new Date().toLocaleTimeString()}`); try { mediaRecorder.requestData(); } catch (e) { console.error("Error requesting data:", e); } } else { console.warn("Interval fired but recorder not recording."); if(uploadIntervalId) clearInterval(uploadIntervalId); uploadIntervalId = null; } }, UPLOAD_INTERVAL); setTimeout(() => { if (mediaRecorder && mediaRecorder.state === 'recording') { console.log("Requesting initial data chunk..."); try { mediaRecorder.requestData(); } catch(e) { console.error("Error initial request:", e); } } }, 500); };
                mediaRecorder.onstop = () => { console.log('MediaRecorder stopped.'); isRecording = false; startButton.disabled = false; stopButton.disabled = true; if (uploadIntervalId) { clearInterval(uploadIntervalId); uploadIntervalId = null; } if (!forceStop) { statusElement.textContent = 'Recording stopped.'; statusElement.className = 'status-idle'; } recordedChunks = []; };
                mediaRecorder.onerror = (event) => { let errorMsg = `ERROR: Recording failed - ${event.error.name}`; if (event.error.message) errorMsg += `: ${event.error.message}`; console.error("MediaRecorder Error:", event.error); statusElement.textContent = errorMsg; statusElement.className = 'status-error'; alert(`A recording error occurred: ${errorMsg}`); forceStop = true; stopRecording(); };
                mediaRecorder.start();
            } catch (e) { console.error("Failed to create or start MediaRecorder:", e); statusElement.textContent = `ERROR: Could not start recorder - ${e.message}`; statusElement.className = 'status-error'; alert(`Failed to start video recording: ${e.message}`); }
        }

        function stopRecording() { /* ... same as before ... */ console.log("Stopping recording..."); if (mediaRecorder && mediaRecorder.state !== 'inactive') { try { mediaRecorder.stop(); } catch(e) { console.error("Error stopping MediaRecorder:", e); isRecording = false; if (uploadIntervalId) clearInterval(uploadIntervalId); uploadIntervalId = null; } } else { console.log("Recorder already inactive/uninit."); isRecording = false; startButton.disabled = false; stopButton.disabled = true; if (uploadIntervalId) clearInterval(uploadIntervalId); uploadIntervalId = null; if (!forceStop) { statusElement.textContent = 'Recording stopped.'; statusElement.className = 'status-idle'; } } }

        async function sendChunkToServer() { /* ... same as before ... */ if (recordedChunks.length === 0) { console.warn("sendChunkToServer: no chunks."); if (statusElement.className === 'status-processing') { statusElement.textContent = 'Recording... Waiting for next segment.'; statusElement.className = 'status-recording'; } return; } const blob = new Blob(recordedChunks, { type: currentMimeType }); recordedChunks = []; console.log(`Sending blob size: ${blob.size} bytes, type: ${currentMimeType}`); statusElement.textContent = `Processing segment (Size: ${Math.round(blob.size / 1024)} KB)...`; statusElement.className = 'status-processing'; try { const response = await fetch(BACKEND_UPLOAD_URL, { method: 'POST', headers: { 'Content-Type': currentMimeType, }, body: blob, }); const data = await response.json(); if (!response.ok) { const errorMsg = data.error || `Server error ${response.status} (${response.statusText})`; console.error('Server Error:', response.status, errorMsg); statusElement.textContent = `Analysis Error: ${errorMsg}`; statusElement.className = 'status-error'; addResultToFeed(errorMsg, new Date().toISOString(), true); } else { console.log('Analysis received:', data); /* Check if analysis indicates processing failure */ if(data.analysis && data.analysis.includes('Could not process video chunk')) { addResultToFeed(data.analysis, data.timestamp, false, true); /* Mark as warning */ statusElement.textContent = 'Recording... (Segment skipped)'; statusElement.className = 'status-recording'; } else { addResultToFeed(data.analysis, data.timestamp); statusElement.textContent = 'Recording... Analysis complete.'; statusElement.className = 'status-recording'; } } } catch (error) { console.error('Network or fetch error:', error); const errorMsg = `Network Error: ${error.message || 'Could not reach server.'}`; statusElement.textContent = errorMsg; statusElement.className = 'status-error'; addResultToFeed(errorMsg, new Date().toISOString(), true); } finally { if (isRecording && !statusElement.className.includes('error') && statusElement.className !== 'status-recording') { statusElement.textContent = 'Recording... Waiting for next segment.'; statusElement.className = 'status-recording'; } } }

        // Modified to handle warning style for processing failures
        function addResultToFeed(analysisText, timestamp, isError = false, isWarning = false) {
            const entryDiv = document.createElement('div'); entryDiv.classList.add('entry'); const time = document.createElement('time'); try { const date = new Date(timestamp); time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString(); } catch(e) { time.textContent = "Invalid date"; } entryDiv.appendChild(time); const analysisP = document.createElement('p'); analysisP.textContent = analysisText || (isError ? 'Unknown error' : (isWarning ? 'Processing issue noted.' : 'No analysis content received.')); entryDiv.appendChild(analysisP);
            if (isError) { entryDiv.classList.add('error'); }
            else if (isWarning) { entryDiv.classList.add('warning'); } // Add warning class
            else if (analysisText) { const lowerCaseText = analysisText.toLowerCase(); if (/\bmedium\b/.test(lowerCaseText)) { entryDiv.classList.add('medium'); } else if (/\bhigh\b/.test(lowerCaseText)) { entryDiv.classList.add('high'); } }
            resultsDiv.prepend(entryDiv); const maxEntries = 50; if (resultsDiv.children.length > maxEntries) { resultsDiv.removeChild(resultsDiv.lastChild); }
        }

        startButton.addEventListener('click', startRecording); stopButton.addEventListener('click', stopRecording); window.addEventListener('load', initWebcam); window.addEventListener('beforeunload', (event) => { if (isRecording) { stopRecording(); } });
    </script>
</body>
</html>
    """
    return Response(html_content, mimetype='text/html')

# --- Run the App ---
if __name__ == '__main__':
    print("Starting Flask server...")
    print(f"Using Gemini Model: {MODEL_NAME} with Direct OpenCV Frame Extraction (Pip Only)")
    print("Ensure OpenCV is installed: pip install opencv-python numpy")
    print("WARNING: User consent required. Some video chunks might fail processing.")
    print(f"Access the tool at http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000)