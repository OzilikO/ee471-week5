import os
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk

# Determine base directory and load .env file
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

app = Flask(__name__, static_folder="static", template_folder="templates")

# Ensure static folder exists for saving audio outputs
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)


@app.route("/")
def index():
    """Serves the main frontend page."""
    return render_template("index.html")


@app.route("/api/text-to-speech", methods=["POST"])
def text_to_speech():
    """Synthesizes input text to speech using Azure Speech SDK.

    Expects JSON body: {"text": "<user_text>"}
    Returns JSON: {"audio_url": "/static/output.wav"}
    """
    if not request.is_json:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text cannot be empty."}), 400

    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")

    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    output_filename = "output.wav"
    output_filepath = STATIC_DIR / output_filename

    try:
        # Configure Azure Speech SDK
        speech_config = speechsdk.SpeechConfig(
            subscription=speech_key,
            region=speech_region
        )
        # Optional: set speech synthesis voice name (default is en-US-AvaMultilingualNeural or standard)
        speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"

        # Output directly to the static audio file
        audio_config = speechsdk.audio.AudioOutputConfig(
            filename=str(output_filepath)
        )

        synthesizer = speechsdk.SpeechSynthesizer(
            speech_config=speech_config,
            audio_config=audio_config
        )

        # Synthesize speech
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


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

