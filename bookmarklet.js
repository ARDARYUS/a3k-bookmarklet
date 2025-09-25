// bookmarklet.js
// Put this file on GitHub and use the raw URL in a small loader bookmarklet.
// Example loader: javascript:(function(){fetch('https://raw.githubusercontent.com/USER/REPO/branch/bookmarklet.js').then(r=>r.text()).then(eval)})()

/*
  Changes from your original:
    - GROQ_API_KEY is stored locally (edit below).
    - Calls Groq endpoint POST https://api.groq.com/openai/v1/chat/completions
    - Model: llama-3.1-8b-instant
    - No data collection / logging / cloudflare tunnel calls
    - Improved fetchAnswer: options extraction, few-shot, caching, coalescing, backoff
*/

const starEffectCSS = `
    .header-bg-effect {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        margin-top: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 0;
        opacity: 0.5;
    }

    .star {
        position: absolute;
        background: rgba(255,255,255,1);
        border-radius: 50%;
        opacity: 0;
        animation: twinkle linear infinite;
        box-shadow: 0 0 12px 5px rgba(255, 255, 255, 0.6);
        filter: blur(0.5px);
    }

    @keyframes twinkle {
        0% { opacity: 0; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.1); }
        100% { opacity: 0; transform: scale(0.8); }
    }
`;

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = starEffectCSS;
document.head.appendChild(styleSheet);

class AssessmentHelper {
    constructor() {
        this.answerIsDragging = false;
        this.answerCurrentX = 0;
        this.answerCurrentY = 0;
        this.answerInitialX = 0;
        this.answerInitialY = 0;

        // Cached article content to avoid re-fetching for subsequent questions
        this.cachedArticle = null;
        this.isFetchingAnswer = false; // State to track if an answer fetch is in progress

        // URLs for the external libraries
        this.animeScriptUrl = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js'; // Anime.js core library
        this.draggabillyScriptUrl = 'https://unpkg.com/draggabilly@3/dist/draggabilly.pkgd.min.js'; // Draggabilly library

        // ---------- GROQ CONFIG (edit here) ----------
        // WARNING: Storing the API key client-side is insecure. Use only for local testing.
        this.GROQ_API_KEY = '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'; // <-- PUT YOUR GROQ API KEY HERE
        this.GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
        this.GROQ_MODEL = 'llama-3.1-8b-instant';
        // ------------------------------------------------

        // Avoid accidental telemetry: ensure no logging to external endpoints (intentionally removed)

        // Ensure the script runs after the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Initializes the helper. Creates UI elements but does not append them yet.
     * Dynamically loads necessary scripts (Anime.js, Draggabilly) sequentially.
     * Starts the intro animation after scripts are loaded.
     */
    async init() {
        try {
            // Dynamically load Anime.js first
            await this.loadScript(this.animeScriptUrl);

            // Then dynamically load Draggabilly
            await this.loadScript(this.draggabillyScriptUrl);

            // Create UI elements after scripts are loaded and available
            this.itemMetadata = {
                UI: this.createUI(), // Main draggable UI
                answerUI: this.createAnswerUI() // Smaller answer display UI
            };

            // Start the intro animation, which will handle appending and showing the UI
            this.playIntroAnimation();

        } catch (error) {
            // Fallback: Create and show UI without animation/dragging if scripts fail
            this.itemMetadata = {
                UI: this.createUI(),
                answerUI: this.createAnswerUI()
            };
            this.showUI(true); // Pass true to indicate fallback mode (skip animation)
        }
    }

    /**
     * Dynamically loads a JavaScript script by creating a script tag.
     * Returns a Promise that resolves when the script is loaded.
     * @param {string} url - The URL of the script to load.
     * @returns {Promise<void>} A Promise that resolves when the script is loaded or rejects on error.
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                resolve();
            };
            script.onerror = (error) => {
                // Clean up the script tag on error
                script.remove();
                reject(new Error(`Failed to load script: ${url}`));
            };
            // Append the script to the document head
            document.head.appendChild(script);
        });
    }

    /**
     * Creates the main UI element (the launcher).
     * Includes the drag handle for Draggabilly.
     * @returns {HTMLDivElement} The container element for the main UI.
     */
    createUI() {
        const container = document.createElement("div");
        const launcher = document.createElement("div");
        launcher.id = "Launcher";
        launcher.className = "Launcher";
        launcher.style.cssText = "outline: none;min-height: 160px;opacity: 0;visibility: hidden;transition: opacity 0.5s ease;font-family: 'Nunito', sans-serif;width: 180px;height: 240px;background: #1c1e2b;position: fixed;border-radius: 12px;display: flex;flex-direction: column;align-items: center;color: white;font-size: 16px;top: 50%;right: 20px;transform: translateY(-50%);z-index: 99999;padding: 16px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);overflow: hidden;white-space: nowrap;";

        // Drag handle element - Draggabilly will be configured to use this
        const dragHandle = document.createElement("div");
        dragHandle.className = "drag-handle";
        dragHandle.style.cssText = "width: 100%;height: 24px;cursor: move;background: transparent;position: absolute;top: 0;";

        // Image element inside the launcher (this image is part of the UI, not the intro animation image)
        const uiImg = document.createElement("img");
        uiImg.src = "https://raw.githubusercontent.com/Cpmjaguar1234/nova/refs/heads/main/nova%20logo%20png.png";
        uiImg.style.cssText = "width: 90px;height: 90px;margin-top: 32px;border-radius: 50%;object-fit:cover;";

        // Close button for the main UI
        const closeButton = document.createElement("button");
        closeButton.id = "closeButton";
        closeButton.textContent = "\u00D7";
        closeButton.style.cssText = "position: absolute;top: 8px;right: 8px;background: none;border: none;color: white;font-size: 18px;cursor: pointer;padding: 2px 8px;transition: color 0.2s ease, transform 0.1s ease; opacity: 0.5; display: block; visibility: visible;";

        // Button to trigger the answer fetching process
        const getAnswerButton = document.createElement("button");
        getAnswerButton.id = "getAnswerButton";
        getAnswerButton.style.cssText = "background: #2c2e3b;border: none;color: white;padding: 12px 20px;border-radius: 8px;cursor: pointer;margin-top: 24px;width: 120px;height: 44px;font-size: 16px;transition: background 0.2s ease, transform 0.1s ease; display: flex; justify-content: center; align-items: center;";

        // Loading indicator element (initially hidden)
        const loadingIndicator = document.createElement("div");
        loadingIndicator.id = "loadingIndicator";
        loadingIndicator.style.cssText = "border: 4px solid rgba(255, 255, 255, 0.3); border-radius: 50%; border-top: 4px solid #fff; width: 20px; height: 20px; animation: spin 1s linear infinite; display: none; margin-right:8px;";

        // Button text span
        const buttonTextSpan = document.createElement("span");
        buttonTextSpan.textContent = "Skip Article";
        buttonTextSpan.id = "getAnswerButtonText";

        getAnswerButton.appendChild(loadingIndicator);
        getAnswerButton.appendChild(buttonTextSpan);

        // Version display
        const version = document.createElement("div");
        version.style.cssText = "position: absolute;bottom: 8px;right: 8px;font-size: 12px;opacity: 0.5;";
        version.textContent = "1.2";

        // Discord icon link (non-telemetry, optional UI)
        const discordLink = document.createElement("a");
        discordLink.href = "https://discord.gg/Gt2eZXSSS5";
        discordLink.target = "_blank";
        discordLink.style.cssText = "position: absolute; bottom: 8px; left: 8px; opacity: 0.5; transition: opacity 0.2s ease; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px;";
        discordLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-discord" viewBox="0 0 16 16">
   <path fill="white" d="M13.545 2.907a13.2 13.2 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.2 12.2 0 0 0-3.658 0 8 8 0 0 0-.412-.833.05.05 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.04.04 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032q.003.022.021.037a13.3 13.3 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019q.463-.63.818-1.329a.05.05 0 0 0-.01-.059l-.018-.011a9 9 0 0 1-1.248-.595.05.05 0 0 1-.02-.066l.015-.019q.127-.095.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.05.05 0 0 1 .053.007q.121.1.248.195a.05.05 0 0 1-.004.085 8 8 0 0 1-1.249.594.05.05 0 0 0-.03.03.05.05 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.2 13.2 0 0 0 4.001-2.02.05.05 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.03.03 0 0 0-.02-.019m-8.198 7.307c-.789 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612m5.316 0c-.788 0-1.438-.724-1.438-1.612s.637-1.613 1.438-1.613c.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612"/>
 </svg>`;
        discordLink.onmouseover = () => discordLink.style.opacity = '1';
        discordLink.onmouseout = () => discordLink.style.opacity = '0.5';

        // Append elements to the launcher
        launcher.appendChild(dragHandle);
        launcher.appendChild(uiImg);
        launcher.appendChild(closeButton);
        launcher.appendChild(getAnswerButton);
        launcher.appendChild(version);
        launcher.appendChild(discordLink);

        // Add the star effect container
        const starEffectContainer = document.createElement("div");
        starEffectContainer.className = "header-bg-effect";
        launcher.appendChild(starEffectContainer);

        // Append launcher to the container
        container.appendChild(launcher);

        return container;
    }

    /**
     * Generates star elements and appends them to the specified container.
     * @param {HTMLElement} container - The container element to append stars to.
     */
    createStars(container, launcher) {
        const numStars = 30;
        for (let i = 0; i < numStars; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.width = `${Math.random() * 3 + 1}px`;
            star.style.height = star.style.width;
            star.style.left = `${Math.random() * 100}%`;
            const uiImg = launcher.querySelector('img');
            const getAnswerButton = launcher.querySelector('#getAnswerButton');

            const launcherRect = launcher.getBoundingClientRect();

            const uiImgRect = uiImg.getBoundingClientRect();
            const getAnswerButtonRect = getAnswerButton.getBoundingClientRect();

            // Convert UI element coordinates to be relative to the launcher's top-left corner
            const uiImgRelativeTop = uiImgRect.top - launcherRect.top;
            const uiImgRelativeLeft = uiImgRect.left - launcherRect.left;

            const getAnswerButtonRelativeTop = getAnswerButtonRect.top - launcherRect.top;
            const getAnswerButtonRelativeLeft = getAnswerButtonRect.left - launcherRect.left;

            let randomTop, randomLeft;
            let attempts = 0;
            const maxAttempts = 100;

            do {
                randomTop = Math.random() * container.clientHeight;
                randomLeft = Math.random() * container.clientWidth;
                attempts++;

                // Check for overlap with Nova logo
                const overlapsLogo = (
                    randomLeft < uiImgRelativeLeft + uiImgRect.width &&
                    randomLeft + star.offsetWidth > uiImgRelativeLeft &&
                    randomTop < uiImgRelativeTop + uiImgRect.height &&
                    randomTop + star.offsetHeight > uiImgRelativeTop
                );

                // Check for overlap with Skip Article button
                const overlapsButton = (
                    randomLeft < getAnswerButtonRelativeLeft + getAnswerButtonRect.width &&
                    randomLeft + star.offsetWidth > getAnswerButtonRelativeLeft &&
                    randomTop < getAnswerButtonRelativeTop + getAnswerButtonRect.height &&
                    randomTop + star.offsetHeight > getAnswerButtonRelativeTop
                );

                if (!overlapsLogo && !overlapsButton) {
                    break;
                }
            } while (attempts < maxAttempts);

            star.style.top = `${randomTop}px`;
            star.style.left = `${randomLeft}px`;
            star.style.animationDelay = `${Math.random() * 5}s`;
            star.style.animationDuration = `${Math.random() * 3 + 2}s`;
            container.appendChild(star);
        }

        return container;
    }

    /**
     * Creates the smaller UI element to display the answer.
     * Uses manual dragging.
     * @returns {HTMLDivElement} The container element for the answer UI.
     */
    createAnswerUI() {
        const container = document.createElement("div");
        const answerContainer = document.createElement("div");
        answerContainer.id = "answerContainer";
        answerContainer.className = "answerLauncher";
        answerContainer.style.cssText = "outline: none;min-height: 60px;transform: translateX(0px) translateY(-50%);opacity: 0;visibility: hidden;transition: opacity 0.3s ease, transform 0.3s ease;font-family: 'Nunito', sans-serif;width: 60px;height: 60px;background: #1c1e2b;position: fixed;border-radius: 8px;display: flex;justify-content: center;align-items: center;color: white;font-size: 24px;top: 50%;right: 220px;z-index: 99998;padding: 8px;box-shadow: 0 4px 8px rgba(0,0,0,0.2);overflow: hidden;white-space: normal;";

        const dragHandle = document.createElement("div");
        dragHandle.className = "answer-drag-handle";
        dragHandle.style.cssText = "width: 100%;height: 24px;cursor: move;background: transparent;position: absolute;top: 0;";

        const closeButton = document.createElement("button");
        closeButton.id = "closeAnswerButton";
        closeButton.style.cssText = "position: absolute;top: 8px;right: 8px;background: none;border: none;color: white;font-size: 18px;cursor: pointer;padding: 2px 8px;transition: color 0.2s ease, transform 0.1s ease;";

        const answerContent = document.createElement("div");
        answerContent.id = "answerContent";
        answerContent.style.cssText = "padding: 0;margin: 0;word-wrap: break-word;font-size: 24px;font-weight: bold;display: flex;justify-content: center;align-items: center;width: 100%;height: 100%;";

        answerContainer.appendChild(dragHandle);
        answerContainer.appendChild(closeButton);
        answerContainer.appendChild(answerContent);
        container.appendChild(answerContainer);

        return container;
    }

    /**
     * Plays the introductory animation using Anime.js.
     */
    playIntroAnimation() {
        if (typeof anime === 'undefined') {
            this.showUI();
            return;
        }

        const imageUrl = "https://raw.githubusercontent.com/Cpmjaguar1234/nova/refs/heads/main/nova%20logo%20png.png";

        const introImgElement = document.createElement('img');
        introImgElement.src = imageUrl;
        introImgElement.id = 'introLoaderImage';
        introImgElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) scale(0.5);
            width: 100px;
            height: auto;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 100001;
            opacity: 0;
        `;

        document.body.appendChild(introImgElement);

        anime.timeline({
            easing: 'easeInOutQuad',
            duration: 800,
            complete: (anim) => {
                introImgElement.remove();
                this.showUI();
            }
        })
        .add({
            targets: introImgElement,
            opacity: [0, 1],
            scale: [0.5, 1],
            rotate: '1turn',
            duration: 1000,
            easing: 'easeOutExpo'
        })
        .add({
            targets: introImgElement,
            translateY: '-=20',
            duration: 500,
            easing: 'easeInOutSine'
        })
        .add({
            targets: introImgElement,
            translateY: '+=20',
            duration: 500,
            easing: 'easeInOutSine'
        })
        .add({
            targets: introImgElement,
            opacity: 0,
            duration: 500,
            easing: 'linear'
        }, '+=500');
    }

    /**
     * Appends the UI elements to the DOM and makes the main UI visible with a fade-in.
     * Then sets up event listeners.
     * @param {boolean} [skipAnimation=false]
     */
    showUI(skipAnimation = false) {
        document.body.appendChild(this.itemMetadata.UI);
        document.body.appendChild(this.itemMetadata.answerUI);

        const launcher = document.getElementById('Launcher');
        if (launcher) {
            if (skipAnimation) {
                launcher.style.visibility = 'visible';
                launcher.style.opacity = 1;
                this.setupEventListeners();
                const starEffectContainer = launcher.querySelector('.header-bg-effect');
                if (starEffectContainer) {
                    this.createStars(starEffectContainer, launcher);
                }
            } else {
                launcher.style.visibility = 'visible';
                setTimeout(() => { launcher.style.opacity = 1; }, 10);
                setTimeout(() => {
                    this.setupEventListeners();
                    const starEffectContainer = launcher.querySelector('.header-bg-effect');
                    if (starEffectContainer) {
                        this.createStars(starEffectContainer, launcher);
                    }
                }, 500);
            }
        } else {
            this.setupEventListeners();
        }
    }

    /**
     * Fetches the article content and question content from the current page DOM.
     * Caches the article content.
     * @returns {Promise<string>} A promise that resolves with the combined article and question content.
     */
    async fetchArticleContent() {
        const articleContainer = document.querySelector('#start-reading');
        let articleContent = '';
        if (articleContainer) {
            const paragraphs = articleContainer.querySelectorAll('p');
            articleContent = Array.from(paragraphs).map(p => p.textContent.trim()).join(' ');
        }

        const questionContainer = document.querySelector('#activity-component-react');
        let questionContent = '';
        if (questionContainer) {
            questionContent = questionContainer.textContent.trim();
        }

        const combinedContent = `${articleContent}\n\n${questionContent}`;
        this.cachedArticle = combinedContent;
        return combinedContent;
    }

    // ---------------------------
    // Helpers used by fetchAnswer
    // ---------------------------
    sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

    // Extract up to 4 option strings (A,B,C,D) from the page
    extractOptionsFromPage() {
        try {
            const radios = Array.from(document.querySelectorAll('[role="radio"], input[type="radio"], [data-choice], .choice, .option'));
            const options = [];
            for (let r of radios) {
                if (options.length >= 4) break;
                let text = '';
                if (r.getAttribute) {
                    text = r.getAttribute('aria-label') || r.getAttribute('data-label') || r.getAttribute('value') || '';
                }
                if (!text) text = (r.textContent || '').trim();
                if (!text) {
                    const lbl = r.closest && r.closest('label');
                    if (lbl) text = (lbl.textContent || '').trim();
                }
                text = String(text || '').replace(/\s+/g, ' ').trim();
                if (text) options.push(text);
            }
            if (options.length < 4) {
                const labelEls = Array.from(document.querySelectorAll('label, .option-label, .answer-text'));
                for (let lbl of labelEls) {
                    if (options.length >= 4) break;
                    const t = (lbl.textContent || '').trim().replace(/\s+/g, ' ');
                    if (t && !options.includes(t)) options.push(t);
                }
            }
            while (options.length < 4) options.push('');
            return options.slice(0,4);
        } catch (e) {
            return ['', '', '', ''];
        }
    }

    _makeQueryKey(queryContent, options) {
        return (String(queryContent || '') + '||' + options.join('||')).slice(0, 2000);
    }

    // ---------------------------
    // Improved fetchAnswer (Groq)
    // ---------------------------
    async fetchAnswer(queryContent, retryCount = 0) {
        const MAX_RETRIES = 5;
        const INITIAL_BACKOFF_MS = 800;
        const MIN_CALL_INTERVAL_MS = 600;

        if (!this.GROQ_API_KEY || this.GROQ_API_KEY === 'grq-REPLACE_ME') {
            return 'Error: GROQ_API_KEY not set in script (edit the script to add it).';
        }

        if (!this._lastCallAt) this._lastCallAt = 0;
        if (!this._inFlightRequests) this._inFlightRequests = {};
        if (!this._responseCache) this._responseCache = {};

        // Extract explicit options; having the A/B choices improves accuracy
        const options = this.extractOptionsFromPage(); // [Atext,Btext,Ctext,Dtext]
        const cacheKey = this._makeQueryKey(queryContent, options);

        // Return cached quickly if present
        if (this._responseCache[cacheKey]) {
            return this._responseCache[cacheKey];
        }

        // Coalesce identical parallel requests
        if (this._inFlightRequests[cacheKey]) {
            try { return await this._inFlightRequests[cacheKey]; } catch (e) { /* fall through */ }
        }

        // Ensure minimum spacing between requests to reduce bursts
        const now = Date.now();
        const since = now - (this._lastCallAt || 0);
        if (since < MIN_CALL_INTERVAL_MS) {
            await this.sleep(MIN_CALL_INTERVAL_MS - since);
        }

        // Build the options text for the prompt
        const optionsText = `A) ${options[0] || '[option A]'}\nB) ${options[1] || '[option B]'}\nC) ${options[2] || '[option C]'}\nD) ${options[3] || '[option D]'}`;

        // Few-shot example to discourage explanations and enforce single-letter output
        const fewShotUser = `Question: What is 2 + 2?\nOptions: A) 1\nB) 2\nC) 3\nD) 4\nAnswer:`;
        const fewShotAssistant = `D`;

        const userPrompt = `${queryContent}\n\nOptions:\n${optionsText}\n\nAnswer:`;

        const messages = [
            { role: "system", content: "You are a strict multiple-choice assistant. Respond with exactly one UPPERCASE letter: A, B, C, or D. No punctuation, no explanation, no extra text. If unsure, pick the best answer." },
            { role: "user", content: fewShotUser },
            { role: "assistant", content: fewShotAssistant },
            { role: "user", content: userPrompt }
        ];

        const doFetch = async (attempt = 0) => {
            try {
                this._lastCallAt = Date.now();
                const resp = await fetch(this.GROQ_ENDPOINT, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.GROQ_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: this.GROQ_MODEL,
                        messages,
                        temperature: 0.0,
                        max_tokens: 6
                    })
                });

                if (!resp.ok) {
                    const txt = await resp.text().catch(() => '');
                    if ((resp.status === 429 || resp.status >= 500) && attempt < MAX_RETRIES) {
                        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                        await this.sleep(backoff);
                        return doFetch(attempt + 1);
                    }
                    throw new Error(`API request failed with status ${resp.status}: ${txt}`);
                }

                const data = await resp.json().catch(() => null);
                if (!data) throw new Error('API returned invalid JSON');

                // Parse Groq/OpenAI style responses
                let raw = '';
                if (Array.isArray(data.choices) && data.choices.length > 0) {
                    const c = data.choices[0];
                    raw = (c.message && c.message.content) ? c.message.content : (c.text || '');
                } else if (data.response && data.response.text) {
                    raw = data.response.text;
                } else if (data.response) {
                    raw = String(data.response);
                } else {
                    raw = JSON.stringify(data).slice(0, 300);
                }

                raw = String(raw || '').trim();

                // Defensive parsing: take first letter A-D
                const m = raw.match(/[A-D]/i);
                const letter = m ? m[0].toUpperCase() : null;
                const finalAnswer = letter || raw || 'No answer available';

                // Cache briefly
                try {
                    this._responseCache[cacheKey] = finalAnswer;
                    setTimeout(() => { if (this._responseCache) delete this._responseCache[cacheKey]; }, 30 * 1000);
                } catch (e) {}

                return finalAnswer;
            } catch (err) {
                if (attempt < MAX_RETRIES) {
                    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                    await this.sleep(backoff);
                    return doFetch(attempt + 1);
                }
                return `Error: ${err.message}`;
            }
        };

        // Store in-flight promise to coalesce duplicate requests
        const p = doFetch(0).finally(() => { delete this._inFlightRequests[cacheKey]; });
        this._inFlightRequests[cacheKey] = p;
        try {
            const r = await p;
            return r;
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }

    /**
     * Sets up all event listeners for the UI elements, including Draggabilly
     * for the main UI and manual drag for the answer UI.
     * Also adds visual feedback for button states and loading.
     */
    setupEventListeners() {
        const launcher = document.getElementById('Launcher');
        const answerContainer = document.getElementById('answerContainer');
        const getAnswerButton = launcher ? launcher.querySelector('#getAnswerButton') : null;
        const loadingIndicator = getAnswerButton ? getAnswerButton.querySelector('#loadingIndicator') : null;
        const buttonTextSpan = getAnswerButton ? getAnswerButton.querySelector('#getAnswerButtonText') : null;
        if (!launcher || !answerContainer) {
            return;
        }

        const closeButton = launcher.querySelector('#closeButton');
        const closeAnswerButton = answerContainer.querySelector('#closeAnswerButton');

        // Add CSS rules if missing
        if (!document.getElementById('assessment-helper-styles')) {
            const style = document.createElement('style');
            style.id = 'assessment-helper-styles';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                #closeButton:hover, #closeAnswerButton:hover {
                    color: #ff6b6b;
                    opacity: 1 !important;
                }
                #closeButton:active, #closeAnswerButton:active {
                    color: #e05252;
                    transform: scale(0.95);
                }
                #getAnswerButton:hover { background: #3c3e4b; }
                #getAnswerButton:active { background: #4c4e5b; transform: scale(0.98); }
                #getAnswerButton:disabled { opacity: 0.6; cursor: not-allowed; }
                .answerLauncher.show { opacity: 1; visibility: visible; transform: translateY(-50%) scale(1); }
            `;
            document.head.appendChild(style);
        }

        // Draggabilly for Launcher if available
        if (typeof Draggabilly !== 'undefined') {
            try {
                new Draggabilly(launcher, { handle: '.drag-handle', delay: 50 });
            } catch (error) { /* ignore */ }
        }

        const answerDragHandle = answerContainer.querySelector('.answer-drag-handle');
        const answerContent = answerContainer.querySelector('#answerContent');

        if (answerDragHandle) {
            answerDragHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.answerIsDragging = true;
                const rect = answerContainer.getBoundingClientRect();
                this.answerInitialX = e.clientX - rect.left;
                this.answerInitialY = e.clientY - rect.top;
                answerContainer.style.position = 'fixed';
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (this.answerIsDragging && answerContainer) {
                e.preventDefault();
                let newX = e.clientX - this.answerInitialX;
                let newY = e.clientY - this.answerInitialY;
                answerContainer.style.left = `${newX}px`;
                answerContainer.style.top = `${newY}px`;
                answerContainer.style.right = null;
                answerContainer.style.bottom = null;
                answerContainer.style.transform = 'none';
            }
        });

        const stopDrag = () => { this.answerIsDragging = false; };
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('mouseleave', stopDrag);

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                launcher.style.opacity = 0;
                launcher.addEventListener('transitionend', function handler() {
                    if (parseFloat(launcher.style.opacity) === 0) {
                        launcher.style.visibility = 'hidden';
                        launcher.removeEventListener('transitionend', handler);
                    }
                });
            });
            closeButton.addEventListener('mousedown', () => { closeButton.style.transform = 'scale(0.95)'; });
            closeButton.addEventListener('mouseup', () => { closeButton.style.transform = 'scale(1)'; });
        }

        if (closeAnswerButton) {
            closeAnswerButton.addEventListener('click', () => {
                answerContainer.style.opacity = 0;
                answerContainer.style.transform = 'translateY(-50%) scale(0.8)';
                answerContainer.addEventListener('transitionend', function handler() {
                    if (parseFloat(answerContainer.style.opacity) === 0) {
                        answerContainer.style.display = 'none';
                        answerContainer.style.visibility = 'hidden';
                        answerContainer.style.transform = 'translateY(-50%) scale(1)';
                        answerContainer.removeEventListener('transitionend', handler);
                    }
                });
            });
            closeAnswerButton.addEventListener('mousedown', () => { closeAnswerButton.style.transform = 'scale(0.95)'; });
            closeAnswerButton.addEventListener('mouseup', () => { closeAnswerButton.style.transform = 'scale(1)'; });
        }

        if (getAnswerButton) {
            getAnswerButton.addEventListener('mouseenter', () => { getAnswerButton.style.background = '#3c3e4b'; });
            getAnswerButton.addEventListener('mouseleave', () => { getAnswerButton.style.background = '#2c2e3b'; });
            getAnswerButton.addEventListener('mousedown', () => { getAnswerButton.style.transform = 'scale(0.98)'; });
            getAnswerButton.addEventListener('mouseup', () => { getAnswerButton.style.transform = 'scale(1)'; });

            getAnswerButton.addEventListener('click', async () => {
                if (this.isFetchingAnswer) return;

                this.isFetchingAnswer = true;
                getAnswerButton.disabled = true;
                if (buttonTextSpan) buttonTextSpan.style.display = 'none';
                if (loadingIndicator) loadingIndicator.style.display = 'block';

                const processQuestion = async (excludedAnswers = []) => {
                    try {
                        let queryContent = await this.fetchArticleContent();
                        queryContent += "\n\nPROVIDE ONLY A ONE-LETTER ANSWER THAT'S IT NOTHING ELSE (A, B, C, or D).";
                        if (excludedAnswers.length > 0) {
                            queryContent += `\n\nDo not pick letter ${excludedAnswers.join(', ')}.`;
                        }

                        const answer = await this.fetchAnswer(queryContent);
                        answerContent.textContent = answer;
                        answerContainer.style.display = 'flex';
                        answerContainer.style.visibility = 'visible';
                        answerContainer.classList.add('show');

                        if (answer && ['A', 'B', 'C', 'D'].includes(answer.trim()) && !excludedAnswers.includes(answer.trim())) {
                            const trimmedAnswer = answer.trim();
                            const options = document.querySelectorAll('[role="radio"]');
                            const index = trimmedAnswer.charCodeAt(0) - 'A'.charCodeAt(0);
                            if (options[index]) {
                                options[index].click();
                                await new Promise(resolve => setTimeout(resolve, 500));
                                const submitButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Submit');
                                if (submitButton) {
                                    submitButton.click();
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    const nextButton = document.getElementById('feedbackActivityFormBtn');
                                    if (nextButton) {
                                        const buttonText = nextButton.textContent.trim();
                                        nextButton.click();
                                        if (buttonText === 'Try again') {
                                            await new Promise(resolve => setTimeout(async () => {
                                                answerContainer.style.display = 'none';
                                                answerContainer.classList.remove('show');
                                                await processQuestion([...excludedAnswers, trimmedAnswer]);
                                                resolve();
                                            }, 1000));
                                        } else {
                                            await new Promise(resolve => setTimeout(async () => {
                                                const newQuestionRadio = document.querySelector('[role="radio"]');
                                                const newSubmitButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === 'Submit');
                                                if (newSubmitButton && newQuestionRadio) {
                                                    answerContainer.style.display = 'none';
                                                    answerContainer.classList.remove('show');
                                                    await processQuestion();
                                                } else {
                                                    answerContent.textContent = "Processing complete or no more questions found.";
                                                }
                                                resolve();
                                            }, 1500));
                                        }
                                    } else {
                                        answerContent.textContent = 'Submit processed, but next step button not found.';
                                    }
                                } else {
                                    answerContent.textContent = 'Error: Submit button not found.';
                                }
                            } else {
                                answerContent.textContent = `Error: Option ${trimmedAnswer} not found on page.`;
                            }
                        } else {
                            // non single-letter or error - shown in UI already
                        }
                    } catch (error) {
                        answerContent.textContent = `Error: ${error.message}`;
                        answerContainer.style.display = 'flex';
                        answerContainer.style.visibility = 'visible';
                        answerContainer.classList.add('show');
                    } finally {
                        this.isFetchingAnswer = false;
                        getAnswerButton.disabled = false;
                        if (loadingIndicator) loadingIndicator.style.display = 'none';
                        if (buttonTextSpan) buttonTextSpan.style.display = 'block';
                    }
                };

                await processQuestion();
            });
        }
    }
}

// instantiate
const helper = new AssessmentHelper();
