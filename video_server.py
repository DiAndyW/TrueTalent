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
from flask_cors import CORS

# --- Configuration ---
load_dotenv()
API_KEY = os.getenv("GEMINI_API_KEY")

if not API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env file or environment variables.")

genai.configure(api_key=API_KEY)

MODEL_NAME = 'gemini-2.5-flash-preview-04-17'

try:
    model = genai.GenerativeModel(MODEL_NAME)
    print(f"Gemini model '{MODEL_NAME}' loaded successfully.")
except Exception as e:
    print(f"Fatal Error: Could not load Gemini model '{MODEL_NAME}': {e}")
    traceback.print_exc()
    exit(1)

app = Flask(__name__)
CORS(app)

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
- If 'Low', state 'Low - No specific visual concerns noted in this frame sequence.' OR 'Low - Could not process video [reason].' if processing failed.
- Be objective. Avoid definitive accusations. Base the rating *only* on this image sequence.
"""

# --- Constants ---
FRAMES_PER_SECOND_TO_EXTRACT = 1

# --- Helper Function to Safely Delete Files ---
def safe_delete(filepath):
    """Safely deletes a file if it exists."""
    if filepath and os.path.exists(filepath):
        try:
            os.remove(filepath)
            print(f"Cleaned up temporary file: {filepath}")
        except OSError as e:
            print(f"Error deleting temporary file {filepath}: {e}")

# --- API Endpoint for Video Analysis ---
@app.route('/analyze_video', methods=['POST'])
def analyze_video():
    """
    Receives video data via POST, saves temporarily, extracts frames using OpenCV,
    sends frames to Gemini for analysis, and returns the analysis result.
    Expects video data in the request body and a 'Content-Type' header
    (e.g., 'video/mp4', 'video/webm').
    """
    if not request.data:
        print("Error: Received request with no data.")
        return jsonify({"error": "No video data received."}), 400

    content_type = request.content_type
    if not content_type or not content_type.startswith('video/'):
        print(f"Error: Invalid Content-Type: {content_type}")
        return jsonify({"error": f"Invalid Content-Type: '{content_type}'. Expected video/*."}), 415 # Use 415 Unsupported Media Type

    video_data = request.data
    print(f"Received video data. Size: {len(video_data)} bytes, Type: {content_type}")

    temp_filename = None
    cap = None # Initialize capture object

    try:
        # 1. Save blob to a temporary file
        suffix = '.bin' # Use generic suffix initially
        if 'mp4' in content_type: suffix = '.mp4'
        elif 'webm' in content_type: suffix = '.webm'
        elif 'ogg' in content_type: suffix = '.ogv'
        # Add more video types if needed
        elif 'quicktime' in content_type: suffix = '.mov'
        elif 'x-msvideo' in content_type: suffix = '.avi'

        # Create temp file - delete=False needed for OpenCV to access by path
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_video_file:
            temp_filename = temp_video_file.name
            temp_video_file.write(video_data)
        print(f"Video data saved to temporary file: {temp_filename}")

        # 2. Attempt to open with OpenCV
        print(f"Attempting to open video with OpenCV: {temp_filename}")
        cap = cv2.VideoCapture(temp_filename)

        # *** CRITICAL CHECK: Did OpenCV open the file? ***
        if not cap or not cap.isOpened():
            print(f"Error: OpenCV could not open temporary video file: {temp_filename}. Cannot analyze.")
            # Return a specific analysis indicating processing failure
            return jsonify({
                "analysis": "Low - Could not process video (OpenCV failed to open file).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 3. Check video metadata (FPS, Frame Count)
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) # Cast to int
        print(f"Video properties reported by OpenCV: FPS={fps:.2f}, TotalFrames={total_frames}")

        # *** CRITICAL CHECK: Is metadata valid? ***
        # Check for non-positive FPS or unrealistic frame count (negative or zero)
        if fps <= 0 or total_frames <= 0:
            print(f"Warning: Video has invalid metadata (FPS={fps}, Frames={total_frames}). Cannot analyze reliably.")
            cap.release() # Release the capture object
            cap = None
            return jsonify({
                "analysis": "Low - Could not process video (Invalid metadata detected).",
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
                break # Stop processing this video on read error

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
        print(f"Successfully attempted frame extraction, {extracted_count} frames encoded.")

        if not extracted_frames_base64:
            # This could happen if the video was valid but shorter than one frame_interval
            print("Warning: No frames were extracted based on interval (video might be too short or interval too large).")
            # Return a specific 'Low' status
            return jsonify({
                "analysis": "Low - No frames extracted (video too short or processing issue).",
                "timestamp": datetime.datetime.now().isoformat()
            })

        # 4. Prepare API request with image parts
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
        print("Analysis complete. Returning result.")
        return jsonify({"analysis": analysis_text, "timestamp": datetime.datetime.now().isoformat()})

    except genai.types.generation_types.BlockedPromptException as bpe:
         print(f"--- Gemini API Blocked Prompt ---"); print(f"Error: {bpe}")
         reason = str(bpe.response.prompt_feedback) if hasattr(bpe, 'response') and hasattr(bpe.response, 'prompt_feedback') else "details unavailable"
         return jsonify({"error": f"Analysis blocked by safety filter: {reason}"}), 400 # Use 400 Bad Request for blocked prompts
    except Exception as e:
        print(f"--- Error during analysis (Outer Try Block) ---")
        traceback.print_exc()
        error_message = f"Server error during analysis: {str(e)}"
        status_code = 500 # Default to Internal Server Error
        # Basic error type check based on string content for Gemini errors
        if "invalid argument" in str(e).lower(): error_message = f"Server error: Gemini reported 'Invalid Argument'. Check API call format/data. Original error: {str(e)}"; status_code = 400
        elif "internal error" in str(e).lower(): error_message = f"Server error: Gemini reported an 'Internal Error'. Try again later. Original error: {str(e)}"; status_code = 502 # Bad Gateway might be appropriate
        return jsonify({"error": error_message}), status_code

    finally:
        # Clean up temporary file ALWAYS
        if cap and cap.isOpened(): # Ensure release if error happened mid-processing
            cap.release()
            print("Released OpenCV capture object in finally block.")
        safe_delete(temp_filename)

# --- Run the App ---
if __name__ == '__main__':
    print("Starting Flask Backend Server...")
    print(f"Using Gemini Model: {MODEL_NAME} with Direct OpenCV Frame Extraction.")
    print("Ensure OpenCV is installed: pip install opencv-python numpy")
    print("This server provides one endpoint:")
    print("  POST /analyze_video")
    print("    - Body: Raw video data (e.g., MP4, WebM)")
    print("    - Headers: Content-Type: video/<format> (e.g., video/mp4)")
    print("    - Returns: JSON with analysis results or error.")
    print("Example usage with curl:")
    print("  curl -X POST --data-binary \"@your_video.mp4\" -H \"Content-Type: video/mp4\" http://127.0.0.1:5000/analyze_video")
    print(f"\nServer running at http://127.0.0.1:5000")
    # Set debug=False for production environments
    app.run(debug=True, host='127.0.0.1', port=5000)