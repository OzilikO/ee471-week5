document.addEventListener("DOMContentLoaded", () => {
    // ========================================================
    // 1. Tab Navigation Controller (All 5 Features)
    // ========================================================
    const tabs = [
        { btn: document.getElementById("tabTtsBtn"), panel: document.getElementById("ttsPanel") },
        { btn: document.getElementById("tabSttBtn"), panel: document.getElementById("sttPanel") },
        { btn: document.getElementById("tabTransBtn"), panel: document.getElementById("transPanel") },
        { btn: document.getElementById("tabDiarBtn"), panel: document.getElementById("diarPanel") },
        { btn: document.getElementById("tabPronBtn"), panel: document.getElementById("pronPanel") }
    ];

    function activateTab(targetBtn) {
        tabs.forEach(({ btn, panel }) => {
            if (btn === targetBtn) {
                btn.classList.add("active");
                panel.classList.remove("hidden");
            } else {
                btn.classList.remove("active");
                panel.classList.add("hidden");
            }
        });
    }

    tabs.forEach(({ btn }) => {
        btn.addEventListener("click", () => activateTab(btn));
    });

    // Utility: Show/Clear Status Messages
    function showStatus(elem, message, type) {
        elem.textContent = message;
        elem.className = `status-box ${type}`;
        elem.classList.remove("hidden");
    }

    function clearStatus(elem) {
        elem.textContent = "";
        elem.className = "status-box hidden";
    }

    // ========================================================
    // 2. Reusable In-Browser WAV Audio Recorder
    // ========================================================
    class WavAudioRecorder {
        constructor() {
            this.audioContext = null;
            this.mediaStream = null;
            this.processorNode = null;
            this.audioInputNode = null;
            this.chunks = [];
            this.isRecording = false;
        }

        async start() {
            this.chunks = [];
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioInputNode = this.audioContext.createMediaStreamSource(this.mediaStream);

            this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.processorNode.onaudioprocess = (e) => {
                if (!this.isRecording) return;
                const channelData = e.inputBuffer.getChannelData(0);
                this.chunks.push(new Float32Array(channelData));
            };

            this.audioInputNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);
            this.isRecording = true;
        }

        stop() {
            this.isRecording = false;
            if (this.processorNode) this.processorNode.disconnect();
            if (this.audioInputNode) this.audioInputNode.disconnect();
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(t => t.stop());
            }

            let totalLength = 0;
            for (let chunk of this.chunks) totalLength += chunk.length;
            let merged = new Float32Array(totalLength);
            let offset = 0;
            for (let chunk of this.chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }

            const sampleRate = this.audioContext ? this.audioContext.sampleRate : 44100;
            if (this.audioContext && this.audioContext.state !== "closed") {
                this.audioContext.close();
            }

            return this.encodeWAV(merged, sampleRate);
        }

        encodeWAV(samples, sampleRate) {
            const buffer = new ArrayBuffer(44 + samples.length * 2);
            const view = new DataView(buffer);

            function writeStr(offset, str) {
                for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
            }

            writeStr(0, "RIFF");
            view.setUint32(4, 36 + samples.length * 2, true);
            writeStr(8, "WAVE");
            writeStr(12, "fmt ");
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // PCM
            view.setUint16(22, 1, true); // Mono
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, "data");
            view.setUint32(40, samples.length * 2, true);

            let offset = 44;
            for (let i = 0; i < samples.length; i++, offset += 2) {
                let s = Math.max(-1, Math.min(1, samples[i]));
                view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
            }
            return new Blob([view], { type: "audio/wav" });
        }
    }

    // ========================================================
    // 3. Text-to-Speech Controller
    // ========================================================
    const textInput = document.getElementById("textInput");
    const synthesizeBtn = document.getElementById("synthesizeBtn");
    const clearTtsBtn = document.getElementById("clearTtsBtn");
    const ttsStatusMessage = document.getElementById("ttsStatusMessage");
    const audioSection = document.getElementById("audioSection");
    const audioPlayer = document.getElementById("audioPlayer");
    const downloadBtn = document.getElementById("downloadBtn");

    synthesizeBtn.addEventListener("click", async () => {
        const text = textInput.value.trim();
        if (!text) {
            showStatus(ttsStatusMessage, "Please enter some text to synthesize.", "error");
            textInput.focus();
            return;
        }

        synthesizeBtn.disabled = true;
        clearTtsBtn.disabled = true;
        synthesizeBtn.innerHTML = '<span class="btn-icon">⏳</span> Synthesizing...';
        showStatus(ttsStatusMessage, "Synthesizing audio with Azure Speech SDK...", "info");

        try {
            const response = await fetch("/api/text-to-speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to synthesize speech.");

            showStatus(ttsStatusMessage, "✓ Speech synthesized successfully!", "success");
            audioPlayer.src = `${data.audio_url}?t=${Date.now()}`;
            downloadBtn.href = data.audio_url;
            audioSection.classList.remove("hidden");
            audioPlayer.load();

        } catch (error) {
            showStatus(ttsStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            synthesizeBtn.disabled = false;
            clearTtsBtn.disabled = false;
            synthesizeBtn.innerHTML = '<span class="btn-icon">🔊</span> Synthesize Speech';
        }
    });

    clearTtsBtn.addEventListener("click", () => {
        textInput.value = "";
        clearStatus(ttsStatusMessage);
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
        audioSection.classList.add("hidden");
        textInput.focus();
    });

    // ========================================================
    // 4. Speech-to-Text Controller
    // ========================================================
    const startRecordBtn = document.getElementById("startRecordBtn");
    const stopRecordBtn = document.getElementById("stopRecordBtn");
    const audioFileInput = document.getElementById("audioFileInput");
    const recordingIndicator = document.getElementById("recordingIndicator");
    const transcribeBtn = document.getElementById("transcribeBtn");
    const clearSttBtn = document.getElementById("clearSttBtn");
    const transcriptionSection = document.getElementById("transcriptionSection");
    const transcriptionText = document.getElementById("transcriptionText");
    const copyTextBtn = document.getElementById("copyTextBtn");
    const sttStatusMessage = document.getElementById("sttStatusMessage");

    const sttRecorder = new WavAudioRecorder();
    let sttBlob = null;

    startRecordBtn.addEventListener("click", async () => {
        try {
            sttBlob = null;
            clearStatus(sttStatusMessage);
            await sttRecorder.start();
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            recordingIndicator.classList.remove("hidden");
            audioFileInput.value = "";
        } catch (err) {
            showStatus(sttStatusMessage, "Microphone access denied or unavailable.", "error");
        }
    });

    stopRecordBtn.addEventListener("click", () => {
        sttBlob = sttRecorder.stop();
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
        recordingIndicator.classList.add("hidden");
        showStatus(sttStatusMessage, "Recording captured! Click 'Transcribe Audio'.", "info");
    });

    audioFileInput.addEventListener("change", () => {
        if (audioFileInput.files.length) {
            sttBlob = null;
            clearStatus(sttStatusMessage);
        }
    });

    transcribeBtn.addEventListener("click", async () => {
        const fileToSend = audioFileInput.files.length ? audioFileInput.files[0] : (sttBlob ? new File([sttBlob], "recording.wav", { type: "audio/wav" }) : null);

        if (!fileToSend) {
            showStatus(sttStatusMessage, "Please record speech or choose an audio file first.", "error");
            return;
        }

        transcribeBtn.disabled = true;
        clearSttBtn.disabled = true;
        transcribeBtn.innerHTML = '<span class="btn-icon">⏳</span> Transcribing...';
        showStatus(sttStatusMessage, "Transcribing with Azure Speech Recognizer...", "info");

        const formData = new FormData();
        formData.append("audio", fileToSend, fileToSend.name || "audio.wav");

        try {
            const response = await fetch("/api/speech-to-text", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to transcribe audio.");

            transcriptionText.textContent = data.transcription || "No speech detected.";
            transcriptionSection.classList.remove("hidden");
            showStatus(sttStatusMessage, "✓ Audio transcribed successfully!", "success");

        } catch (error) {
            showStatus(sttStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            transcribeBtn.disabled = false;
            clearSttBtn.disabled = false;
            transcribeBtn.innerHTML = '<span class="btn-icon">🎙</span> Transcribe Audio';
        }
    });

    copyTextBtn.addEventListener("click", async () => {
        const text = transcriptionText.textContent.trim();
        if (!text) return;
        await navigator.clipboard.writeText(text);
        const orig = copyTextBtn.innerHTML;
        copyTextBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!';
        setTimeout(() => { copyTextBtn.innerHTML = orig; }, 1800);
    });

    clearSttBtn.addEventListener("click", () => {
        audioFileInput.value = "";
        sttBlob = null;
        clearStatus(sttStatusMessage);
        transcriptionText.textContent = "";
        transcriptionSection.classList.add("hidden");
        recordingIndicator.classList.add("hidden");
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
    });

    // ========================================================
    // 5. Speech Translation Controller (Part 4)
    // ========================================================
    const transSourceLang = document.getElementById("transSourceLang");
    const transTargetLang = document.getElementById("transTargetLang");
    const transModeAudioBtn = document.getElementById("transModeAudioBtn");
    const transModeTextBtn = document.getElementById("transModeTextBtn");
    const transAudioSection = document.getElementById("transAudioSection");
    const transTextSection = document.getElementById("transTextSection");
    const transStartRecordBtn = document.getElementById("transStartRecordBtn");
    const transStopRecordBtn = document.getElementById("transStopRecordBtn");
    const transAudioFileInput = document.getElementById("transAudioFileInput");
    const transRecordingIndicator = document.getElementById("transRecordingIndicator");
    const transTextInput = document.getElementById("transTextInput");
    const translateSubmitBtn = document.getElementById("translateSubmitBtn");
    const clearTransBtn = document.getElementById("clearTransBtn");
    const transStatusMessage = document.getElementById("transStatusMessage");
    const transOutputSection = document.getElementById("transOutputSection");
    const transSourceText = document.getElementById("transSourceText");
    const transResultText = document.getElementById("transResultText");
    const copyTransBtn = document.getElementById("copyTransBtn");
    const transAudioPlayer = document.getElementById("transAudioPlayer");
    const downloadTransAudioBtn = document.getElementById("downloadTransAudioBtn");

    let translationMode = "audio"; // "audio" | "text"
    const transRecorder = new WavAudioRecorder();
    let transBlob = null;

    transModeAudioBtn.addEventListener("click", () => {
        translationMode = "audio";
        transModeAudioBtn.classList.add("active");
        transModeTextBtn.classList.remove("active");
        transAudioSection.classList.remove("hidden");
        transTextSection.classList.add("hidden");
    });

    transModeTextBtn.addEventListener("click", () => {
        translationMode = "text";
        transModeTextBtn.classList.add("active");
        transModeAudioBtn.classList.remove("active");
        transTextSection.classList.remove("hidden");
        transAudioSection.classList.add("hidden");
    });

    transStartRecordBtn.addEventListener("click", async () => {
        try {
            transBlob = null;
            clearStatus(transStatusMessage);
            await transRecorder.start();
            transStartRecordBtn.disabled = true;
            transStopRecordBtn.disabled = false;
            transRecordingIndicator.classList.remove("hidden");
            transAudioFileInput.value = "";
        } catch (err) {
            showStatus(transStatusMessage, "Microphone access denied or unavailable.", "error");
        }
    });

    transStopRecordBtn.addEventListener("click", () => {
        transBlob = transRecorder.stop();
        transStartRecordBtn.disabled = false;
        transStopRecordBtn.disabled = true;
        transRecordingIndicator.classList.add("hidden");
        showStatus(transStatusMessage, "Speech captured! Click 'Translate'.", "info");
    });

    translateSubmitBtn.addEventListener("click", async () => {
        const targetLang = transTargetLang.value;
        const sourceLang = transSourceLang.value;

        translateSubmitBtn.disabled = true;
        clearTransBtn.disabled = true;
        translateSubmitBtn.innerHTML = '<span class="btn-icon">⏳</span> Translating...';
        showStatus(transStatusMessage, "Translating with Azure TranslationRecognizer...", "info");

        try {
            let response = null;

            if (translationMode === "text") {
                const text = transTextInput.value.trim();
                if (!text) throw new Error("Please enter source text to translate.");

                response = await fetch("/api/translate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, target_lang: targetLang, source_lang: sourceLang })
                });
            } else {
                const fileToSend = transAudioFileInput.files.length ? transAudioFileInput.files[0] : (transBlob ? new File([transBlob], "speech.wav", { type: "audio/wav" }) : null);

                if (!fileToSend) throw new Error("Please record speech or choose an audio file first.");

                const formData = new FormData();
                formData.append("audio", fileToSend, fileToSend.name || "speech.wav");
                formData.append("target_lang", targetLang);
                formData.append("source_lang", sourceLang);

                response = await fetch("/api/translate", {
                    method: "POST",
                    body: formData
                });
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Translation failed.");

            transSourceText.textContent = data.source_text || "(Text Input)";
            transResultText.textContent = data.translated_text || "No translation output.";

            if (data.audio_url) {
                transAudioPlayer.src = `${data.audio_url}?t=${Date.now()}`;
                downloadTransAudioBtn.href = data.audio_url;
                transAudioPlayer.load();
            }

            transOutputSection.classList.remove("hidden");
            showStatus(transStatusMessage, "✓ Translation completed successfully!", "success");

        } catch (error) {
            showStatus(transStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            translateSubmitBtn.disabled = false;
            clearTransBtn.disabled = false;
            translateSubmitBtn.innerHTML = '<span class="btn-icon">🌐</span> Translate';
        }
    });

    copyTransBtn.addEventListener("click", async () => {
        const text = transResultText.textContent.trim();
        if (!text) return;
        await navigator.clipboard.writeText(text);
        const orig = copyTransBtn.innerHTML;
        copyTransBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!';
        setTimeout(() => { copyTransBtn.innerHTML = orig; }, 1800);
    });

    clearTransBtn.addEventListener("click", () => {
        transTextInput.value = "";
        transAudioFileInput.value = "";
        transBlob = null;
        clearStatus(transStatusMessage);
        transOutputSection.classList.add("hidden");
        transRecordingIndicator.classList.add("hidden");
        transStartRecordBtn.disabled = false;
        transStopRecordBtn.disabled = true;
    });

    // ========================================================
    // 6. Diarization Controller (Part 4)
    // ========================================================
    const diarStartRecordBtn = document.getElementById("diarStartRecordBtn");
    const diarStopRecordBtn = document.getElementById("diarStopRecordBtn");
    const diarAudioFileInput = document.getElementById("diarAudioFileInput");
    const diarRecordingIndicator = document.getElementById("diarRecordingIndicator");
    const diarizeSubmitBtn = document.getElementById("diarizeSubmitBtn");
    const clearDiarBtn = document.getElementById("clearDiarBtn");
    const diarStatusMessage = document.getElementById("diarStatusMessage");
    const diarOutputSection = document.getElementById("diarOutputSection");
    const diarTranscriptList = document.getElementById("diarTranscriptList");
    const copyDiarBtn = document.getElementById("copyDiarBtn");

    const diarRecorder = new WavAudioRecorder();
    let diarBlob = null;
    let fullDiarTranscriptText = "";

    diarStartRecordBtn.addEventListener("click", async () => {
        try {
            diarBlob = null;
            clearStatus(diarStatusMessage);
            await diarRecorder.start();
            diarStartRecordBtn.disabled = true;
            diarStopRecordBtn.disabled = false;
            diarRecordingIndicator.classList.remove("hidden");
            diarAudioFileInput.value = "";
        } catch (err) {
            showStatus(diarStatusMessage, "Microphone access denied or unavailable.", "error");
        }
    });

    diarStopRecordBtn.addEventListener("click", () => {
        diarBlob = diarRecorder.stop();
        diarStartRecordBtn.disabled = false;
        diarStopRecordBtn.disabled = true;
        diarRecordingIndicator.classList.add("hidden");
        showStatus(diarStatusMessage, "Audio captured! Click 'Run Diarization'.", "info");
    });

    diarizeSubmitBtn.addEventListener("click", async () => {
        const fileToSend = diarAudioFileInput.files.length ? diarAudioFileInput.files[0] : (diarBlob ? new File([diarBlob], "conversation.wav", { type: "audio/wav" }) : null);

        if (!fileToSend) {
            showStatus(diarStatusMessage, "Please upload or record multi-speaker audio.", "error");
            return;
        }

        diarizeSubmitBtn.disabled = true;
        clearDiarBtn.disabled = true;
        diarizeSubmitBtn.innerHTML = '<span class="btn-icon">⏳</span> Analyzing Speakers...';
        showStatus(diarStatusMessage, "Running Azure ConversationTranscriber diarization...", "info");

        const formData = new FormData();
        formData.append("audio", fileToSend, fileToSend.name || "conversation.wav");

        try {
            const response = await fetch("/api/diarization", {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Diarization failed.");

            diarTranscriptList.innerHTML = "";
            fullDiarTranscriptText = data.formatted_transcript || "";

            data.diarization.forEach(turn => {
                const bubble = document.createElement("div");
                bubble.className = "diarization-bubble";

                const pill = document.createElement("span");
                pill.className = "speaker-pill";
                pill.textContent = turn.speaker;

                const textSpan = document.createElement("span");
                textSpan.className = "speaker-text";
                textSpan.textContent = turn.text;

                bubble.appendChild(pill);
                bubble.appendChild(textSpan);
                diarTranscriptList.appendChild(bubble);
            });

            diarOutputSection.classList.remove("hidden");
            showStatus(diarStatusMessage, "✓ Diarization completed successfully!", "success");

        } catch (error) {
            showStatus(diarStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            diarizeSubmitBtn.disabled = false;
            clearDiarBtn.disabled = false;
            diarizeSubmitBtn.innerHTML = '<span class="btn-icon">👥</span> Run Diarization';
        }
    });

    copyDiarBtn.addEventListener("click", async () => {
        if (!fullDiarTranscriptText) return;
        await navigator.clipboard.writeText(fullDiarTranscriptText);
        const orig = copyDiarBtn.innerHTML;
        copyDiarBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!';
        setTimeout(() => { copyDiarBtn.innerHTML = orig; }, 1800);
    });

    clearDiarBtn.addEventListener("click", () => {
        diarAudioFileInput.value = "";
        diarBlob = null;
        diarTranscriptList.innerHTML = "";
        fullDiarTranscriptText = "";
        clearStatus(diarStatusMessage);
        diarOutputSection.classList.add("hidden");
        diarRecordingIndicator.classList.add("hidden");
        diarStartRecordBtn.disabled = false;
        diarStopRecordBtn.disabled = true;
    });

    // ========================================================
    // 7. Pronunciation Assessment Controller (Part 4)
    // ========================================================
    const pronReferenceText = document.getElementById("pronReferenceText");
    const pronStartRecordBtn = document.getElementById("pronStartRecordBtn");
    const pronStopRecordBtn = document.getElementById("pronStopRecordBtn");
    const pronAudioFileInput = document.getElementById("pronAudioFileInput");
    const pronRecordingIndicator = document.getElementById("pronRecordingIndicator");
    const pronAssessSubmitBtn = document.getElementById("pronAssessSubmitBtn");
    const clearPronBtn = document.getElementById("clearPronBtn");
    const pronStatusMessage = document.getElementById("pronStatusMessage");
    const pronOutputSection = document.getElementById("pronOutputSection");
    const scoreOverall = document.getElementById("scoreOverall");
    const scoreAccuracy = document.getElementById("scoreAccuracy");
    const scoreFluency = document.getElementById("scoreFluency");
    const scoreCompleteness = document.getElementById("scoreCompleteness");
    const pronRecognizedText = document.getElementById("pronRecognizedText");

    const pronRecorder = new WavAudioRecorder();
    let pronBlob = null;

    pronStartRecordBtn.addEventListener("click", async () => {
        try {
            pronBlob = null;
            clearStatus(pronStatusMessage);
            await pronRecorder.start();
            pronStartRecordBtn.disabled = true;
            pronStopRecordBtn.disabled = false;
            pronRecordingIndicator.classList.remove("hidden");
            pronAudioFileInput.value = "";
        } catch (err) {
            showStatus(pronStatusMessage, "Microphone access denied or unavailable.", "error");
        }
    });

    pronStopRecordBtn.addEventListener("click", () => {
        pronBlob = pronRecorder.stop();
        pronStartRecordBtn.disabled = false;
        pronStopRecordBtn.disabled = true;
        pronRecordingIndicator.classList.add("hidden");
        showStatus(pronStatusMessage, "Spoken attempt captured! Click 'Assess Pronunciation'.", "info");
    });

    pronAssessSubmitBtn.addEventListener("click", async () => {
        const referenceText = pronReferenceText.value.trim();
        if (!referenceText) {
            showStatus(pronStatusMessage, "Please enter reference text to assess against.", "error");
            pronReferenceText.focus();
            return;
        }

        const fileToSend = pronAudioFileInput.files.length ? pronAudioFileInput.files[0] : (pronBlob ? new File([pronBlob], "attempt.wav", { type: "audio/wav" }) : null);

        if (!fileToSend) {
            showStatus(pronStatusMessage, "Please record or upload your speech attempt.", "error");
            return;
        }

        pronAssessSubmitBtn.disabled = true;
        clearPronBtn.disabled = true;
        pronAssessSubmitBtn.innerHTML = '<span class="btn-icon">⏳</span> Scoring...';
        showStatus(pronStatusMessage, "Assessing pronunciation with Azure Cognitive Services...", "info");

        const formData = new FormData();
        formData.append("audio", fileToSend, fileToSend.name || "attempt.wav");
        formData.append("reference_text", referenceText);

        try {
            const response = await fetch("/api/pronunciation-assessment", {
                method: "POST",
                body: formData
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Pronunciation assessment failed.");

            scoreOverall.textContent = data.pronunciation_score;
            scoreAccuracy.textContent = data.accuracy_score;
            scoreFluency.textContent = data.fluency_score;
            scoreCompleteness.textContent = data.completeness_score;
            pronRecognizedText.textContent = data.recognized_text || "No speech recognized.";

            pronOutputSection.classList.remove("hidden");
            showStatus(pronStatusMessage, "✓ Pronunciation assessment completed successfully!", "success");

        } catch (error) {
            showStatus(pronStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            pronAssessSubmitBtn.disabled = false;
            clearPronBtn.disabled = false;
            pronAssessSubmitBtn.innerHTML = '<span class="btn-icon">🎯</span> Assess Pronunciation';
        }
    });

    clearPronBtn.addEventListener("click", () => {
        pronAudioFileInput.value = "";
        pronBlob = null;
        clearStatus(pronStatusMessage);
        pronOutputSection.classList.add("hidden");
        pronRecordingIndicator.classList.add("hidden");
        pronStartRecordBtn.disabled = false;
        pronStopRecordBtn.disabled = true;
    });
});
