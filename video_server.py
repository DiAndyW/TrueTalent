import os
import base64
import google.generativeai as genai
from flask import Flask, request, jsonify
from dotenv import load_dotenv
import datetime
import traceback # For detailed error logging
import tempfile # For handling temporary files
import cv2      # OpenCV for video processing
import math     # For frame rate calculations
from flask_cors import CORS

# --- Configuration ---
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file or environment variables.")

genai.configure(api_key=API_KEY)

# Using gemini-1.5-flash-latest as requested
MODEL_NAME = 'gemini-1.5-flash-latest'

try:
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"Gemini model '{MODEL_NAME}' loaded successfully.")
except Exception as e:
    print(f"Fatal Error: Could not load Gemini model '{MODEL_NAME}': {e}")
    traceback.print_exc()
    exit(1)

app = Flask(__name__)
CORS(app)

# --- Global State (Simple approach for single analysis stream) ---
# WARNING: This simple global state is NOT suitable for concurrent users.
# For multiple simultaneous analyses, you'd need session management or
# a more complex state tracking mechanism (e.g., dictionary keyed by a stream ID).
analysis_active = False
print("Backend Initialized. Analysis state: INACTIVE")

# --- Gemini Prompt (Frame Analysis) ---
# Prompt remains the same
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

# --- API Endpoint to START Analysis State ---
@app.route('/start_analysis', methods=['POST'])
def start_analysis_endpoint():
    """
    Endpoint to signal the backend that video chunks will start being sent.
    Sets the internal 'analysis_active' state to True.
    """
    global analysis_active
    if analysis_active:
        print("Received /start_analysis request, but analysis is already active.")
        return jsonify({"status": "Analysis already active"}), 200 # Or maybe 409 Conflict? 200 is simpler.
    else:
        analysis_active = True
        print("Received /start_analysis request. Analysis state: ACTIVE")
        return jsonify({"status": "Analysis started"}), 200

# --- API Endpoint to STOP Analysis State ---
@app.route('/stop_analysis', methods=['POST'])
def stop_analysis_endpoint():
    """
    Endpoint to signal the backend that video chunks will stop being sent.
    Sets the internal 'analysis_active' state to False.
    """
    global analysis_active
    if not analysis_active:
        print("Received /stop_analysis request, but analysis was not active.")
        return jsonify({"status": "Analysis already stopped"}), 200
    else:
        analysis_active = False
        print("Received /stop_analysis request. Analysis state: INACTIVE")
        return jsonify({"status": "Analysis stopped"}), 200

# --- API Endpoint for Video Chunk Analysis ---
@app.route('/analyze_chunk', methods=['POST'])
def analyze_video_chunk():
    """
    Receives a video chunk, saves temporarily, attempts frame extraction with OpenCV,
    sends frames to Gemini, returns analysis.
    Only processes if 'analysis_active' state is True.
    """
    global analysis_active
    print(f"\n--- Received request on /analyze_chunk at {datetime.datetime.now()} ---")

    if not analysis_active:
        print("Ignoring chunk: Analysis state is INACTIVE. Call /start_analysis first.")
        return jsonify({"error": "Analysis not active. Call /start_analysis first."}), 403 # 403 Forbidden

    # --- Proceed with analysis only if active ---
    if not request.data:
        print("Error: Received request with no data.")
        return jsonify({"error": "No video data received."}), 400

    content_type = request.content_type
    if not content_type or not content_type.startswith('video/'):
        print(f"Error: Invalid Content-Type: {content_type}")
        return jsonify({"error": f"Invalid Content-Type: '{content_type}'. Expected video/*."}), 400

    video_data = request.data
    print(f"Received video chunk. Size: {len(video_data)} bytes, Type: {content_type}. Analysis state: ACTIVE")

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

        # 2. Attempt to open with OpenCV
        print(f"Attempting to open with OpenCV: {temp_filename}")
        cap = cv2.VideoCapture(temp_filename)

        if not cap or not cap.isOpened():
            print(f"Error: OpenCV could not open temporary video file: {temp_filename}. Skipping analysis for this chunk.")
            return jsonify({
                "analysis": "Low - Could not process video chunk (OpenCV failed to open file).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 3. Check video metadata
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        print(f"Video properties reported by OpenCV: FPS={fps:.2f}, TotalFrames={total_frames}")

        if fps <= 0 or total_frames <= 0:
            print(f"Warning: Video has invalid metadata (FPS={fps}, Frames={total_frames}). Skipping analysis for this chunk.")
            cap.release()
            cap = None
            return jsonify({
                "analysis": "Low - Could not process video chunk (Invalid metadata detected).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 4. Extract Frames
        frame_interval = max(1, int(math.ceil(fps / FRAMES_PER_SECOND_TO_EXTRACT)))
        print(f"Extracting frame every {frame_interval} frames (approx {FRAMES_PER_SECOND_TO_EXTRACT}/sec).")

        extracted_frames_base64 = []
        frame_count = 0
        extracted_count = 0

        while True:
            try:
                ret, frame = cap.read()
            except Exception as read_err:
                print(f"Error reading frame {frame_count} from video: {read_err}")
                traceback.print_exc()
                break

            if not ret:
                print(f"End of video stream reached after reading {frame_count} frames.")
                break

            if frame_count % frame_interval == 0:
                success, encoded_image = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if success:
                    frame_base64 = base64.b64encode(encoded_image).decode('utf-8')
                    extracted_frames_base64.append(frame_base64)
                    extracted_count += 1
                else:
                     print(f"Warning: Failed to encode frame {frame_count} as JPEG.")
            frame_count += 1

        cap.release()
        cap = None
        print(f"Successfully attempted extraction, {extracted_count} frames encoded.")

        if not extracted_frames_base64:
            print("Warning: No frames were extracted (video might be short or interval too large).")
            return jsonify({
                "analysis": "Low - No frames extracted (video chunk too short?).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 5. Prepare API request for Gemini
        image_parts = [ {"mime_type": "image/jpeg", "data": frame_b64} for frame_b64 in extracted_frames_base64 ]

        # --- Call Gemini API ---
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
        if "invalid argument" in str(e).lower(): error_message = f"Server error: Gemini reported 'Invalid Argument'. Original error: {str(e)}"; status_code = 400
        elif "internal error" in str(e).lower(): error_message = f"Server error: Gemini reported an 'Internal Error'. Original error: {str(e)}"; status_code = 502
        return jsonify({"error": error_message}), status_code

    finally:
        # Clean up temporary file ALWAYS
        if cap and cap.isOpened(): # Ensure release if error happened mid-processing
            cap.release()
            print("Released OpenCV capture object in finally block.")
        safe_delete(temp_filename)


# --- Run the App ---
if __name__ == '__main__':
    print("\n--- Starting Flask Backend Server ---")
    print(f"Using Gemini Model: {MODEL_NAME} with Direct OpenCV Frame Extraction")
    print("Endpoints:")
    print("  POST /start_analysis : Tells the server to start accepting chunks.")
    print("  POST /stop_analysis  : Tells the server to stop accepting chunks.")
    print("  POST /analyze_chunk  : Send video chunk data here (requires Content-Type header).")
    print("                         Only processes if analysis state is ACTIVE.")
    print("WARNING: This simple implementation uses global state and is not suitable for concurrent users.")
    print(f"Server running at http://127.0.0.1:5000")
    app.run(debug=True, host='127.0.0.1', port=5000) # debug=True is useful for development