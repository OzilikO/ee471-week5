# Vibe Coding Prompts & Project Log - EE471 Week 5

**Course:** EE 471 Modern Software Development Practices and Technologies  
**Exercise:** In-class exercise Week #5 - Speech Studio & Voice-Activated Calculator  
**Developer:** OzilikO  

---

## Overview

This document records the complete prompt progression, architectural decisions, user feedback, and iterative engineering steps for **Week 5: Task 1 and Task 2**.

---

## Task 1: Speech-Studio-Backed Website

### Part 1: Text-to-Speech (TTS) Standalone App

#### User Prompt:
> I am doing task 1 of the file at path D:\EE\EE471week5\ee471-week5\Week-5-InClass-Exercise.pdf. Read it. I want you to help me complete part 1 of task 1. First help with the creation of the website and explain everything from the backend to the front end step by step afterwards. Lets have a similiar UI to the one in the pdf aswell for easier comparison. Aslo lets name the file for the app as text_to_speech.app
>
> Task: Develop a localhost Flask website for Text-to-Speech using Azure Speech SDK.  
> Requirements:
> - Backend (app.py): Load SPEECH_KEY and SPEECH_REGION from .env using python-dotenv. Create route @app.route('/') to serve index.html. Create API endpoint POST /api/text-to-speech that receives JSON {"text": "<user_text>"}. Use Azure Speech SDK (azure.cognitiveservices.speech) to synthesize the input text into audio format (.wav or .mp3). Save the generated audio file inside a static/ directory (e.g., static/output.wav) and return its URL/path in JSON {"audio_url": "/static/output.wav"}. Return proper HTTP status codes (200 OK on success, 400 Bad Request if text is empty, 500 Internal Server Error on Azure SDK errors).
> - Frontend (index.html, style.css, script.js): Create a UI matching the left panel of the mockup ("Text-to-Speech Powered by Azure Cognitive Services"). Includes a textarea for entering text, a Synthesize Speech button, a Clear button, a status message area, an HTML5 <audio> player, and a Download Audio button. Connect script.js to POST /api/text-to-speech via fetch().

#### Engineering & Deliverables:
- Created `Week-5-Task-1/text_to_speech.py` and entry point `Week-5-Task-1/app.py`.
- Created `Week-5-Task-1/templates/index.html` with card framing matching the left panel mockup.
- Created `Week-5-Task-1/static/style.css` (purple frame `#5b50e6`, clean typography, green status pill).
- Created `Week-5-Task-1/static/script.js` with asynchronous `fetch('/api/text-to-speech')` and cache-busting timestamping on audio source.
- Staged on branch `text-to-speech` and merged into `main`.

---

### Part 2: Speech-to-Text (STT) Standalone App

#### User Prompt:
> Now lets move to part 2 of the PDF. Again explain me the front end back end etc. Keep in mind part 3 aswell. We will need to inetgrate both of the text to speech and speech to text apps in the home of the website and We are going to be able to switch between the two as it is with the second picutre in the pdf. Here is the prompt:
>
> Task: Develop a localhost Flask website for Speech-to-Text using Azure Speech SDK.  
> Requirements:
> - Backend (app.py): Load SPEECH_KEY and SPEECH_REGION from .env using python-dotenv. Endpoint POST /api/speech-to-text accepting an uploaded audio file (.wav or .mp3 format). Use Azure Speech SDK (azure.cognitiveservices.speech) with AudioConfig(filename=...) and SpeechRecognizer to transcribe the audio file to text. Return JSON response {"transcription": "<recognized_text>"} with status 200 OK, or appropriate error status codes (400/500).
> - Frontend (index.html, style.css, script.js): Build the UI matching the right panel of the mockup ("Azure Speech Services - Speech to Text"). Include a file input (Choose File), browser microphone recording buttons (Start Recording / Stop Recording), a Transcribe Audio button, a Clear button, and a Transcription output container with a Copy Text button. Connect script.js to send recorded/uploaded audio to POST /api/speech-to-text using fetch().

#### User Correction & Architectural Refinement:
> Note part 3 requires us to solve merge conflicts!. the speech to text part should be its own STANDALONE website. It should not just be speech-to-text + text-to-speed both onn the speech-to-text branch! We well integrate them both to work on the same website home page in part 3!
>
> the app should be named speech-to-text for ease and context and to not messup during other task with name conflict

#### Engineering & Deliverables:
- Created standalone `Week-5-Task-1/speech_to_text.py` and `Week-5-Task-1/app.py` on the `speech-to-text` branch.
- Implemented pure client-side 16-bit PCM WAV encoding using Web Audio API (`AudioContext` and `ScriptProcessorNode`) so recorded microphone audio works natively with Azure Speech SDK on Windows without requiring GStreamer.
- Re-based branch divergence point to `Initial commit` (`52b5602`) so merging into `main` produces the intentional merge conflict expected by the course assignment.

---

### Part 3: Resolve Merge Conflicts & Unify into Tabbed Studio

#### User Prompt:
> Resolve all Git merge conflicts in this directory and unify our application into a single fully functional web app matching the assignment specifications. I have already fixed conflict in the app.py file but I will still include it. Main focus is the ui and the web aspect of it:
>
> 1. app.py Backend:
>    - Resolve conflict markers and keep BOTH API endpoints:
>      * POST /api/text-to-speech (synthesizes text to speech using Azure Speech SDK)
>      * POST /api/speech-to-text (transcribes uploaded/recorded audio to text using Azure Speech SDK)
>    - Ensure environment variables (SPEECH_KEY, SPEECH_REGION) are loaded via python-dotenv from .env.
>    - Return proper HTTP status codes (200 OK, 400 Bad Request, 500 Internal Server Error) with error JSON format {"error": "<message>"}.
>
> 2. index.html & style.css Frontend:
>    - Combine the UI into a side-by-side or tabbed dashboard matching the assignment mockup (with "Text to Speech" and "Speech to Text" sections).
>    - Text-to-Speech section: Textarea input, Synthesize Speech button, Clear button, Audio player element, and Download Audio button.
>    - Speech-to-Text section: File upload input, Start/Stop Recording buttons, Transcribe Audio button, Clear button, Transcription display, and Copy Text button.
>
> 3. script.js Controller:
>    - Retain all event listeners and fetch() calls for both features.
>    - Ensure script.js sends requests to /api/text-to-speech and /api/speech-to-text correctly without code duplication.

#### Engineering & Deliverables:
- Resolved conflict markers in `.gitignore`, `Week-5-Task-1/app.py`, `templates/index.html`, `static/style.css`, and `static/script.js`.
- Combined both features into a unified tabbed layout with `Text to Speech` and `Speech to Text` tabs.
- Staged and committed merge on branch `main`.

---

### Part 4: Supplementary Features (Translation, Diarization, Pronunciation)

#### User Prompt:
> Enhance our existing Flask Speech web app (Week-5-Task-1) with the three supplementary features required in Part 4:
>
> 1. Backend Updates (app.py):
>    - Add POST /api/translate: Uses azure.cognitiveservices.speech.translation.TranslationRecognizer to take audio input or text input, target language (e.g., "tr", "de"), and return translated text/audio.
>    - Add POST /api/diarization: Uses Azure Speech SDK Conversation Transcriber / Diarization to return transcriptions formatted with speaker labels (e.g., "Speaker 1: ...", "Speaker 2: ...").
>    - Add POST /api/pronunciation-assessment: Accepts an audio file and reference text, configures PronunciationAssessmentConfig, and returns scores for accuracy, fluency, completeness, and overall score.
>
> 2. Frontend Updates (index.html, style.css, script.js):
>    - Add UI tabs or sections for:
>      * Translation (Language selection dropdown, source text/audio, translated text output).
>      * Diarization (Upload multi-speaker audio, view speaker-tagged transcription).
>      * Pronunciation Assessment (Enter reference text, record/upload speech, view score badges/progress bars).
>    - Ensure script.js connects all forms to the new API endpoints using fetch() with proper error handling.

#### Engineering & Deliverables:
- Implemented `POST /api/translate` using `TranslationRecognizer`, with automated neural voice synthesis of the translated output.
- Implemented `POST /api/diarization` using `ConversationTranscriber` to identify speaker IDs and format dialogues.
- Implemented `POST /api/pronunciation-assessment` using `PronunciationAssessmentConfig` (`HundredMark` scale, `Phoneme` granularity, miscue detection enabled).
- Added 5 unified navigation tabs (`🔊 TTS`, `🎙 STT`, `🌐 Translation`, `👥 Diarization`, `🎯 Pronunciation`) to `index.html`.
- Styled speaker speech bubbles and a 4-badge score grid in `style.css`.

---

### Task 1 Code Quality & Refactoring

#### User Prompt:
> I will point out some errors in the code I was. Fix them please.
> - Remove temporary test files (e.g., test_env.py) if present in Week-5-Task-1.
> - Update .gitignore to include:
>   .env
>   __pycache__/
>   *.pyc
>   static/*.wav
>   static/*.mp3
>
> 2. Refactor app.py (Backend):
>    - Move load_dotenv() to the top of the file directly after imports.
>    - Initialize a global Azure SpeechConfig instance or helper function (get_speech_config()) using SPEECH_KEY and SPEECH_REGION to eliminate repeated configuration setups across endpoints.
>    - Ensure all error responses strictly follow the JSON schema {"error": "<message>"} with proper status codes (400, 404, 500).
>    - Ensure app.run(debug=True, port=5000) is called exactly once inside if __name__ == '__main__':.
>
> 3. Refactor script.js & index.html (Frontend):
>    - Remove any duplicate event listeners or redundant DOM queries created during git merge resolutions.
>    - Consolidate error and status message handling into a single helper function showStatus(message, isError).
>    - Keep fetch() API calls cleanly modularized for /api/text-to-speech, /api/speech-to-text, /api/translate, /api/diarization, and /api/pronunciation-assessment.
>
> 4. Verification:
>    - Ensure python app.py starts cleanly on http://127.0.0.1:5000 without warnings or runtime errors.

#### Engineering & Deliverables:
- Moved `load_dotenv()` directly below imports.
- Created `get_speech_config()` to eliminate redundant credentials setup across all 5 endpoints.
- Re-architected `showStatus(message, isError)` in `script.js` and modularized API callers (`apiTextToSpeech`, `apiSpeechToText`, `apiTranslate`, `apiDiarization`, `apiPronunciationAssessment`).
- Added `@app.errorhandler` for 400, 404, and 500 to guarantee uniform `{"error": "<msg>"}` JSON responses.

---

## Task 2: Voice-Activated Calculator

#### User Prompt:
> OK. Let us move to task 2. The name off the app is up to you I prefer speaking_calculator.app so just do whatever is best that does not cause conflict in app names!
>
> Help me build Task 2 (Voice-Activated Calculator) inside Week-5-Task-2 using Python Flask, HTML/CSS/JS, and Azure Speech SDK:
>
> 1. Copy & reuse our OOP Calculator logic from Week 4 at path D:\EE\EE471-week4\ee471-week4 into backend custom classes.
>
> 2. Backend (app.py):
>    - Load Azure SPEECH_KEY and SPEECH_REGION from .env using python-dotenv.
>    - Endpoint POST /api/voice-command: Receives recorded microphone audio from the client, transcribes it using Azure STT, maps the recognized speech text ("Five", "plus", "two", "is", "Over", "Times", etc.) into calculator inputs/operations, computes the result, and returns JSON {"command": text, "display": display_val, "result": result_val}.
>    - Endpoint POST /api/speak: Receives text (e.g., "Three plus five is eight" or button label "Five") and synthesizes TTS audio via Azure TTS, returning audio URL or stream for playback.
>
> 3. Frontend (index.html, style.css, script.js):
>    - UI matching the assignment mockup: a classic calculator grid with a dedicated microphone button on the left.
>    - Mic Button: Recording triggers STT voice command processing and executes the spoken calculation.
>    - Button Clicks (Magical Buttons): Clicking any button (0-9, +, -, x, ÷, =) plays its TTS audio back to the user and updates the display.
>
> Make sure python app.py runs cleanly on http://127.0.0.1:5000.

#### Engineering & Deliverables:
- Created `Week-5-Task-2/custom_classes.py` reusing and extending the Week 4 `Calculator` class with `compute()`, `parse_voice_command()`, `number_to_spoken_words()`, and the command table dictionary.
- Created `Week-5-Task-2/speaking_calculator.py` and entry point `Week-5-Task-2/app.py`:
  - `POST /api/voice-command`: Transcribes voice input, executes calculation, and synthesizes speech reply (`"is seven"`).
  - `POST /api/speak`: Synthesizes voice outputs for single button clicks.
  - `POST /api/calculate`: Computes arithmetic on `=` click and returns audio (`"is eight"`).
- Created `Week-5-Task-2/templates/index.html` and `Week-5-Task-2/static/style.css` matching Page 3 of the PDF (deep blue `#0075c9` body, LCD display, tall left microphone pill with pulse effect, and 4x4 keypad).
- Created `Week-5-Task-2/static/script.js` with integrated audio playback and browser microphone WAV recording.

---

## Deliverables Test Verification Table

| Test Identifier | Input Action | Expected Display | Expected Voice Output | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Demo 1 - Case a** | Audio Command: *"Five plus two is"* | `7` | `"is seven"` | Passed |
| **Demo 1 - Case b** | Audio Command: *"Seven minus three is"* | `4` | `"is four"` | Passed |
| **Demo 1 - Case c** | Audio Command: *"Three times two is"* | `6` | `"is six"` | Passed |
| **Demo 1 - Case d** | Audio Command: *"Nine over, three is"* | `3` | `"is three"` | Passed |
| **Demo 2 - Case a** | Buttons: `5` $\rightarrow$ `+` $\rightarrow$ `2` $\rightarrow$ `=` | `7` | `"Five", "Plus", "Two", "is seven"` | Passed |
| **Demo 2 - Case b** | Buttons: `7` $\rightarrow$ `-` $\rightarrow$ `3` $\rightarrow$ `=` | `4` | `"Seven", "Minus", "Three", "is four"` | Passed |
| **Demo 2 - Case c** | Buttons: `3` $\rightarrow$ `x` $\rightarrow$ `2` $\rightarrow$ `=` | `6` | `"Three", "Times", "Two", "is six"` | Passed |
| **Demo 2 - Case d** | Buttons: `9` $\rightarrow$ `÷` $\rightarrow$ `3` $\rightarrow$ `=` | `3` | `"Nine", "Over", "Three", "is three"` | Passed |

