document.addEventListener("DOMContentLoaded", () => {
    const calcDisplay = document.getElementById("calcDisplay");
    const micBtn = document.getElementById("micBtn");
    const micPulse = document.getElementById("micPulse");
    const statusText = document.getElementById("statusText");
    const historyLog = document.getElementById("historyLog");
    const historyText = document.getElementById("historyText");
    const ttsAudioPlayer = document.getElementById("ttsAudioPlayer");

    // ========================================================
    // 1. Calculator State & Logic
    // ========================================================
    let currentInput = "0";
    let firstOperand = null;
    let operator = null;
    let waitingForSecondOperand = false;

    function updateDisplay(val) {
        currentInput = String(val);
        calcDisplay.textContent = currentInput;
    }

    function clearCalculator() {
        currentInput = "0";
        firstOperand = null;
        operator = null;
        waitingForSecondOperand = false;
        calcDisplay.textContent = "0";
        statusText.textContent = "Calculator cleared.";
    }

    calcDisplay.addEventListener("click", clearCalculator);

    // ========================================================
    // 2. Audio Playback Helper
    // ========================================================
    function playAudio(url) {
        if (!url) return;
        ttsAudioPlayer.src = `${url}?t=${Date.now()}`;
        ttsAudioPlayer.play().catch(e => console.log("Audio autoplay prevented:", e));
    }

    async function speakButtonText(word) {
        if (!word) return;
        try {
            const res = await fetch("/api/speak", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: word })
            });
            const data = await res.json();
            if (data.audio_url) {
                playAudio(data.audio_url);
            }
        } catch (err) {
            console.error("Speak error:", err);
        }
    }

    // ========================================================
    // 3. Magical Buttons Event Listeners
    // ========================================================
    document.querySelectorAll(".keypad-grid .btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const speechWord = btn.getAttribute("data-speech");

            // Visual feedback
            btn.classList.add("speaking-active");
            setTimeout(() => btn.classList.remove("speaking-active"), 200);

            // Number input
            if (btn.classList.contains("btn-num")) {
                const val = btn.getAttribute("data-val");
                if (waitingForSecondOperand) {
                    currentInput = val;
                    waitingForSecondOperand = false;
                } else {
                    if (val === ".") {
                        if (!currentInput.includes(".")) {
                            currentInput += ".";
                        }
                    } else {
                        currentInput = currentInput === "0" ? val : currentInput + val;
                    }
                }
                calcDisplay.textContent = currentInput;
                statusText.textContent = `Button pressed: ${speechWord}`;
                await speakButtonText(speechWord);
            }

            // Operator input (+, -, *, /)
            else if (btn.classList.contains("btn-op")) {
                const nextOp = btn.getAttribute("data-op");
                statusText.textContent = `Operator: ${speechWord}`;
                await speakButtonText(speechWord);

                if (firstOperand === null) {
                    firstOperand = parseFloat(currentInput);
                } else if (operator && !waitingForSecondOperand) {
                    await executeEqualsCalculation();
                    firstOperand = parseFloat(currentInput);
                }

                operator = nextOp;
                waitingForSecondOperand = true;
            }

            // Equals input (=)
            else if (btn.classList.contains("btn-equals")) {
                if (firstOperand !== null && operator !== null) {
                    await executeEqualsCalculation();
                } else {
                    await speakButtonText("Is");
                }
            }
        });
    });

    async function executeEqualsCalculation() {
        const num1 = firstOperand;
        const num2 = parseFloat(currentInput);
        const op = operator;

        statusText.textContent = `Calculating: ${num1} ${op} ${num2}...`;

        try {
            const res = await fetch("/api/calculate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ num1, num2, operator: op })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Calculation failed.");

            updateDisplay(data.display);
            statusText.textContent = `Result: ${data.spoken_text}`;

            if (data.audio_url) {
                playAudio(data.audio_url);
            }

            // Reset state
            firstOperand = parseFloat(data.display);
            operator = null;
            waitingForSecondOperand = true;

        } catch (err) {
            statusText.textContent = `Error: ${err.message}`;
            calcDisplay.textContent = "Error";
            firstOperand = null;
            operator = null;
            waitingForSecondOperand = false;
        }
    }

    // ========================================================
    // 4. In-Browser WAV Audio Recorder for Voice Commands
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
    // 5. Microphone Button Controller
    // ========================================================
    const recorder = new WavAudioRecorder();
    let isRecording = false;

    micBtn.addEventListener("click", async () => {
        if (!isRecording) {
            // Start listening
            try {
                await recorder.start();
                isRecording = true;
                micBtn.classList.add("recording");
                micPulse.classList.remove("hidden");
                statusText.textContent = "Listening... Speak your command (e.g. 'Five plus two is').";
            } catch (err) {
                console.error("Mic access error:", err);
                statusText.textContent = "Microphone access denied or not available.";
            }
        } else {
            // Stop listening and process command
            isRecording = false;
            micBtn.classList.remove("recording");
            micPulse.classList.add("hidden");
            statusText.textContent = "Processing voice command with Azure Speech SDK...";

            const audioBlob = recorder.stop();
            const formData = new FormData();
            formData.append("audio", audioBlob, "voice_command.wav");

            try {
                const res = await fetch("/api/voice-command", {
                    method: "POST",
                    body: formData
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to recognize command.");

                // Update calculator display with result
                updateDisplay(data.display);
                firstOperand = parseFloat(data.display);
                operator = null;
                waitingForSecondOperand = true;

                // Show history
                historyText.textContent = `"${data.command}"  ➜  Result: ${data.display} (${data.spoken_text})`;
                historyLog.classList.remove("hidden");
                statusText.textContent = `Recognized: "${data.command}" ➜ Spoke: "${data.spoken_text}"`;

                // Play spoken response audio
                if (data.audio_url) {
                    playAudio(data.audio_url);
                }

            } catch (err) {
                statusText.textContent = `Voice Error: ${err.message}`;
            }
        }
    });
});

