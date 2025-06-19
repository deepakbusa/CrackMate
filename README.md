# CrackMate

CrackMate is a modern, AI-powered coding and interview assistant built with Electron and React. It helps you practice coding and aptitude questions, analyze screenshots, upload your resume for personalized interview prep, and interact with AI using your voice—all in a beautiful, desktop-friendly UI.

## Features

- **Voice Assistant:** Start/stop listening and ask coding or aptitude questions by voice. AI only responds when you ask a question.
- **Screenshot Solving:** Take a screenshot of any coding or aptitude problem (even with a solution), and CrackMate will extract, analyze, and provide:
  - For coding: Approach, Solution (with code/comments), Complexity (time/space, as bullets), or Comparison if a solution is present.
  - For aptitude: Correct answer and a short explanation.
- **Resume Upload:** Upload your PDF/DOCX resume. The AI will use your background to personalize interview answers.
- **Keyboard Shortcuts:** Quickly take screenshots, move the window, start over, toggle visibility, and more.
- **Beautiful UI:** Modern, responsive, and distraction-free design with dynamic content areas and code blocks.
- **No unnecessary file saving:** Screenshots are processed in-memory for privacy and speed.

## Setup

1. **Clone the repo:**
   ```bash
   git clone <your-repo-url>
   cd speech-ui
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment variables:**
   - Copy `.env.example` to `.env` and fill in your Azure/OpenAI API keys and endpoints.
4. **Run the app:**
   ```bash
   npm start
   ```
   This will launch both the React app and Electron shell.

## Usage

- **Start/Stop Listening:** Click the Start button to begin voice recognition. Click Stop to end.
- **Ask Questions:** Speak your coding or aptitude question. The AI will respond only to questions.
- **Take Screenshots:** Use the shortcut or UI to capture a problem from your screen. The AI will analyze and respond with structured sections.
- **Upload Resume:** Use the Upload Resume button to provide your background for personalized answers.
- **Read AI Responses:** All responses are structured, readable, and code is formatted with scroll and syntax highlighting.

## Keyboard Shortcuts

- **Take Screenshot:** `Ctrl + H`
- **Start Over:** `Ctrl + G`
- **Move Window:** `Ctrl + Arrow Keys`
- **Toggle App Visibility:** `Ctrl + .`
- **Quit App:** `Ctrl + Q`
- **Solve Screenshots:** `Ctrl + Enter`

## License

MIT

---

_CrackMate: Your AI-powered coding and interview companion._
