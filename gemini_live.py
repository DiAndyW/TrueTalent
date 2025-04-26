# https://ai.google.dev/gemini-api/docs/live
# pip install -U google-genai
# pip install python-dotenv


import asyncio
from google import genai
import os

from dotenv import load_dotenv

load_dotenv()  

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
model = "gemini-2.0-flash-live-001"

config = {"response_modalities": ["TEXT"]}

async def main():
    async with client.aio.live.connect(model=model, config=config) as session:
        while True:
            message = input("User> ")
            if message.lower() == "exit":
                break
            await session.send_client_content(
                turns={"role": "user", "parts": [{"text": message}]}, turn_complete=True
            )

            async for response in session.receive():
                if response.text is not None:
                    print(response.text, end="")

if __name__ == "__main__":
    asyncio.run(main())

