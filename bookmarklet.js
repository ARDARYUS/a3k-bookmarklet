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

        // URLs for the external libraries (bookmarklet still loads them dynamically)
        this.animeScriptUrl = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
        this.draggabillyScriptUrl = 'https://unpkg.com/draggabilly@3/dist/draggabilly.pkgd.min.js';

        // Eye timing / state (kept from earlier; harmless if not used)
        this.eyeTimeoutId = null;
        this.eyeDurations = { full: 3000 };

        // Ensure the script runs after the DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Dynamically loads a JavaScript script by creating a script tag.
     * Returns a Promise that resolves when the script is loaded.
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = () => resolve();
            script.onerror = (error) => {
                script.remove();
                reject(new Error(`Failed to load script: ${url}`));
            };
            document.head.appendChild(script);
        });
    }

    init = async () => {
        try {
            await this.loadScript(this.animeScriptUrl);
            await this.loadScript(this.draggabillyScriptUrl);

            this.itemMetadata = {
                UI: this.createUI(),
                answerUI: this.createAnswerUI()
            };

            this.playIntroAnimation();
        } catch (error) {
            // fallback: show UI without animation/draggability
            this.itemMetadata = {
                UI: this.createUI(),
                answerUI: this.createAnswerUI()
            };
            this.showUI(true);
        }
    };

    // resolve icons (bookmarklet has no extension folder) - keep as-is or point to hosted assets if needed
    getIconPath(filename) {
        // If you host icons online, change this to the hosted absolute URL.
        return `icons/${filename}`;
    }

    createEl(tag, props = {}) {
        const el = document.createElement(tag);
        Object.keys(props).forEach((k) => {
            if (k === 'style') el.style.cssText = props.style;
            else if (k === 'dataset') Object.assign(el.dataset, props.dataset);
            else if (k === 'children') props.children.forEach((c) => el.appendChild(c));
            else if (k === 'text') el.textContent = props.text;
            else el[k] = props[k];
        });
        return el;
    }

    createUI() {
        const container = this.createEl('div');

        const launcher = this.createEl('div', {
            id: 'Launcher',
            className: 'Launcher',
            style:
                "outline:none;min-height:160px;opacity:0;visibility:hidden;transition:opacity 0.5s ease;font-family:'Nunito',sans-serif;width:180px;height:240px;background:#010203;position:fixed;border-radius:12px;display:flex;flex-direction:column;align-items:center;color:white;font-size:16px;top:50%;right:20px;transform:translateY(-50%);z-index:99999;padding:16px;box-shadow:0 10px 8px rgba(0,0,0,0.2);overflow:hidden;white-space:nowrap;"
        });

        const dragHandle = this.createEl('div', {
            className: 'drag-handle',
            style: 'width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;'
        });

        // UI image (kept original remote image URL)
        const uiImg = this.createEl('img', {
            src: "https://raw.githubusercontent.com/Cpmjaguar1234/nova/refs/heads/main/nova%20logo%20png.png",
            style: 'width:90px;height:90px;margin-top:32px;border-radius:50%;object-fit:cover;'
        });

        const closeButton = this.createEl('button', {
            id: 'closeButton',
            text: '\u00D7',
            style:
                'position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.2s ease, transform 0.1s ease;opacity:0.5;'
        });

        const getAnswerButton = this.createEl('button', {
            id: 'getAnswerButton',
            style:
                'background:#1a1a1a;border:none;color:white;padding:12px 20px;border-radius:8px;cursor:pointer;margin-top:24px;width:120px;height:44px;font-size:16px;transition:background 0.2s ease, transform 0.1s ease;display:flex;justify-content:center;align-items:center;'
        });

        const loadingIndicator = this.createEl('div', {
            id: 'loadingIndicator',
            style:
                'border: 4px solid rgba(255,255,255,0.3); border-radius:50%; border-top:4px solid #fff; width:20px; height:20px; animation: spin 1s linear infinite; display:none;'
        });

        const buttonTextSpan = this.createEl('span', { text: 'Skip Article', id: 'getAnswerButtonText' });

        getAnswerButton.appendChild(loadingIndicator);
        getAnswerButton.appendChild(buttonTextSpan);

        const version = this.createEl('div', {
            style: 'position:absolute;bottom:8px;right:8px;font-size:12px;opacity:0.5;',
            text: '1.2'
        });

        launcher.appendChild(dragHandle);
        launcher.appendChild(uiImg);
        launcher.appendChild(closeButton);
        launcher.appendChild(getAnswerButton);
        launcher.appendChild(version);

        container.appendChild(launcher);
        return container;
    }

    createAnswerUI() {
        const container = this.createEl('div');
        const answerContainer = this.createEl('div', {
            id: 'answerContainer',
            className: 'answerLauncher',
            style:
                "outline:none;min-height:60px;transform:translateX(0px) translateY(-50%);opacity:0;visibility:hidden;transition:opacity 0.3s ease, transform 0.3s ease;font-family:'Nunito',sans-serif;width:60px;height:60px;background:#1c1e2b;position:fixed;border-radius:8px;display:flex;justify-content:center;align-items:center;color:white;font-size:24px;top:50%;right:220px;z-index:99998;padding:8px;box-shadow:0 4px 8px rgba(0,0,0,0.2);overflow:hidden;white-space:normal;"
        });

        const dragHandle = this.createEl('div', {
            className: 'answer-drag-handle',
            style: 'width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;'
        });

        const closeButton = this.createEl('button', {
            id: 'closeAnswerButton',
            style:
                'position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.2s ease, transform 0.1s ease;'
        });

        const answerContent = this.createEl('div', {
            id: 'answerContent',
            style:
                'padding:0;margin:0;word-wrap:break-word;font-size:24px;font-weight:bold;display:flex;justify-content:center;align-items:center;width:100%;height:100%;'
        });

        answerContainer.appendChild(dragHandle);
        answerContainer.appendChild(closeButton);
        answerContainer.appendChild(answerContent);

        container.appendChild(answerContainer);
        return container;
    }

    playIntroAnimation() {
        if (typeof anime === 'undefined') {
            this.showUI();
            return;
        }

        const imageUrl = "https://github.com/Cpmjaguar1234/nova/blob/main/nova%20logo%20png.png?raw=true";
        const introImgElement = this.createEl('img', {
            src: imageUrl,
            id: 'introLoaderImage',
            style:
                'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.5);width:100px;height:auto;border-radius:12px;box-shadow:0 4px 8px rgba(0,0,0,0.2);z-index:100001;opacity:0;'
        });

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
            .add({ targets: introImgElement, translateY: '-=20', duration: 500, easing: 'easeInOutSine' })
            .add({ targets: introImgElement, translateY: '+=20', duration: 500, easing: 'easeInOutSine' })
            .add({ targets: introImgElement, opacity: 0, duration: 500, easing: 'linear' }, '+=500');
    }

    showUI(skipAnimation = false) {
        document.body.appendChild(this.itemMetadata.UI);
        document.body.appendChild(this.itemMetadata.answerUI);

        const launcher = document.getElementById('Launcher');
        if (!launcher) {
            this.setupEventListeners();
            return;
        }

        if (skipAnimation) {
            launcher.style.visibility = 'visible';
            launcher.style.opacity = 1;
            this.setupEventListeners();
        } else {
            launcher.style.visibility = 'visible';
            setTimeout(() => { launcher.style.opacity = 1; }, 10);
            setTimeout(() => { this.setupEventListeners(); }, 500);
        }
    }

    showAlert(message, type = 'info') {
        const alertContainer = this.createEl('div', {
            style: `position:fixed;top:20px;left:50%;transform:translateX(-50%);background-color:${type === 'error' ? '#dc3545' : '#007bff'};color:white;padding:15px 25px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:100000;opacity:0;transition:opacity 0.5s ease-in-out;font-family:'Nunito',sans-serif;font-size:16px;max-width:80%;text-align:center;`
        });
        alertContainer.textContent = message;
        document.body.appendChild(alertContainer);
        setTimeout(() => (alertContainer.style.opacity = 1), 10);
        setTimeout(() => {
            alertContainer.style.opacity = 0;
            alertContainer.addEventListener('transitionend', () => alertContainer.remove());
        }, 5000);
    }

    async fetchArticleContent() {
        const articleContainer = document.querySelector('#start-reading');
        let articleContent = '';
        if (articleContainer) {
            const paragraphs = articleContainer.querySelectorAll('p');
            articleContent = Array.from(paragraphs).map(p => p.textContent.trim()).join(' ');
        }

        const questionContainer = document.querySelector('#activity-component-react');
        let questionContent = '';
        if (questionContainer) questionContent = questionContainer.textContent.trim();

        const combinedContent = `${articleContent}\n\n${questionContent}`;
        this.cachedArticle = combinedContent;
        return combinedContent;
    }

    async fetchAnswer(queryContent, retryCount = 0) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1000;
        try {
            const response = await fetch('https://broadband-drama-struggle-remarkable.trycloudflare.com/ask', {
                method: 'POST',
                cache: 'no-cache',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ q: queryContent, article: this.cachedArticle || null })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                if (response.status === 500 && errorBody.includes("429 You exceeded your current quota")) {
                    if (retryCount < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                        return this.fetchAnswer(queryContent, retryCount + 1);
                    } else {
                        throw new Error(`API request failed after multiple retries due to quota: ${errorBody}`);
                    }
                } else {
                    throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
                }
            }
            const data = await response.json();
            return data.response ? String(data.response).trim() : 'No answer available';
        } catch (error) {
            return `Error: ${error.message}`;
        }
    }

    setupEventListeners() {
        const launcher = document.getElementById('Launcher');
        const answerContainer = document.getElementById('answerContainer');
        const getAnswerButton = launcher ? launcher.querySelector('#getAnswerButton') : null;
        const loadingIndicator = getAnswerButton ? getAnswerButton.querySelector('#loadingIndicator') : null;
        const buttonTextSpan = getAnswerButton ? getAnswerButton.querySelector('#getAnswerButtonText') : null;
        if (!launcher || !answerContainer) return;

        const closeButton = launcher.querySelector('#closeButton');
        const closeAnswerButton = answerContainer.querySelector('#closeAnswerButton');

        if (!document.getElementById('assessment-helper-styles')) {
            const style = document.createElement('style');
            style.id = 'assessment-helper-styles';
            style.textContent = `
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #closeButton:hover, #closeAnswerButton:hover { color: #ff6b6b; opacity: 1 !important; }
                #closeButton:active, #closeAnswerButton:active { color: #e05252; transform: scale(0.95); }
                #getAnswerButton:hover { background: #454545; }
                #getAnswerButton:active { background: #4c4e5b; transform: scale(0.98); }
                #getAnswerButton:disabled { opacity: 0.6; cursor: not-allowed; }
                .answerLauncher.show { opacity: 1; visibility: visible; transform: translateY(-50%) scale(1); }
            `;
            document.head.appendChild(style);
        }

        // Draggabilly try
        if (typeof Draggabilly !== 'undefined') {
            try {
                new Draggabilly(launcher, { handle: '.drag-handle', delay: 50 });
            } catch (err) {}
        }

        // Manual dragging for answer container
        const answerDragHandle = answerContainer.querySelector('.answer-drag-handle');
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
                const newX = e.clientX - this.answerInitialX;
                const newY = e.clientY - this.answerInitialY;
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
                }, { once: true });
            });
            closeButton.addEventListener('mousedown', () => (closeButton.style.transform = 'scale(0.95)'));
            closeButton.addEventListener('mouseup', () => (closeButton.style.transform = 'scale(1)'));
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
                }, { once: true });
            });
            closeAnswerButton.addEventListener('mousedown', () => (closeAnswerButton.style.transform = 'scale(0.95)'));
            closeAnswerButton.addEventListener('mouseup', () => (closeAnswerButton.style.transform = 'scale(1)'));
        }

        if (getAnswerButton) {
            getAnswerButton.addEventListener('mouseenter', () => { getAnswerButton.style.background = '#454545'; });
            getAnswerButton.addEventListener('mouseleave', () => { getAnswerButton.style.background = '#1a1a1a'; });
            getAnswerButton.addEventListener('mousedown', () => { getAnswerButton.style.transform = 'scale(0.98)'; });
            getAnswerButton.addEventListener('mouseup', () => { getAnswerButton.style.transform = 'scale(1)'; });

            getAnswerButton.addEventListener('click', async () => {
                let novaButtonClickCount = 1;

                if (this.isFetchingAnswer) return;

                this.isFetchingAnswer = true;
                getAnswerButton.disabled = true;
                if (buttonTextSpan) buttonTextSpan.style.display = 'none';
                if (loadingIndicator) loadingIndicator.style.display = 'block';

                // attempt to log (non-blocking if it errors)
                try { await this.logToDataEndpoint(novaButtonClickCount); } catch (e) {}

                const processQuestion = async (excludedAnswers = []) => {
                    try {
                        let queryContent = await this.fetchArticleContent();
                        queryContent += "\n\nPROVIDE ONLY A ONE-LETTER ANSWER THAT'S IT NOTHING ELSE (A, B, C, or D).";
                        if (excludedAnswers.length > 0) queryContent += `\n\nDo not pick letter ${excludedAnswers.join(', ')}.`;

                        const answer = await this.fetchAnswer(queryContent);

                        const answerContainerEl = document.getElementById('answerContainer');
                        const answerContentEl = answerContainerEl ? answerContainerEl.querySelector('#answerContent') : null;
                        if (answerContentEl) answerContentEl.textContent = answer;

                        if (answerContainerEl) {
                            answerContainerEl.style.display = 'flex';
                            answerContainerEl.style.visibility = 'visible';
                            answerContainerEl.classList.add('show');
                        }

                        if (answer && ['A','B','C','D'].includes(answer.trim()) && !excludedAnswers.includes(answer.trim())) {
                            const trimmedAnswer = answer.trim();
                            const options = document.querySelectorAll('[role="radio"]');
                            const index = trimmedAnswer.charCodeAt(0) - 'A'.charCodeAt(0);

                            if (options[index]) {
                                options[index].click();
                                await new Promise(r => setTimeout(r, 500));
                                const submitButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Submit');
                                if (submitButton) {
                                    submitButton.click();
                                    await new Promise(r => setTimeout(r, 1000));
                                    const nextButton = document.getElementById('feedbackActivityFormBtn');
                                    if (nextButton) {
                                        const buttonText = nextButton.textContent.trim();
                                        nextButton.click();
                                        if (buttonText === 'Try again') {
                                            await new Promise(r => setTimeout(r, 1000));
                                            answerContainerEl.style.display = 'none';
                                            answerContainerEl.classList.remove('show');
                                            await processQuestion([...excludedAnswers, trimmedAnswer]);
                                        } else {
                                            await new Promise(r => setTimeout(r, 1500));
                                            const newQuestionRadio = document.querySelector('[role="radio"]');
                                            const newSubmitButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Submit');
                                            if (newSubmitButton && newQuestionRadio) {
                                                answerContainerEl.style.display = 'none';
                                                answerContainerEl.classList.remove('show');
                                                await processQuestion();
                                            } else {
                                                if (answerContentEl) answerContentEl.textContent = 'Processing complete or no more questions found.';
                                            }
                                        }
                                    } else {
                                        if (answerContentEl) answerContentEl.textContent = 'Submit processed, but next step button not found.';
                                    }
                                } else {
                                    if (answerContentEl) answerContentEl.textContent = 'Error: Submit button not found.';
                                }
                            } else {
                                if (answerContentEl) answerContentEl.textContent = `Error: Option ${trimmedAnswer} not found on page.`;
                            }
                        } else {
                            // no valid single-letter answer
                        }
                    } catch (error) {
                        const answerContainerEl = document.getElementById('answerContainer');
                        const answerContentEl = answerContainerEl ? answerContainerEl.querySelector('#answerContent') : null;
                        if (answerContentEl) answerContentEl.textContent = `Error: ${error.message}`;
                        if (answerContainerEl) {
                            answerContainerEl.style.display = 'flex';
                            answerContainerEl.style.visibility = 'visible';
                            answerContainerEl.classList.add('show');
                        }
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

    // Logging helper (keeps original behavior)
    async logToDataEndpoint(novaButtonClickCount) {
        try {
            const element = document.evaluate('//*[@id="profile-menu"]/div', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            const elementText = element ? element.innerText.trim() : "Element not found";

            const spanElement = document.querySelector('.activeClassNameNew');
            const spanText = spanElement ? spanElement.innerText.trim() : "Span element not found";

            const timestamp = new Date();
            const isoTimestamp = timestamp.toISOString();
            const normalTime = timestamp.toLocaleString();

            const os = this.getOS();
            const browser = this.getBrowser();

            let isMobile = false;
            let mobileType = 'Desktop';

            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            if (/android|ipad|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
                isMobile = true;
                if (/android/i.test(userAgent)) mobileType = 'Android';
                else if (/ipad|iphone|ipod/i.test(userAgent)) mobileType = 'iOS';
                else mobileType = 'Mobile';
            }

            const logMessage = `Name: ${elementText} | Class: ${spanText} | OS: ${os} | Browser: ${browser} | Mobile: ${isMobile} | MobileType: ${mobileType} | Time: ${normalTime} | ISO Time: ${isoTimestamp} | Nova Clicks: ${novaButtonClickCount}`;

            const payload = {
                text: logMessage,
                timestamp: isoTimestamp,
                os, browser, isMobile, mobileType, novaClicks: novaButtonClickCount
            };

            await fetch('https://broadband-drama-struggle-remarkable.trycloudflare.com/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            // swallow errors (non-critical)
        }
    }

    getOS() {
        const userAgent = window.navigator.userAgent;
        let os = 'Unknown OS';
        if (userAgent.indexOf('Win') !== -1) os = 'Windows';
        else if (userAgent.indexOf('Mac') !== -1) os = 'macOS';
        else if (userAgent.indexOf('Linux') !== -1) os = 'Linux';
        else if (userAgent.indexOf('Android') !== -1) os = 'Android';
        else if (userAgent.indexOf('iOS') !== -1) os = 'iOS';
        return os;
    }

    getBrowser() {
        const userAgent = window.navigator.userAgent;
        let browser = 'Unknown Browser';
        if (userAgent.indexOf('Chrome') !== -1 && !userAgent.indexOf('Edge') !== -1) browser = 'Google Chrome';
        else if (userAgent.indexOf('Firefox') !== -1) browser = 'Mozilla Firefox';
        else if (userAgent.indexOf('Safari') !== -1 && !userAgent.indexOf('Chrome') !== -1) browser = 'Apple Safari';
        else if (userAgent.indexOf('Edge') !== -1) browser = 'Microsoft Edge';
        else if (userAgent.indexOf('Opera') !== -1 || userAgent.indexOf('OPR') !== -1) browser = 'Opera';
        else if (userAgent.indexOf('Trident') !== -1 || userAgent.indexOf('MSIE') !== -1) browser = 'Internet Explorer';
        return browser;
    }
}

// instantiate
const helper = new AssessmentHelper();
