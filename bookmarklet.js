// bookmarklet.js
// Put this file on GitHub and use the raw URL in a small loader bookmarklet.
// Example: javascript:(function(){fetch('https://raw.githubusercontent.com/USER/REPO/branch/bookmarklet.js').then(r=>r.text()).then(eval)})()

(function () {
    'use strict';

    // ---------- CONFIG ----------
    // Replace this with your working API base (must support CORS).
    const API_BASE = 'https://your.api.domain'; // <-- EDIT ME
    // Toggle this to true for offline debugging (no network calls)
    const DISABLE_REMOTE = false;

    // URLs built from config
    const ENDPOINT_ASK = API_BASE + '/ask';
    const ENDPOINT_LOG = API_BASE + '/data';

    // ---------- small helper to load remote libs (used by init) ----------
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve();
            s.onerror = (e) => reject(new Error('Failed to load ' + url));
            document.head.appendChild(s);
        });
    }

    // ---------- CLASS ----------
    class AssessmentHelper {
        constructor() {
            // state
            this.answerIsDragging = false;
            this.answerInitialX = 0;
            this.answerInitialY = 0;
            this.cachedArticle = null;
            this.isFetchingAnswer = false;

            // network config (instance-level so methods can reference easily)
            this.API_BASE = API_BASE;
            this.ENDPOINT_ASK = ENDPOINT_ASK;
            this.ENDPOINT_LOG = ENDPOINT_LOG;
            this.disableRemote = DISABLE_REMOTE;

            // Ensure not duplicated
            if (document.getElementById('Launcher')) {
                console.log('AssessmentHelper already injected.');
                return;
            }

            // load libraries then init
            this.animeUrl = 'https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js';
            this.draggabillyUrl = 'https://unpkg.com/draggabilly@3/dist/draggabilly.pkgd.min.js';

            // If DOM still loading, wait
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        async init() {
            // Try to load libs but do not fail hard if they don't load
            try {
                await loadScript(this.animeUrl);
            } catch (e) {
                console.warn('Anime.js failed to load (continuing without intro animation).', e);
            }
            try {
                await loadScript(this.draggabillyUrl);
            } catch (e) {
                console.warn('Draggabilly failed to load (dragging may be limited).', e);
            }

            // Create UI
            this.itemMetadata = { UI: this.createUI(), answerUI: this.createAnswerUI() };
            this.playIntroAnimation();
        }

        // ---------- tiny DOM helpers ----------
        createEl(tag, props = {}) {
            const el = document.createElement(tag);
            Object.keys(props).forEach((k) => {
                if (k === 'style') el.style.cssText = props.style;
                else if (k === 'dataset') Object.assign(el.dataset, props.dataset);
                else if (k === 'children') props.children.forEach(c => el.appendChild(c));
                else if (k === 'text') el.textContent = props.text;
                else el[k] = props[k];
            });
            return el;
        }

        applyStylesOnce(id, css) {
            if (!document.getElementById(id)) {
                const st = document.createElement('style');
                st.id = id;
                st.textContent = css;
                document.head.appendChild(st);
            }
        }

        // Utility to resolve resource URLs if needed (bookmarklet doesn't bundle icons)
        getUrl(path) {
            // If you host icons, you can prefix with your repo raw url here.
            // For now just return path as-is (most icons in bookmarklet used remote URLs).
            return path;
        }

        // ---------- UI creation ----------
        createUI() {
            const container = this.createEl('div');

            const launcher = this.createEl('div', {
                id: 'Launcher',
                className: 'Launcher',
                style:
                    "min-height:160px;opacity:0;visibility:hidden;transition:opacity 0.5s ease;font-family:'Nunito',sans-serif;width:180px;height:240px;background:#010203;position:fixed;border-radius:12px;display:flex;flex-direction:column;align-items:center;color:white;font-size:16px;top:50%;right:20px;transform:translateY(-50%);z-index:99999;padding:16px;box-shadow:0 10px 8px rgba(0,0,0,0.25);overflow:hidden;white-space:nowrap;"
            });

            const dragHandle = this.createEl('div', {
                className: 'drag-handle',
                style: 'width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;'
            });

            // UI image (logo). Replace with your hosted image if needed.
            const uiImg = this.createEl('img', {
                src: 'https://raw.githubusercontent.com/Cpmjaguar1234/nova/refs/heads/main/nova%20logo%20png.png',
                style: 'width:90px;height:90px;margin-top:32px;border-radius:50%;object-fit:cover;'
            });

            const closeButton = this.createEl('button', {
                id: 'closeButton',
                text: '\u00D7',
                style: 'position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.2s ease, transform 0.1s ease;opacity:0.6;'
            });

            const getAnswerButton = this.createEl('button', {
                id: 'getAnswerButton',
                style:
                    'background:#1a1a1a;border:none;color:white;padding:12px 20px;border-radius:8px;cursor:pointer;margin-top:24px;width:120px;height:44px;font-size:16px;transition:background 0.2s ease, transform 0.1s ease;display:flex;justify-content:center;align-items:center;'
            });

            // Loading indicator (spinner)
            const loadingIndicator = this.createEl('div', {
                id: 'loadingIndicator',
                style: 'border:4px solid rgba(255,255,255,0.15);border-radius:50%;border-top:4px solid #fff;width:20px;height:20px;animation:spin 1s linear infinite;display:none;margin-right:8px;'
            });

            const buttonTextSpan = this.createEl('span', { text: 'Skip Article', id: 'getAnswerButtonText' });

            getAnswerButton.appendChild(loadingIndicator);
            getAnswerButton.appendChild(buttonTextSpan);

            const version = this.createEl('div', {
                style: 'position:absolute;bottom:8px;right:8px;font-size:12px;opacity:0.6;',
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

            const dragHandle = this.createEl('div', { className: 'answer-drag-handle', style: 'width:100%;height:24px;cursor:move;background:transparent;position:absolute;top:0;' });

            const closeButton = this.createEl('button', { id: 'closeAnswerButton', style: 'position:absolute;top:8px;right:8px;background:none;border:none;color:white;font-size:18px;cursor:pointer;padding:2px 8px;transition:color 0.2s ease, transform 0.1s ease;' });

            const answerContent = this.createEl('div', { id: 'answerContent', style: 'padding:0;margin:0;word-wrap:break-word;font-size:24px;font-weight:bold;display:flex;justify-content:center;align-items:center;width:100%;height:100%;' });

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

            const imageUrl = 'https://raw.githubusercontent.com/Cpmjaguar1234/nova/refs/heads/main/nova%20logo%20png.png';
            const introImgElement = this.createEl('img', {
                src: imageUrl,
                id: 'introLoaderImage',
                style: 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.5);width:100px;height:auto;border-radius:12px;box-shadow:0 4px 8px rgba(0,0,0,0.2);z-index:100001;opacity:0;'
            });
            document.body.appendChild(introImgElement);

            anime.timeline({
                easing: 'easeInOutQuad',
                duration: 800,
                complete: () => {
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

            // apply base CSS rules once
            this.applyStylesOnce('assessment-helper-styles', `
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                #closeButton:hover, #closeAnswerButton:hover { color: #ff6b6b; opacity: 1 !important; }
                #closeButton:active, #closeAnswerButton:active { color: #e05252; transform: scale(0.95); }
                #getAnswerButton:hover { background: #454545 !important; }
                #getAnswerButton:active { background: #4c4e5b !important; transform: scale(0.98); }
                #getAnswerButton:disabled { opacity: 0.6; cursor: not-allowed; }
                .answerLauncher.show { opacity: 1; visibility: visible; transform: translateY(-50%) scale(1); }
            `);

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
                setTimeout(() => { launcher.style.visibility = 'visible'; launcher.style.opacity = 1; }, 10);
                setTimeout(() => { this.setupEventListeners(); }, 500);
            }
        }

        // ---------- content fetching & server comms ----------
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

        // Replaceable network function to ask the API for an answer
        async fetchAnswer(queryContent, retryCount = 0) {
            if (this.disableRemote) {
                return 'Error: remote calls disabled (disableRemote = true)';
            }
            const MAX_RETRIES = 3;
            const RETRY_DELAY_MS = 1000;

            try {
                const resp = await fetch(this.ENDPOINT_ASK, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: queryContent, article: this.cachedArticle || null })
                });

                if (!resp.ok) {
                    const errText = await resp.text().catch(() => '');
                    if (resp.status === 500 && errText && errText.toLowerCase().includes('quota') && retryCount < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                        return this.fetchAnswer(queryContent, retryCount + 1);
                    }
                    throw new Error(`API request failed with status ${resp.status}: ${errText}`);
                }

                const data = await resp.json().catch(() => null);
                if (!data) return 'Error: API returned invalid JSON';
                return data.response ? String(data.response).trim() : (data.answer ? String(data.answer).trim() : 'No answer available');
            } catch (err) {
                return `Error: ${err.message}`;
            }
        }

        // Log usage; fails gracefully and doesn't block the main flow
        async logToDataEndpoint(novaButtonClickCount = 1) {
            if (this.disableRemote) return;
            try {
                const element = document.evaluate('//*[@id="profile-menu"]/div', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                const elementText = element ? element.innerText.trim() : "Unknown";
                const spanElement = document.querySelector('.activeClassNameNew');
                const spanText = spanElement ? spanElement.innerText.trim() : "Unknown";
                const payload = {
                    user: elementText,
                    class: spanText,
                    time: new Date().toISOString(),
                    novaClicks: novaButtonClickCount,
                    ua: navigator.userAgent
                };

                const resp = await fetch(this.ENDPOINT_LOG, {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!resp.ok) {
                    console.warn('logToDataEndpoint: server responded', resp.status);
                }
            } catch (err) {
                console.warn('logToDataEndpoint failed:', err.message);
            }
        }

        // ---------- setup events ----------
        setupEventListeners() {
            const launcher = document.getElementById('Launcher');
            const answerContainer = document.getElementById('answerContainer');
            const getAnswerButton = launcher ? launcher.querySelector('#getAnswerButton') : null;
            const loadingIndicator = getAnswerButton ? getAnswerButton.querySelector('#loadingIndicator') : null;
            const buttonTextSpan = getAnswerButton ? getAnswerButton.querySelector('#getAnswerButtonText') : null;
            if (!launcher || !answerContainer) return;

            const closeButton = launcher.querySelector('#closeButton');
            const closeAnswerButton = answerContainer.querySelector('#closeAnswerButton');

            // Draggabilly if available
            if (typeof Draggabilly !== 'undefined') {
                try { new Draggabilly(launcher, { handle: '.drag-handle', delay: 50 }); } catch (e) { /* ignore */ }
            }

            // answer manual drag
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
                    answerContainer.style.right = '';
                    answerContainer.style.bottom = '';
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
                    });
                });
                closeAnswerButton.addEventListener('mousedown', () => (closeAnswerButton.style.transform = 'scale(0.95)'));
                closeAnswerButton.addEventListener('mouseup', () => (closeAnswerButton.style.transform = 'scale(1)'));
            }

            // getAnswerButton interactions
            if (getAnswerButton) {
                getAnswerButton.addEventListener('mouseenter', () => { getAnswerButton.style.background = '#2b2b2b'; });
                getAnswerButton.addEventListener('mouseleave', () => { getAnswerButton.style.background = '#1a1a1a'; });
                getAnswerButton.addEventListener('mousedown', () => { getAnswerButton.style.transform = 'scale(0.98)'; });
                getAnswerButton.addEventListener('mouseup', () => { getAnswerButton.style.transform = 'scale(1)'; });

                getAnswerButton.addEventListener('click', async () => {
                    let novaButtonClickCount = 1;
                    if (this.isFetchingAnswer) return;

                    // Visual state
                    this.isFetchingAnswer = true;
                    getAnswerButton.disabled = true;
                    if (buttonTextSpan) buttonTextSpan.style.display = 'none';
                    if (loadingIndicator) loadingIndicator.style.display = 'block';

                    // fire-and-forget logging
                    this.logToDataEndpoint(novaButtonClickCount);

                    const processQuestion = async (excludedAnswers = []) => {
                        try {
                            let queryContent = await this.fetchArticleContent();
                            queryContent += "\n\nPROVIDE ONLY A ONE-LETTER ANSWER THAT'S IT NOTHING ELSE (A, B, C, or D).";
                            if (excludedAnswers.length > 0) {
                                queryContent += `\n\nDo not pick letter ${excludedAnswers.join(', ')}.`;
                            }

                            const answer = await this.fetchAnswer(queryContent);
                            const answerContainerEl = document.getElementById('answerContainer');
                            const answerContentEl = answerContainerEl ? answerContainerEl.querySelector('#answerContent') : null;
                            if (answerContentEl) answerContentEl.textContent = answer;

                            if (answerContainerEl) {
                                answerContainerEl.style.display = 'flex';
                                answerContainerEl.style.visibility = 'visible';
                                answerContainerEl.classList.add('show');
                            }

                            if (answer && ['A', 'B', 'C', 'D'].includes(answer.trim()) && !excludedAnswers.includes(answer.trim())) {
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
                                                await processQuestion([...excludedAnswers, answer]);
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
                                    if (answerContentEl) answerContentEl.textContent = `Error: Option ${answer} not found on page.`;
                                }
                            } else {
                                // non-single-letter or error returned
                                if (answerContentEl && typeof answer === 'string' && answer.startsWith('Error:')) {
                                    // already an error string
                                }
                            }
                        } catch (err) {
                            const answerContainerEl = document.getElementById('answerContainer');
                            const answerContentEl = answerContainerEl ? answerContainerEl.querySelector('#answerContent') : null;
                            if (answerContentEl) answerContentEl.textContent = `Error: ${err.message}`;
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
    }

    // instantiate
    try {
        new AssessmentHelper();
    } catch (e) {
        console.error('Failed to instantiate AssessmentHelper:', e);
    }
})();
