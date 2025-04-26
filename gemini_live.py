# https://ai.google.dev/gemini-api/docs/live
# pip install -U google-genai
# pip install python-dotenv
# pip install SpeechRecognition
# pip install pyaudio


import asyncio
import os
import wave
import speech_recognition as sr

from audio import recognize_speech_from_mic

from google import genai
from google.genai import types

from dotenv import load_dotenv

load_dotenv()  

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
model = "gemini-2.0-flash-live-001"

async def async_enumerate(aiterable, start=0):
    index = start
    async for item in aiterable:
        yield index, item
        index += 1

async def process_audio(message):

    config = {"system_instruction": types.Content(
        parts=[
            types.Part(
                text="You are a careful interviewer who wants to hire the best and most handidate candidate."
            )
        ]
    ),
    "response_modalities": ["AUDIO"]}

    async with client.aio.live.connect(model=model, config=config) as session:
        wf = wave.open("audio.wav", "wb")
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)

        await session.send_client_content(
            turns={"role": "user", "parts": [{"text": str(message)}]}, turn_complete=True
        )

        async for idx,response in async_enumerate(session.receive()):
            if response.data is not None:
                wf.writeframes(response.data)

        wf.close()


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
                print(response.text, end="")

        print(f"\nGemini> {response_text}")


if __name__ == "__main__":
    recognizer = sr.Recognizer()
    microphone = sr.Microphone()

    # Uncomment the following lines to use speech recognition
    # print("Please say something...")
    # speech = recognize_speech_from_mic(recognizer, microphone)
    # print("You said: " + speech["transcription"])

    gemini_audio_prompt = "Brainstorm a list of specific, tailored questions based the code that they wrote below. Ensure that the candidate is not cheating and can explain the code in detail."
    code = "def hello_world():\n    print('Hello, world!')\n\nhello_world()"
    # transcription = speech["transcription"]
    transcription = "The time complexity of this code is O(n)"

    asyncio.run(process_audio(gemini_audio_prompt + "\n" + code + "\n" + transcription))
    
    # asyncio.run(process_text(transcription))

