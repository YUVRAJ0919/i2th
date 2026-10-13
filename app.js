import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ==========================================
// 1. ENVIRONMENT CONFIGURATION (Load Balancing)
// ==========================================
const rawKeys = import.meta.env.VITE_GEMINI_API_KEYS || "";
const apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
const AI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-1.5-flash";

function getRandomApiKey() {
    if (apiKeys.length === 0) return null;
    return apiKeys[Math.floor(Math.random() * apiKeys.length)];
}

// ==========================================
// 2. THREE.JS ENGINE SETUP
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

function addUpdate(fn) {
    updatables.push(fn);
}

// ==========================================
// 3. AI GENERATION & COMPILATION
// ==========================================
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');

function appendMessage(sender, text, derivation = null, question = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    msgDiv.innerHTML = `<p>${text}</p>`;
    
    if (derivation) {
        const mathDiv = document.createElement('div');
        mathDiv.className = 'derivation-box';
        mathDiv.innerHTML = `<strong>Derivation / Formula:</strong><br><br>${derivation}`;
        msgDiv.appendChild(mathDiv);
    }
    
    if (question) {
        const qDiv = document.createElement('div');
        qDiv.className = 'question-box';
        qDiv.innerHTML = `<strong>Practice Question:</strong><br>${question}`;
        msgDiv.appendChild(qDiv);
    }
    
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    // Check if KaTeX window method is loaded
    if (window.renderMathInElement) {
        window.renderMathInElement(msgDiv, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }
}

const SYSTEM_PROMPT = `
You are an expert Class 12 STEM 3D tutor. The user will give a topic.
You must return ONLY a raw JSON object (without markdown blocks like \`\`\`json).
Format:
{
  "explanation": "Clear explanation of the topic.",
  "derivation": "The mathematical derivation in LaTeX (use $$ for display, $ for inline).",
  "question": "A practice question based on the topic.",
  "threeJsCode": "Valid JavaScript code to build a 3D diagram for the topic."
}

Rules for 'threeJsCode':
1. This string will be executed inside a function: function(scene, THREE, addUpdate) { ... }
2. Do not redefine 'scene' or 'THREE'. They are provided in the environment.
3. Create standard Geometries (SphereGeometry, BoxGeometry, TorusGeometry, CylinderGeometry), apply MeshStandardMaterial with distinct hex colors, and add them to 'scene'.
4. To animate the diagram, pass a callback to addUpdate(function() { ... }).
5. Use basic shapes cleverly to represent atoms, circuits, fields, optical setups, math vectors, or biological concepts. 
6. Ensure things are scaled to fit within a coordinate range of -10 to +10.
7. Return raw JS string code inside the JSON. No import statements.
`;

async function handleUserQuery() {
    const topic = userInput.value.trim();
    const apiKey = getRandomApiKey();
    
    if (!topic || !apiKey) {
        appendMessage('system', 'Please enter a topic and ensure API keys are set in .env.');
        return;
    }
    
    appendMessage('user', topic);
    userInput.value = '';
    
    loadingOverlay.classList.remove('hidden');
    sceneLabel.innerText = "Generating: " + topic;
    clearScene();

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ 
                    parts: [{ text: `${SYSTEM_PROMPT}\n\nUser Topic: ${topic}` }] 
                }]
            })
        });
        
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);

        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, '').replace(/```javascript/g, '').replace(/```/g, '').trim();
        
        const aiResponse = JSON.parse(rawText);

        appendMessage('ai', aiResponse.explanation, aiResponse.derivation, aiResponse.question);

        if (aiResponse.threeJsCode) {
            try {
                const generate3DScene = new Function('scene', 'THREE', 'addUpdate', aiResponse.threeJsCode);
                generate3DScene(scene, THREE, addUpdate);
                sceneLabel.innerText = "3D View: " + topic;
            } catch (threeErr) {
                console.error("AI 3D Code Error:", threeErr);
                sceneLabel.innerText = "Error rendering 3D diagram.";
            }
        }
        
    } catch (error) {
        appendMessage('ai', `Error connecting to API: ${error.message}`);
        sceneLabel.innerText = "Connection Failed";
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

sendBtn.addEventListener('click', handleUserQuery);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleUserQuery();
});