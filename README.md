# True Talent

With the growing abilities of Artificial Intelligence, there has also been a growing reliance on AI by the all in the CS field (and beyond!). There has been a surge of "Vibe Coders", who do everything using AI, even including their coding interviews. While AI should be used as a tool, it cannot replace the expertise of those behind the screen. These AI cheating tools have diluted the talent, and can prevent companies from finding the most talented candidates.

Our project hopes to resolve this issue. True Talent is a code-interview website akin to those like CodePair, but with one big added feature. We incorporated AI in multiple ways to help detect cheaters, including code, video, and speech analysis.

## Acknowledgements

Built at LAHacks 2025. Thanks to all the organizers and sponsors for making this event possible!

## Authors

- [@Edwin Yee](https://github.com/Edwin-Yee)
- [@Andy Wang](https://github.com/DiAndyW)
- [@Hari Sanku](https://github.com/code4hari)
- [@Peter Tran](https://github.com/dttran0)

## Documentation

1. Clone the repository
2. Ensure `Node.js` and `Python` (>3.11) are installed
3. While in root directory, do `pip install -r requirements.txt`
4. `cd client`, and run `npm install`
5. Back up into root and `cd server`, and run `npm install` again
6. Open 4 terminals
- Use the first to run `python app.py` in root directory  
- Use the second to run `python video_server.py` in root directory
- Use the third to run `npm start` in `/server`
- Use the last to run `npm start` in `/client`

You should be good to go!

## Environment Variables

To run this project, you will need to add the following environment variables to your .env file

`GEMINI_API_KEY` 
