document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("textInput");
    const synthesizeBtn = document.getElementById("synthesizeBtn");
    const clearBtn = document.getElementById("clearBtn");
    const statusMessage = document.getElementById("statusMessage");
    const audioSection = document.getElementById("audioSection");
    const audioPlayer = document.getElementById("audioPlayer");
    const downloadBtn = document.getElementById("downloadBtn");

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-box ${type}`;
        statusMessage.classList.remove("hidden");
    }

    function clearStatus() {
        statusMessage.textContent = "";
        statusMessage.className = "status-box hidden";
    }

    // Synthesize Speech
    synthesizeBtn.addEventListener("click", async () => {
        const text = textInput.value.trim();

        if (!text) {
            showStatus("Please enter some text to synthesize.", "error");
            textInput.focus();
            return;
        }

        // Set loading state
        synthesizeBtn.disabled = true;
        clearBtn.disabled = true;
        synthesizeBtn.innerHTML = '<span class="btn-icon">⏳</span> Synthesizing...';
        showStatus("Synthesizing audio, please wait...", "info");

        try {
            const response = await fetch("/api/text-to-speech", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ text })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to synthesize speech.");
            }

            // Display success message matching the PDF mockup
            showStatus("✓ Speech synthesized successfully!", "success");

            // Update audio source with cache-busting timestamp
            const audioUrlWithCacheBust = `${data.audio_url}?t=${Date.now()}`;
            audioPlayer.src = audioUrlWithCacheBust;
            downloadBtn.href = data.audio_url;

            // Reveal audio section and load player
            audioSection.classList.remove("hidden");
            audioPlayer.load();

        } catch (error) {
            console.error("Synthesis error:", error);
            showStatus(`⚠ ${error.message}`, "error");
        } finally {
            // Restore button state
            synthesizeBtn.disabled = false;
            clearBtn.disabled = false;
            synthesizeBtn.innerHTML = '<span class="btn-icon">🔊</span> Synthesize Speech';
        }
    });

    // Clear input and audio
    clearBtn.addEventListener("click", () => {
        textInput.value = "";
        clearStatus();
        audioPlayer.pause();
        audioPlayer.removeAttribute("src");
        audioPlayer.load();
        audioSection.classList.add("hidden");
        textInput.focus();
    });
});

