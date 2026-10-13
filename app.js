import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==========================================
// 1. API KEYS & VOICE SETUP
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

function speakTeacher(text) {
    if (!voiceEnabled) return;
    window.speechSynthesis.cancel(); // Stop current speech if any
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly slower, teacher-like pacing
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 2. SUBJECTS & TOPICS DATABASE
// ==========================================
const syllabus = {
    physics: ["Gauss Law", "Biot-Savart Law", "Bohr Model", "Lens Maker Formula", "Cyclotron", "Wheatstone Bridge", "Electric Dipole", "De Broglie Wavelength", "Faraday's Law"],
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
// Load Physics by default
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
camera.position.set(0, 10, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
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
// 4. AI GENERATION & TEACHING LOGIC
// ==========================================
const chatHistory = document.getElementById('chat-history');
const sendBtn = document.getElementById('send-btn');

function typeWriterEffect(element, text, speed, onComplete) {
    let i = 0;
    element.innerHTML = "";
    element.classList.add('typing-cursor');
    function type() {
        if (i < text.length) {
            element.innerHTML += text.charAt(i);
            i++;
            chatHistory.scrollTop = chatHistory.scrollHeight;
            setTimeout(type, speed);
        } else {
            element.classList.remove('typing-cursor');
            if (onComplete) onComplete();
        }
    }
    type();
}

function appendMessage(sender, text, derivation = null, question = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    const p = document.createElement('p');
    msgDiv.appendChild(p);
    chatHistory.appendChild(msgDiv);
    
    if (sender === 'ai') {
        speakTeacher(text); // Trigger TTS Voice
        
        typeWriterEffect(p, text, 15, () => {
            if (derivation) {
                const mathDiv = document.createElement('div');
                mathDiv.className = 'derivation-box';
                // Enforce $$ delimiters so KaTeX always catches it
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
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '[', right: ']', display: true}
                    ],
                    throwOnError: false
                });
            }
        });
    } else {
        p.innerText = text;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

// System Prompt updated to fix LaTeX rendering issues
const SYSTEM_PROMPT = `
You are an expert Class 12 STEM 3D tutor. The user will give a topic.
Return ONLY a valid JSON object.
Format:
{
  "explanation": "Clear explanation. Plain text only, no math symbols, because this will be read aloud by a Text-to-Speech voice.",
  "derivation": "The mathematical derivation in raw LaTeX. DO NOT include $$ wrappers here, just the raw math code. Double escape backslashes (e.g., \\\\frac).",
  "question": "A practice question based on the topic.",
  "threeJsCode": "Valid JavaScript code to build a 3D diagram."
}
Rules for 'threeJsCode':
1. Executed inside: function(scene, THREE, addUpdate) { ... }
2. Do not redefine 'scene' or 'THREE'. Use standard Geometries and MeshStandardMaterial.
3. Animate via addUpdate(function() { ... }).
4. Scale things to fit -10 to +10. No import statements.
`;

async function handleUserQuery() {
    const topic = userInput.value.trim();
    const apiKey = getRandomApiKey();
    if (!topic || !apiKey) return;
    
    appendMessage('user', topic);
    userInput.value = '';
    window.speechSynthesis.cancel(); // Stop talking if user asks a new question
    
    loadingOverlay.classList.remove('hidden');
    sceneLabel.innerText = "Generating 3D model for: " + topic;
    clearScene();

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Topic: ${topic}` }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });
        
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```javascript/g, '').replace(/```/g, '').trim();
        
        let aiResponse;
        try {
            aiResponse = JSON.parse(rawText);
        } catch (e) {
            rawText = rawText.replace(/\\([a-zA-Z])/g, '\\\\$1');
            aiResponse = JSON.parse(rawText);
        }

        appendMessage('ai', aiResponse.explanation, aiResponse.derivation, aiResponse.question);

        if (aiResponse.threeJsCode) {
            try {
                const generate3DScene = new Function('scene', 'THREE', 'addUpdate', aiResponse.threeJsCode);
                generate3DScene(scene, THREE, addUpdate);
                sceneLabel.innerText = "Interactive 3D: " + topic;
            } catch (threeErr) {
                console.error("AI 3D Code Error:", threeErr);
                sceneLabel.innerText = "Error rendering 3D diagram.";
            }
        }
    } catch (error) {
        console.error(error);
        appendMessage('ai', `Connection Failed: ${error.message}`);
        sceneLabel.innerText = "System Offline";
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

sendBtn.addEventListener('click', handleUserQuery);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUserQuery();
});
