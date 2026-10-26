document.addEventListener("DOMContentLoaded", () => {
    // =========================================================
    // Tab Switching Logic
    // =========================================================
    const tabTtsBtn = document.getElementById("tabTtsBtn");
    const tabSttBtn = document.getElementById("tabSttBtn");
    const ttsPanel = document.getElementById("ttsPanel");
    const sttPanel = document.getElementById("sttPanel");

    function switchTab(activeTab) {
        if (activeTab === "tts") {
            tabTtsBtn.classList.add("active");
            tabSttBtn.classList.remove("active");
            ttsPanel.classList.remove("hidden");
            sttPanel.classList.add("hidden");
        } else {
            tabSttBtn.classList.add("active");
            tabTtsBtn.classList.remove("active");
            sttPanel.classList.remove("hidden");
            ttsPanel.classList.add("hidden");
        }
    }

    tabTtsBtn.addEventListener("click", () => switchTab("tts"));
    tabSttBtn.addEventListener("click", () => switchTab("stt"));

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
    // 1. Text-to-Speech Feature
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
        showStatus(ttsStatusMessage, "Synthesizing audio, please wait...", "info");

        try {
            const response = await fetch("/api/text-to-speech", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to synthesize speech.");
            }

            showStatus(ttsStatusMessage, "✓ Speech synthesized successfully!", "success");

            // Cache-busting URL to reload latest synthesized audio
            const audioUrl = `${data.audio_url}?t=${Date.now()}`;
            audioPlayer.src = audioUrl;
            downloadBtn.href = data.audio_url;

            audioSection.classList.remove("hidden");
            audioPlayer.load();

        } catch (error) {
            console.error("Synthesis error:", error);
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
    // 2. Speech-to-Text Feature
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

    let audioContext = null;
    let mediaStream = null;
    let audioInputNode = null;
    let processorNode = null;
    let audioChunks = [];
    let recordedAudioBlob = null;
    let isRecording = false;

    // Helper: Write ASCII strings to DataView for WAV RIFF headers
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Helper: Encode raw PCM float samples into standard 16-bit PCM WAV Blob
    function encodeWAV(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        /* RIFF identifier */
        writeString(view, 0, "RIFF");
        /* file length */
        view.setUint32(4, 36 + samples.length * 2, true);
        /* RIFF type */
        writeString(view, 8, "WAVE");
        /* format chunk identifier */
        writeString(view, 12, "fmt ");
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (1 = raw PCM) */
        view.setUint16(20, 1, true);
        /* channel count (1 = mono) */
        view.setUint16(22, 1, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * 1 channel * 2 bytes) */
        view.setUint32(28, sampleRate * 2, true);
        /* block align (1 channel * 2 bytes) */
        view.setUint16(32, 2, true);
        /* bits per sample */
        view.setUint16(34, 16, true);
        /* data chunk identifier */
        writeString(view, 36, "data");
        /* data chunk length */
        view.setUint32(40, samples.length * 2, true);

        // Convert Float32 samples to 16-bit PCM integers
        let offset = 44;
        for (let i = 0; i < samples.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([view], { type: "audio/wav" });
    }

    // Start Recording from Microphone
    startRecordBtn.addEventListener("click", async () => {
        try {
            audioChunks = [];
            recordedAudioBlob = null;
            clearStatus(sttStatusMessage);

            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioInputNode = audioContext.createMediaStreamSource(mediaStream);

            processorNode = audioContext.createScriptProcessor(4096, 1, 1);
            processorNode.onaudioprocess = (e) => {
                if (!isRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                audioChunks.push(new Float32Array(inputData));
            };

            audioInputNode.connect(processorNode);
            processorNode.connect(audioContext.destination);

            isRecording = true;
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            recordingIndicator.classList.remove("hidden");
            audioFileInput.value = "";

        } catch (err) {
            console.error("Microphone access error:", err);
            showStatus(sttStatusMessage, "Microphone access denied or not supported.", "error");
        }
    });

    // Stop Recording
    stopRecordBtn.addEventListener("click", () => {
        if (!isRecording) return;
        isRecording = false;

        if (processorNode) processorNode.disconnect();
        if (audioInputNode) audioInputNode.disconnect();
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }

        let totalLength = 0;
        for (let chunk of audioChunks) totalLength += chunk.length;
        let mergedSamples = new Float32Array(totalLength);
        let offset = 0;
        for (let chunk of audioChunks) {
            mergedSamples.set(chunk, offset);
            offset += chunk.length;
        }

        const sampleRate = audioContext ? audioContext.sampleRate : 44100;
        if (audioContext && audioContext.state !== "closed") {
            audioContext.close();
        }

        recordedAudioBlob = encodeWAV(mergedSamples, sampleRate);

        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
        recordingIndicator.classList.add("hidden");
        showStatus(sttStatusMessage, "Recording captured! Click 'Transcribe Audio' to convert to text.", "info");
    });

    // Handle File Input Selection
    audioFileInput.addEventListener("change", () => {
        if (audioFileInput.files && audioFileInput.files.length > 0) {
            recordedAudioBlob = null;
            clearStatus(sttStatusMessage);
        }
    });

    // Transcribe Audio
    transcribeBtn.addEventListener("click", async () => {
        let fileToSend = null;

        if (audioFileInput.files && audioFileInput.files.length > 0) {
            fileToSend = audioFileInput.files[0];
        } else if (recordedAudioBlob) {
            fileToSend = new File([recordedAudioBlob], "recording.wav", { type: "audio/wav" });
        }

        if (!fileToSend) {
            showStatus(sttStatusMessage, "Please record audio or choose an audio file first.", "error");
            return;
        }

        transcribeBtn.disabled = true;
        clearSttBtn.disabled = true;
        transcribeBtn.innerHTML = '<span class="btn-icon">⏳</span> Transcribing...';
        showStatus(sttStatusMessage, "Transcribing audio with Azure Speech SDK, please wait...", "info");

        const formData = new FormData();
        formData.append("audio", fileToSend, fileToSend.name || "audio.wav");

        try {
            const response = await fetch("/api/speech-to-text", {
                method: "POST",
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to transcribe audio.");
            }

            transcriptionText.textContent = data.transcription || "No speech detected.";
            transcriptionSection.classList.remove("hidden");
            showStatus(sttStatusMessage, "✓ Audio transcribed successfully!", "success");

        } catch (error) {
            console.error("Transcription error:", error);
            showStatus(sttStatusMessage, `⚠ ${error.message}`, "error");
        } finally {
            transcribeBtn.disabled = false;
            clearSttBtn.disabled = false;
            transcribeBtn.innerHTML = '<span class="btn-icon">🎙</span> Transcribe Audio';
        }
    });

    // Copy Transcription Text
    copyTextBtn.addEventListener("click", async () => {
        const textToCopy = transcriptionText.textContent.trim();
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            const originalHtml = copyTextBtn.innerHTML;
            copyTextBtn.innerHTML = '<span class="btn-icon">✓</span> Copied!';
            setTimeout(() => {
                copyTextBtn.innerHTML = originalHtml;
            }, 2000);
        } catch (err) {
            console.error("Failed to copy text:", err);
        }
    });

    // Clear STT Form
    clearSttBtn.addEventListener("click", () => {
        audioFileInput.value = "";
        recordedAudioBlob = null;
        audioChunks = [];
        clearStatus(sttStatusMessage);
        transcriptionText.textContent = "";
        transcriptionSection.classList.add("hidden");
        recordingIndicator.classList.add("hidden");
        startRecordBtn.disabled = false;
        stopRecordBtn.disabled = true;
    });
});
