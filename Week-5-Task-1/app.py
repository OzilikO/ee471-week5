import os
import time
import tempfile
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import azure.cognitiveservices.speech as speechsdk
import azure.cognitiveservices.speech.translation as translation_sdk
import azure.cognitiveservices.speech.transcription as transcription_sdk

# Determine base directory and load .env file
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


def save_uploaded_audio(audio_file):
    """Saves an incoming file to UPLOAD_DIR and returns its path."""
    file_ext = Path(audio_file.filename).suffix.lower() if audio_file.filename else ".wav"
    suffix = file_ext if file_ext else ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=UPLOAD_DIR) as temp_file:
        temp_filepath = temp_file.name
        audio_file.save(temp_filepath)
    return temp_filepath


@app.route("/")
def index():
    """Serves the unified frontend page."""
    return render_template("index.html")


# ========================================================
# 1. Text-to-Speech Endpoint
# ========================================================
@app.route("/api/text-to-speech", methods=["POST"])
def text_to_speech():
    """Synthesizes input text to speech using Azure Speech SDK."""
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

        audio_config = speechsdk.audio.AudioOutputConfig(filename=str(output_filepath))
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

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


# ========================================================
# 2. Speech-to-Text Endpoint
# ========================================================
@app.route("/api/speech-to-text", methods=["POST"])
def speech_to_text():
    """Transcribes an uploaded audio file (.wav or .mp3) to text."""
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

    temp_filepath = save_uploaded_audio(audio_file)

    try:
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        audio_config = speechsdk.audio.AudioConfig(filename=temp_filepath)
        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

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


# ========================================================
# 3. Speech Translation Endpoint (Part 4)
# ========================================================
@app.route("/api/translate", methods=["POST"])
def translate_speech():
    """Translates audio or text to a target language using TranslationRecognizer.

    Returns translated text and synthesized audio of the translated text.
    """
    speech_key, speech_region = get_speech_credentials()
    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    # Read target and source language
    target_lang = "tr"
    source_lang = "en-US"
    audio_file = None
    input_text = None

    if request.is_json:
        data = request.get_json(silent=True) or {}
        input_text = data.get("text", "").strip()
        target_lang = data.get("target_lang", "tr").strip()
        source_lang = data.get("source_lang", "en-US").strip()
    else:
        target_lang = request.form.get("target_lang", "tr").strip()
        source_lang = request.form.get("source_lang", "en-US").strip()
        audio_file = request.files.get("audio") or request.files.get("file")
        input_text = request.form.get("text", "").strip()

    temp_audio_path = None
    cleanup_temp_audio = False

    try:
        # If user gave text, synthesize to temporary audio to run TranslationRecognizer
        if not audio_file and input_text:
            temp_synth = tempfile.NamedTemporaryFile(delete=False, suffix=".wav", dir=UPLOAD_DIR)
            temp_audio_path = temp_synth.name
            temp_synth.close()
            cleanup_temp_audio = True

            synth_cfg = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
            synth_out = speechsdk.audio.AudioOutputConfig(filename=temp_audio_path)
            synth = speechsdk.SpeechSynthesizer(speech_config=synth_cfg, audio_config=synth_out)
            synth_res = synth.speak_text_async(input_text).get()
            if synth_res.reason != speechsdk.ResultReason.SynthesizingAudioCompleted:
                return jsonify({"error": "Failed to prepare input speech for translation."}), 500

        elif audio_file:
            temp_audio_path = save_uploaded_audio(audio_file)
            cleanup_temp_audio = True
        else:
            return jsonify({"error": "Please provide an audio file or text to translate."}), 400

        # Run Speech Translation Recognizer
        trans_cfg = translation_sdk.SpeechTranslationConfig(
            subscription=speech_key,
            region=speech_region
        )
        trans_cfg.speech_recognition_language = source_lang
        trans_cfg.add_target_language(target_lang)

        audio_cfg = speechsdk.audio.AudioConfig(filename=temp_audio_path)
        recognizer = translation_sdk.TranslationRecognizer(
            translation_config=trans_cfg,
            audio_config=audio_cfg
        )

        result = recognizer.recognize_once_async().get()

        if result.reason == translation_sdk.ResultReason.TranslatedSpeech:
            source_text = result.text
            translated_text = result.translations.get(target_lang, "")

            # Voice mapping for synthesis of translated text
            voice_map = {
                "tr": "tr-TR-AhmetNeural",
                "de": "de-DE-KatjaNeural",
                "es": "es-ES-ElviraNeural",
                "fr": "fr-FR-DeniseNeural",
                "it": "it-IT-ElsaNeural",
                "ru": "ru-RU-SvetlanaNeural",
                "ja": "ja-JP-NanamiNeural",
                "zh-Hans": "zh-CN-XiaoxiaoNeural"
            }
            target_voice = voice_map.get(target_lang, "en-US-JennyNeural")

            # Synthesize translated text to audio
            translated_audio_filename = "translated_output.wav"
            translated_audio_filepath = STATIC_DIR / translated_audio_filename

            tts_cfg = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
            tts_cfg.speech_synthesis_voice_name = target_voice
            tts_out = speechsdk.audio.AudioOutputConfig(filename=str(translated_audio_filepath))
            tts_synth = speechsdk.SpeechSynthesizer(speech_config=tts_cfg, audio_config=tts_out)
            tts_synth.speak_text_async(translated_text).get()

            return jsonify({
                "source_text": source_text,
                "translated_text": translated_text,
                "target_lang": target_lang,
                "audio_url": f"/static/{translated_audio_filename}",
                "message": "Translation completed successfully!"
            }), 200

        elif result.reason == translation_sdk.ResultReason.NoMatch:
            return jsonify({"error": "No speech recognized for translation."}), 400
        elif result.reason == translation_sdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return jsonify({"error": f"Translation canceled: {cancellation.reason} - {cancellation.error_details}"}), 500
        else:
            return jsonify({"error": f"Translation returned unexpected result: {result.reason}"}), 500

    except Exception as e:
        return jsonify({"error": f"Translation error: {str(e)}"}), 500
    finally:
        if cleanup_temp_audio and temp_audio_path and os.path.exists(temp_audio_path):
            try:
                os.remove(temp_audio_path)
            except OSError:
                pass


# ========================================================
# 4. Conversation Diarization Endpoint (Part 4)
# ========================================================
@app.route("/api/diarization", methods=["POST"])
def diarize_audio():
    """Transcribes multi-speaker audio with speaker identification (diarization)."""
    if "audio" not in request.files and "file" not in request.files:
        return jsonify({"error": "Please provide an audio file for diarization."}), 400

    audio_file = request.files.get("audio") or request.files.get("file")
    if not audio_file or not audio_file.filename:
        return jsonify({"error": "Empty audio file received."}), 400

    speech_key, speech_region = get_speech_credentials()
    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    temp_filepath = save_uploaded_audio(audio_file)

    try:
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        audio_config = speechsdk.audio.AudioConfig(filename=temp_filepath)
        transcriber = transcription_sdk.ConversationTranscriber(
            speech_config=speech_config,
            audio_config=audio_config
        )

        speaker_map = {}
        speaker_counter = 1
        lines = []
        done = False
        error_details = None

        def transcribed_cb(evt):
            nonlocal speaker_counter
            if evt.result and evt.result.text:
                raw_speaker = evt.result.speaker_id or "Guest"
                if raw_speaker not in speaker_map:
                    speaker_map[raw_speaker] = f"Speaker {speaker_counter}"
                    speaker_counter += 1
                friendly_speaker = speaker_map[raw_speaker]
                lines.append({
                    "speaker": friendly_speaker,
                    "text": evt.result.text
                })

        def stop_cb(evt):
            nonlocal done
            done = True

        def canceled_cb(evt):
            nonlocal done, error_details
            done = True
            if evt.error_details:
                error_details = evt.error_details

        transcriber.transcribed.connect(transcribed_cb)
        transcriber.session_stopped.connect(stop_cb)
        transcriber.canceled.connect(canceled_cb)

        transcriber.start_transcribing_async()

        # Allow sufficient time for the conversation transcriber to process the file
        timeout = time.time() + 25
        while not done and time.time() < timeout:
            time.sleep(0.15)

        transcriber.stop_transcribing_async()

        if error_details:
            return jsonify({"error": f"Diarization error: {error_details}"}), 500

        if not lines:
            return jsonify({"error": "No speech could be recognized or diarized from the audio."}), 400

        formatted_transcript = "\n".join([f"{item['speaker']}: {item['text']}" for item in lines])

        return jsonify({
            "diarization": lines,
            "formatted_transcript": formatted_transcript,
            "message": "Diarization completed successfully!"
        }), 200

    except Exception as e:
        return jsonify({"error": f"Diarization server error: {str(e)}"}), 500
    finally:
        try:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
        except OSError:
            pass


# ========================================================
# 5. Pronunciation Assessment Endpoint (Part 4)
# ========================================================
@app.route("/api/pronunciation-assessment", methods=["POST"])
def pronunciation_assessment():
    """Assesses speech pronunciation against a reference text."""
    if "audio" not in request.files and "file" not in request.files:
        return jsonify({"error": "Please provide an audio recording or file to assess."}), 400

    audio_file = request.files.get("audio") or request.files.get("file")
    reference_text = request.form.get("reference_text", "").strip()

    if not reference_text:
        return jsonify({"error": "Reference text is required for pronunciation assessment."}), 400

    speech_key, speech_region = get_speech_credentials()
    if not speech_key or not speech_region:
        return jsonify({
            "error": "Azure Speech credentials (SPEECH_KEY, SPEECH_REGION) are missing in .env."
        }), 500

    temp_filepath = save_uploaded_audio(audio_file)

    try:
        speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
        audio_config = speechsdk.audio.AudioConfig(filename=temp_filepath)

        pronunciation_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True
        )

        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
        pronunciation_config.apply_to(recognizer)

        result = recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            pron_result = speechsdk.PronunciationAssessmentResult(result)

            return jsonify({
                "reference_text": reference_text,
                "recognized_text": result.text,
                "accuracy_score": round(pron_result.accuracy_score, 1),
                "fluency_score": round(pron_result.fluency_score, 1),
                "completeness_score": round(pron_result.completeness_score, 1),
                "pronunciation_score": round(pron_result.pronunciation_score, 1),
                "message": "Pronunciation assessment completed successfully!"
            }), 200

        elif result.reason == speechsdk.ResultReason.NoMatch:
            return jsonify({
                "error": "No speech recognized. Please check your microphone and speak clearly."
            }), 400
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation = result.cancellation_details
            return jsonify({
                "error": f"Assessment canceled: {cancellation.reason} - {cancellation.error_details}"
            }), 500
        else:
            return jsonify({
                "error": f"Assessment finished with unexpected result: {result.reason}"
            }), 500

    except Exception as e:
        return jsonify({"error": f"Assessment error: {str(e)}"}), 500
    finally:
        try:
            if os.path.exists(temp_filepath):
                os.remove(temp_filepath)
        except OSError:
            pass


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
