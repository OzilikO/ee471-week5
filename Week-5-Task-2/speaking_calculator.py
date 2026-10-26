import os
import tempfile
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Load environment variables directly after imports
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

import azure.cognitiveservices.speech as speechsdk
from custom_classes import (
    Calculator,
    parse_voice_command,
    number_to_spoken_words,
    BUTTON_TO_SPEECH
)

app = Flask(__name__, static_folder="static", template_folder="templates")

# Ensure static & uploads directories exist
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def get_speech_credentials():
    """Retrieve Azure Speech API credentials from environment variables."""
    speech_key = os.getenv("SPEECH_KEY")
    speech_region = os.getenv("SPEECH_REGION")
    return speech_key, speech_region


def get_speech_config():
    """Returns an Azure SpeechConfig instance with speech credentials."""
    key, region = get_speech_credentials()
    if not key or not region:
        return None
    return speechsdk.SpeechConfig(subscription=key, region=region)


def synthesize_speech_to_file(text, output_filename="speech.wav"):
    """Synthesizes text to a static .wav file and returns its web URL path."""
    speech_config = get_speech_config()
    if not speech_config:
        return None

    speech_config.speech_synthesis_voice_name = "en-US-JennyNeural"
    output_filepath = STATIC_DIR / output_filename

    audio_config = speechsdk.audio.AudioOutputConfig(filename=str(output_filepath))
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
    result = synthesizer.speak_text_async(text).get()

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return f"/static/{output_filename}"
    return None


@app.route("/")
def index():
    """Serves the voice-activated calculator web UI."""
    return render_template("index.html")


# ========================================================
# 1. Voice Command Endpoint (Speech-to-Text -> Compute)
# ========================================================
@app.route("/api/voice-command", methods=["POST"])
def voice_command():
    """Transcribes spoken audio command (e.g. 'Five plus two is'), computes result,

    and returns calculation result along with synthesized voice reply.
    """
    if "audio" not in request.files and "file" not in request.files:
        return jsonify({"error": "No audio file provided."}), 400

    audio_file = request.files.get("audio") or request.files.get("file")
    if not audio_file or not audio_file.filename:
        return jsonify({"error": "Empty audio file received."}), 400

    speech_config = get_speech_config()
    if not speech_config:
        return jsonify({"error": "Azure Speech credentials missing in .env."}), 500

    # Save audio temporarily for Azure Speech Recognizer
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=UPLOAD_DIR) as temp_file:
        temp_filepath = temp_file.name
        audio_file.save(temp_filepath)

    try:
        audio_config = speechsdk.audio.AudioConfig(filename=temp_filepath)
        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
        result = recognizer.recognize_once_async().get()

        if result.reason != speechsdk.ResultReason.RecognizedSpeech:
            return jsonify({"error": "No speech recognized. Please speak clearly into the microphone."}), 400

        recognized_text = result.text
        # Parse spoken voice command into operands and operator
        num1, op, num2, clean_text = parse_voice_command(recognized_text)

        # Compute with OOP Calculator logic
        calc = Calculator()
        comp_result = calc.compute(num1, op, num2)

        # Format display (e.g. 7 instead of 7.0 if integer)
        if float(comp_result).is_integer():
            display_val = str(int(round(comp_result)))
        else:
            display_val = f"{comp_result:.4f}".rstrip("0").rstrip(".")

        # Format spoken response in line with command table
        spoken_num = number_to_spoken_words(comp_result)
        spoken_text = f"is {spoken_num}"

        # Synthesize audio response
        audio_url = synthesize_speech_to_file(spoken_text, output_filename="voice_reply.wav")

        return jsonify({
            "command": recognized_text,
            "parsed": f"{num1} {op} {num2}",
            "display": display_val,
            "result": comp_result,
            "spoken_text": spoken_text,
            "audio_url": audio_url
        }), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500
    finally:
        if os.path.exists(temp_filepath):
            try:
                os.remove(temp_filepath)
            except OSError:
                pass


# ========================================================
# 2. Text-to-Speech Endpoint for Magical Button Presses
# ========================================================
@app.route("/api/speak", methods=["POST"])
def speak_button():
    """Synthesizes text for button press voice outputs (e.g. 'Three', 'Plus', 'Is eight')."""
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "Text is required to speak."}), 400

    try:
        audio_url = synthesize_speech_to_file(text, output_filename="speak_output.wav")
        if not audio_url:
            return jsonify({"error": "Failed to synthesize speech."}), 500

        return jsonify({
            "text": text,
            "audio_url": audio_url
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ========================================================
# 3. Calculation Endpoint (For manual button '=' press)
# ========================================================
@app.route("/api/calculate", methods=["POST"])
def calculate():
    """Computes arithmetic from button clicks and generates spoken result."""
    data = request.get_json(silent=True) or {}
    try:
        num1 = float(data.get("num1"))
        num2 = float(data.get("num2"))
        operator = data.get("operator")
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid input numbers."}), 400

    calc = Calculator()
    try:
        comp_result = calc.compute(num1, operator, num2)
        if float(comp_result).is_integer():
            display_val = str(int(round(comp_result)))
        else:
            display_val = f"{comp_result:.4f}".rstrip("0").rstrip(".")

        spoken_num = number_to_spoken_words(comp_result)
        spoken_text = f"is {spoken_num}"

        audio_url = synthesize_speech_to_file(spoken_text, output_filename="calc_output.wav")

        return jsonify({
            "result": comp_result,
            "display": display_val,
            "spoken_text": spoken_text,
            "audio_url": audio_url
        }), 200

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

