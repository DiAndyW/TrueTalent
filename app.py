from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import os
import wave
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
model = "gemini-2.0-flash-live-001"

# Create a global event loop (better way)
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

@app.route('/process_audio', methods=['POST'])
def process_audio_endpoint():
    data = request.json
    message = data.get('message', '')

    async def process_audio(message):
        config = {
            "system_instruction": types.Content(
                parts=[
                    types.Part(
                        text="You are a careful interviewer who wants to hire the best and most honest candidate."
                    )
                ]
            ),
            "response_modalities": ["AUDIO"]
        }

        async with client.aio.live.connect(model=model, config=config) as session:
            wf = wave.open("audio.wav", "wb")
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(24000)

            idx = 0  # Manual counter
            async for response in session.receive():
                if response.data is not None:
                    wf.writeframes(response.data)
                idx += 1

            wf.close()

    # Use the existing event loop
    loop.run_until_complete(process_audio(message))
    return jsonify({"status": "Audio processed and saved to audio.wav"})

@app.route('/process_text', methods=['POST'])
def process_text_endpoint():
    data = request.json
    msg = data.get('message', '')

    async def process_text(msg):
        config = {"response_modalities": ["TEXT"]}

        async with client.aio.live.connect(model=model, config=config) as session:
            await session.send_client_content(
                turns={"role": "user", "parts": [{"text": msg}]}, turn_complete=True
            )

            response_text = ""
            async for response in session.receive():
                if response.text is not None:
                    response_text += response.text

            return response_text

    response_text = loop.run_until_complete(process_text(msg))
    return jsonify({"response": response_text})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9999, debug=True)