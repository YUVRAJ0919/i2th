import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==========================================
// 1. API KEYS & HINGLISH VOICE SETUP
// ==========================================
const rawKeys = import.meta.env.VITE_GEMINI_API_KEYS || "";
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
const AI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-1.5-flash";

function getRandomApiKey() {
    if (apiKeys.length === 0) return null;
    return apiKeys[Math.floor(Math.random() * apiKeys.length)];
}

let voiceEnabled = true;
const voiceToggle = document.getElementById('voice-toggle');

// Pre-load voices to find the most human-like Indian accent
let availableVoices = [];
window.speechSynthesis.onvoiceschanged = () => {
    availableVoices = window.speechSynthesis.getVoices();
};

voiceToggle.addEventListener('click', () => {
    voiceEnabled = !voiceEnabled;
    if (voiceEnabled) {
        voiceToggle.innerText = '🔊 Voice: ON';
        voiceToggle.className = 'voice-btn on';
    } else {
        voiceToggle.innerText = '🔇 Voice: OFF';
        voiceToggle.className = 'voice-btn off';
        window.speechSynthesis.cancel();
    }
});

// ==========================================
// 2. SUBJECTS & TOPICS DATABASE
// ==========================================
const syllabus = {
    physics: ["Wheatstone Bridge", "Gauss Law", "Biot-Savart Law", "Bohr Model", "Lens Maker Formula", "Cyclotron", "Electric Dipole", "De Broglie Wavelength", "Faraday's Law"],
    chemistry: ["Nernst Equation", "Arrhenius Equation", "Raoult's Law", "First Order Kinetics", "Aldol Condensation", "SN1 and SN2 Mechanism", "Crystal Field Theory", "Ideal Gas Law"],
    maths: ["Integration by Parts", "Bayes' Theorem", "Direction Cosines", "Matrix Inverse", "Maxima and Minima", "Area under Curve", "Vector Dot Product", "Differential Equations"]
};

const subjectSelector = document.getElementById('subject-selector');
const quickTopicsDiv = document.getElementById('quick-topics');
const userInput = document.getElementById('user-input');

function loadTopics(subject) {
    quickTopicsDiv.innerHTML = '';
    syllabus[subject].forEach(topic => {
        const btn = document.createElement('button');
        btn.className = 'topic-btn';
        btn.innerText = topic;
        btn.addEventListener('click', () => {
            userInput.value = `${subject.toUpperCase()}: ${topic}`;
            handleUserQuery();
        });
        quickTopicsDiv.appendChild(btn);
    });
}
loadTopics('physics');
subjectSelector.addEventListener('change', (e) => loadTopics(e.target.value));

// ==========================================
// 3. THREE.JS ENGINE SETUP
// ==========================================
const container = document.getElementById('canvas-container');
const sceneLabel = document.getElementById('scene-label');
const loadingOverlay = document.getElementById('loading-overlay');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(0, 10, 25);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

let updatables = [];
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updatables.forEach(fn => fn());
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function clearScene() {
    while(scene.children.length > 2){ 
        const obj = scene.children[scene.children.length - 1];
        if(obj.geometry) obj.geometry.dispose();
        if(obj.material) obj.material.dispose();
        scene.remove(obj);
    }
    updatables = [];
}
function addUpdate(fn) { updatables.push(fn); }

// ==========================================
// 4. AI GENERATION & SYNCED TEACHING LOGIC
// ==========================================
const chatHistory = document.getElementById('chat-history');
const sendBtn = document.getElementById('send-btn');

function syncTextWithVoice(element, text, onComplete) {
    element.innerHTML = "";
    element.classList.add('typing-cursor');

    if (!voiceEnabled) {
        // Fallback fast typing if voice is off
        let i = 0;
        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                chatHistory.scrollTop = chatHistory.scrollHeight;
                setTimeout(type, 15);
            } else {
                element.classList.remove('typing-cursor');
                if (onComplete) onComplete();
            }
        }
        type();
        return;
    }

    window.speechSynthesis.cancel(); // Stop old speech
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Human-like pacing
    utterance.rate = 0.85; 
    utterance.pitch = 1.0;
    
    // Select the best Indian English/Hindi voice available (Prioritizes Google/Natural voices)
    const bestVoice = availableVoices.find(v => v.name.includes('Google') && (v.lang.includes('IN'))) 
                   || availableVoices.find(v => v.lang === 'en-IN' || v.lang.includes('hi-IN'));
    if (bestVoice) {
        utterance.voice = bestVoice;
    }

    // Sync text to the words being spoken in real-time
    let charIndex = 0;
    utterance.onboundary = (event) => {
        if (event.name === 'word') {
            charIndex = event.charIndex + event.charLength;
            element.innerHTML = text.substring(0, charIndex);
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    };

    utterance.onend = () => {
        element.innerHTML = text; // Ensure full text is shown
        element.classList.remove('typing-cursor');
        if (onComplete) onComplete();
    };

    // Failsafe in case onboundary isn't supported by the browser's TTS engine
    setTimeout(() => {
        if (charIndex === 0) {
            let i = 0;
            const msPerChar = 45; // Match average speaking speed
            function fallbackType() {
                if (i < text.length) {
                    element.innerHTML += text.charAt(i);
                    i++;
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    setTimeout(fallbackType, msPerChar);
                }
            }
            fallbackType();
        }
    }, 500);

    window.speechSynthesis.speak(utterance);
}

function appendMessage(sender, text, derivation = null, question = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    const p = document.createElement('p');
    msgDiv.appendChild(p);
    chatHistory.appendChild(msgDiv);
    
    if (sender === 'ai') {
        // Trigger synced speech and typing
        syncTextWithVoice(p, text, () => {
            // Show math formulas only AFTER speaking is done
            if (derivation) {
                const mathDiv = document.createElement('div');
                mathDiv.className = 'derivation-box';
                // Force $$ wrappers to ensure KaTeX renders it in block mode
                mathDiv.innerHTML = `<strong>Derivation / Formula:</strong><br><br>$$${derivation}$$`;
                msgDiv.appendChild(mathDiv);
            }
            if (question) {
                const qDiv = document.createElement('div');
                qDiv.className = 'question-box';
                qDiv.innerHTML = `<strong>Practice Question:</strong><br>${question}`;
                msgDiv.appendChild(qDiv);
            }
            chatHistory.scrollTop = chatHistory.scrollHeight;
            
            // Execute KaTeX rendering specifically on this new element
            if (window.renderMathInElement) {
                window.renderMathInElement(msgDiv, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false,
                    strict: false
                });
            }
        });
    } else {
        p.innerText = text;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

// System Prompt heavily updated for connected 3D structures and strict LaTeX rules
const SYSTEM_PROMPT = `
You are an expert Class 12 STEM 3D tutor teaching Indian students. The user will give a topic.
Return ONLY a valid JSON object.
Format:
{
  "explanation": "Clear explanation written in Hinglish (a mix of Hindi and English written in the English alphabet). Tone should be friendly and human-like. Plain text only, NO math symbols.",
  "derivation": "The mathematical derivation in raw LaTeX. CRITICAL RULES: 1) Do NOT use raw \\n for newlines. 2) If multi-step, use \\\\begin{aligned} ... \\\\end{aligned} and use \\\\\\\\ for newlines. 3) Double escape all backslashes (e.g., \\\\frac, \\\\sum).",
  "question": "A practice question based on the topic.",
  "threeJsCode": "Valid JavaScript code to build a 3D diagram."
}
CRITICAL Rules for 'threeJsCode':
1. Executed inside: function(scene, THREE, addUpdate) { ... }
2. NO FLOATING BLOCKS. You MUST connect components (using THREE.CylinderGeometry or THREE.Line) to form proper circuits, bonds, or optical paths. 
3. E.g., for Wheatstone bridge, build actual connecting wires between the nodes. For optics, draw actual line rays. 
4. Add a THREE.GridHelper(20, 20) to ground the scene.
5. Animate via addUpdate(function() { ... }) to make it dynamic.
6. Return raw JS string code. No import statements.
`;

async function handleUserQuery() {
    const topic = userInput.value.trim();
    const apiKey = getRandomApiKey();
    if (!topic || !apiKey) return;
    
    appendMessage('user', topic);
    userInput.value = '';
    window.speechSynthesis.cancel();
    
    loadingOverlay.classList.remove('hidden');
