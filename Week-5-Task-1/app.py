import os
import tempfile
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk

# Determine base directory and load the .env file
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

app = Flask(__name__, static_folder="static", template_folder="templates")

# Ensure static folder exists for saving audio outputs
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Ensure temporary upload directory exists
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_speech_credentials():
    """Retrieve Azure Speech API credentials from environment variables."""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    return speech_key, speech_region


@app.route("/")
def index():
    """Serves the unified frontend page."""
    return render_template("index.html")


@app.route("/api/text-to-speech", methods=["POST"])
def text_to_speech():
    """Synthesizes input text to speech using Azure Speech SDK.

    Expects JSON body: {"text": "<user_text>"}
    Returns JSON: {"audio_url": "/static/output.wav", "message": "Speech synthesized successfully!"}
    """
    if not request.is_json:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text cannot be empty."}), 400

    speech_key, speech_region = get_speech_credentials()
    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    output_filename = "output.wav"
    output_filepath = STATIC_DIR / output_filename

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key,
            region=speech_region
        )
        speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"

        audio_config = speechsdk.audio.AudioOutputConfig(
            filename=str(output_filepath)
        )

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        result = synthesizer.speak_text_async(text).get()

        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return jsonify({
                "message": "Speech synthesized successfully!",
                "audio_url": f"/static/{output_filename}"
            }), 200
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            error_message = f"Azure Speech synthesis canceled: {cancellation.reason}"
            if cancellation.error_details:
                error_message += f" - {cancellation.error_details}"
            return jsonify({"error": error_message}), 500
        else:
            return jsonify({
                "error": f"Synthesis finished with unexpected result: {result.reason}"
            }), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@app.route("/api/speech-to-text", methods=["POST"])
def speech_to_text():
    """Transcribes an uploaded audio file (.wav or .mp3) to text using Azure Speech SDK.

    Accepts multipart/form-data with file field 'audio' or 'file'.
    Returns JSON: {"transcription": "<recognized_text>", "message": "Audio transcribed successfully!"}
    """
    if "audio" not in request.files and "file" not in request.files:
        return jsonify({"error": "No audio file provided. Please record or upload an audio file."}), 400

    audio_file = request.files.get("audio") or request.files.get("file")
    if not audio_file or not audio_file.filename:
        return jsonify({"error": "Empty audio file received."}), 400

    allowed_extensions = {".wav", ".mp3", ".webm", ".ogg"}
    file_ext = Path(audio_file.filename).suffix.lower()
    if file_ext and file_ext not in allowed_extensions:
        return jsonify({
            "error": f"Unsupported audio format '{file_ext}'. Please upload a .wav or .mp3 file."
        }), 400

    speech_key, speech_region = get_speech_credentials()
    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    suffix = file_ext if file_ext else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=UPLOAD_DIR) as temp_file:
        temp_filepath = temp_file.name
        audio_file.save(temp_filepath)

    try:
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key,
            region=speech_region
        )

        audio_config = speechsdk.audio.AudioConfig(filename=temp_filepath)
        recognizer = speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        result = recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return jsonify({
                "transcription": result.text,
                "message": "Audio transcribed successfully!"
            }), 200
        elif result.reason == speechsdk.ResultReason.NoMatch:
            return jsonify({
                "error": "No speech could be recognized from the audio. Please check microphone or audio clarity."
            }), 400
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            error_message = f"Speech Recognition canceled: {cancellation.reason}"
            if cancellation.error_details:
                error_message += f" - {cancellation.error_details}"
            return jsonify({"error": error_message}), 500
        else:
            return jsonify({
                "error": f"Recognition finished with unexpected result: {result.reason}"
            }), 500

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500
    finally:
        try:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
        except OSError:
            pass


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
