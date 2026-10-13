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

// Persistent Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Array to hold dynamic AI animations
let updatables = [];

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    updatables.forEach(fn => fn()); // Execute AI animations every frame
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

function clearScene() {
    // Keep lights (indices 0 and 1) but remove all AI-generated meshes
    while(scene.children.length > 2){ 
        const obj = scene.children[scene.children.length - 1];
        if(obj.geometry) obj.geometry.dispose();
        if(obj.material) obj.material.dispose();
        scene.remove(obj);
    }
    updatables = [];
}

// Passed to AI generated code so it can register animation functions
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
    
    // Trigger KaTeX to render math (LaTeX) in the newly added element safely
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
You must return ONLY a valid JSON object.
Format:
{
  "explanation": "Clear explanation of the topic.",
  "derivation": "The mathematical derivation in LaTeX. CRITICAL: You must double-escape ALL backslashes in LaTeX (e.g., write \\\\frac instead of \\frac, \\\\cdot instead of \\cdot, \\\\oint instead of \\oint).",
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
7. Return raw JS string code. No import statements. Do not use unescaped quotes.
`;

async function handleUserQuery() {
    const topic = userInput.value.trim();
    const apiKey = getRandomApiKey();
    
    if (!topic || !apiKey) {
        appendMessage('system', 'Please enter a topic and ensure API keys are correctly set in Vercel.');
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
                }],
                // STRICTLY forces the AI to output valid, parsable JSON
                generationConfig: {
                    responseMimeType: "application/json" 
                }
            })
        });
        
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);

        let rawText = data.candidates[0].content.parts[0].text;
        
        // Clean any residual markdown formatting the AI might mistakenly add
        rawText = rawText.replace(/```json/g, '').replace(/```javascript/g, '').replace(/```/g, '').trim();
        
        // JSON Parsing block with a fallback failsafe for unescaped LaTeX backslashes
        let aiResponse;
        try {
            aiResponse = JSON.parse(rawText);
        } catch (initialParseError) {
            console.warn("Initial JSON parse failed. Applying aggressive backslash escaping for LaTeX...");
            // Failsafe: Targets single backslashes followed by letters and double-escapes them
            rawText = rawText.replace(/\\([a-zA-Z])/g, '\\\\$1');
            aiResponse = JSON.parse(rawText);
        }

        // Render UI
        appendMessage('ai', aiResponse.explanation, aiResponse.derivation, aiResponse.question);

        // Compile and execute the AI's 3D JS Code dynamically
        if (aiResponse.threeJsCode) {
            try {
                const generate3DScene = new Function('scene', 'THREE', 'addUpdate', aiResponse.threeJsCode);
                generate3DScene(scene, THREE, addUpdate);
                sceneLabel.innerText = "3D View: " + topic;
            } catch (threeErr) {
                console.error("AI 3D Code Error:", threeErr);
                sceneLabel.innerText = "Error rendering 3D diagram. Code was invalid.";
            }
        }
        
    } catch (error) {
        console.error(error);
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
