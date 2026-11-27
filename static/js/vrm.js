const urlParams = new URLSearchParams(window.location.search);
const isRenderMode = urlParams.get('mode') === 'render'; // Render mode (for OBS capture)
// --- Variables for panoramic rendering ---
let cubeCamera, cubeRenderTarget, panoMesh, panoCamera, panoShaderMaterial;
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { createVRMAnimationClip, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation';
import { SplatMesh } from '@sparkjsdev/spark';
let isVRM1 = true;
let currentMixer = null;
let idleAction = null;
let breathAction = null;
let blinkAction = null;

// Variables for automatically hiding the model on mouse hover
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isAutoHideEnabled = false;           // Auto-hide feature toggle
let isModelHiddenByHover = false;        // Whether hover currently hides the model
let hoverCheckTimeout = null;            // Debounce timer
let mixerTimeScaleBeforeHide = 1;        // Animation speed before hiding
let animationsPausedForHide = false;     // Whether animations were paused for hiding
const HOVER_CHECK_INTERVAL = 33;         // Check interval (milliseconds), approximately 30 fps
const FADE_DURATION = 120;               // Fade duration (milliseconds), shortened to reduce residual visibility
let hideTransitionTimer = null;          // Track the hide timer to prevent overlapping transitions

// Pause and resume animations while hidden to avoid wasting resources
function pauseModelAnimationsForHide() {
    if (!animationsPausedForHide && currentMixer) {
        mixerTimeScaleBeforeHide = currentMixer.timeScale ?? 1;
        currentMixer.timeScale = 0;
        animationsPausedForHide = true;
    }
}

function resumeModelAnimationsAfterHide() {
    if (animationsPausedForHide && currentMixer) {
        currentMixer.timeScale = mixerTimeScaleBeforeHide || 1;
    }
    animationsPausedForHide = false;
}

// renderer
// Detect the runtime environment
const isElectron = typeof require !== 'undefined' || navigator.userAgent.includes('Electron');

// Add a class according to the environment
document.body.classList.add(isElectron ? 'electron' : 'web');

// Optimize renderer settings
const renderer = new THREE.WebGLRenderer();
// Add performance optimization settings
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.max(1, window.devicePixelRatio));
renderer.setClearColor(0x00000000, 0);
renderer.xr.enabled = true;
// Fetch the value from /cur_language
async function fetchLanguage() {
    try {
        const http_protocol = window.location.protocol;
        const HOST = window.location.host;
        let res = await fetch(`${http_protocol}//${HOST}/cur_language`);
        const data = await res.json();
        return data.language || 'en-US';
    } catch (error) {
        console.error('Error fetching language:', error);
        return 'en-US';
    }
}
async function t(key) {
    const currentLanguage = await fetchLanguage();
    return translations[currentLanguage]?.[key] || translations['en-US']?.[key] || key;
}
// Fetch the value from /cur_language
async function fetchVRMConfig() {
    try {
        const http_protocol = window.location.protocol;
        const HOST = window.location.host;
        let res = await fetch(`${http_protocol}//${HOST}/vrm_config`);
        const data = await res.json();
        if(data.VRMConfig.name != 'default'){
            data.VRMConfig.selectedModelId = data.VRMConfig.selectedNewModelId;
            data.VRMConfig.selectedMotionIds = data.VRMConfig.selectedNewMotionIds;
        }
        if (data.VRMConfig.selectedGaussSceneId == ''){
            data.VRMConfig.selectedGaussSceneId = 'transparent';
        }
        console.log(data.VRMConfig);
        return data.VRMConfig;
    } catch (error) {
        console.error('Error fetching VRMConfig:', error);
        return   {
            name: 'default',
            enabledExpressions: false,
            enabledMotions: false,
            selectedModelId: 'alice', // Select the Alice model by default
            defaultModels: [], // Store default models
            userModels: [],     // Store user-uploaded models
            defaultMotions: [], // Store default motions
            userMotions: [],     // Store user-uploaded motions
            selectedMotionIds: [],
            gaussDefaultScenes: [],   // GAUSS
            gaussUserScenes: [],      // GAUSS
            selectedGaussSceneId: 'transparent',
        };
    }
}
const modelConfig = await fetchVRMConfig();

// ==========================================
// NEW: Initialize Motion Map for ID Lookup
// ==========================================
const motionUrlMap = new Map();

function initMotionMap(config) {
    motionUrlMap.clear();
    const allMotions = [...(config.defaultMotions || []), ...(config.userMotions || [])];
    
    allMotions.forEach(motion => {
        if (motion.path) {
            try {
                let motionUrl = new URL(motion.path, window.location.origin);
                motionUrl.protocol = window.location.protocol;
                motionUrl.host = window.location.host;
                const finalUrl = motionUrl.toString();

                // 1. Bind by unique ID for internal system logic
                if (motion.id) {
                    motionUrlMap.set(motion.id, finalUrl);
                }

                // 2. Bind by display name for semantic AI calls
                // An AI request to nod matches a display_name with the same wording
                if (motion.name) {
                    // If names contain spaces or special characters, consider lowercasing or removing spaces for consistent matching
                    motionUrlMap.set(motion.name, finalUrl);
                    
                    // Also support the name without its extension in case the AI includes .vrma
                    const nameWithoutExt = motion.name.replace(/\.[^/.]+$/, "");
                    if (nameWithoutExt !== motion.name) {
                        motionUrlMap.set(nameWithoutExt, finalUrl);
                    }
                }
            } catch (e) {
                console.warn(`[MotionMap] Failed to resolve path: ${motion.name}`, e);
            }
        }
    });
    console.log("Motion ID & Name Map Initialized. ", motionUrlMap);
}
initMotionMap(modelConfig);
// ==========================================

const windowName = modelConfig.name;
async function getVRMpath() {
    const vrmConfig = await fetchVRMConfig();
    const modelId = vrmConfig.selectedModelId;
    const defaultModel = vrmConfig.defaultModels.find(model => model.id === modelId) || vrmConfig.userModels.find(model => model.id === modelId);
    if (defaultModel) {
        // Replace the protocol and host in defaultModel.path
        let defaultModelURL = new URL(defaultModel.path);
        defaultModelURL.protocol = window.location.protocol;
        defaultModelURL.host = window.location.host;
        return defaultModelURL.toString();
    } else {
        const userModel = vrmConfig.userModels.find(model => model.id === modelId);
        if (userModel) {
            // Replace the protocol and host in userModel.path
            let userModelURL = new URL(userModel.path);
            userModelURL.protocol = window.location.protocol;
            userModelURL.host = window.location.host;
            return userModelURL.toString();
        }
        else {
            return `${window.location.protocol}//${window.location.host}/vrm/Alice.vrm`;
        }
    }
}

async function getVRMname() {
    const vrmConfig = await fetchVRMConfig();
    const modelId = vrmConfig.selectedModelId;
    const defaultModel = vrmConfig.defaultModels.find(model => model.id === modelId) || vrmConfig.userModels.find(model => model.id === modelId);
    if (defaultModel) {
        return defaultModel.name;
    } else {
        const userModel = vrmConfig.userModels.find(model => model.id === modelId);
        if (userModel) {
            return userModel.name;
        }
        else {
            return 'Alice';
        }
    }
}

const vrmPath = await getVRMpath();
console.log(vrmPath);
// Enable shadows if needed
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

document.body.appendChild( renderer.domElement );

// camera
let camera;
if (isRenderMode) {
    // Panorama mode still needs a basic camera to drive the renderer, but uses CubeCamera for capture
    camera = new THREE.PerspectiveCamera(30.0, window.innerWidth / window.innerHeight, 0.1, 20.0);
    
    // Initialize the cube render target (2048 resolution recommended for clear panoramas)
    cubeRenderTarget = new THREE.WebGLCubeRenderTarget(2048, {
        format: THREE.RGBAFormat,
        generateMipmaps: true,
        magFilter: THREE.LinearFilter
    });
    cubeCamera = new THREE.CubeCamera(0.1, 1000, cubeRenderTarget);
    // Place the camera at character head height (about 1.5 m) and slightly forward (1 m) for the best view
    cubeCamera.position.set(0, 1.5, 1);

    // Panorama conversion shader: map the six cube faces onto a 2:1 plane
    panoShaderMaterial = new THREE.ShaderMaterial({
        uniforms: {
            tCube: { value: cubeRenderTarget.texture }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,

        fragmentShader: `
            varying vec2 vUv;
            uniform samplerCube tCube;
            #define PI 3.141592653589793

            void main() {
                // --- Key change: adjust the UV.x offset when mapping from [0, 1] ---
                // Previously: vUv.x * 2.0 * PI - PI
                // Multiply directly by 2PI so 0.5 (center) corresponds to PI (forward, -Z)
                float longitude = vUv.x * 2.0 * PI; 
                
                float latitude = vUv.y * PI - PI / 2.0;

                vec3 dir;
                dir.x = cos(latitude) * sin(longitude);
                dir.y = sin(latitude);
                dir.z = cos(latitude) * cos(longitude);

                gl_FragColor = textureCube(tCube, dir);
            }
        `,
        side: THREE.DoubleSide
    });

    // Create a full-screen overlay plane and orthographic camera
    panoMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), panoShaderMaterial);
    panoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
} else {
    // Normal mode: retain the original implementation
    camera = new THREE.PerspectiveCamera(30.0, window.innerWidth / window.innerHeight, 0.1, 20.0);
}

camera.position.set( 0.0, 1.0, 4.0 );
camera.far = 1000; 
camera.updateProjectionMatrix();

// camera controls
const controls = new OrbitControls( camera, renderer.domElement );
let controlsEnabledBeforeAutoHide = true;   
controls.screenSpacePanning = true;
controls.target.set( 0.0, 1.0, 0.0 );
controls.update();

// scene
const scene = new THREE.Scene();

// light
const light = new THREE.DirectionalLight( 0xffffff, Math.PI );
light.position.set( 1, 3, 2 ).normalize();
light.castShadow = true;                       // Enable shadow casting
light.shadow.mapSize.set( 2048, 2048 );        // Shadow map resolution

// Cover the area near the character with the shadow camera; adjust for scene size
const camSize = 4;
light.shadow.camera.left   = -camSize;
light.shadow.camera.right  =  camSize;
light.shadow.camera.top    =  camSize;
light.shadow.camera.bottom = -camSize;
light.shadow.camera.near   = 0.1;
light.shadow.camera.far    = 20;
scene.add( light );

const transformControl = new TransformControls( camera, renderer.domElement );
transformControl.addEventListener('change', () => {
    const obj = transformControl.object;
    if (transformControl.getMode() === 'scale' && obj) {
        
        // Get the axis currently being dragged (X, Y, Z)
        const axis = transformControl.axis; 
        
        // For center or plane handles, axis may be XYZ or XY
        // Only handle single-axis dragging to enforce uniform scaling
        let s = obj.scale.x; // Default scale value

        if (axis === 'X') {
            s = obj.scale.x;
        } else if (axis === 'Y') {
            s = obj.scale.y;
        } else if (axis === 'Z') {
            s = obj.scale.z;
        } else {
            // Center scaling (XYZ) is already uniform and needs no adjustment
            return;
        }

        // Check for equality to avoid unnecessary assignments
        if (obj.scale.y !== s || obj.scale.z !== s || obj.scale.x !== s) {
            obj.scale.set(s, s, s);
        }
    }
});
// Disable OrbitControls during model dragging to prevent unwanted camera rotation
transformControl.addEventListener( 'dragging-changed', function ( event ) {
    controls.enabled = ! event.value;
});

// Default to translate mode; rotate and scale are also supported
transformControl.setMode('translate'); 

scene.add( transformControl.getHelper() ); // Add the transform control helper

let currentSceneGroup = null;          // Current scene root group for unloading the entire scene

/* Reuse the configuration already loaded by await fetchVRMConfig() */
async function loadGaussScene() {
    /* ---------- 1. Read configuration ---------- */
    const cfg        = await fetchVRMConfig();
    const sceneId    = cfg.selectedGaussSceneId;
    const defaultArr = cfg.gaussDefaultScenes || [];
    const userArr    = cfg.gaussUserScenes    || [];

    /* ---------- 2. Construct URL ---------- */
    let sceneURL = null;
    if (sceneId === 'transparent') {
        /* Transparent scene: do not download an SPZ file */
        sceneURL = 'transparent';
    } else {
        const hit = [...defaultArr, ...userArr].find(s => s.id === sceneId);
        if (!hit) {
            console.warn(`[SceneLoader] Scene id=${sceneId} not found; falling back to transparent`);
            sceneURL = 'transparent';
        } else {
            // Resolve the relative path to an absolute URL
            const url = new URL(hit.path);
            url.protocol = window.location.protocol;
            url.host     = window.location.host;
            sceneURL     = url.toString();
        }
    }

    /* ---------- 3. Unload the old scene ---------- */
    if (currentSceneGroup) {
        scene.remove(currentSceneGroup);
        currentSceneGroup.traverse(o => {
            if (o.dispose) o.dispose();      // SplatMesh provides its own dispose method
        });
        currentSceneGroup = null;
    }

    /* ---------- 4. Construct the new scene ---------- */
    const group = new THREE.Group();
    group.name = `gaussScene_${sceneId}`;

    if (sceneURL === 'transparent') {
        /* ------ 4.1 Transparent shadow-receiving floor ------ */
        const groundGeo = new THREE.PlaneGeometry(20, 20);
        const shadowMat = new THREE.ShadowMaterial({ opacity: 0.4 });
        const ground    = new THREE.Mesh(groundGeo, shadowMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        group.add(ground);
    } else {
        /* ------ 4.2 Load .spz ------ */
        const splat = new SplatMesh({ url: sceneURL });
        let splat_height = 0;
        let splat_scale = 2;
        if (sceneId === 'space') {
            splat_height = 1.55;
        }else if (sceneId === 'home') {
            splat_height = 1.6;
        }else if (sceneId === 'sea') {
            splat_height = 2.4;
            splat_scale = 4;
        }
        // Scale and position relative to the center of the feet first; fine-tune for each model
        splat.quaternion.set(1, 0, 0, 0);
        splat.position.set(0, splat_height, 2);
        splat.scale.set(splat_scale, splat_scale, splat_scale);
        splat.receiveShadow = true;
        group.add(splat);
    }

    /* ---------- 5. Attach to the scene ---------- */
    scene.add(group);
    currentSceneGroup = group;
    console.log(`[SceneLoader] Scene ${sceneId} loaded`);
}

/* ------------------------------------------------------------------ */
/* Call once during initialization */
/* ------------------------------------------------------------------ */
await loadGaussScene();


// lookat target
const lookAtTarget = new THREE.Object3D();
camera.add( lookAtTarget );

// Add ambient light for a softer overall appearance
const ambientLight = new THREE.AmbientLight( 0xffffff, 0.1 );
scene.add( ambientLight );

// gltf and vrm
let currentVrm = undefined;
let currentVrmWrapper = new THREE.Group(); // Group that wraps the VRM model
scene.add(currentVrmWrapper);              // Attach the wrapper to the scene immediately
const loader = new GLTFLoader();
loader.crossOrigin = 'anonymous';

// ---------------- Repair malformed SpringBone configurations that can cause parsing failures ----------------
loader.register((parser) => {
    return {
        name: 'VRMSpringBoneBugFixPlugin',
        beforeRoot: () => {
            const json = parser.json;
            if (!json || !json.extensions) return;

            // Repair VRM 1.0 SpringBone configuration
            if (json.extensions.VRMC_springBone) {
                const sb = json.extensions.VRMC_springBone;
                if (!sb.springs) sb.springs = [];
                if (!sb.colliders) sb.colliders = [];
                if (!sb.colliderGroups) sb.colliderGroups = [];
                
                sb.springs.forEach(spring => {
                    if (spring) {
                        if (!spring.joints) spring.joints = [];
                        if (!spring.colliderGroups) spring.colliderGroups = [];
                    }
                });
                
                sb.colliderGroups.forEach(group => {
                    if (group && !group.colliders) group.colliders = [];
                });
            }

            // Repair VRM 0.0 secondary animation
            if (json.extensions.VRM && json.extensions.VRM.secondaryAnimation) {
                const sa = json.extensions.VRM.secondaryAnimation;
                if (!sa.boneGroups) sa.boneGroups = [];
                if (!sa.colliderGroups) sa.colliderGroups = [];
                
                sa.boneGroups.forEach(group => {
                    if (group) {
                        if (!group.bones) group.bones = [];
                        if (!group.colliderGroups) group.colliderGroups = [];
                    }
                });
                
                sa.colliderGroups.forEach(group => {
                    if (group && !group.colliders) group.colliders = [];
                });
            }
        }
    };
});
// -----------------------------------------------------------------------------------------

loader.register( ( parser ) => {

    return new VRMLoaderPlugin(parser); 

} );

loader.register( ( parser ) => {
    return new VRMAnimationLoaderPlugin( parser );
} );

// Set a natural pose
function setNaturalPose(vrm) {
    if (!vrm.humanoid) return;
    let v = 1;
    if (!isVRM1){
        v = -1;
    }
    // 1. Adjust both arms: increase 0.4 to 0.45 to bring the arms closer to the body, and tilt them slightly forward on the X axis
    const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    if (leftArm) {
        leftArm.rotation.z = -0.45 * Math.PI * v; 
        leftArm.rotation.x = 0.05; // Tilt the arm slightly forward
    }

    const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    if (rightArm) {
        rightArm.rotation.z = 0.45 * Math.PI * v;
        rightArm.rotation.x = 0.05; // Tilt the arm slightly forward
    }
    
    // Keep the existing wrist logic
    const leftHand = vrm.humanoid.getNormalizedBoneNode('leftHand');
    if (leftHand) {
        leftHand.rotation.z = 0.1 * v; // Natural wrist bend
        leftHand.rotation.x = 0.05;
    }
    const rightHand = vrm.humanoid.getNormalizedBoneNode('rightHand');
    if (rightHand) {
        rightHand.rotation.z = -0.1 * v; // Natural wrist bend
        rightHand.rotation.x = 0.05;
    }

    // Add natural finger curvature if supported by the model
    const fingerBones = [
        'leftThumbProximal', 'leftThumbIntermediate', 'leftThumbDistal',
        'leftIndexProximal', 'leftIndexIntermediate', 'leftIndexDistal',
        'leftMiddleProximal', 'leftMiddleIntermediate', 'leftMiddleDistal',
        'leftRingProximal', 'leftRingIntermediate', 'leftRingDistal',
        'leftLittleProximal', 'leftLittleIntermediate', 'leftLittleDistal',
        'rightThumbProximal', 'rightThumbIntermediate', 'rightThumbDistal',
        'rightIndexProximal', 'rightIndexIntermediate', 'rightIndexDistal',
        'rightMiddleProximal', 'rightMiddleIntermediate', 'rightMiddleDistal',
        'rightRingProximal', 'rightRingIntermediate', 'rightRingDistal',
        'rightLittleProximal', 'rightLittleIntermediate', 'rightLittleDistal'
    ];

    fingerBones.forEach(boneName => {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (bone) {
            // Set different bend amounts for each finger joint
            if (boneName.includes('Thumb')) {
                // Bend the thumb slightly inward
                bone.rotation.y = boneName.includes('left') ? 0.35 : -0.35;
            } else if (boneName.includes('Proximal')) {
                // Slightly bend the proximal phalanx
                bone.rotation.z = boneName.includes('left') ? -0.35 * v : 0.35 * v;
            } else if (boneName.includes('Intermediate')) {
                // Slightly bend the intermediate phalanx
                bone.rotation.z = boneName.includes('left') ? -0.45 * v : 0.45 * v;
            } else if (boneName.includes('Distal')) {
                // Slightly bend the distal phalanx
                bone.rotation.z = boneName.includes('left') ? -0.3 * v : 0.3 * v;
            }
        }
    });
}

// Idle motion time offsets keep movements out of sync
const idleOffsets = {
    body: Math.random() * Math.PI * 2,
    leftArm: Math.random() * Math.PI * 2,
    rightArm: Math.random() * Math.PI * 2,
    head: Math.random() * Math.PI * 2,
    spine: Math.random() * Math.PI * 2
};

// Improved idle animation management in global state
let idleAnimations = [];
let currentIdleAnimationIndex = 0;
let idleAnimationAction = null;
let isLoadingAnimations = false;
let idleAnimationManager = null; // Idle animation manager
let defaultPoseAction = null; // Default pose action
let useVRMAIdleAnimations = true; // Whether to use VRM-A idle animations
let isIdleAnimationModeChanging = false; // Prevent duplicate mode changes


// Complete idle animation manager class (corrected version)
class IdleAnimationManager {
    constructor(vrm, mixer) {
        this.vrm = vrm;
        this.mixer = mixer;
        
        // Core action references
        this.currentIdleAction = null;      // VRMA idle action
        this.defaultPoseAction = null;      // Default T-pose or A-pose reset action
        this.proceduralIdleAction = null;   // Procedural breathing and subtle movement action
        this.currentOneShotAction = null;   // Currently playing one-shot action

        // State flags
        this.isTransitioning = false;
        this.animationQueue = [];
        this.currentIndex = 0;
        
        // Parameter configuration
        this.transitionDuration = 0.5; // Standard transition duration
        this.pauseBetweenAnimations = 1.5;
        this.idleWeight = 1.0; 
        this.isActive = false;
        this.currentMode = 'none'; // 'vrma', 'procedural', 'none'
        
        // Listener references for removing old listeners when conflicts occur
        this._onOneShotFinished = null; 

        // Initialize base actions
        this.createDefaultPoseAction();
        this.createProceduralIdleAction();
        
        console.log('IdleAnimationManager initialized (Conflict Fix Version)');
    }

    createDefaultPoseAction() {
        try {
            const defaultPoseClip = this.createDefaultPoseClip();
            this.defaultPoseAction = this.mixer.clipAction(defaultPoseClip);
            this.defaultPoseAction.setLoop(THREE.LoopOnce);
            this.defaultPoseAction.clampWhenFinished = true;
            this.defaultPoseAction.setEffectiveWeight(0);
        } catch (error) {
            console.error('Error creating default pose action:', error);
        }
    }

    createProceduralIdleAction() {
        try {
            const idleClip = createIdleClip(this.vrm);
            if (!idleClip) return;
            this.proceduralIdleAction = this.mixer.clipAction(idleClip);
            this.proceduralIdleAction.setLoop(THREE.LoopRepeat);
            this.proceduralIdleAction.setEffectiveWeight(0); 
        } catch (error) {
            console.error('Error creating procedural idle action:', error);
        }
    }
    
    createDefaultPoseClip() { return super.createDefaultPoseClip ? super.createDefaultPoseClip() : this._createDefaultPoseClipImpl(); }
    _createDefaultPoseClipImpl() {
         const tracks = [];
        const duration = 1.0;
        const fps = 30;
        const frameCount = duration * fps;
        const times = [];
        for (let i = 0; i <= frameCount; i++) times.push(i / fps);

        const bonesToReset = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']; 
        
        bonesToReset.forEach(boneName => {
            const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName);
            if (!bone) return;
            const naturalRotation = this.getNaturalRotation(boneName);
            const values = [];
            times.forEach((time, index) => {
                if (index === 0) values.push(...bone.quaternion.toArray());
                else {
                    const progress = time / duration;
                    const easedProgress = this.easeInOutCubic(progress);
                    const currentQuat = new THREE.Quaternion().fromArray(values.slice((index - 1) * 4, index * 4));
                    const interpolatedQuat = currentQuat.clone().slerp(naturalRotation, easedProgress);
                    values.push(...interpolatedQuat.toArray());
                }
            });
            tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', times, values));
        });
        return new THREE.AnimationClip('defaultPose', duration, tracks);
    }
    
    easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    
    getNaturalRotation(boneName) { 
         const euler = new THREE.Euler(0, 0, 0);
         const v = isVRM1 ? 1 : -1;
         
         if(boneName === 'leftUpperArm') {
             euler.set(0.05, 0, -0.45 * Math.PI * v);
         }
         else if(boneName === 'rightUpperArm') {
             euler.set(0.05, 0, 0.45 * Math.PI * v);
         }
         else if(boneName === 'leftHand') {
             euler.set(0.05, 0, 0.1 * v);
         }
         else if(boneName === 'rightHand') {
             euler.set(0.05, 0, -0.1 * v);
         }
         else if(boneName === 'leftUpperLeg') {
             euler.set(0, 0.05 * v, 0.04 * v);
         }
         else if(boneName === 'rightUpperLeg') {
             euler.set(0, -0.05 * v, -0.04 * v);
         }

         const q = new THREE.Quaternion();
         q.setFromEuler(euler);
         return q;
    }
    
    setAnimationQueue(animations) {
        this.animationQueue = [...animations];
        this.currentIndex = 0;
    }

    startIdleLoop() {
        if (this.currentOneShotAction && this.currentOneShotAction.isRunning()) return;
        
        if (this.animationQueue.length === 0) {
            this.switchToProceduralMode();
            return;
        }
        
        this.currentMode = 'vrma';
        this.isActive = true;
        this.playNextVRMAAnimation();
    }
    
    playNextVRMAAnimation() {
        if (!this.isActive || this.currentMode !== 'vrma' || this.animationQueue.length === 0) return;
        if (this.currentOneShotAction && this.currentOneShotAction.isRunning()) return;
        if (this.isTransitioning) return;

        const animation = this.animationQueue[this.currentIndex];
        this.playVRMAAnimation(animation);
        
        const previousIndex = this.currentIndex;
        if (this.animationQueue.length > 1) {
            let newIndex;
            do { newIndex = Math.floor(Math.random() * this.animationQueue.length); } 
            while (newIndex === previousIndex);
            this.currentIndex = newIndex;
        }
    }
    
    playVRMAAnimation(animationData) {
        if (!animationData || !animationData.animation) {
            this.scheduleNextVRMAAnimation();
            return;
        }

        try {
            const clip = createVRMAnimationClip(animationData.animation, this.vrm);
            if (!clip) return;

            if (this.currentIdleAction) {
                this.currentIdleAction.stop();
            }

            this.currentIdleAction = this.mixer.clipAction(clip);
            this.currentIdleAction.setLoop(THREE.LoopOnce);
            this.currentIdleAction.clampWhenFinished = true;
            this.currentIdleAction.reset();
            this.currentIdleAction.setEffectiveWeight(1.0); 
            this.currentIdleAction.play();
            this.currentIdleAction.fadeIn(0.5);

            const onFinished = (event) => {
                if (event.action === this.currentIdleAction) {
                    this.mixer.removeEventListener('finished', onFinished);
                    if (this.currentMode === 'vrma' && !this.currentOneShotAction) {
                        this.onVRMAAnimationFinished();
                    }
                }
            };
            this.mixer.addEventListener('finished', onFinished);

        } catch (error) {
            console.error('Error playing VRMA:', error);
            this.scheduleNextVRMAAnimation();
        }
    }

    onVRMAAnimationFinished() {
        if (this.currentOneShotAction) return; 

        this.isTransitioning = true;
        
        if (this.currentIdleAction) this.currentIdleAction.fadeOut(1.0);
        
        if (this.defaultPoseAction) {
            this.defaultPoseAction.reset().setEffectiveWeight(1.0).play();
            this.defaultPoseAction.fadeIn(0.5);
        }

        setTimeout(() => {
            if (this.currentOneShotAction) { this.isTransitioning = false; return; }
            
            if (this.defaultPoseAction) this.defaultPoseAction.fadeOut(0.5);
            this.isTransitioning = false;
            
            setTimeout(() => {
                if (!this.currentOneShotAction && this.currentMode === 'vrma') {
                    this.playNextVRMAAnimation();
                }
            }, 300);
        }, 1500);
    }

    scheduleNextVRMAAnimation() {
        setTimeout(() => {
            if (!this.currentOneShotAction && this.currentMode === 'vrma') this.playNextVRMAAnimation();
        }, 1000);
    }

    async playOneShotAnimation(url) {
        if (!url) return;
        console.log(`[IdleManager] Requesting One-Shot: ${url}`);

        if (this.currentOneShotAction) {
            if (this._onOneShotFinished) {
                this.mixer.removeEventListener('finished', this._onOneShotFinished);
                this._onOneShotFinished = null;
            }
            this.currentOneShotAction.stop();
            this.currentOneShotAction = null;
        }

        const fadeDuration = 0.3; 
        
        if (this.currentMode === 'vrma' && this.currentIdleAction) {
            this.currentIdleAction.fadeOut(fadeDuration);
        }
        if (this.currentMode === 'procedural' && this.proceduralIdleAction) {
            this.proceduralIdleAction.fadeOut(fadeDuration);
        }
        if (this.defaultPoseAction) {
            this.defaultPoseAction.fadeOut(fadeDuration);
        }

        try {
            const gltf = await new Promise((resolve, reject) => {
                loader.load(url, resolve, undefined, reject);
            });
            const vrmAnimations = gltf.userData.vrmAnimations;
            if (!vrmAnimations || vrmAnimations.length === 0) throw new Error('No VRMA found');
            
            const clip = createVRMAnimationClip(vrmAnimations[0], this.vrm);
            if (!clip) throw new Error('Failed to create clip');

            const action = this.mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            action.reset();
            action.setEffectiveWeight(1.0);
            action.play();
            action.fadeIn(fadeDuration);

            this.currentOneShotAction = action;

            this._onOneShotFinished = (e) => {
                if (e.action === action) {
                    console.log(`[IdleManager] One-Shot finished: ${url}`);
                    this.mixer.removeEventListener('finished', this._onOneShotFinished);
                    this._onOneShotFinished = null;
                    
                    this.resetToIdle();
                }
            };
            this.mixer.addEventListener('finished', this._onOneShotFinished);

        } catch (err) {
            console.error('[IdleManager] Failed to play one-shot:', err);
            this.resetToIdle(); 
        }
    }

    resetToIdle() {
        console.log('[IdleManager] Resetting to Idle state...');
        const fadeDuration = 0.5;

        if (this.currentOneShotAction) {
            this.currentOneShotAction.fadeOut(fadeDuration);
            const oldAction = this.currentOneShotAction;
            setTimeout(() => {
                oldAction.stop(); 
                if (this.currentOneShotAction === oldAction) {
                    this.currentOneShotAction = null;
                }
            }, fadeDuration * 1000);
        }

        if (useVRMAIdleAnimations) {
            this.switchToVRMAMode(fadeDuration);
        } else {
            this.switchToProceduralMode(fadeDuration);
        }
    }

    switchToVRMAMode(fadeInTime = 0.5) {
        this.stopProceduralAnimations();
        this.currentMode = 'vrma';
        this.isActive = true;

        if (this.animationQueue.length > 0) {
            if (!this.currentIdleAction || !this.currentIdleAction.isRunning()) {
                this.playNextVRMAAnimation();
            } else {
                this.currentIdleAction.enabled = true;
                this.currentIdleAction.setEffectiveWeight(1.0);
                this.currentIdleAction.fadeIn(fadeInTime);
            }
        } else {
            this.switchToProceduralMode();
        }
    }

    switchToProceduralMode(fadeInTime = 0.5) {
        this.stopVRMAAnimations();
        this.currentMode = 'procedural';
        this.isActive = true;

        if (this.proceduralIdleAction) {
            this.proceduralIdleAction.enabled = true;
            this.proceduralIdleAction.reset();
            this.proceduralIdleAction.play();
            this.proceduralIdleAction.setEffectiveWeight(1.0); 
            this.proceduralIdleAction.fadeIn(fadeInTime);
        } else {
            this.createProceduralIdleAction();
            if (this.proceduralIdleAction) this.proceduralIdleAction.play();
        }
    }

    stopVRMAAnimations() {
        if (this.currentIdleAction) this.currentIdleAction.fadeOut(0.5);
        if (this.defaultPoseAction) this.defaultPoseAction.fadeOut(0.5);
    }

    stopProceduralAnimations() {
        if (this.proceduralIdleAction) this.proceduralIdleAction.fadeOut(0.5);
    }

    stopAllAnimations() {
        console.log('Stopping all animations...');
        this.isActive = false;
        if (this.currentIdleAction) this.currentIdleAction.stop();
        if (this.proceduralIdleAction) this.proceduralIdleAction.stop();
        if (this.defaultPoseAction) this.defaultPoseAction.stop();
        if (this.currentOneShotAction) this.currentOneShotAction.stop();
        this.currentMode = 'none';
    }
}

// Switch idle animation mode
async function toggleIdleAnimationMode() {
    if (isIdleAnimationModeChanging || !idleAnimationManager) {
        return;
    }
    
    isIdleAnimationModeChanging = true;
    useVRMAIdleAnimations = !useVRMAIdleAnimations;
    
    console.log(`Switching idle animation mode to: ${useVRMAIdleAnimations ? 'VRMA' : 'Procedural'}`);
    
    try {
        if (useVRMAIdleAnimations) {
            // Switch to VRMA animation
            if (idleAnimations.length === 0) {
                console.log('Loading VRMA animations...');
                await loadIdleAnimations();
            }
            
            if (idleAnimationManager) {
                idleAnimationManager.setAnimationQueue(idleAnimations);
                idleAnimationManager.switchToVRMAMode();
            }
        } else {
            // Switch to procedural animation
            if (idleAnimationManager) {
                idleAnimationManager.switchToProceduralMode();
            }
        }
        
        // Update button state
        updateIdleAnimationButton();
        
    } catch (error) {
        console.error('Error switching idle animation mode:', error);
        // Restore state if an error occurs
        useVRMAIdleAnimations = !useVRMAIdleAnimations;
    } finally {
        isIdleAnimationModeChanging = false;
    }
}

// Update idle animation button state
async function updateIdleAnimationButton() {
    const button = document.getElementById('idle-animation-handle');
    if (button) {
        button.style.color = useVRMAIdleAnimations ?  '#ff6b35': '#28a745';
        button.innerHTML = useVRMAIdleAnimations ? 
            '<i class="fas fa-stop"></i>' : 
            '<i class="fas fa-play"></i>';
        button.title = useVRMAIdleAnimations ? 
            await t('UsingVRMAAnimations') || 'Using VRMA Animations' : 
            await t('UsingProceduralAnimations') || 'Using Procedural Animations';
    }
}

// Get all VRMA files in the animation directory
async function getAnimationFiles() {
  try {
    const cfg = await fetchVRMConfig();
    const motionPool = [...(cfg.defaultMotions || []), ...(cfg.userMotions || [])];

    // Get the selected motions
    const urls = (cfg.selectedMotionIds || [])
      .map(id => motionPool.find(m => m.id === id))
      .filter(Boolean)
      .map(item => {
        try {
          // Resolve relative paths using window.location.origin
          const urlObj = new URL(item.path, window.location.origin);
          urlObj.protocol = window.location.protocol;
          urlObj.host     = window.location.host;
          return urlObj.toString();
        } catch (e) {
          console.error(`[AnimationFiles] Cannot construct a valid URL: ${item.path}`, e);
          return null;
        }
      })
      .filter(u => u !== null); // Remove invalid URLs

    // If no motion is selected, return the default fallback animation
    if (urls.length === 0) {
      const base = `${window.location.protocol}//${window.location.host}/vrm/animations/`;
      const fallback = [
        "greeting.vrma", "akimbo.vrma", "play_fingers.vrma", "scratch_head.vrma",
        "stretch.vrma", "shoot.vrma", "peace_sign.vrma", "show_full_body.vrma",
        "squat.vrma", "model_pose.vrma", "spin.vrma"
      ].map(file => base + file);
      
      console.warn('No valid motions selected; using fallback animations from the default directory');
      return fallback;
    }

    return urls;

  } catch (err) {
    console.error('Failed to retrieve animation list:', err);
    return [`${window.location.protocol}//${window.location.host}/vrm/animations/greeting.vrma`];
  }
}

// Load a VRMA animation file
async function loadVRMAAnimation(url) {
    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                const vrmAnimations = gltf.userData.vrmAnimations;
                if (vrmAnimations && vrmAnimations.length > 0) {
                    resolve(vrmAnimations[0]);
                } else {
                    reject(new Error('No VRM animation found in file'));
                }
            },
            (progress) => {
                console.log(`Loading animation ${url}...`, 100.0 * (progress.loaded / progress.total), '%');
            },
            (error) => {
                console.error(`Error loading animation ${url}:`, error);
                reject(error);
            }
        );
    });
}

// Load all idle animations
async function loadIdleAnimations() {
    if (isLoadingAnimations) return;
    isLoadingAnimations = true;
    
    console.log('Loading idle animations...');
    
    try {
        const animationFiles = await getAnimationFiles();
        idleAnimations = [];
        
        for (const file of animationFiles) {
            try {
                const animation = await loadVRMAAnimation(file);
                idleAnimations.push({
                    animation: animation,
                    file: file,
                    name: file.split('/').pop().replace('.vrma', '')
                });
                console.log(`Loaded animation: ${file}`);
            } catch (error) {
                console.warn(`Failed to load animation: ${file}`, error);
            }
        }
        
        console.log(`Successfully loaded ${idleAnimations.length} idle animations`);
        
    } catch (error) {
        console.error('Error loading idle animations:', error);
    } finally {
        isLoadingAnimations = false;
    }
}

async function startIdleAnimationLoop() {
    if (!idleAnimationManager) {
        console.error('Idle animation manager not available');
        return;
    }
    
    console.log(`Starting idle animation with mode: ${useVRMAIdleAnimations ? 'VRMA' : 'Procedural'}`);
    
    if (useVRMAIdleAnimations) {
        // Use VRMA animation
        if (idleAnimations.length === 0) {
            console.log('Loading VRMA animations...');
            await loadIdleAnimations();
        }
        
        if (idleAnimations.length > 0) {
            idleAnimationManager.setAnimationQueue(idleAnimations);
            idleAnimationManager.switchToVRMAMode();
        } else {
            console.warn('No VRMA animations available, falling back to procedural');
            idleAnimationManager.switchToProceduralMode();
        }
    } else {
        // Use procedural animation
        idleAnimationManager.switchToProceduralMode();
    }
}

// Procedural idle animation as fallback
function useProceduralIdleAnimation() {
    if (!currentVrm) return;
    
    const idleClip = createIdleClip(currentVrm);
    idleAction = currentMixer.clipAction(idleClip);
    idleAction.setLoop(THREE.LoopRepeat);
    idleAction.play();
}

// Generate the idle animation clip (corrected version)
function createIdleClip(vrm) {
    const tracks = [];
    const fps = 30;
    const duration = 600;
    const frameCount = duration * fps;
    
    // Generate the time array
    const times = [];
    for (let i = 0; i <= frameCount; i++) {
        times.push(i / fps);
    }
    
    // Detect the VRM version
    const v = (vrm.meta.metaVersion === '1') ? 1 : -1;
    
    // List bones to animate
    const animatedBones = [
        'spine', 'chest', 'neck', 'head',
        'leftUpperArm', 'leftLowerArm', 'leftHand', 'leftShoulder',
        'rightUpperArm', 'rightLowerArm', 'rightHand', 'rightShoulder'
    ];
    
    animatedBones.forEach(boneName => {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!bone) return;
        
        const values = [];
        
        // Calculate rotation values for each time point
        times.forEach(time => {
            let euler = new THREE.Euler(0, 0, 0);
            
            // Use periodic functions to ensure the same values at t=0 and t=duration
            const cycleTime = (time / duration) * 200 * Math.PI; // 0 to 2 pi per cycle; multiplier determines the number of cycles
            
            switch (boneName) {
                case 'spine':
                    euler.set(
                        Math.sin(cycleTime * 0.6 + idleOffsets.body) * 0.02,     
                        0,                                                    
                        Math.cos(cycleTime * 0.5 + idleOffsets.body) * 0.015    
                    );
                    break;
                    
                case 'chest':
                    euler.set(
                        Math.sin(cycleTime * 0.6 + idleOffsets.body) * 0.01,     
                        0,                                                    
                        Math.cos(cycleTime * 0.5 + idleOffsets.body) * 0.0075   
                    );
                    break;
                    
                case 'neck':
                    euler.set(
                        Math.cos(cycleTime * 1.2 + idleOffsets.head) * 0.01,     
                        Math.sin(cycleTime * 1.5 + idleOffsets.head) * 0.02,     
                        0                                                     
                    );
                    break;
                    
                case 'head':
                    euler.set(
                        Math.sin(cycleTime * 1.0 + idleOffsets.head) * 0.02,     
                        Math.sin(cycleTime * 1.5 + idleOffsets.head) * 0.03,     
                        Math.cos(cycleTime * 0.8 + idleOffsets.head) * 0.01      
                    );
                    break;
                    
                case 'leftUpperArm':
                    euler.set(
                        Math.cos(cycleTime * 0.7 + idleOffsets.leftArm) * 0.03, 
                        Math.sin(cycleTime * 0.6 + idleOffsets.leftArm) * 0.02,  
                        -0.4 * Math.PI * v + Math.sin(cycleTime * 1.5 + idleOffsets.leftArm) * 0.03
                    );
                    break;
                    
                case 'leftLowerArm':
                    euler.set(
                        0,                                                   
                        0,                                                   
                        -Math.sin(cycleTime * 1.5 + idleOffsets.leftArm) * 0.02 
                    );
                    break;
                    
                case 'leftHand':
                    euler.set(
                        0.05,                                                
                        0,                                                   
                        0.1 * v + Math.sin(cycleTime * 1.2 + idleOffsets.leftArm) * 0.015 
                    );
                    break;
                    
                case 'leftShoulder':
                    euler.set(
                        0,                                                   
                        0,                                                   
                        Math.sin(cycleTime * 0.7 + idleOffsets.leftArm) * 0.02 
                    );
                    break;
                    
                case 'rightUpperArm':
                    euler.set(
                        Math.cos(cycleTime * 0.8 + idleOffsets.rightArm) * 0.03,  
                        Math.sin(cycleTime * 0.64 + idleOffsets.rightArm) * 0.02, 
                        0.4 * Math.PI * v + Math.sin(cycleTime * 1.5 + idleOffsets.rightArm) * 0.03 
                    );
                    break;
                    
                case 'rightLowerArm':
                    euler.set(
                        0,                                                    
                        0,                                                    
                        Math.sin(cycleTime * 1.5 + idleOffsets.rightArm) * 0.02 
                    );
                    break;
                    
                case 'rightHand':
                    euler.set(
                        0.05,                                                 
                        0,                                                    
                        -0.1 * v + Math.sin(cycleTime * 1.2 + idleOffsets.rightArm) * 0.015 
                    );
                    break;
                    
                case 'rightShoulder':
                    euler.set(
                        0,                                                    
                        0,                                                    
                        Math.sin(cycleTime * 0.8 + idleOffsets.rightArm) * 0.02  
                    );
                    break;
                    
                default:
                    euler.set(0, 0, 0);
                    break;
            }
            
            // Convert Euler angles to quaternions and append them to the values array
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(euler);
            values.push(...quaternion.toArray());
        });
        
        // Create quaternion keyframe tracks
        const track = new THREE.QuaternionKeyframeTrack(
            bone.name + '.quaternion',
            times,
            values
        );
        
        tracks.push(track);
    });
    
    // Create and return the animation clip
    return new THREE.AnimationClip('idle', duration, tracks);
}


function createBreathClip(vrm) {
    const tracks = [];
    const duration = 4; // One breathing cycle every 4 seconds
    const fps = 30;
    const frameCount = duration * fps;
    
    const times = [];
    for (let i = 0; i <= frameCount; i++) {
        times.push(i / fps);
    }
    
    // Breathing scale animation
    const scaleValues = [];
    times.forEach(time => {
        const breathScale = 1 + Math.sin(time * Math.PI / 2) * 0.006; // More natural breathing rhythm
        scaleValues.push(breathScale, breathScale, breathScale);
    });
    
    const scaleTrack = new THREE.VectorKeyframeTrack(
        vrm.scene.name + '.scale',
        times,
        scaleValues
    );
    
    tracks.push(scaleTrack);
    return new THREE.AnimationClip('breath', duration, tracks);
}

function createBlinkClip(vrm) {
    if (!vrm.expressionManager) return null;
    
    const tracks = [];
    const duration = 6; // 6-second cycle with random intervals
    const fps = 30;
    const frameCount = duration * fps;
    
    const times = [];
    for (let i = 0; i <= frameCount; i++) {
        times.push(i / fps);
    }
    
    // Create a blink pattern with blinks at selected times
    const blinkValues = [];
    times.forEach(time => {
        let blinkValue = 0;
        
        // Single blink at 1.5 seconds
        if (time >= 1.5 && time <= 1.6) {
            const progress = (time - 1.5) / 0.2;
            blinkValue = Math.sin(progress * Math.PI);
        }
        // Double blink at 4 seconds
        else if (time >= 3.8 && time <= 4.4) {
            const localTime = time - 3.8;
            if (localTime < 0.15) {
                blinkValue = Math.sin((localTime / 0.15) * Math.PI);
            } else if (localTime > 0.25 && localTime < 0.4) {
                blinkValue = Math.sin(((localTime - 0.25) / 0.15) * Math.PI);
            }
        }
        
        blinkValues.push(blinkValue);
    });
    
    const blinkTrack = new THREE.NumberKeyframeTrack(
        vrm.expressionManager.getExpressionTrackName('blink'),
        times,
        blinkValues
    );
    
    tracks.push(blinkTrack);
    return new THREE.AnimationClip('blink', duration, tracks);
}

/**
 * Stop animation and audio for a specified speech chunk
 * @param {string|number} chunkId Speech chunk ID
 */
function stopChunkAnimation(chunkId) {
    const chunkState = chunkAnimations.get(chunkId);
    if (!chunkState) return;

    console.log(`Stopping animation and audio for chunk ${chunkId}`);

    if (chunkState.animationId) {
        cancelAnimationFrame(chunkState.animationId);
    }
    if (chunkState.audio) {
        chunkState.audio.pause();
        chunkState.audio.removeAttribute('src'); // Fully release resources
        chunkState.audio.load();
    }
    if (chunkState.audioSource) {
        chunkState.audioSource.disconnect();
    }

    chunkAnimations.delete(chunkId);

    // Reset expressions if all speech chunks have finished
    if (chunkAnimations.size === 0 && currentVrm && currentVrm.expressionManager) {
        console.log('All speech chunks finished; resetting expression.');
        currentVrm.expressionManager.resetValues();
        currentVrm.expressionManager.setValue('neutral', 1.0);
    }
}

/**
 * Stop all currently playing speech animations
 */
function stopAllChunkAnimations() {
    console.log('Stopping all lip-sync animations.');
    for (const chunkId of chunkAnimations.keys()) {
        stopChunkAnimation(chunkId);
    }
    chunkAnimations.clear();
    if (currentVrm && currentVrm.expressionManager) {
        currentVrm.expressionManager.resetValues();
        currentVrm.expressionManager.setValue('neutral', 1.0);
    }
}

/**
 * Lip synchronization based on formants F1 and F2 (corrected version)
 * Determine mouth shape from the positions of the two main spectral energy peaks (F1 and F2) in the vowel triangle
 */
function startChunkAnimation(chunkId, chunkState) {
    if (!chunkState || !chunkState.isPlaying || !chunkState.analyser) {
        return;
    }

    const analyser = chunkState.analyser;
    // Increase FFT precision because formant detection requires higher frequency resolution
    analyser.fftSize = 1024; // The previous size of 256 was too small to distinguish F1 and F2
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const sampleRate = currentAudioContext.sampleRate;
    
    // Smoothing interpolation variables
    let currentBlends = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    
    // Sensitivity settings (adjust for microphone or TTS volume)
    const SENSITIVITY = 1.0; // Increase this value if mouth movement is too small
    const NOISE_GATE = 15;   // Noise floor threshold

    function getFormant(minFreq, maxFreq) {
        // Convert frequency to an array index
        const nyquist = sampleRate / 2;
        const startIndex = Math.floor((minFreq / nyquist) * bufferLength);
        const endIndex = Math.floor((maxFreq / nyquist) * bufferLength);
        
        let maxAmp = -Infinity;
        let maxIndex = -1;
        
        // Find the strongest peak in the specified frequency range
        for (let i = startIndex; i <= endIndex; i++) {
            if (dataArray[i] > maxAmp) {
                maxAmp = dataArray[i];
                maxIndex = i;
            }
        }
        
        // Return the frequency and strength of the peak
        return {
            freq: (maxIndex / bufferLength) * nyquist,
            amp: maxAmp
        };
    }

    function animateChunk() {
        const currentState = chunkAnimations.get(chunkId);
        if (!currentState || !currentState.isPlaying) {
            // Reset to zero when stopped
            if (currentVrm && currentVrm.expressionManager) {
                ['aa', 'ih', 'ou', 'ee', 'oh'].forEach(v => currentVrm.expressionManager.setValue(v, 0));
            }
            return;
        }

        currentState.animationId = requestAnimationFrame(animateChunk);

        // 1. Get frequency-domain data
        analyser.getByteFrequencyData(dataArray);

        // 2. Detect formants
        // F1 range: 200-1000 Hz (mouth opening)
        // F2 range: 1000-3000 Hz (front/back tongue position)
        const f1 = getFormant(200, 1000);
        const f2 = getFormant(1000, 3000);

        // 3. Calculate overall volume to control mouth opening
        // Calculate average energy only in the main speech band (200-4000 Hz)
        let vocalEnergy = 0;
        const startBin = Math.floor((200 / (sampleRate/2)) * bufferLength);
        const endBin = Math.floor((4000 / (sampleRate/2)) * bufferLength);
        for(let i=startBin; i<endBin; i++) vocalEnergy += dataArray[i];
        const avgVol = vocalEnergy / (endBin - startBin);

        // 4. Mapping logic (vowel triangle)
        let target = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        
        if (avgVol > NOISE_GATE) {
            // Normalize intensity
            const intensity = Math.min(1.0, (avgVol / 255) * SENSITIVITY);
            
            // --- Core algorithm: identify vowels from F1/F2 coordinates ---
            // Values are based on general speech statistics and may need fine-tuning
            
            if (f1.freq > 600) {
                // High F1: wide-open mouth, A (aa)
                // Similar to the vowel ah
                target.aa = intensity;
            } 
            else if (f1.freq < 450 && f2.freq > 1800) {
                // Low F1 (closed mouth), high F2 (front tongue): I (ih)
                // Similar to the vowel ee
                target.ih = intensity;
                // The I vowel often includes a small amount of E
                target.ee = intensity * 0.3; 
            }
            else if (f1.freq < 450 && f2.freq < 1100) {
                // Low F1 (closed mouth), low F2 (back tongue): U (ou)
                // Similar to the vowel oo
                target.ou = intensity;
            }
            else if (f2.freq > 1600) {
                // Remaining high F2: E (ee)
                // Similar to the vowel in yes
                target.ee = intensity;
                target.ih = intensity * 0.2;
            }
            else {
                // Otherwise O (oh) or neutral vowel
                // Similar to the vowel oh
                target.oh = intensity;
                target.ou = intensity * 0.3;
            }
        }

        // 5. Apply to VRM
        if (currentVrm && currentVrm.expressionManager) {
            // Expression suppression logic
            const expression = chunkState.expression;
            let limit = 1.0;
            if (expression && ['happy', 'surprised'].includes(expression)) {
                limit = 0.5; 
            }

            if (expression) {
                // Common expressions exclude blink to avoid interfering with automatic blinking unless explicitly requested
                const EMOTIONS = ['surprised', 'happy', 'angry', 'sad', 'neutral', 'relaxed'];
                
                // For an emotional expression, set it to 1.0 and reset other emotions to 0.0 to prevent unintended mixed expressions
                if (EMOTIONS.includes(expression)) {
                    EMOTIONS.forEach(exp => {
                        currentVrm.expressionManager.setValue(exp, exp === expression ? 1.0 : 0.0);
                    });
                } else {
                    // Apply specific expressions such as blink directly
                    currentVrm.expressionManager.setValue(expression, 1.0);
                }
            }

            ['aa', 'ih', 'ou', 'ee', 'oh'].forEach(v => {
                const t = target[v] * limit;
                const c = currentBlends[v];
                // Dynamic smoothing: fast opening (0.5), slow closing (0.1)
                const smooth = t > c ? 0.5 : 0.1; 
                currentBlends[v] = c + (t - c) * smooth;
                
                currentVrm.expressionManager.setValue(v, currentBlends[v]);
            });
        }
    }

    console.log(`Chunk ${chunkId}: Starting formant-based lip sync`);
    chunkState.animationId = requestAnimationFrame(animateChunk);
}

/**
 * Complete playback function with formant-based F1/F2 lip synchronization
 * Adapted to the Promise queue to preserve playback order and all core algorithms
 */
async function startLipSyncForChunk(data) {
    return new Promise(async (resolve) => {
        const chunkId = data.chunkIndex;

        // 1. Initialize Web Audio
        if (!currentAudioContext) {
            currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (currentAudioContext.state === 'suspended') {
            await currentAudioContext.resume();
        }

        // 2. Check motion ID
        const incomingExpressions = data.expressions || [];
        if (idleAnimationManager) {
            const foundMotionId = incomingExpressions.find(exp => motionUrlMap.has(exp));
            if (foundMotionId) {
                const motionUrl = motionUrlMap.get(foundMotionId);
                if (motionUrl) {
                    console.log(`[LipSync] Triggering motion: ${foundMotionId}`);
                    idleAnimationManager.playOneShotAnimation(motionUrl);
                }
            }
        }

        // 3. Process expressions (blend shapes)
        const ALLOW_EXPS = ['surprised','happy','angry','sad','neutral','relaxed','blink','blinkLeft','blinkRight'];
        const hitExpression = incomingExpressions.find(e => ALLOW_EXPS.includes(e));

        // 4. Create playback state
        const chunkState = {
            isPlaying: true,
            animationId: null,
            audio: new Audio(data.audioDataUrl),
            audioSource: null,
            analyser: currentAudioContext.createAnalyser(),
            expression: hitExpression,
        };
        chunkAnimations.set(chunkId, chunkState);

        const { audio, analyser } = chunkState;
        
        // 5. Set analyzer resolution for F1/F2
        analyser.fftSize = 1024; 
        analyser.smoothingTimeConstant = 0.3;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const sampleRate = currentAudioContext.sampleRate;

        // 6. Connect audio
        audio.crossOrigin = 'anonymous';
        const audioSource = currentAudioContext.createMediaElementSource(audio);
        audioSource.connect(analyser);
        analyser.connect(currentAudioContext.destination);
        chunkState.audioSource = audioSource;

        // 7. Internal function to find formants
        function getFormant(minFreq, maxFreq) {
            const nyquist = sampleRate / 2;
            const startIndex = Math.floor((minFreq / nyquist) * bufferLength);
            const endIndex = Math.floor((maxFreq / nyquist) * bufferLength);
            let maxAmp = -Infinity;
            let maxIndex = -1;
            for (let i = startIndex; i <= endIndex; i++) {
                if (dataArray[i] > maxAmp) {
                    maxAmp = dataArray[i];
                    maxIndex = i;
                }
            }
            return { freq: (maxIndex / bufferLength) * nyquist, amp: maxAmp };
        }

        // 8. Internal smoothing interpolation variables
        let currentBlends = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        const SENSITIVITY = 1.0; 
        const NOISE_GATE = 15;

        // 9. Animation loop (core algorithm)
        function animateChunk() {
            const currentState = chunkAnimations.get(chunkId);
            if (!currentState || !currentState.isPlaying) {
                if (currentVrm && currentVrm.expressionManager) {
                    ['aa', 'ih', 'ou', 'ee', 'oh'].forEach(v => currentVrm.expressionManager.setValue(v, 0));
                }
                return;
            }

            currentState.animationId = requestAnimationFrame(animateChunk);
            analyser.getByteFrequencyData(dataArray);

            const f1 = getFormant(200, 1000);
            const f2 = getFormant(1000, 3000);

            let vocalEnergy = 0;
            const startBin = Math.floor((200 / (sampleRate/2)) * bufferLength);
            const endBin = Math.floor((4000 / (sampleRate/2)) * bufferLength);
            for(let i=startBin; i<endBin; i++) vocalEnergy += dataArray[i];
            const avgVol = vocalEnergy / (endBin - startBin);

            let target = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
            
            if (avgVol > NOISE_GATE) {
                const intensity = Math.min(1.0, (avgVol / 255) * SENSITIVITY);
                if (f1.freq > 600) {
                    target.aa = intensity;
                } else if (f1.freq < 450 && f2.freq > 1800) {
                    target.ih = intensity;
                    target.ee = intensity * 0.3; 
                } else if (f1.freq < 450 && f2.freq < 1100) {
                    target.ou = intensity;
                } else if (f2.freq > 1600) {
                    target.ee = intensity;
                    target.ih = intensity * 0.2;
                } else {
                    target.oh = intensity;
                    target.ou = intensity * 0.3;
                }
            }

            if (currentVrm && currentVrm.expressionManager) {
                // Expression constraints
                const expression = currentState.expression;
                let limit = (expression && ['happy', 'surprised'].includes(expression)) ? 0.5 : 1.0;

                if (expression) {
                    const EMOTIONS = ['surprised', 'happy', 'angry', 'sad', 'neutral', 'relaxed'];
                    if (EMOTIONS.includes(expression)) {
                        EMOTIONS.forEach(exp => {
                            currentVrm.expressionManager.setValue(exp, exp === expression ? 1.0 : 0.0);
                        });
                    } else {
                        currentVrm.expressionManager.setValue(expression, 1.0);
                    }
                }

                ['aa', 'ih', 'ou', 'ee', 'oh'].forEach(v => {
                    const t = target[v] * limit;
                    const c = currentBlends[v];
                    const smooth = t > c ? 0.5 : 0.1; 
                    currentBlends[v] = c + (t - c) * smooth;
                    currentVrm.expressionManager.setValue(v, currentBlends[v]);
                });
            }
        }

        // 10. Bind audio events
        audio.onended = () => {
            stopChunkAnimation(chunkId);
            resolve(); // Resolve the Promise when playback ends so the queue can advance
        };

        audio.onerror = (err) => {
            console.error(`Chunk ${chunkId} Playback error:`, err);
            stopChunkAnimation(chunkId);
            resolve(); // Resolve even on error so the queue does not stall
        };

        // 11. Start playback and animation
        try {
            await audio.play();
            chunkState.animationId = requestAnimationFrame(animateChunk);
        } catch (error) {
            console.error("Audio.play failed:", error);
            stopChunkAnimation(chunkId);
            resolve();
        }
    });
}

let VRMname = await getVRMname();
showModelSwitchingIndicator(VRMname);
loader.load(

    // URL of the VRM you want to load
    vrmPath,

    // called when the resource is loaded
    ( gltf ) => {

        const vrm = gltf.userData.vrm;
        currentMixer = new THREE.AnimationMixer(vrm.scene); // Create the animation mixer
        isVRM1 = vrm.meta.metaVersion === '1';
        VRMUtils.rotateVRM0(vrm); // Rotate the VRM to face forward
        // calling these functions greatly improves the performance
        // VRMUtils.removeUnnecessaryVertices( gltf.scene );

        // Add material fixes
        // gltf.scene.traverse((obj) => {
        // if (obj.isMesh && obj.material) {
        //     // Correct black edges on transparent materials
        //     if (obj.material.transparent) {
        //         obj.material.alphaTest = 0.01;
        //         obj.material.depthWrite = true;
        //         obj.material.needsUpdate = true;
        //     }
            
        //     // Ensure the correct blending mode
        //     obj.material.blending = THREE.NormalBlending;
        //     obj.material.premultipliedAlpha = false;
            
        //     // Set rendering order
        //     obj.renderOrder = obj.material.transparent ? 1 : 0;
        // }
        // });

        // VRMUtils.combineSkeletons( gltf.scene );
        // VRMUtils.combineMorphs( vrm );

        // Enable SpringBone physics simulation
        if (vrm.springBoneManager) {
            console.log('Spring Bone Manager found:', vrm.springBoneManager);
            // SpringBone updates automatically in vrm.update()
        }


        // Disable frustum culling
        vrm.scene.traverse( ( obj ) => {

            obj.frustumCulled = false;

        } );

        vrm.lookAt.target = camera;

        if (vrm.lookAt.applier) {
            vrm.lookAt.applier.yawLimit = 60.0;   // Maximum horizontal head rotation: 60 degrees
            vrm.lookAt.applier.pitchLimit = 30.0; // Maximum vertical head rotation: 30 degrees
        }

        currentVrm = vrm;
        console.log( vrm );
        currentVrmWrapper.add(vrm.scene); 
        
        // Allow the model to cast shadows
        vrm.scene.traverse((obj) => {
            if (obj.isMesh) {
                obj.castShadow = true;
                obj.receiveShadow = true;   // Keep this if the model should also receive shadows
            }
        });
        // Set a natural pose
        setNaturalPose(vrm);

        if (vrm.expressionManager) {
            vrm.expressionManager.setValue('neutral', 1.0);
        }

        const breathClip = createBreathClip(vrm);
        breathAction = currentMixer.clipAction(breathClip);
        breathAction.setLoop(THREE.LoopRepeat);
        breathAction.play();

        const blinkClip = createBlinkClip(vrm);
        blinkAction = currentMixer.clipAction(blinkClip);
        blinkAction.setLoop(THREE.LoopRepeat);
        blinkAction.play();

        // Create the idle animation manager
        idleAnimationManager = new IdleAnimationManager(vrm, currentMixer);

        // Start the idle animation loop
        startIdleAnimationLoop();

        hideModelSwitchingIndicator();
    },

    (progress) => {
        console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
        // Loading progress can be updated here
        updateModelLoadingProgress(progress.loaded / progress.total);
    },

    (error) => {
        console.error('Error loading model:', error);
        hideModelSwitchingIndicator();
        
        // If loading fails, try returning to the previous model
        if (allModels.length > 1) {
            console.log('Attempting to load fallback model...');
            // Try loading the first model as fallback
            if (currentModelIndex !== 0) {
                switchToModel(0);
            }
        }
    }

);

// Global subtitle state
let subtitleElement = null;
let currentSubtitleChunkIndex = -1;
let subtitleTimeout = null;
let isSubtitleEnabled = true; // Subtitles enabled by default
let isDraggingSubtitle = false;
let subtitleOffsetX = 0;
let subtitleOffsetY = 0;

// Initialize the subtitle element
function initSubtitleElement() {
    subtitleElement = document.createElement('div');
    subtitleElement.id = 'subtitle-container';
    subtitleElement.style.cssText = `
        position: fixed;
        top: 50%;  
        left: 50%;
        width: auto;
        max-width: 80%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border-radius: 8px;
        font-family: 'Arial', sans-serif;
        font-size: 1.2em;
        text-align: center;
        backdrop-filter: blur(10px);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        z-index: 9998;
        white-space: pre-wrap;
        line-height: 1.5;
        cursor: move;
        user-select: none;
        min-width: 100px;
        max-width: 80%;
        width: max-content;
    `;

    // Add drag event listeners
    subtitleElement.addEventListener('mousedown', startDragSubtitle);
    document.addEventListener('mousemove', dragSubtitle);
    document.addEventListener('mouseup', endDragSubtitle);

    document.body.appendChild(subtitleElement);
}

// Improved drag handling
function startDragSubtitle(e) {
    if (!isSubtitleEnabled) return;
    
    isDraggingSubtitle = true;
    
    // Get the subtitle element's initial position
    const rect = subtitleElement.getBoundingClientRect();
    
    // Calculate the mouse offset relative to the subtitle center
    subtitleOffsetX = e.clientX - (rect.left + rect.width / 2);
    subtitleOffsetY = e.clientY - rect.top;
    
    // 禁用过渡效果
    subtitleElement.style.transition = 'none';
}

function dragSubtitle(e) {
    if (isDraggingSubtitle) {
        // 计算字幕中心点的目标位置
        const centerX = e.clientX - subtitleOffsetX;
        const centerY = e.clientY - subtitleOffsetY;
        
        // 限制在窗口范围内，保持水平居中
        const halfWidth = subtitleElement.offsetWidth / 2;
        const clampedX = Math.max(halfWidth, Math.min(centerX, window.innerWidth - halfWidth));
        
        // 设置位置时保持水平居中
        subtitleElement.style.left = `${clampedX}px`;
        subtitleElement.style.transform = 'translateX(-50%)'; // 水平居中
        
        // 垂直位置保持不变
        const maxY = window.innerHeight - subtitleElement.offsetHeight;
        const clampedY = Math.max(0, Math.min(centerY, maxY));
        
        subtitleElement.style.top = `${clampedY}px`;
        subtitleElement.style.bottom = 'auto'; // 取消底部定位
    }
}

function endDragSubtitle() {
    if (isDraggingSubtitle) {
        isDraggingSubtitle = false;
        subtitleElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    }
}

// 修改字幕显示/隐藏功能
function toggleSubtitle(enable) {
    isSubtitleEnabled = enable;
    if (subtitleElement) {
        subtitleElement.style.display = enable ? 'block' : 'none';
    }
}

/**
 * 提取出的尺寸调整逻辑
 */
function adjustSubtitleSize() {
    if (!subtitleElement) return;
    const maxWidth = window.innerWidth * 0.8;
    subtitleElement.style.width = 'max-content';
    subtitleElement.style.minWidth = '100px';
    
    const rect = subtitleElement.getBoundingClientRect();
    if (rect.width > maxWidth) {
        subtitleElement.style.width = `${maxWidth}px`;
    }
}


let vmcLastSent = 0;
const VMC_SEND_INTERVAL = 1000 / 30;          // 30 fps
const VMC_BONES = [                           // VMC 标准骨骼列表
  'hips','spine','chest','upperChest','neck','head',
  'leftShoulder','leftUpperArm','leftLowerArm','leftHand',
  'rightShoulder','rightUpperArm','rightLowerArm','rightHand',
  'leftUpperLeg','leftLowerLeg','leftFoot','leftToes',
  'rightUpperLeg','rightLowerLeg','rightFoot','rightToes',
  // 手指（可选）
  'leftThumbProximal','leftThumbIntermediate','leftThumbDistal',
  'leftIndexProximal','leftIndexIntermediate','leftIndexDistal',
  'leftMiddleProximal','leftMiddleIntermediate','leftMiddleDistal',
  'leftRingProximal','leftRingIntermediate','leftRingDistal',
  'leftLittleProximal','leftLittleIntermediate','leftLittleDistal',
  'rightThumbProximal','rightThumbIntermediate','rightThumbDistal',
  'rightIndexProximal','rightIndexIntermediate','rightIndexDistal',
  'rightMiddleProximal','rightMiddleIntermediate','rightMiddleDistal',
  'rightRingProximal','rightRingIntermediate','rightRingDistal',
  'rightLittleProximal','rightLittleIntermediate','rightLittleDistal'
];

function getVMCBoneData() {
  if (!currentVrm?.humanoid) return [];

  const boneData = [];
  
  // VMC 接收端通常期望 Hips 的位置是相对于地面的绝对高度
  // 我们需要获取 Hips 的世界坐标
  const hipsNode = currentVrm.humanoid.getNormalizedBoneNode('hips');
  let rootY = 0;
  if (hipsNode) {
      const worldPos = new THREE.Vector3();
      hipsNode.getWorldPosition(worldPos);
      // 如果模型被缩放过，或者场景有位移，这里要用世界坐标
  }

  for (const name of VMC_BONES) {
    const node = currentVrm.humanoid.getNormalizedBoneNode(name);
    if (!node) continue;

    // 获取相对于父级的旋转（局部旋转），因为 VMC 传输的是 Local Rotation
    // 注意：Hips 需要特殊处理，它通常传输世界位置
    
    // 1. 位置处理 (Position)
    // 只有 Hips 需要传位置，其他骨骼位置通常由骨骼长度决定（VMC接收端会忽略非Hips的位置，或者用来缩放）
    // 为了兼容性，我们只对 Hips 传真实位置，其他传 0 (或者传 node.position 也行，但要注意转换)
    
    let x = node.position.x;
    let y = node.position.y;
    let z = node.position.z;

    // ★ 关键坐标系转换：ThreeJS(右手) -> Unity(左手)
    // Position: X 取反
    const vmcPos = { x: -x, y: y, z: z };

    // 2. 旋转处理 (Rotation)
    // ThreeJS: x, y, z, w
    // Unity:   x, -y, -z, w (通常转换公式)
    
    let qx = node.quaternion.x;
    let qy = node.quaternion.y;
    let qz = node.quaternion.z;
    let qw = node.quaternion.w;

    if (!isVRM1) {
        qx = -qx;
        qz = -qz;
    }

    const vmcRot = { 
        x: qx, 
        y: -qy, 
        z: -qz, 
        w: qw 
    };

    boneData.push({
        name: name,
        pos: vmcPos,
        rot: vmcRot
    });
  }
  return boneData;
}

// VRM1 → VRM0（VMC 事实标准）
const VRM1_TO_VMC0 = {
  happy:  'Joy',
  angry:  'Angry',
  sad:    'Sorrow',
  relaxed:'Fun',
  aa:     'A',
  ih:     'I',
  ou:     'U',
  ee:     'E',
  oh:     'O',
  blinkLeft:  'Blink_L',
  blinkRight: 'Blink_R',
  blink:      'Blink',
  surprised:  'Surprised',
  neutral:    'Neutral',
  lookDown:   'LookDown',
  lookUp:     'LookUp',
  lookLeft:   'LookLeft',
  lookRight:  'LookRight'
};

// 需要同步的表情（按需删减）
const VMC_BLEND_SHAPES = [
  // 五元音
  'aa','ee','ih','oh','ou',
  'blink', 'blinkLeft', 'blinkRight',
  'surprised','happy','angry', 'sad', 'neutral', 'relaxed',
  'lookDown','lookUp','lookLeft','lookRight'
];

let lastBlendWeights = {}; // 节流：变化了才发



function getVMCBlendData() {
  if (!currentVrm?.expressionManager) return [];
  
  const blendData = [];
  const mgr = currentVrm.expressionManager;

  for (const vrmName of VMC_BLEND_SHAPES) {
    const weight = mgr.getValue(vrmName);
    if (weight === undefined) continue;

    const vmcName = VRM1_TO_VMC0[vrmName];
    if (!vmcName) continue;
    
    // 这里为了保证数据完整，Warudo 建议每帧都发，或者至少变化时发
    // 如果为了带宽可以做节流，但最好打包发送
    blendData.push({
        name: vmcName,
        weight: weight
    });
  }
  return blendData;
}
const vmcToVrmBone = {
  LeftIndexIntermediate: 'leftIndexIntermediate',
  RightIndexIntermediate:'rightIndexIntermediate',
  LeftMiddleIntermediate:'leftMiddleIntermediate',
  RightMiddleIntermediate:'rightMiddleIntermediate',
  LeftRingIntermediate:  'leftRingIntermediate',
  RightRingIntermediate: 'rightRingIntermediate',
  LeftLittleIntermediate:'leftLittleIntermediate',
  RightLittleIntermediate:'rightLittleIntermediate',
  LeftThumbIntermediate: 'leftThumbIntermediate',
  RightThumbIntermediate:'rightThumbIntermediate',
  LeftUpperArm:  'leftUpperArm',
  LeftLowerArm:  'leftLowerArm',
  LeftHand:      'leftHand',
  RightUpperArm: 'rightUpperArm',
  RightLowerArm: 'rightLowerArm',
  RightHand:     'rightHand',
  UpperChest:    'upperChest',
  Chest:         'chest',
  Spine:         'spine',
  Hips:          'hips',
  Neck:          'neck',
  Head:          'head',
};

// animate
const clock = new THREE.Clock();
clock.start();
let currentLookYaw = 0;   // 左右偏航角 (Y轴)
let currentLookPitch = 0; // 上下俯仰角 (X轴)

let isPreviewing360 = false;
let debugSphere, debugCamera, debugControls;

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    updatePointerLockMovement(deltaTime);
    const shouldSkipModelUpdate = isModelHiddenByHover && isAutoHideEnabled;

    if (currentVrm && !shouldSkipModelUpdate) {
        // 1. Mixer 更新
        if (currentMixer) {
            currentMixer.update(deltaTime);
        }

        // 2. VMC 接收更新
        if (vmcReceiveEnabled) {
            for (const [vmcName, data] of vmcBoneBuffer) {
                let boneName = vmcToVrmBone[vmcName] ??
                            vmcName.charAt(0).toLowerCase() + vmcName.slice(1);
                
                if (boneName === 'neck' || boneName === 'head') continue;

                const node = currentVrm.humanoid.getNormalizedBoneNode(boneName);
                if (!node) continue;
                if (isVRM1) {
                    node.position.copy(data.position);
                    node.quaternion.copy(data.rotation);
                } else {
                    node.position.copy(data.position);
                    node.quaternion.set(-data.rotation.x, data.rotation.y, -data.rotation.z, data.rotation.w);
                }
            }
        } 

        // 3. 仿生视线追踪 (彻底修复 VRM 0.x 坐标系朝向问题)
        const neck = currentVrm.humanoid.getNormalizedBoneNode('neck');
        const head = currentVrm.humanoid.getNormalizedBoneNode('head');

        if (neck && neck.parent) {
            const parent = neck.parent;
            const targetWorldPos = camera.position.clone();
            
            const localCameraPos = parent.worldToLocal(targetWorldPos.clone());
            const neckLocalPos = neck.position.clone();
            const viewVector = localCameraPos.sub(neckLocalPos);

            if (!isVRM1) {
                viewVector.z = -viewVector.z; 
                viewVector.x = -viewVector.x; 
            }

            const rawTargetYaw = Math.atan2(viewVector.x, viewVector.z);
            const horizontalDist = Math.sqrt(viewVector.x**2 + viewVector.z**2);
            const rawTargetPitch = Math.atan2(viewVector.y, horizontalDist);

            let targetYaw = rawTargetYaw * 0.6;
            let targetPitch = rawTargetPitch * 0.6;

            const yawLimit = THREE.MathUtils.degToRad(45);  
            const pitchUpLimit = THREE.MathUtils.degToRad(40);
            const pitchDownLimit = THREE.MathUtils.degToRad(20);
            const behindLimit = THREE.MathUtils.degToRad(110);

            if (Math.abs(rawTargetYaw) > behindLimit) {
                targetYaw = 0;
                targetPitch = 0;
            } else {
                targetYaw = THREE.MathUtils.clamp(targetYaw, -yawLimit, yawLimit);
                targetPitch = THREE.MathUtils.clamp(targetPitch, -pitchDownLimit, pitchUpLimit);
            }

            const lerpSpeed = 2.0 * deltaTime;
            currentLookYaw = THREE.MathUtils.lerp(currentLookYaw, targetYaw, lerpSpeed);
            currentLookPitch = THREE.MathUtils.lerp(currentLookPitch, targetPitch, lerpSpeed);

            let applyYaw = currentLookYaw;
            let applyPitch = -currentLookPitch; 

            if (!isVRM1) {
                applyYaw = currentLookYaw; 
                applyPitch = currentLookPitch; 
            }

            const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), applyYaw);
            const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), applyPitch);
            qYaw.multiply(qPitch);
            neck.quaternion.copy(qYaw);

            if (head) {
                const qHeadYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), applyYaw * 0.5);
                const qHeadPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), applyPitch * 0.5);
                qHeadYaw.multiply(qHeadPitch);
                head.quaternion.copy(qHeadYaw);
            }
        }

        // 4. VRM 最终更新
        currentVrm.update(deltaTime);
    }

    // --- 渲染逻辑分支 (全景渲染核心) ---
    if (isRenderMode) {
        if (isPreviewing360 && debugCamera) {
            // A. 360 预览模式：使用调试相机旋转查看球体内部
            renderer.render(scene, debugCamera);
        } else {
            // B. 标准全景模式 (2:1 展开图)
            if (cubeCamera) {
                // 渲染前隐藏全景投影平面，防止遮挡立方体相机
                if (panoMesh) panoMesh.visible = false;
                
                // 让立方体相机捕捉 360 度场景
                cubeCamera.update(renderer, scene);
                
                // 恢复投影平面并渲染到屏幕
                if (panoMesh) {
                    panoMesh.visible = true;
                    renderer.render(panoMesh, panoCamera);
                }
            }
        }
    } else {
        // C. 普通模式
        renderer.render(scene, camera);
    }
    
    // 5. VMC 发送逻辑
    const now = performance.now();
    if (window.vmcAPI && (now - vmcLastSent >= VMC_SEND_INTERVAL)) {
        vmcLastSent = now;
        const bones = getVMCBoneData();
        const blends = getVMCBlendData();
        if (bones.length > 0) {
            window.vmcAPI.sendVMCFrame({
                bones: bones,
                blends: blends
            });
        }
    }

    // 6. UI 字幕维护
    if (subtitleElement && !isDraggingSubtitle) {
        const rect = subtitleElement.getBoundingClientRect();
        if (rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
            subtitleElement.style.left = '50%';
            subtitleElement.style.bottom = '30%';
            subtitleElement.style.top = 'auto';
            subtitleElement.style.transform = 'translateX(-50%)';
        }
    }
}

// --- 全景预览切换逻辑：完整对齐高度版本 ---

window.addEventListener('keydown', (e) => {
    // 只有在渲染模式下才响应 V 键
    if (e.key.toLowerCase() === 'v' && isRenderMode) {
        if (!isPreviewing360) {
            // 1. 创建全景调试球体
            // 半径设为 5 即可，不要太大也不要太小
            const geometry = new THREE.SphereGeometry(5, 60, 40);
            geometry.scale(-1, 1, 1); // 翻转球体，从内向外看
            
            const material = new THREE.MeshBasicMaterial({
                map: cubeRenderTarget.texture, // 实时采样全景相机的内容
                side: THREE.BackSide // 确保只渲染内侧
            });
            
            debugSphere = new THREE.Mesh(geometry, material);
            
            // --- 关键同步：球体中心也要设在 1.5m ---
            debugSphere.position.set(0, 1.5, 1);
            scene.add(debugSphere);
            
            // 2. 创建预览用的调试相机
            debugCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
            
            // --- 关键同步：相机位置与 cubeCamera 保持完全一致 ---
            debugCamera.position.set(0, 1.5, 1); 
            
            // 3. 初始化控制器
            debugControls = new OrbitControls(debugCamera, renderer.domElement);
            
            // --- 核心修复：将目标点设在 1.5m，实现平视视角 ---
            debugControls.target.set(0, 1.5, 0); 
            
            debugControls.enableZoom = false; // 禁用缩放，模拟固定点视角
            debugControls.enablePan = false;  // 禁用平移，防止跑出球体
            debugControls.update(); // 必须调用，否则 target 不生效
            
            isPreviewing360 = true;
            console.log("Entering 360 preview mode at 1.5 m eye level");
        } else {
            // 退出预览模式
            if (debugSphere) {
                scene.remove(debugSphere);
                if (debugSphere.geometry) debugSphere.geometry.dispose();
                if (debugSphere.material) debugSphere.material.dispose();
            }
            if (debugControls) {
                debugControls.dispose();
            }
            isPreviewing360 = false;
            console.log("Leaving preview; restoring 2:1 flat output");
        }
    }
});

async function setVMCReceive (enable, syncExpr = false) {
  if (vmcReceiveEnabled!= enable){
    if (enable) {
      // 进入 VMC 模式：停止本地一切动画
      if (idleAnimationManager) idleAnimationManager.stopAllAnimations();
      if (breathAction) breathAction.stop();
      if (blinkAction)  blinkAction.stop();
      if (currentMixer) currentMixer.stopAllAction();
      // 清空缓存，防止旧数据“跳变”
      vmcBoneBuffer.clear();
      vmcBlendBuffer.clear();

      // 开启程序化呼吸和眨眼
      currentMixer = new THREE.AnimationMixer(currentVrm.scene);
      const breathClip = createBreathClip(currentVrm);
      breathAction = currentMixer.clipAction(breathClip);
      breathAction.setLoop(THREE.LoopRepeat);
      breathAction.play();

      const blinkClip = createBlinkClip(currentVrm);
      blinkAction = currentMixer.clipAction(blinkClip);
      blinkAction.setLoop(THREE.LoopRepeat);
      blinkAction.play();


    } else {
      switchToModel(currentModelIndex, true);
    }
  };

  vmcReceiveEnabled = enable;
  vmcSyncExpression = syncExpr;
	console.log(`VMC receive enabled: ${enable}, sync expression: ${syncExpr}`);


};
let pointerLocked = false;          // 当前是否处于 PointerLock 模式
let orbitControlsSaved = null;      // 保存 OrbitControls 实例
let pointerLockControls = null;     // PointerLockControls 实例
const keyState = {};               // 按键记录
const moveSpeed = 5;               // 每秒移动速度（米/秒）

// 监听按键
function onKeyDown(e) {
    keyState[e.code] = true;
}
function onKeyUp(e) {
    keyState[e.code] = false;
}

// 每帧更新相机位置
function updatePointerLockMovement(delta) {
    if (!pointerLocked || !pointerLockControls) return;

    const direction = new THREE.Vector3();
    const head = pointerLockControls.getObject();   // 相机容器

    // 前后
    if (keyState['KeyW']) direction.z -= 1;
    if (keyState['KeyS']) direction.z += 1;
    // 左右
    if (keyState['KeyA']) direction.x -= 1;
    if (keyState['KeyD']) direction.x += 1;
    // 上下
    if (keyState['KeyQ']) direction.y -= 1;
    if (keyState['KeyE']) direction.y += 1;

    if (direction.lengthSq() === 0) return;

    direction.normalize().applyQuaternion(head.quaternion); // 转成世界方向
    head.position.addScaledVector(direction, moveSpeed * delta);
}

// 进入 PointerLock 时绑定事件
function enablePointerLockMovement() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

// 退出 PointerLock 时清理
function disablePointerLockMovement() {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    // 清空按键缓存
    for (const k in keyState) delete keyState[k];
}

const pttStyle = document.createElement('style');
pttStyle.textContent = `
    #ptt-floating-btn {
        position: fixed;
        bottom: 80px; /* 抬高一点防底部小白条 */
        left: 50%;
        transform: translateX(-50%) scale(0);
        width: 80px;   /* 增大尺寸，符合触控 */
        height: 80px;  /* 增大尺寸 */
        background: linear-gradient(135deg, #ff6b35, #ff8c5a);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 16px rgba(255, 107, 53, 0.4); 
        cursor: pointer;
        z-index: 10002;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s;
        user-select: none;
        touch-action: none; /* 必须，防止滑动页面 */
        -webkit-touch-callout: none; /* 防止长按弹出菜单 */
        opacity: 0;
        pointer-events: none;
    }
    #ptt-floating-btn.visible { 
        transform: translateX(-50%) scale(1); 
        opacity: 1;
        pointer-events: auto;
    }
    #ptt-floating-btn:active, #ptt-floating-btn.active { 
        transform: translateX(-50%) scale(0.9); 
        background: #e65c2b; 
    }
    #ptt-floating-btn i { 
        color: white; 
        font-size: 36px; /* 图标放大 */
    }
    .ptt-recording-pulse {
        position: absolute;
        width: 100%; height: 100%;
        border-radius: 50%;
        background: rgba(255, 107, 53, 0.5);
        animation: ptt-pulse-ring 1.2s infinite;
        z-index: -1;
    }
    @keyframes ptt-pulse-ring {
        0% { transform: scale(1); opacity: 0.5; }
        100% { transform: scale(2.2); opacity: 0; }
    }
`;
document.head.appendChild(pttStyle);

// 全局状态
let pttMainWs = null;
let pttAsrWs = null;
let pttMediaRecorder = null;
let pttAudioChunks = [];
let isPttActive = false;
let pttVisible = false;
// 初始化通往主界面的控制 WS
function initPttMainWs() {
    if (pttMainWs && pttMainWs.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    pttMainWs = new WebSocket(`${protocol}//${window.location.host}/ws`);
    pttMainWs.onclose = () => setTimeout(initPttMainWs, 3000);
}

// 初始化 ASR WS
async function initPttAsrWs() {
    if (pttAsrWs && pttAsrWs.readyState === WebSocket.OPEN) return pttAsrWs;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    pttAsrWs = new WebSocket(`${protocol}//${window.location.host}/ws/asr`);
    
    return new Promise((resolve) => {
        pttAsrWs.onopen = () => {
            pttAsrWs.send(JSON.stringify({ type: "init" }));
            resolve(pttAsrWs);
        };
        pttAsrWs.onmessage = (e) => {
            const msg = JSON.parse(e.data);
            if (msg.type === "transcription" && msg.text && msg.is_final) {
                // 识别成功，通过控制 WS 发送给主界面
                if (pttMainWs && pttMainWs.readyState === WebSocket.OPEN) {
                    pttMainWs.send(JSON.stringify({ type: "set_user_input", data: { text: msg.text } }));
                    setTimeout(() => {
                        pttMainWs.send(JSON.stringify({ type: "trigger_send_message", data: {} }));
                    }, 300);
                }
            }
        };
    });
}

// 核心转码：WebM -> 16kHz WAV (Sherpa 专用)
async function pttEncodeWav(blob) {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    
    const wavBuffer = new ArrayBuffer(44 + channelData.length * 2);
    const view = new DataView(wavBuffer);
    
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + channelData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 16000 * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, channelData.length * 2, true);

    for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
}

// 初始化 PTT 按钮与录音逻辑
// 初始化 PTT 按钮与录音逻辑 (支持长按、防快按误触、XR射线)
function setupPttInteraction() {
    const floatingBtn = document.createElement('div');
    floatingBtn.id = 'ptt-floating-btn';
    floatingBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    document.body.appendChild(floatingBtn);

    let isRecordingRequested = false; // 防极快点击导致异步 Bug

    const startRecording = async (e) => {
        if (e.cancelable) e.preventDefault();
        if (isPttActive) return;
        isPttActive = true;
        isRecordingRequested = true;
        pttAudioChunks = [];
        
        floatingBtn.classList.add('active'); // 视觉反馈
        floatingBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><div class="ptt-recording-pulse"></div>';

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // 如果用户松手太快，授权结束后立刻清理，不开始录音
            if (!isRecordingRequested) {
                stream.getTracks().forEach(t => t.stop());
                isPttActive = false;
                floatingBtn.classList.remove('active');
                floatingBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
                return;
            }

            pttMediaRecorder = new MediaRecorder(stream);
            pttMediaRecorder.ondataavailable = (ev) => pttAudioChunks.push(ev.data);
            pttMediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                
                // 只有录到了数据才发送（防秒松手发空包）
                if (pttAudioChunks.length > 0) {
                    const webmBlob = new Blob(pttAudioChunks, { type: 'audio/webm' });
                    const wavBlob = await pttEncodeWav(webmBlob);
                    
                    const ws = await initPttAsrWs();
                    const reader = new FileReader();
                    reader.readAsDataURL(wavBlob);
                    reader.onloadend = () => {
                        ws.send(JSON.stringify({
                            type: 'audio_complete',
                            audio: reader.result.split(',')[1],
                            format: 'wav'
                        }));
                    };
                }
            };
            pttMediaRecorder.start();
        } catch (err) {
            console.error("Mic error:", err);
            isPttActive = false;
            floatingBtn.classList.remove('active');
            floatingBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        }
    };

    const stopRecording = (e) => {
        if (e && e.cancelable) e.preventDefault();
        isRecordingRequested = false;
        if (!isPttActive) return;
        isPttActive = false;
        
        floatingBtn.classList.remove('active');
        floatingBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        
        if (pttMediaRecorder && pttMediaRecorder.state === 'recording') {
            pttMediaRecorder.stop();
        }
    };

    // 使用 Pointer Events，完美兼顾 鼠标、触摸屏、XR射线
    floatingBtn.addEventListener('pointerdown', startRecording);
    floatingBtn.addEventListener('pointerup', stopRecording);
    floatingBtn.addEventListener('pointercancel', stopRecording);
    // 监听全局，防止手指/鼠标滑出按钮区域外松开导致没停止
    window.addEventListener('pointerup', stopRecording);
    
    initPttMainWs();
}

let isTextInputReady = false;
function setupTextInteraction() {
    if (isTextInputReady) return;
    isTextInputReady = true;

    const textInputContainer = document.createElement('div');
    textInputContainer.id = 'text-input-container';
    textInputContainer.style.cssText = `
        position: fixed;
        bottom: 20px; /* 错开在橙色 PTT 按钮下方 */
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(10px);
        padding: 8px 16px;
        border-radius: 24px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        width: 80%;
        max-width: 500px;
        transition: opacity 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        opacity: 0;
        pointer-events: none;
    `;

    const textInputField = document.createElement('input');
    textInputField.id = 'text-input-field';
    textInputField.type = 'text';
    textInputField.placeholder = 'Enter a message to chat...';
    textInputField.style.cssText = `
        flex: 1;
        background: transparent;
        border: none;
        color: white;
        font-size: 15px;
        outline: none;
        padding: 8px 4px;
    `;

    // 隔离事件：防止输入框打字时触发3D场景漫游等快捷键 (如 W, A, S, D, T, R等)
    ['keydown', 'keyup', 'keypress'].forEach(evt => {
        textInputField.addEventListener(evt, (e) => {
            e.stopPropagation();
            if (evt === 'keydown' && e.key === 'Enter') {
                e.preventDefault();
                sendTextInputMessage();
            }
        });
    });

    const textSendBtn = document.createElement('button');
    textSendBtn.id = 'text-send-btn';
    textSendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    textSendBtn.style.cssText = `
        background: #ff6b35;
        color: white;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin-left: 8px;
        transition: transform 0.2s, background 0.2s;
        outline: none;
    `;
    textSendBtn.addEventListener('mouseenter', () => { textSendBtn.style.transform = 'scale(1.1)'; textSendBtn.style.background = '#e65c2b'; });
    textSendBtn.addEventListener('mouseleave', () => { textSendBtn.style.transform = 'scale(1)'; textSendBtn.style.background = '#ff6b35'; });
    textSendBtn.addEventListener('click', sendTextInputMessage);

    textInputContainer.appendChild(textInputField);
    textInputContainer.appendChild(textSendBtn);
    document.body.appendChild(textInputContainer);

    function sendTextInputMessage() {
        const text = textInputField.value.trim();
        if (!text) return;
        if (pttMainWs && pttMainWs.readyState === WebSocket.OPEN) {
            // 1. 发送用户输入的文本
            pttMainWs.send(JSON.stringify({ type: "set_user_input", data: { text: text } }));
            // 2. 稍微延迟确保主程序录入后，触发对话生成指令
            setTimeout(() => {
                pttMainWs.send(JSON.stringify({ type: "trigger_send_message", data: {} }));
            }, 300);
            textInputField.value = ''; 
        } else {
            console.warn("WebSocket disconnected; attempting to reconnect...");
            initPttMainWs();
        }
    }
    
    // 阻止点击面板时触发父级的交互折叠事件等
    textInputContainer.addEventListener('mousedown', (e) => e.stopPropagation());
    textInputContainer.addEventListener('touchstart', (e) => e.stopPropagation(), {passive: true});
}

const btn_width = 28;
const btn_height = 28;

function addcontrolPanel() {
    if (isRenderMode) {
        console.log('Panoramic render mode: skipping control panel creation');
        return;
    }

    // 等待一小段时间确保页面完全加载
    setTimeout(async () => {
        // 创建控制面板容器
        const controlPanel = document.createElement('div');
        controlPanel.id = 'control-panel';
        controlPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 9999;
        opacity: 0;
        visibility: hidden;
        transform: translateX(20px);
        transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
        pointer-events: none;
        `;

        // 注入全局 CSS 清理移动端点击方块高亮
        const globalStyle = document.createElement('style');
        globalStyle.textContent = `
            #control-panel div, #sub-control-panel div {
                -webkit-tap-highlight-color: transparent;
            }
        `;
        document.head.appendChild(globalStyle);

        // ==========================================
        // ======= 创建左侧子面板 (用于收纳更多按钮) =======
        // ==========================================
        const subPanel = document.createElement('div');
        subPanel.id = 'sub-control-panel';
        subPanel.style.cssText = `
            position: absolute;
            right: 100%;
            top: 0;
            margin-right: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            opacity: 0;
            visibility: hidden;
            /* 修复点 1: 将 0 改为具体的 translateX，并加上 scale(1) 锁定比例 */
            transform: translateX(10px) scale(1); 
            /* 修复点 2: 明确指定过渡属性，绝对不要用 all */
            transition: opacity 0.3s ease, transform 0.3s ease; 
            /* 修复点 3: 锁定变形原点在右侧，这样它展开时是向左伸展，而不是中心放大 */
            transform-origin: right center; 
            pointer-events: none;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            backdrop-filter: none !important;
        `;

        // 创建工具提示容器
        const tooltipContainer = document.createElement('div');
        tooltipContainer.id = 'control-tooltip-container';
        tooltipContainer.style.cssText = `
            position: fixed;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transform: translateX(-10px);
            transition: all 0.3s ease;
        `;
        
        const tooltip = document.createElement('div');
        tooltip.id = 'control-tooltip';
        tooltip.style.cssText = `
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            backdrop-filter: blur(8px);
        `;
        
        tooltipContainer.appendChild(tooltip);
        document.body.appendChild(tooltipContainer);
        
        // 工具提示显示函数 - 在左侧显示
        function showTooltip(button, text) {
            const rect = button.getBoundingClientRect();
            tooltip.textContent = text;
            const topPosition = rect.top + (rect.height - tooltip.offsetHeight) / 2;
            tooltipContainer.style.left = `${rect.left - tooltip.offsetWidth - 15}px`;
            tooltipContainer.style.top = `${topPosition}px`;
            tooltipContainer.style.opacity = '1';
            tooltipContainer.style.transform = 'translateX(0)';
        }
        
        function hideTooltip() {
            tooltipContainer.style.opacity = '0';
            tooltipContainer.style.transform = 'translateX(-10px)';
        }
        
        const addHoverEffect = (button, text) => {
            button.addEventListener('mouseenter', (e) => {
                showTooltip(button, text);
            });
            button.addEventListener('mousemove', (e) => {
                const rect = button.getBoundingClientRect();
                const topPosition = rect.top + (rect.height - tooltip.offsetHeight) / 2;
                tooltipContainer.style.left = `${rect.left - tooltip.offsetWidth - 15}px`;
                tooltipContainer.style.top = `${topPosition}px`;
            });
            button.addEventListener('mouseleave', () => {
                hideTooltip();
            });
        };

        // 【新增】绑定点击与触摸事件，解决移动端点击无响应或需要双击的问题
        function bindTapEvent(element, callback) {
            let touchMoved = false;
            element.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
            element.addEventListener('touchmove', () => { touchMoved = true; }, { passive: true });
            element.addEventListener('touchend', (e) => {
                if (!touchMoved) {
                    e.preventDefault();
                    e.stopPropagation();
                    callback(e);
                }
            }, { passive: false });
            element.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                callback(e);
            });
        }

        // 1. 拖拽按钮
        const dragButton = document.createElement('div');
        dragButton.id = 'drag-handle';
        dragButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px;
            background: rgba(255,255,255,0.95); border: 2px solid rgba(0,0,0,0.1);
            border-radius: 50%; color: #333; cursor: pointer; -webkit-app-region: drag;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform 0.2s; user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        const dragArea = document.createElement('div');
        dragArea.style.cssText = `position: absolute; top: 0; left: 0; width: 100%; height: 100%; -webkit-app-region: drag; z-index: 1;`;
        const iconContainer = document.createElement('div');
        iconContainer.innerHTML = '<i class="fa-solid fa-arrows-up-down-left-right"></i>';
        iconContainer.style.cssText = `position: relative; z-index: 2; pointer-events: none; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; -webkit-app-region: drag;`;
        dragButton.appendChild(dragArea);
        dragButton.appendChild(iconContainer);

        // 2. 锁定按钮逻辑
        const lockButton = document.createElement('div');
        lockButton.id = 'lock-handle';
        let isMouseLocked = false;
        const controlButtons = []; // 保存所有需要被隐藏的按钮

        async function initLockButton() {
            lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
            lockButton.style.cssText = `
                width: ${btn_width}px; height: ${btn_height}px;
                background: rgba(255,255,255,0.95); border: 2px solid rgba(0,0,0,0.1);
                border-radius: 50%; color: #28a745; cursor: pointer; -webkit-app-region: no-drag;
                display: flex; align-items: center; justify-content: center; font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
                user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
            `;
            lockButton.title = await t('UnlockWindow');
            updateLockButtonState();
        }

        async function updateLockButtonState() {
            if (isMouseLocked) {
                lockButton.innerHTML = '<i class="fas fa-lock"></i>';
                lockButton.style.color = '#dc3545';
                lockButton.title = await t('UnlockWindow');
            } else {
                lockButton.innerHTML = '<i class="fas fa-lock-open"></i>';
                lockButton.style.color = '#28a745';
                lockButton.title = await t('LockWindow');
            }
        }

        function hideOtherButtons() {
            // 如果子面板开着，强制关闭
            if (isSubPanelOpen) {
                isSubPanelOpen = false;
                updateMoreButtonState();
            }
            controlButtons.forEach(button => {
                if (button && button !== lockButton) {
                    button.style.display = 'none'; // 直接隐藏，让布局自然收缩
                }
            });
            lockButton.style.marginBottom = '0';
            lockButton.style.marginTop = 'auto';
        }

        function showAllButtons() {
            controlButtons.forEach(button => {
                if (button && button !== lockButton) {
                    button.style.display = 'flex';
                    button.style.opacity = '1';
                    button.style.visibility = 'visible';
                    button.style.transform = 'scale(1)';
                }
            });
            lockButton.style.marginBottom = '';
            lockButton.style.marginTop = '';
        }

        lockButton.addEventListener('mouseenter', () => {
            lockButton.style.background = 'rgba(255,255,255,1)';
            lockButton.style.transform = 'scale(1.1)';
            lockButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        });
        lockButton.addEventListener('mouseleave', () => {
            lockButton.style.background = 'rgba(255,255,255,0.95)';
            lockButton.style.transform = 'scale(1)';
            lockButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        
        bindTapEvent(lockButton, (e) => {
            toggleMouseLock();
        });

        async function toggleMouseLock() {
            isMouseLocked = !isMouseLocked;
            if (isMouseLocked) {
                window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
                hideOtherButtons();
            } else {
                window.electronAPI.setIgnoreMouseEvents(false);
                showAllButtons();
            }
            updateLockButtonState();
            sendToMain('mouseLockStatus', { locked: isMouseLocked });
            updateButtonTooltips();
        }
        await initLockButton();

        // 3. 自动隐藏按钮
        const hideButton = document.createElement('div');
        hideButton.id = 'hide-handle';
        let isAutoHideActive = false; 
        let autoHideDisabledByPointerLock = false; 

        async function initHideButton() {
            hideButton.innerHTML = '<i class="fas fa-eye"></i>';
            hideButton.style.cssText = `
                width: ${btn_width}px; height: ${btn_height}px;
                background: rgba(255,255,255,0.95); border: 2px solid rgba(0,0,0,0.1);
                border-radius: 50%; color: #6c757d; cursor: pointer; -webkit-app-region: no-drag;
                display: flex; align-items: center; justify-content: center; font-size: 14px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
                user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
            `;
            const hideDesc = await t('AutoHideDescription');
            hideButton.title = hideDesc || 'Auto-hide on hover';
            updateHideButtonState();
        }

        async function updateHideButtonState() {
            if (isAutoHideActive) {
                hideButton.innerHTML = '<i class="fas fa-eye-slash"></i>';
                hideButton.style.color = '#ffc107';
                hideButton.title = await t('AutoHideEnabled') || 'Auto-hide enabled; click to disable';
            } else {
                hideButton.innerHTML = '<i class="fas fa-eye"></i>';
                hideButton.style.color = '#6c757d';
                hideButton.title = await t('AutoHideDescription') || 'Auto-hide on hover; click to enable';
            }
        }

        async function toggleAutoHide() {
            if (pointerLocked && !isAutoHideActive) {
                console.warn('Auto hide is disabled in first-person mode');
                return;
            }
            isAutoHideActive = !isAutoHideActive;
            if (isAutoHideActive) enableAutoHide();
            else disableAutoHide();
            updateHideButtonState();
            sendToMain('autoHideStatus', { enabled: isAutoHideActive });
        }

        hideButton.addEventListener('mouseenter', () => {
            hideButton.style.background = 'rgba(255,255,255,1)';
            hideButton.style.transform = 'scale(1.1)';
            hideButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        });
        hideButton.addEventListener('mouseleave', () => {
            hideButton.style.background = 'rgba(255,255,255,0.95)';
            hideButton.style.transform = 'scale(1)';
            hideButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });

        bindTapEvent(hideButton, (e) => {
            toggleAutoHide();
        });

        await initHideButton();

        function handleModelHoverDetection(event) {
            if (!currentVrm || !isAutoHideEnabled || pointerLocked) return;
            if (hoverCheckTimeout) clearTimeout(hoverCheckTimeout);
            hoverCheckTimeout = setTimeout(() => {
                mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(currentVrm.scene, true);
                const nowHovered = intersects.length > 0;
                if (nowHovered !== isModelHiddenByHover) {
                    isModelHiddenByHover = nowHovered;
                    if (nowHovered) hideModelWithTransition();
                    else showModelWithTransition();
                }
            }, HOVER_CHECK_INTERVAL);
        }

        function handleMouseLeaveWindow(event) {
            if (!event.relatedTarget && isAutoHideEnabled) {
                isModelHiddenByHover = false;
                showModelWithTransition();
            }
        }

        function hideModelWithTransition() {
            if (!renderer || !renderer.domElement) return;
            const canvas = renderer.domElement;
            canvas.style.transition = `opacity ${FADE_DURATION}ms ease`;
            pauseModelAnimationsForHide();
            if (hideTransitionTimer) { clearTimeout(hideTransitionTimer); hideTransitionTimer = null; }
            requestAnimationFrame(() => { canvas.style.opacity = '0'; });
            hideTransitionTimer = setTimeout(() => {
                canvas.style.pointerEvents = 'none';
                if (currentVrm) currentVrm.scene.visible = false;
                if (isElectron && !isMouseLocked && window.electronAPI?.setIgnoreMouseEvents) {
                    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
                }
                hideTransitionTimer = null;
            }, FADE_DURATION + 10);
        }

        function showModelWithTransition() {
            if (!renderer || !renderer.domElement) return;
            const canvas = renderer.domElement;
            canvas.style.transition = `opacity ${FADE_DURATION}ms ease`;
            canvas.style.pointerEvents = 'auto';
            canvas.style.opacity = '0'; 
            if (currentVrm) currentVrm.scene.visible = true;
            resumeModelAnimationsAfterHide();
            if (hideTransitionTimer) { clearTimeout(hideTransitionTimer); hideTransitionTimer = null; }
            requestAnimationFrame(() => { canvas.style.opacity = '1'; });
            setTimeout(() => {
                canvas.style.pointerEvents = 'auto';
                if (isElectron && !isMouseLocked && window.electronAPI?.setIgnoreMouseEvents) {
                    window.electronAPI.setIgnoreMouseEvents(false);
                }
            }, FADE_DURATION + 10);
        }

        function enableAutoHide() {
            if (isAutoHideEnabled) return;
            isAutoHideEnabled = true;
            isModelHiddenByHover = false;
            controlsEnabledBeforeAutoHide = controls.enabled;
            controls.enabled = false;
            document.addEventListener('mousemove', handleModelHoverDetection);
            document.addEventListener('mouseleave', handleMouseLeaveWindow);
        }

        function disableAutoHide() {
            if (!isAutoHideEnabled) return;
            isAutoHideEnabled = false;
            isModelHiddenByHover = false;
            controls.enabled = controlsEnabledBeforeAutoHide;
            document.removeEventListener('mousemove', handleModelHoverDetection);
            document.removeEventListener('mouseleave', handleMouseLeaveWindow);
            if (hoverCheckTimeout) { clearTimeout(hoverCheckTimeout); hoverCheckTimeout = null; }
            showModelWithTransition();
        }

        // 4. 切换模型按钮
        await getAllModels();
        const prevModelButton = document.createElement('div');
        prevModelButton.id = 'prev-model-handle';
        prevModelButton.innerHTML = '<i class="fas fa-chevron-up"></i>';
        prevModelButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        
        const nextModelButton = document.createElement('div');
        nextModelButton.id = 'next-model-handle';
        nextModelButton.innerHTML = '<i class="fas fa-chevron-down"></i>';
        nextModelButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;

        prevModelButton.addEventListener('mouseenter', async () => {
            prevModelButton.style.background = 'rgba(255,255,255,1)';
            prevModelButton.style.transform = 'scale(1.1)';
            prevModelButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
            const prevModel = getPrevModelInfo();
            if (prevModel) prevModelButton.title = `${await t('Previous')}: ${prevModel.name}`;
        });
        prevModelButton.addEventListener('mouseleave', () => {
            prevModelButton.style.background = 'rgba(255,255,255,0.95)';
            prevModelButton.style.transform = 'scale(1)';
            prevModelButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        nextModelButton.addEventListener('mouseenter', async () => {
            nextModelButton.style.background = 'rgba(255,255,255,1)';
            nextModelButton.style.transform = 'scale(1.1)';
            nextModelButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
            const nextModel = getNextModelInfo();
            if (nextModel) nextModelButton.title = `${await t('Next')}: ${nextModel.name}`;
        });
        nextModelButton.addEventListener('mouseleave', () => {
            nextModelButton.style.background = 'rgba(255,255,255,0.95)';
            nextModelButton.style.transform = 'scale(1)';
            nextModelButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });

        bindTapEvent(prevModelButton, (e) => { 
            if (allModels.length > 1) switchToModel(currentModelIndex - 1); 
        });
        bindTapEvent(nextModelButton, (e) => { 
            if (allModels.length > 1) switchToModel(currentModelIndex + 1); 
        });

        async function initModelButtons() {
            if (allModels.length <= 1) {
                prevModelButton.style.opacity = '0.5'; prevModelButton.style.cursor = 'not-allowed'; prevModelButton.title = 'No other models available';
                nextModelButton.style.opacity = '0.5'; nextModelButton.style.cursor = 'not-allowed'; nextModelButton.title = 'No other models available';
            } else {
                const prevModel = getPrevModelInfo();
                const nextModel = getNextModelInfo();
                prevModelButton.title = prevModel ? `Previous: ${prevModel.name}` : 'Previous Model';
                nextModelButton.title = nextModel ? `Next: ${nextModel.name}` : 'Next Model';
            }
        }
        initModelButtons();

        // 5. 新增的“更多功能”按钮
        const moreButton = document.createElement('div');
        moreButton.id = 'more-handle';
        let isSubPanelOpen = false;
        moreButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
        moreButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;

        async function updateMoreButtonState() {
            if (isSubPanelOpen) {
                subPanel.style.opacity = '1';
                subPanel.style.visibility = 'visible';
                subPanel.style.transform = 'translateX(0) scale(1)'; 
                subPanel.style.pointerEvents = 'auto';
                moreButton.innerHTML = '<i class="fas fa-caret-right"></i>';
                moreButton.style.color = '#007bff';
                moreButton.title = await t('collapse') || 'Collapse panel';
            } else {
                subPanel.style.opacity = '0';
                subPanel.style.visibility = 'hidden';
                subPanel.style.transform = 'translateX(10px) scale(1)';
                subPanel.style.pointerEvents = 'none';
                moreButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
                moreButton.style.color = '#333';
                moreButton.title = await t('MoreOptions') || 'More options';
            }
            showTooltip(moreButton, moreButton.title);
        }

        bindTapEvent(moreButton, async (e) => {
            isSubPanelOpen = !isSubPanelOpen;
            updateMoreButtonState();
        });

        moreButton.addEventListener('mouseenter', async () => {
            moreButton.style.background = 'rgba(255,255,255,1)';
            moreButton.style.transform = 'scale(1.1)';
            moreButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
            if (!moreButton.title) moreButton.title = await t('MoreOptions') || 'More options';
            showTooltip(moreButton, moreButton.title);
        });
        moreButton.addEventListener('mouseleave', () => {
            moreButton.style.background = 'rgba(255,255,255,0.95)';
            moreButton.style.transform = 'scale(1)';
            moreButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            hideTooltip();
        });

        const subtitleButton = document.createElement('div');
        subtitleButton.id = 'subtitle-handle';
        subtitleButton.innerHTML = '<i class="fas fa-closed-captioning"></i>';
        subtitleButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
            color: ${isSubtitleEnabled ? '#28a745' : '#dc3545'};
        `;
        subtitleButton.addEventListener('mouseenter', () => { subtitleButton.style.background = 'rgba(255,255,255,1)'; subtitleButton.style.transform = 'scale(1.1)'; subtitleButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; });
        subtitleButton.addEventListener('mouseleave', () => { subtitleButton.style.background = 'rgba(255,255,255,0.95)'; subtitleButton.style.transform = 'scale(1)'; subtitleButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; });
        
        bindTapEvent(subtitleButton, async (e) => {
            isSubtitleEnabled = !isSubtitleEnabled;
            toggleSubtitle(isSubtitleEnabled);
            subtitleButton.style.color = isSubtitleEnabled ? '#28a745' : '#dc3545';
            subtitleButton.title = isSubtitleEnabled ? await t('SubtitleEnabled') : await t('SubtitleDisabled');
        });

        // 6. 刷新与关闭按钮
        const refreshButton = document.createElement('div');
        refreshButton.id = 'refresh-handle';
        refreshButton.innerHTML = '<i class="fas fa-redo-alt"></i>';
        refreshButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        refreshButton.addEventListener('mouseenter', () => {
            refreshButton.style.background = 'rgba(255,255,255,1)'; refreshButton.style.transform = 'scale(1.1)'; refreshButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        });
        refreshButton.addEventListener('mouseleave', () => {
            refreshButton.style.background = 'rgba(255,255,255,0.95)'; refreshButton.style.transform = 'scale(1)'; refreshButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        bindTapEvent(refreshButton, (e) => { window.location.reload(); });

        const closeButton = document.createElement('div');
        closeButton.id = 'close-handle';
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.background = 'rgba(255,255,255,1)'; closeButton.style.transform = 'scale(1.1)'; closeButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
        });
        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.background = 'rgba(255,255,255,0.95)'; closeButton.style.transform = 'scale(1)'; closeButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        bindTapEvent(closeButton, (e) => { window.close(); });

        // ======= 以下为收纳在子面板中的按钮 =======

        // 子 1. 调整模式按钮
        const moveModeBtn = document.createElement('div');
        moveModeBtn.id = 'move-mode-handle';
        let transformState = 0; 
        moveModeBtn.innerHTML = '<i class="fa-solid fa-cube"></i>'; 
        moveModeBtn.title = await t('ModeOff') || 'Mode: Off'; 
        moveModeBtn.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer; 
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center; 
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        bindTapEvent(moveModeBtn, async (e) => {
            if (!currentVrm) return;
            transformState = (transformState + 1) % 4;
            updateTransformState();
        });
        async function updateTransformState() {
            if (typeof transformControl === 'undefined') return;
            if (transformState !== 0 && currentVrmWrapper) transformControl.attach(currentVrmWrapper);
            switch (transformState) {
                case 0: transformControl.detach(); moveModeBtn.style.color = '#333'; moveModeBtn.style.background = 'rgba(255,255,255,0.95)'; moveModeBtn.innerHTML = '<i class="fa-solid fa-cube"></i>'; moveModeBtn.title = await t('ModeOff') || 'Mode: Off'; break;
                case 1: transformControl.setMode('translate'); transformControl.setSpace('world'); moveModeBtn.style.color = '#ff6b35'; moveModeBtn.style.background = 'rgba(255,255,255,1)'; moveModeBtn.innerHTML = '<i class="fa-solid fa-arrows-left-right-to-line"></i>'; moveModeBtn.title = await t('ModeMove') || 'Move Mode'; break;
                case 2: transformControl.setMode('rotate'); transformControl.setSpace('local'); moveModeBtn.style.color = '#007bff'; moveModeBtn.style.background = 'rgba(255,255,255,1)'; moveModeBtn.innerHTML = '<i class="fas fa-sync-alt"></i>'; moveModeBtn.title = await t('ModeRotate') || 'Rotate Mode'; break;
                case 3: transformControl.setMode('scale'); transformControl.setSpace('local'); moveModeBtn.style.color = '#e83e8c'; moveModeBtn.style.background = 'rgba(255,255,255,1)'; moveModeBtn.innerHTML = '<i class="fas fa-compress-arrows-alt"></i>'; moveModeBtn.title = await t('ModeScale') || 'Scale Mode'; break;
            }
        }
        moveModeBtn.addEventListener('mouseenter', () => { moveModeBtn.style.transform = 'scale(1.1)'; moveModeBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; showTooltip(moveModeBtn, moveModeBtn.title); });
        moveModeBtn.addEventListener('mouseleave', () => { moveModeBtn.style.transform = 'scale(1)'; moveModeBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; hideTooltip(); });
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!currentVrm || typeof transformControl === 'undefined') return;
            if (e.code === 'Escape') { transformState = 0; updateTransformState(); return; }
            if (transformState !== 0) {
                switch(e.code) { case 'KeyT': transformState = 1; updateTransformState(); break; case 'KeyR': transformState = 2; updateTransformState(); break; case 'KeyS': transformState = 3; updateTransformState(); break; }
            }
        });

        // 子 2. WS 状态
        const wsStatusButton = document.createElement('div');
        wsStatusButton.id = 'ws-status-handle';
        wsStatusButton.innerHTML = '<i class="fas fa-wifi"></i>';
        wsStatusButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
            color: ${wsConnected ? '#28a745' : '#dc3545'};
        `;
        bindTapEvent(wsStatusButton, (e) => {
            if (wsConnected) { if (ttsWebSocket) ttsWebSocket.close(); } else { initTTSWebSocket(); }
        });
        wsStatusButton.addEventListener('mouseenter', () => { wsStatusButton.style.background = 'rgba(255,255,255,1)'; wsStatusButton.style.transform = 'scale(1.1)'; wsStatusButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; });
        wsStatusButton.addEventListener('mouseleave', () => { wsStatusButton.style.background = 'rgba(255,255,255,0.95)'; wsStatusButton.style.transform = 'scale(1)'; wsStatusButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; });
        async function updateWSStatus() { wsStatusButton.style.color = wsConnected ? '#28a745' : '#dc3545'; wsStatusButton.title = wsConnected ? await t('WebSocketConnected') : await t('WebSocketDisconnected'); }
        setInterval(updateWSStatus, 1000);

        // 子 4. 闲置动画按钮
        const idleAnimationButton = document.createElement('div');
        idleAnimationButton.id = 'idle-animation-handle';
        idleAnimationButton.innerHTML = useVRMAIdleAnimations ? '<i class="fas fa-stop"></i>' : '<i class="fas fa-play"></i>';
        idleAnimationButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: ${useVRMAIdleAnimations ? '#ff6b35' : '#28a745'};
            cursor: pointer; -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        idleAnimationButton.addEventListener('mouseenter', () => { idleAnimationButton.style.background = 'rgba(255,255,255,1)'; idleAnimationButton.style.transform = 'scale(1.1)'; idleAnimationButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; });
        idleAnimationButton.addEventListener('mouseleave', () => { idleAnimationButton.style.background = 'rgba(255,255,255,0.95)'; idleAnimationButton.style.transform = 'scale(1)'; idleAnimationButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; });
        
        bindTapEvent(idleAnimationButton, async (e) => {
            if (isIdleAnimationModeChanging) return;
            await toggleIdleAnimationMode();
        });

        // 子 5. XR 按钮
        const xrAutoBtn = document.createElement('div');
        xrAutoBtn.id = 'xr-auto-btn';
        xrAutoBtn.innerHTML = '<i class="fa-solid fa-vr-cardboard"></i>';
        xrAutoBtn.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer; 
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center; 
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px); display: none;`;
        let canAR = false, canVR = false;
        Promise.all([
            navigator.xr.isSessionSupported('immersive-ar').then(yes=>{ canAR=yes; }),
            navigator.xr.isSessionSupported('immersive-vr').then(yes=>{ canVR=yes; })
        ]).then(()=>{ xrAutoBtn.style.display = (canAR || canVR) ? 'flex' : 'none'; });
        let xrSession = null;
        let xrRefSpace = null;
        
        // 确保使用原生的 click 事件
        xrAutoBtn.addEventListener('click', async (e) => {
            if (renderer.xr.isPresenting) {
                await renderer.xr.getSession().end();
                return;
            }

            // 自动检测模式 (AR 优先)
            const mode = canAR ? 'immersive-ar' : 'immersive-vr';
            let session;

            try {
                // 尝试 1：带 UI 穿透 (dom-overlay) 和平面检测 (hit-test) 的全功能模式
                session = await navigator.xr.requestSession(mode, {
                    optionalFeatures: ['local-floor', 'hit-test', 'dom-overlay'],
                    domOverlay: { root: document.body } 
                });
                console.log("Entering XR: full-feature mode");

            } catch (err1) {
                console.warn('Full-feature XR startup failed; trying fallback...', err1);
                try {
                    // 尝试 2：剥离 dom-overlay (很多安卓浏览器死在 body 作为 root 上)
                    session = await navigator.xr.requestSession(mode, {
                        optionalFeatures: ['local-floor', 'hit-test']
                    });
                    console.log("Entering XR: mode without UI passthrough");

                } catch (err2) {
                    console.warn('XR fallback mode 1 failed; trying basic mode...', err2);
                    try {
                        // 尝试 3：最基础的 XR 模式 (只要手机支持 ARCore/VR 就能开)
                        session = await navigator.xr.requestSession(mode);
                        console.log("Entering XR: basic mode");

                    } catch (err3) {
                        // 彻底不支持
                        alert('Your browser does not support these XR configurations. Try the latest version of Chrome.\nError: ' + err3.message);
                        return;
                    }
                }
            }

            // ========== 成功获取 session 后的处理 ==========
            renderer.xr.setSession(session);
            xrSession = session;

            renderer.setAnimationLoop(xrAnimate);
            
            // 隐藏控制面板
            const ctrlPanel = document.getElementById('control-panel');
            if (ctrlPanel) ctrlPanel.style.display = 'none'; 
            
            const pttBtn = document.getElementById('ptt-floating-btn');
            if (pttBtn) pttBtn.classList.add('visible');

            if (currentVrm) {
                // 在 VR/AR 中将模型稍微放远一点，避免“贴脸”
                currentVrm.scene.position.set(0, 0, -1.5);
            }

            // 处理 XR 手柄或屏幕点击输入
            session.addEventListener('select', (event) => {
                console.log('XR screen/controller click');
            });
        });

        renderer.xr.addEventListener('sessionend', () => { 
            renderer.setAnimationLoop(null); 
            animate(); 
            xrSession = null; 
            
            // === 退出 XR 恢复 UI ===
            document.getElementById('control-panel').style.display = 'flex';
            // 如果进 XR 之前没开语音，退出来后也把它隐藏回去
            if (!pttVisible) {
                document.getElementById('ptt-floating-btn').classList.remove('visible');
            }
        });
        function xrAnimate(time, frame) {
          const delta = clock.getDelta();
          if (currentVrm) currentVrm.update(delta);
          if (currentMixer) currentMixer.update(delta);
          renderer.render(scene, camera);
        }

        // 子 6. VMC 按钮
        const vmcButton = document.createElement('div');
        vmcButton.id = 'vmc-handle';
        vmcButton.innerHTML = '<i class="fas fa-broadcast-tower"></i>';
        vmcButton.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333;
            cursor: pointer; -webkit-app-region: no-drag; display: flex;
            align-items: center; justify-content: center; font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);`;
        let vmcApp = null;
        let vmcWrapper = null;
        
        bindTapEvent(vmcButton, async (e) => {
            if (vmcApp) {
                vmcApp.unmount(); document.body.removeChild(vmcWrapper); vmcApp = null; vmcWrapper = null; return;
            }
            const cfg = await window.electronAPI.getVMCConfig();
            const { ElDialog, ElForm, ElFormItem, ElInput, ElSwitch, ElButton, ElInputNumber } = ElementPlus;
            vmcWrapper = document.createElement('div');
            document.body.appendChild(vmcWrapper);
            vmcApp = Vue.createApp({
                data() {
                    return {
                        dialogVisible: true,
                        form: {
                            receive: { enable: cfg.receive.enable, port: cfg.receive.port, syncExpression: cfg.receive.syncExpression },
                            send: { enable: cfg.send.enable, host: cfg.send.host, port: cfg.send.port }
                        },
                        translations: { title: '', receiveEnable: '', receivePort: '', sendEnable: '', sendHost: '', sendPort: '', cancelButton: '', saveButton: '' }
                    }
                },
                async mounted() {
                    this.translations.title = await t('vmcSettings'); this.translations.receiveEnable = await t('vmcReceiveEnable'); this.translations.receivePort = await t('vmcReceivePort');
                    this.translations.sendEnable = await t('vmcSendEnable'); this.translations.sendHost = await t('vmcSendHost'); this.translations.sendPort = await t('vmcSendPort');
                    this.translations.cancelButton = await t('cancel'); this.translations.saveButton = await t('save'); this.translations.syncExpression = await t('syncExpression');
                },
                methods: {
                    async saveConfig() {
                        await window.electronAPI.setVMCConfig({
                            receive: { enable: this.form.receive.enable, port: this.form.receive.port, syncExpression: this.form.receive.syncExpression },
                            send: { enable: this.form.send.enable, host: this.form.send.host, port: this.form.send.port }
                        });
                        setVMCReceive(this.form.receive.enable, this.form.receive.syncExpression);
                        this.close();
                    },
                    cancel() { this.close(); },
                    close() { this.dialogVisible = false; vmcApp.unmount(); document.body.removeChild(vmcWrapper); vmcApp = null; vmcWrapper = null; }
                },
                template: `
                    <el-dialog v-model="dialogVisible" :title="translations.title" width="420px" :modal="false" :close-on-click-modal="false" append-to-body custom-class="vmc-dialog" @close="close" style="background: rgba(255, 255, 255, 0.25) !important;backdrop-filter: blur(20px);border-radius: 20px !important;">
                        <div style="padding: 0 10px;">
                            <div style="margin-bottom: 20px; padding: 15px; background: rgba(245, 247, 250, 0.75)!important; border-radius: 20px;">
                                <div style="display: flex; align-items: center; margin-bottom: 15px;"><el-switch v-model="form.receive.enable"></el-switch><span style="margin-left: 10px; font-weight: 500;">{{ translations.receiveEnable }}</span></div>
                                <div style="display:flex;align-items:center;margin-top:8px;"><el-switch v-model="form.receive.syncExpression"></el-switch><span style="margin-left:10px;font-size:14px;">{{ translations.syncExpression }}</span></div>
                                <div style="display: flex; align-items: center; gap: 10px;"><span style="width: 100px;margin-right:30px; font-size: 14px;">{{ translations.receivePort }}:</span><el-input-number v-model="form.receive.port" :min="1024" :max="65535" controls-position="right" style="width: 200px;"></el-input-number></div>
                            </div>
                            <div style="margin-bottom: 20px; padding: 15px; background: rgba(245, 247, 250, 0.75)!important; border-radius: 20px;">
                                <div style="display: flex; align-items: center; margin-bottom: 15px;"><el-switch v-model="form.send.enable"></el-switch><span style="margin-left: 10px;margin-right:30px; font-weight: 500;">{{ translations.sendEnable }}</span></div>
                                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;"><span style="width: 100px; margin-right:30px;font-size: 14px;">{{ translations.sendHost }}:</span><el-input v-model="form.send.host" style="width: 200px;"></el-input></div>
                                <div style="display: flex; align-items: center; gap: 10px;"><span style="width: 100px;margin-right:30px; font-size: 14px;">{{ translations.sendPort }}:</span><el-input-number v-model="form.send.port" :min="1024" :max="65535" controls-position="right" style="width: 200px;"></el-input-number></div>
                            </div>
                        </div>
                        <template #footer><div style="text-align: right;"><el-button @click="cancel" style="margin-right: 10px;">{{ translations.cancelButton }}</el-button><el-button type="primary" @click="saveConfig">{{ translations.saveButton }}</el-button></div></template>
                    </el-dialog>
                `
            });
            vmcApp.use(ElementPlus); vmcApp.mount(vmcWrapper);
        });

        // 子 7. 第一人称视角按钮
        const switchCtrlBtn = document.createElement('div');
        switchCtrlBtn.id = 'switch-controls-handle';
        switchCtrlBtn.innerHTML = '<i class="fas fa-gamepad"></i>';
        switchCtrlBtn.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333; cursor: pointer; -webkit-app-region: no-drag;
            display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transform 0.2s; user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;
        function createPointerLockControls() {
            pointerLockControls = new PointerLockControls(camera, renderer.domElement);
            scene.add(pointerLockControls.getObject());
        }
        function toggleControls() {
            if (!pointerLockControls) createPointerLockControls();
            if (!pointerLocked) {
                orbitControlsSaved = controls; orbitControlsSaved.enabled = false;
                pointerLockControls.lock(); enablePointerLockMovement(); pointerLocked = true;
                if (isAutoHideActive) { disableAutoHide(); isAutoHideActive = false; autoHideDisabledByPointerLock = true; updateHideButtonState(); }
                switchCtrlBtn.style.color = '#ffc73bff';
            } else {
                pointerLockControls.unlock(); disablePointerLockMovement(); pointerLocked = false;
                if (autoHideDisabledByPointerLock) { enableAutoHide(); isAutoHideActive = true; autoHideDisabledByPointerLock = false; updateHideButtonState(); }
                switchCtrlBtn.style.color = '#333';
                if (orbitControlsSaved) orbitControlsSaved.enabled = true;
            }
        }
        
        bindTapEvent(switchCtrlBtn, (e) => { toggleControls(); });

        switchCtrlBtn.addEventListener('mouseenter', async () => {
            switchCtrlBtn.style.background = 'rgba(255,255,255,1)'; switchCtrlBtn.style.transform = 'scale(1.1)'; switchCtrlBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)';
            switchCtrlBtn.title = pointerLocked ? await t('ExitFirstPerson') || 'Exit First-Person' : await t('EnterFirstPerson') || 'Enter First-Person';
        });
        switchCtrlBtn.addEventListener('mouseleave', () => { switchCtrlBtn.style.background = 'rgba(255,255,255,0.95)'; switchCtrlBtn.style.transform = 'scale(1)'; switchCtrlBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; });
        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== renderer.domElement && pointerLocked) toggleControls();
        });

        // 1. 创建按钮并设置初始属性
        const voiceControlBtn = document.createElement('div');
        voiceControlBtn.id = 'voice-toggle-handle';
        voiceControlBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        voiceControlBtn.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #000000; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;

        // 2. 初始 Hover 提示 (使用你代码里的翻译函数 t)
        (async () => {
            const initialTitle = await t('EnableVoiceInput') || 'Enable voice input';
            voiceControlBtn.title = initialTitle;
            addHoverEffect(voiceControlBtn, initialTitle); // 调用你现有的提示增强函数
        })();

        // 3. 点击事件中增加标题动态更新
        bindTapEvent(voiceControlBtn, async (e) => {
            pttVisible = !pttVisible;
            const fBtn = document.getElementById('ptt-floating-btn');
            
            // 获取新的标题文本
            const activeTitle = pttVisible 
                ? (await t('DisableVoiceInput') || 'Disable voice input') 
                : (await t('EnableVoiceInput') || 'Enable voice input');

           if (pttVisible) {
                fBtn.classList.add('visible');
                voiceControlBtn.style.background = '#ff6b35';
                voiceControlBtn.style.color = '#ff6b35';
            } else {
                fBtn.classList.remove('visible');
                voiceControlBtn.style.background = '#000000';
                voiceControlBtn.style.color = '#000000';
            }

            // 更新原生标题和自定义 Tooltip
            voiceControlBtn.title = activeTitle;
            showTooltip(voiceControlBtn, activeTitle); // 立即更新当前显示的黑色气泡
        });

        // 1. 创建文字控制按钮
        const textControlBtn = document.createElement('div');
        textControlBtn.id = 'text-toggle-handle';
        textControlBtn.innerHTML = '<i class="fas fa-keyboard"></i>'; // 统一使用 fas
        textControlBtn.style.cssText = `
            width: ${btn_width}px; height: ${btn_height}px; background: rgba(255,255,255,0.95);
            border: 2px solid rgba(0,0,0,0.1); border-radius: 50%; color: #333333; cursor: pointer;
            -webkit-app-region: no-drag; display: flex; align-items: center; justify-content: center;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transform 0.2s;
            user-select: none; pointer-events: auto; backdrop-filter: blur(10px);
        `;

        // 补上与其他按钮一致的悬浮动效，防止 Hover 时变色冲突
        textControlBtn.addEventListener('mouseenter', () => { 
            textControlBtn.style.background = 'rgba(255,255,255,1)'; 
            textControlBtn.style.transform = 'scale(1.1)'; 
            textControlBtn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; 
        });
        textControlBtn.addEventListener('mouseleave', () => { 
            textControlBtn.style.background = 'rgba(255,255,255,0.95)'; 
            textControlBtn.style.transform = 'scale(1)'; 
            textControlBtn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; 
        });

        let textInputVisible = false;
        (async () => {
            const initialTitle = await t('EnableTextInput') || 'Enable text input';
            textControlBtn.title = initialTitle;
            addHoverEffect(textControlBtn, initialTitle);
        })();

        bindTapEvent(textControlBtn, async (e) => {
            textInputVisible = !textInputVisible;
            const container = document.getElementById('text-input-container');
            
            const activeTitle = textInputVisible 
                ? (await t('DisableTextInput') || 'Disable text input') 
                : (await t('EnableTextInput') || 'Enable text input');

            if (textInputVisible) {
                // 显示输入框，图标变蓝，背景维持白色
                container.style.opacity = '1';
                container.style.pointerEvents = 'auto';
                container.style.transform = 'translateX(-50%) translateY(0)';
                textControlBtn.style.color = '#007bff'; 
                setTimeout(() => document.getElementById('text-input-field').focus(), 300);
            } else {
                // 隐藏输入框，图标恢复黑灰
                container.style.opacity = '0';
                container.style.pointerEvents = 'none';
                container.style.transform = 'translateX(-50%) translateY(20px)';
                textControlBtn.style.color = '#333333'; 
                document.getElementById('text-input-field').blur();
            }

            textControlBtn.title = activeTitle;
            showTooltip(textControlBtn, activeTitle);
        });

        // ==========================================
        // ======= 组装所有面板与按钮 ===================
        // ==========================================
        
        // 1. 组装主面板（按顺序排列）
        controlPanel.appendChild(dragButton);          // 拖拽
        controlPanel.appendChild(lockButton);          // 锁定穿透
        controlPanel.appendChild(hideButton);          // 模型不遮挡
        controlPanel.appendChild(prevModelButton);     // 上一个模型
        controlPanel.appendChild(nextModelButton);     // 下一个模型
        controlPanel.appendChild(subtitleButton);          // 字幕开关
        controlPanel.appendChild(voiceControlBtn);        // 语音控制
        controlPanel.appendChild(textControlBtn); 
        controlPanel.appendChild(moreButton);          // 🌟 更多按钮
        controlPanel.appendChild(refreshButton);       // 刷新
        controlPanel.appendChild(closeButton);         // 关闭


        // 2. 组装子面板（收纳次要按钮）
        if (isElectron) {
            subPanel.appendChild(vmcButton);           // VMC 设置
        }
        subPanel.appendChild(idleAnimationButton);     // 闲置动画
        subPanel.appendChild(switchCtrlBtn);           // 第一人称
        subPanel.appendChild(moveModeBtn);             // 物体平移缩放
        subPanel.appendChild(wsStatusButton);          // WS 状态
        subPanel.appendChild(xrAutoBtn);               // XR

        // 3. 把子面板挂载到主面板内部
        controlPanel.appendChild(subPanel);
        
        // 4. 将所有需要被“锁定”操作隐藏的按钮放入数组
        controlButtons.push(
            dragButton,
            hideButton,
            prevModelButton, 
            nextModelButton, 
            voiceControlBtn,
            textControlBtn,
            moreButton,          // 让"更多"按钮受锁定控制
            refreshButton, 
            closeButton,
            // 以下为子面板内的按钮，一同加入数组确保状态一致
            subtitleButton, 
            idleAnimationButton, 
            switchCtrlBtn,
            moveModeBtn,
            wsStatusButton,
            xrAutoBtn
        );
        if (isElectron) controlButtons.push(vmcButton);

        // 5. 添加到页面
        document.body.appendChild(controlPanel);

        // 初始化所有提示文本
        dragButton.title = await t('dragWindow');
        refreshButton.title = await t('refreshWindow');
        closeButton.title = await t('closeWindow');
        
        addHoverEffect(dragButton, await t('dragWindow'));
        addHoverEffect(lockButton, isMouseLocked ? await t('UnlockWindow') : await t('LockWindow'));
        addHoverEffect(hideButton, isAutoHideActive ? await t('AutoHideEnabled') : await t('AutoHideDescription'));
        addHoverEffect(refreshButton, await t('refreshWindow'));
        addHoverEffect(closeButton, await t('closeWindow'));
        
        addHoverEffect(wsStatusButton, wsConnected ? await t('WebSocketConnected') : await t('WebSocketDisconnected'));
        addHoverEffect(subtitleButton, isSubtitleEnabled ? await t('SubtitleEnabled') : await t('SubtitleDisabled'));
        addHoverEffect(idleAnimationButton, useVRMAIdleAnimations ? await t('UsingVRMAAnimations') : await t('UsingProceduralAnimations'));
        addHoverEffect(xrAutoBtn, await t('EnterXR') || 'Enter XR');
        addHoverEffect(switchCtrlBtn, pointerLocked ? await t('ExitFirstPerson') || 'Exit First-Person' : await t('EnterFirstPerson') || 'Enter First-Person');
        
        if (isElectron) {
            addHoverEffect(vmcButton, await t('vmcSettings') || 'VMC Settings');
        }

        async function updateButtonTooltips() {
            addHoverEffect(lockButton, isMouseLocked ? await t('UnlockWindow') : await t('LockWindow'));
            addHoverEffect(hideButton, isAutoHideActive ? await t('AutoHideEnabled') : await t('AutoHideDescription'));
            addHoverEffect(wsStatusButton, wsConnected ? await t('WebSocketConnected') : await t('WebSocketDisconnected'));
            addHoverEffect(subtitleButton, isSubtitleEnabled ? await t('SubtitleEnabled') : await t('SubtitleDisabled'));
            addHoverEffect(switchCtrlBtn, pointerLocked ? await t('ExitFirstPerson') || 'Exit First-Person (WASD+QE)' : await t('EnterFirstPerson') || 'Enter First-Person (WASD+QE)');
            addHoverEffect(idleAnimationButton, useVRMAIdleAnimations ? await t('UsingVRMAAnimations') : await t('UsingProceduralAnimations'));
            
            const prevModel = getPrevModelInfo();
            const nextModel = getNextModelInfo();
            addHoverEffect(prevModelButton, prevModel ? `${await t('Previous')}: ${prevModel.name}` : await t('NoPreviousModel'));
            addHoverEffect(nextModelButton, nextModel ? `${await t('Next')}: ${nextModel.name}` : await t('NoNextModel'));
            switch (transformState) {
                case 0: moveModeBtn.title = await t('ModeOff') || 'Mode: Off'; break;
                case 1: moveModeBtn.title = await t('ModeMove') || 'Move Mode'; break;
                case 2: moveModeBtn.title = await t('ModeRotate') || 'Rotate Mode'; break;
                case 3: moveModeBtn.title = await t('ModeScale') || 'Scale Mode'; break;
            }
            const vText = pttVisible ? await t('DisableVoiceInput') : await t('EnableVoiceInput');
            addHoverEffect(voiceControlBtn, vText || (pttVisible ? 'Disable voice input' : 'Enable voice input'));
            const tText = textInputVisible ? await t('DisableTextInput') : await t('EnableTextInput');
            addHoverEffect(textControlBtn, tText || (textInputVisible ? 'Disable text input' : 'Enable text input'));
        }
        setInterval(updateButtonTooltips, 1000);

        // ======= 显示/隐藏控制逻辑 (整个面板的自动淡出) =======
        let hideTimeout;
        let isControlPanelHovered = false;
        
        function showControlPanel() {
            clearTimeout(hideTimeout);
            controlPanel.style.opacity = '1';
            controlPanel.style.visibility = 'visible';
            controlPanel.style.transform = 'translateX(0)';
            controlPanel.style.pointerEvents = 'auto';
        }
        
        function hideControlPanel() {
            if (!isControlPanelHovered) {
                // 如果鼠标静止，自动折叠子面板
                if (isSubPanelOpen) {
                    isSubPanelOpen = false;
                    updateMoreButtonState();
                }
                controlPanel.style.opacity = '0';
                controlPanel.style.visibility = 'hidden';
                controlPanel.style.transform = 'translateX(20px)';
                controlPanel.style.pointerEvents = 'none';
            }
        }
        
        function scheduleHide() {
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(hideControlPanel, isMouseLocked ? 200 : 1200);
        }
        
        document.body.addEventListener('mouseenter', () => { showControlPanel(); });
        document.body.addEventListener('mousemove', () => { showControlPanel(); scheduleHide(); });
        document.body.addEventListener('mouseleave', () => { if (!isControlPanelHovered) scheduleHide(); });

        // 【新增移动端优化】点击屏幕呼出控制面板并隐藏 Tooltip
        document.body.addEventListener('touchstart', (e) => {
            hideTooltip();
            // 如果点击的是控制面板内的元素，不处理，让面板自己处理
            if (controlPanel.contains(e.target)) return;
            showControlPanel(); 
            scheduleHide(); 
        }, { passive: true });
        
        controlPanel.addEventListener('mouseenter', () => {
            if (renderer.xr.isPresenting) return; 
            isControlPanelHovered = true;
            clearTimeout(hideTimeout);
            showControlPanel();
            if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
        });
        
        controlPanel.addEventListener('mouseleave', () => {
            isControlPanelHovered = false;
            scheduleHide();
            if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
        });

        // 【新增移动端优化】触控面板时保持面板显示
        controlPanel.addEventListener('touchstart', () => {
            if (renderer.xr.isPresenting) return; 
            isControlPanelHovered = true;
            clearTimeout(hideTimeout);
            showControlPanel();
            if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
        }, { passive: true });

        controlPanel.addEventListener('touchend', () => {
            isControlPanelHovered = false;
            scheduleHide();
            if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
        }, { passive: true });
        
        let mouseStopTimeout;
        document.body.addEventListener('mousemove', () => {
            clearTimeout(mouseStopTimeout);
            mouseStopTimeout = setTimeout(() => {
                if (!isControlPanelHovered) hideControlPanel();
            }, isMouseLocked ? 200 : 1200); 
        });
        
        scheduleHide();
        setupPttInteraction();
        setupTextInteraction();

        // ======= 【新增】锁定状态下放行底部交互组件的鼠标穿透 =======
        const pttBtn = document.getElementById('ptt-floating-btn');
        if (pttBtn) {
            pttBtn.addEventListener('mouseenter', () => {
                if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
            });
            pttBtn.addEventListener('mouseleave', () => {
                if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            });
        }

        const textInputContainer = document.getElementById('text-input-container');
        const textInputField = document.getElementById('text-input-field');
        if (textInputContainer && textInputField) {
            textInputContainer.addEventListener('mouseenter', () => {
                if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
            });
            textInputContainer.addEventListener('mouseleave', () => {
                // 如果鼠标移出且输入框没有聚焦，才恢复鼠标穿透
                if (isMouseLocked && window.electronAPI && document.activeElement !== textInputField) {
                    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
                }
            });
            textInputField.addEventListener('blur', () => {
                // 输入框失去焦点时，如果鼠标已经不在容器内，恢复穿透
                if (isMouseLocked && window.electronAPI && !textInputContainer.matches(':hover')) {
                    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
                }
            });
            textInputField.addEventListener('focus', () => {
                // 输入框聚焦时强制取消穿透，防止打字打一半鼠标乱晃导致键盘失焦
                if (isMouseLocked && window.electronAPI) window.electronAPI.setIgnoreMouseEvents(false);
            });
        }
        // ==============================================================

        console.log('Control panel loaded; additional options collapsed.');

    }, 1000);
}

addcontrolPanel();
// 在全局变量区域添加
let ttsWebSocket = null;
let wsConnected = false;
let currentAudioContext = null; // 用于管理音频处理
const chunkAnimations = new Map(); // 用于存储每个语音块的动画状态
let vrmAudioQueue = [];            // 排序后的待播放队列
let vrmReceiveBuffer = new Map();   // 排序缓冲区
let nextExpectedIndex = 0;         // 期望的下一个 Index
let isVrmPlaying = false;          // 播放状态锁

function initTTSWebSocket() {
    const http_protocol = window.location.protocol;
    const ws_protocol = http_protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${ws_protocol}//${window.location.host}/ws/vrm`;
    
    ttsWebSocket = new WebSocket(wsUrl);
    ttsWebSocket.binaryType = 'arraybuffer'; // 必须！

    ttsWebSocket.onopen = () => { wsConnected = true; console.log('VRM Binary Connected'); };

    ttsWebSocket.onmessage = async (event) => {
        if (event.data instanceof ArrayBuffer) {
            // 1. 解析二进制
            const buffer = event.data;
            const view = new DataView(buffer);
            const jsonLen = view.getUint32(0, true);
            const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, jsonLen)));
            const audioDataBytes = new Uint8Array(buffer, 4 + jsonLen);

            if (metadata.type === 'omni_chunk') {
                isOmniMode = true;
                isAudioStreaming = true;
                if (metadata.text) fullTargetText = metadata.text;
                
                const b64 = btoa(String.fromCharCode.apply(null, audioDataBytes));
                processOmniStreaming({
                    audioData: b64,
                    sampleRate: metadata.sampleRate
                });
                
                startTypewriterLoop();
            } else if (metadata.type === 'audio_chunk') {
                const audioUrl = URL.createObjectURL(new Blob([audioDataBytes], { type: metadata.mimeType }));
                addToVrmSortBuffer({
                    audioDataUrl: audioUrl, chunkIndex: metadata.chunkIndex,
                    expressions: metadata.expressions, text: metadata.text, isBinary: true
                });
            }
        } else {
            // 处理指令 (JSON)
            try {
                const message = JSON.parse(event.data);
                // 确保两个指令处理函数均被执行
                handleVrmCoreLogic(message);
                handleTTSMessage(message); 
            } catch (e) {
                console.error("Failed to parse JSON: ", e);
            }
        }
    };
    ttsWebSocket.onclose = () => { wsConnected = false; setTimeout(initTTSWebSocket, 3000); };
}

// --- 处理指令的函数 ---
function handleVrmCoreLogic(message) {
    const { type, data } = message;
    
    // 【核心修复】当对话开始或停止时，重置所有你定义的打字机变量
    if (type === 'ttsStarted' || type === 'stopSpeaking') {
        // 1. 重置你写好的打字机变量
        isOmniMode = false;
        isAudioStreaming = false;
        fullTargetText = "";
        currentVisibleCount = 0;
        displayStartIndex = 0;
        omniNextStartTime = 0;
        omniTotalAudioDuration = 0;
        omniPlaybackStartTime = 0;
        stopTypewriterLoop(); // 调用你的停止函数
        clearSubtitle();     // 调用你的清理函数

        // 2. 重置标准 TTS 队列
        vrmAudioQueue = [];
        vrmReceiveBuffer.clear();
        nextExpectedIndex = 0;
        isVrmPlaying = false;
        haltCurrentAudio();
    }
    
    // 兼容静音块指令
    if (type === 'startSpeaking' && data.voice === 'silence') {
        addToVrmSortBuffer({ ...data, isSilence: true });
    }
}

// --- 标准 TTS 排序函数 (完整版) ---
function addToVrmSortBuffer(task) {
    vrmReceiveBuffer.set(task.chunkIndex, task);
    while (vrmReceiveBuffer.has(nextExpectedIndex)) {
        const nextTask = vrmReceiveBuffer.get(nextExpectedIndex);
        vrmAudioQueue.push(nextTask);
        vrmReceiveBuffer.delete(nextExpectedIndex);
        nextExpectedIndex++;
    }
    if (!isVrmPlaying && vrmAudioQueue.length > 0) processVrmQueue();
}

// --- 标准 TTS 播放队列 (完整版) ---
async function processVrmQueue() {
    if (vrmAudioQueue.length === 0) { isVrmPlaying = false; return; }
    isVrmPlaying = true;
    const task = vrmAudioQueue.shift();

    // 复用你的字幕渲染
    if (task.text) renderSubtitleUI(task.text);

    if (task.isSilence) {
        await new Promise(r => setTimeout(r, 600));
    } else {
        await startLipSyncForChunk(task); // 调用你那个 F1/F2 算法函数
    }

    if (task.isBinary && task.audioDataUrl) URL.revokeObjectURL(task.audioDataUrl);
    processVrmQueue();
}

initTTSWebSocket();

const VMCToVRMBlend = {
  Joy:      'happy',
  Angry:    'angry',
  Sorrow:   'sad',
  Fun:      'relaxed',
  A:        'aa',
  I:        'ih',
  U:        'ou',
  E:        'ee',
  O:        'oh',
  Blink:    'blink',
  Blink_L:  'blinkLeft',
  Blink_R:  'blinkRight',
  Surprised:'surprised',
  LookDown:   'lookDown',
  LookUp:     'lookUp',
  LookLeft:   'lookLeft',
  LookRight:  'lookRight'
};
let vmcReceiveEnabled = false;   // 是否正在 VMC 接收模式
let vmcSyncExpression = false;   // 是否同步表情（面板开关）
let vmcBoneBuffer = new Map();   // 缓存最新骨骼数据
let vmcBlendBuffer = new Map();  // 缓存最新表情数据

/* ========== VMC 接收：骨骼 + 表情 一次性完整版 ========== */
if (window.vmcAPI) {
  window.vmcAPI.onVMCOscRaw((oscMsg) => {
    if (!vmcReceiveEnabled) return;          // 总开关

    const { address, args } = oscMsg;

    /* -------- 1. 骨骼 /VMC/Ext/Bone/Pos -------- */
    if (address === '/VMC/Ext/Bone/Pos') {
      // 兼容两种常见 osc 库格式：{type,value} 或直接原始值
      const boneName = args[0].value ?? args[0];
      const x   = args[1].value ?? args[1];
      const y   = args[2].value ?? args[2];
      const z   = args[3].value ?? args[3];
      const qx  = args[4].value ?? args[4];
      const qy  = - args[5].value ?? args[5];
      const qz  = - args[6].value ?? args[6];
      const qw  = args[7].value ?? args[7];

      vmcBoneBuffer.set(boneName, {
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Quaternion(qx, qy, qz, qw)
      });
      return;
    }

    /* -------- 2. 表情 /VMC/Ext/Blend/Val -------- */
    if (address === '/VMC/Ext/Blend/Val') {
      const blendName = args[0].value ?? args[0];
      const weight  = args[1].value ?? args[1];
      vmcBlendBuffer.set(blendName, weight);
      return;
    }

    /* -------- 3. 表情 Apply -------- */
    if (address === '/VMC/Ext/Blend/Apply') {
      if (!currentVrm?.expressionManager || !vmcSyncExpression) return;
      for (const [vmcName, w] of vmcBlendBuffer) {
        const vrmName = VMCToVRMBlend[vmcName];   // 官方表情映射表
        if (vrmName) currentVrm.expressionManager.setValue(vrmName, w);
      }
    }
  });
}



// 发送消息到主界面
function sendToMain(type, data) {
    if (ttsWebSocket && wsConnected) {
        ttsWebSocket.send(JSON.stringify({
            type,
            data,
            timestamp: Date.now()
        }));
    }
}

let fullTargetText = "";          // 记录当前对话收到的所有文本
let currentVisibleCount = 0;      // 当前已显示的字符数
let displayStartIndex = 0; // 新增：锁定当前显示的起始位置
const MAX_WINDOW_SIZE = 60;  // 一屏最多显示约40个字（视UI宽度而定）
const OVERLAP_SIZE = 30;     // 翻页时保留的字数（即“半页”重叠）
const SAFE_PUNC_LIST = /[，。！？；：、“”（）《》,.!?;:()]/; // 定义安全分割的标点符号

let typewriterTimer = null;       // 打字机计时器
let isAudioStreaming = false;
let isOmniMode = false;           // 是否处于 Omni 流模式
let omniNextStartTime = 0;        // 预估的音频流结束时间点
let omniTotalAudioDuration = 0;   // 记录当前句子已接收到的音频总时长
let omniPlaybackStartTime = 0;    // 记录这句音频开始播放的绝对时间
/**
 * 强制停止所有音频播放并重置音频上下文
 * 解决“上一句话还没说完，下一句话就开始了”产生的重叠问题
 */
async function haltCurrentAudio() {
    // 1. 停止音频上下文（最关键的一步）
    if (currentAudioContext) {
        try {
            // suspend() 会立即停止音频输出
            await currentAudioContext.suspend();
            // close() 释放硬件资源，强迫下次创建新的 Context，避免时间戳错乱
            await currentAudioContext.close();
        } catch (e) {
            console.warn("AudioContext cleanup warning:", e);
        }
        currentAudioContext = null; // 置空，以便下次 processOmniStreaming 重新创建
    }

    // 2. 重置音频流时间戳
    omniNextStartTime = 0;
    
    // 3. 停止所有动画与分析器连接
    stopAllChunkAnimations();
    chunkAnimations.clear(); // 清空 Map，防止残留状态
}

function handleTTSMessage(message) {
    const { type, data } = message;

    switch (type) {
        case 'ttsStarted':
            isOmniMode = false;
            fullTargetText = "";
            currentVisibleCount = 0;
            displayStartIndex = 0;
            isAudioStreaming = false;
            omniNextStartTime = 0;
            omniTotalAudioDuration = 0;
            omniPlaybackStartTime = 0;
            stopTypewriterLoop();
            stopAllChunkAnimations();
            clearSubtitle();
            break;

        case 'omniStreaming':
            if (windowName === 'default') {
                if (!isOmniMode || (data.text && data.text.length < fullTargetText.length)) {
                    fullTargetText = "";
                    currentVisibleCount = 0;
                    displayStartIndex = 0;
                    omniNextStartTime = 0;
                    omniTotalAudioDuration = 0;
                    omniPlaybackStartTime = 0;
                    stopTypewriterLoop();
                    clearSubtitle();
                }

                isOmniMode = true;
                isAudioStreaming = true; // 标记正在接收数据流
                if (data.text) fullTargetText = data.text;
                
                // 纯文本模式下的表情与动作触发
                if (data.expressions && data.expressions.length > 0) {
                    const ALLOW_EXPS = ['surprised','happy','angry','sad','neutral','relaxed','blink','blinkLeft','blinkRight'];
                    if (idleAnimationManager) {
                        const foundMotionId = data.expressions.find(exp => motionUrlMap.has(exp));
                        if (foundMotionId) {
                            const motionUrl = motionUrlMap.get(foundMotionId);
                            if (motionUrl) {
                                console.log(`[OmniTextOnly] Triggering motion: ${foundMotionId}`);
                                idleAnimationManager.playOneShotAnimation(motionUrl);
                            }
                        }
                    }
                    const hitExpression = data.expressions.find(e => ALLOW_EXPS.includes(e));
                    if (hitExpression && currentVrm && currentVrm.expressionManager) {
                        const EMOTIONS = ['surprised', 'happy', 'angry', 'sad', 'neutral', 'relaxed'];
                        if (EMOTIONS.includes(hitExpression)) {
                            EMOTIONS.forEach(exp => {
                                currentVrm.expressionManager.setValue(exp, exp === hitExpression ? 1.0 : 0.0);
                            });
                        } else {
                            currentVrm.expressionManager.setValue(hitExpression, 1.0);
                        }
                    }
                }

                if (data.audioData) {
                    processOmniStreaming(data).then(() => startTypewriterLoop());
                } else {
                    startTypewriterLoop();
                }
            }
            break;

        case 'startSpeaking':
            if (windowName === 'default' || windowName === data.voice) {
                isOmniMode = false;
                startLipSyncForChunk(data); 
                if (data.text) {
                    updateSubtitle(data.text, data.chunkIndex);
                }
            }
            break;

        case 'stopSpeaking':
            // 强行打断：直接清除状态，不留痕迹
            isOmniMode = false;
            isAudioStreaming = false;
            stopTypewriterLoop();
            haltCurrentAudio(); 
            finalizeSpeech(true); 
            break;

        case 'allChunksCompleted':
            // 仅标记 AI 数据输入结束。打字机自会负责完整打印完毕。
            isAudioStreaming = false; 
            break;
            
        case 'chunkEnded':
            if (currentSubtitleChunkIndex === data.chunkIndex && !isOmniMode) {
                clearSubtitle();
            }
            break;
    }
}

// ==========================================
// 3. 动态打字机逻辑
// ==========================================
/**
 * 完整改进版打字机循环
 * 支持：动态语速、半页重叠翻页、标点符号安全分割、视觉反馈
 */
// 提取出的字幕渲染与滚动复用辅助函数
function updateSubtitleAndRoll() {
    const currentDisplayLength = currentVisibleCount - displayStartIndex;
    if (currentDisplayLength > MAX_WINDOW_SIZE) {
        let targetStartIndex = currentVisibleCount - OVERLAP_SIZE;
        const lookbackRange = Math.floor(MAX_WINDOW_SIZE * 0.6); 
        const searchText = fullTargetText.slice(currentVisibleCount - lookbackRange, currentVisibleCount);
        let lastPuncIndex = -1;
        for (let i = searchText.length - 1; i >= 0; i--) {
            if (SAFE_PUNC_LIST.test(searchText[i])) {
                lastPuncIndex = i;
                break;
            }
        }
        if (lastPuncIndex !== -1) {
            const foundIndex = (currentVisibleCount - lookbackRange) + lastPuncIndex + 1;
            const newOverlap = currentVisibleCount - foundIndex;
            if (newOverlap >= 5 && newOverlap <= MAX_WINDOW_SIZE * 0.8) {
                targetStartIndex = foundIndex;
            }
        }
        displayStartIndex = targetStartIndex;
    }

    const displayText = fullTargetText.slice(displayStartIndex, currentVisibleCount);
    const prefix = displayStartIndex > 0 ? "..." : "";
    renderSubtitleUI(prefix + displayText);
}

// 兼容“无音频纯文本驱动”的自适应打字机循环
function startTypewriterLoop() {
    if (typewriterTimer) return; // 防止重复启动

    // 检测当前是否处于纯文本模式（无音频输出或未启动音频节点）
    const isTextOnlyMode = !currentAudioContext || !chunkAnimations.has('omni_live_stream');

    if (isTextOnlyMode) {
        let lastUpdateTime = performance.now();
        const CHARS_PER_SECOND = 8; // 降低语速：调整为每秒 8 个中文字符，阅读体验更自然舒适

        function typeTextOnly() {
            // 如果外部调用了强行打断（如 stopSpeaking），则立即退出
            if (!isOmniMode) {
                typewriterTimer = null;
                return;
            }

            const now = performance.now();
            const elapsed = now - lastUpdateTime;
            const interval = 1000 / CHARS_PER_SECOND;
            
            if (elapsed >= interval) {
                // 平滑、逐字递增地打字，绝不跳字或闪烁
                if (currentVisibleCount < fullTargetText.length) {
                    currentVisibleCount++;
                    updateSubtitleAndRoll();
                }
                // 扣除余数，确保打字间隔时间高精度均匀
                lastUpdateTime = now - (elapsed % interval);
            }

            // 只有当所有文字均已完整打出，且 AI 流已完全停止时，才安全关闭打字机并收尾
            if (currentVisibleCount >= fullTargetText.length && (!isAudioStreaming || isTextOnlyMode)) {
                typewriterTimer = null;
                isOmniMode = false; // 打印彻底结束，释放状态
                finalizeSpeech(false);
            } else {
                typewriterTimer = requestAnimationFrame(typeTextOnly);
            }
        }
        typewriterTimer = requestAnimationFrame(typeTextOnly);
        return;
    }

    // 标准音频同步打字逻辑 (原版逻辑)
    function syncTextToAudio() {
        if (!isOmniMode || !currentAudioContext) {
            typewriterTimer = null;
            if (!currentAudioContext && currentVisibleCount >= totalChars) {
                isOmniMode = false;
                finalizeSpeech(false);
            }
            return;
        }

        const now = currentAudioContext.currentTime;
        const totalChars = fullTargetText.length;

        if (totalChars > 0 && omniTotalAudioDuration > 0) {
            const playedTime = Math.max(0, now - omniPlaybackStartTime);
            let progress = (playedTime / omniTotalAudioDuration) * 1.05; 
            progress = Math.min(1.0, progress); 

            let targetCharCount = Math.floor(progress * totalChars);

            if (!isAudioStreaming && now >= omniNextStartTime) {
                targetCharCount = totalChars;
            }

            if (targetCharCount > currentVisibleCount) {
                currentVisibleCount = targetCharCount;
                updateSubtitleAndRoll();
            }
        }

        const audioFinished = !isAudioStreaming || (omniTotalAudioDuration > 0 && now >= omniNextStartTime);
        if (!isOmniMode || (audioFinished && currentVisibleCount >= totalChars)) {
            typewriterTimer = null;
            isOmniMode = false;
            finalizeSpeech(false);
        } else {
            typewriterTimer = requestAnimationFrame(syncTextToAudio);
        }
    }

    typewriterTimer = requestAnimationFrame(syncTextToAudio);
}


function stopTypewriterLoop() {
    if (typewriterTimer) {
        cancelAnimationFrame(typewriterTimer);
        typewriterTimer = null;
    }
}

// ==========================================
// 4. 音频流处理 (Omni 模式)
// ==========================================
async function processOmniStreaming(data) {
    const chunkId = 'omni_live_stream';
    
    try {
        if (!currentAudioContext) {
            currentAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (currentAudioContext.state === 'suspended') await currentAudioContext.resume();

        let state = chunkAnimations.get(chunkId);
        if (!state) {
            state = { 
                isPlaying: true, 
                analyser: currentAudioContext.createAnalyser(), 
                expression: 'neutral' 
            };
            state.analyser.fftSize = 256;
            state.analyser.connect(currentAudioContext.destination);
            chunkAnimations.set(chunkId, state);
            startChunkAnimation(chunkId, state);
            omniNextStartTime = currentAudioContext.currentTime;
        }

        const raw = atob(data.audioData);
        const pcm16 = new Int16Array(raw.length / 2);
        for (let i = 0; i < raw.length; i += 2) {
            pcm16[i >> 1] = raw.charCodeAt(i) | (raw.charCodeAt(i + 1) << 8);
        }
        
        const buffer = currentAudioContext.createBuffer(1, pcm16.length, data.sampleRate || 24000);
        const floatData = buffer.getChannelData(0);
        for (let i = 0; i < pcm16.length; i++) {
            floatData[i] = pcm16[i] / 32768;
        }

        const source = currentAudioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(state.analyser);

        const now = currentAudioContext.currentTime;

        if (omniNextStartTime === 0 || omniPlaybackStartTime === 0) {
            omniPlaybackStartTime = Math.max(now, omniNextStartTime);
        }

        if (omniNextStartTime < now) omniNextStartTime = now;
        
        source.start(omniNextStartTime);

        omniTotalAudioDuration += buffer.duration;
        omniNextStartTime += buffer.duration;
    } catch (e) {
        console.error('Omni Streaming Error:', e);
    }
}

// ==========================================
// 5. 字幕渲染与清理
// ==========================================
function renderSubtitleUI(text) {
    if (!isSubtitleEnabled) return;
    if (!subtitleElement) initSubtitleElement();
    subtitleElement.textContent = text;
    subtitleElement.style.opacity = '1';
    if (typeof adjustSubtitleSize === 'function') adjustSubtitleSize();
}

function updateSubtitle(text, chunkIndex) {
    // 兼容传统 TTS 的字幕显示
    if (!isSubtitleEnabled || !text.trim()) return;
    renderSubtitleUI(text);
    currentSubtitleChunkIndex = chunkIndex;
}

function clearSubtitle() {
    if (subtitleElement) {
        subtitleElement.style.transition = 'opacity 0.5s ease';
        subtitleElement.style.opacity = '0';
    }
}

function finalizeSpeech(immediate = false) {
    // 停止动画驱动
    stopAllChunkAnimations();
    if (chunkAnimations.has('omni_live_stream')) {
        stopChunkAnimation('omni_live_stream');
        chunkAnimations.delete('omni_live_stream');
    }

    if (immediate) {
        clearSubtitle();
        fullTargetText = "";
        currentVisibleCount = 0;
        displayStartIndex = 0;
    } else {
        // --- 优化点：文字全部打完后，多留 2.5 秒的“静止阅读时间” ---
        if (subtitleTimeout) clearTimeout(subtitleTimeout);
        subtitleTimeout = setTimeout(() => {
            // 确保这期间没有开启新的对话
            if (!isOmniMode && !typewriterTimer) {
                clearSubtitle();
                fullTargetText = "";
                currentVisibleCount = 0;
                displayStartIndex = 0;
            }
        }, 2000); 
    }
}


// 在页面加载完成后初始化 WebSocket
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保其他组件已经准备好
    setTimeout(() => {
        initTTSWebSocket();
    }, 2000);
});

if (isElectron) {
  // 禁用 Chromium 的自动播放限制
  const disableAutoplayPolicy = () => {
    if (window.chrome && chrome.webview) {
      chrome.webview.setAutoplayPolicy('no-user-gesture-required');
    }
  };
  
  // 在用户交互后执行
  document.addEventListener('click', () => {
    disableAutoplayPolicy();
    if (currentAudioContext) {
      currentAudioContext.resume();
    }
  });
}

// 在全局变量区域添加模型切换相关变量
let currentModelIndex = 0;
let allModels = [];
let modelsInitialized = false;

// 获取所有可用模型的函数（只执行一次）
async function getAllModels() {
    if (modelsInitialized) {
        return allModels;
    }
    
    const vrmConfig = await fetchVRMConfig();
    const defaultModels = vrmConfig.defaultModels || [];
    const userModels = vrmConfig.userModels || [];
    allModels = [...defaultModels, ...userModels];
    
    // 找到当前选中模型的索引
    const selectedModelId = vrmConfig.selectedModelId;
    currentModelIndex = Math.max(0, allModels.findIndex(model => model.id === selectedModelId));
    
    modelsInitialized = true;
    console.log(`Models initialized: ${allModels.length} models available, current index: ${currentModelIndex}`);
    
    return allModels;
}

// 切换到指定索引的模型（纯前端切换）
async function switchToModel(index,isRefresh = false) {
    if (!modelsInitialized) {
        await getAllModels();
    }
    
    if (allModels.length === 0) {
        console.error('No models available');
        return;
    }
    
    // 确保索引在有效范围内（循环切换）
    const newIndex = ((index % allModels.length) + allModels.length) % allModels.length;
    
    // 如果是同一个模型，不需要切换
    if (newIndex === currentModelIndex && !isRefresh) {
        console.log('Same model selected, no need to switch');
        return;
    }
    
    currentModelIndex = newIndex;
    const selectedModel = allModels[currentModelIndex];
    // 替换userModel.path中的protocol和host
    let userModelURL = new URL(selectedModel.path);
    userModelURL.protocol = window.location.protocol;
    userModelURL.host = window.location.host;
    selectedModel.path = userModelURL.href;
    console.log(`Switching to model: ${selectedModel.name} (${selectedModel.id}) - Index: ${currentModelIndex}`);
    // 切换模型前确保画布和交互恢复为可见状态
    isModelHiddenByHover = false;
    resumeModelAnimationsAfterHide();
    if (renderer?.domElement) {
        const canvas = renderer.domElement;
        canvas.style.opacity = '1';
        canvas.style.pointerEvents = 'auto';
        canvas.style.transition = '';
        if (currentVrm) currentVrm.scene.visible = true;
    }
    
    try {
        // 显示加载提示（可选）
        showModelSwitchingIndicator(selectedModel.name);
        // 🔥 添加：停止当前的闲置动画
        if (idleAnimationManager) {
            idleAnimationManager.stopAllAnimations();
        }
        
        // 🔥 添加：重置闲置动画管理器
        idleAnimationManager = null;

        // 移除当前VRM模型
        if (currentVrm) {
            if (typeof transformControl !== 'undefined') {
                transformControl.detach();
            }
            // scene.remove(currentVrm.scene); <-- 删除这行
            currentVrmWrapper.remove(currentVrm.scene); // 从 Wrapper 移除
            currentVrm = undefined;
        }
        
        // 加载新模型
        const modelPath = selectedModel.path;
        
        loader.load(
            modelPath,
            (gltf) => {
                const vrm = gltf.userData.vrm;
                currentMixer = new THREE.AnimationMixer(vrm.scene); // 创建动画混合器
                isVRM1 = vrm.meta.metaVersion === '1';
                VRMUtils.rotateVRM0(vrm); // 旋转 VRM 使其面向正前方
                // 优化性能
                // VRMUtils.removeUnnecessaryVertices(gltf.scene);
                // 添加材质修复
                // gltf.scene.traverse((obj) => {
                // if (obj.isMesh && obj.material) {
                //     // 解决透明材质黑边问题
                //     if (obj.material.transparent) {
                //         obj.material.alphaTest = 0.01;
                //         obj.material.depthWrite = true;
                //         obj.material.needsUpdate = true;
                //     }
                    
                //     // 确保正确混合模式
                //     obj.material.blending = THREE.NormalBlending;
                //     obj.material.premultipliedAlpha = false;
                    
                //     // 设置渲染顺序
                //     obj.renderOrder = obj.material.transparent ? 1 : 0;
                // }
                // });

                // VRMUtils.combineSkeletons(gltf.scene);
                // VRMUtils.combineMorphs(vrm);
                
                // 启用 Spring Bone 物理模拟
                if (vrm.springBoneManager) {
                    console.log('Spring Bone Manager found:', vrm.springBoneManager);
                }
                
                // 禁用视锥体剔除
                vrm.scene.traverse((obj) => {
                    obj.frustumCulled = false;
                });
                
                vrm.lookAt.target = camera;

                if (vrm.lookAt.applier) {
                    vrm.lookAt.applier.yawLimit = 60.0;   // 左右转头最大 60 度
                    vrm.lookAt.applier.pitchLimit = 30.0; // 上下抬头最大 30 度
                }

                currentVrm = vrm;
                console.log('New VRM loaded:', vrm);
                currentVrmWrapper.add(vrm.scene);
                // 让模型投射阴影
                vrm.scene.traverse((obj) => {
                    if (obj.isMesh) {
                        obj.castShadow = true;
                        obj.receiveShadow = true;   // 如需让模型本身也接收阴影可保留
                    }
                });
                // 设置自然姿势
                setNaturalPose(vrm);

                if (vrm.expressionManager) {
                    vrm.expressionManager.setValue('neutral', 1.0);
                }

                const breathClip = createBreathClip(vrm);
                breathAction = currentMixer.clipAction(breathClip);
                breathAction.setLoop(THREE.LoopRepeat);
                breathAction.play();

                const blinkClip = createBlinkClip(vrm);
                blinkAction = currentMixer.clipAction(blinkClip);
                blinkAction.setLoop(THREE.LoopRepeat);
                blinkAction.play();
                
                // 🔥 关键修复：重新创建闲置动画管理器并重新设置动画队列
                idleAnimationManager = new IdleAnimationManager(vrm, currentMixer);
                
                // 🔥 重要：重新设置VRMA动画队列（如果之前已经加载过）
                if (useVRMAIdleAnimations && idleAnimations.length > 0) {
                    idleAnimationManager.setAnimationQueue(idleAnimations);
                }
                
                // 🔥 重新启动闲置动画循环
                startIdleAnimationLoop();

                // 隐藏加载提示
                hideModelSwitchingIndicator();
                
                if (typeof transformControl !== 'undefined' && transformControl.object) {
                    transformControl.attach(currentVrmWrapper);
                }

                console.log(`Successfully switched to model: ${selectedModel.name}`);
            },
            (progress) => {
                console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
                // 可以在这里更新加载进度
                updateModelLoadingProgress(progress.loaded / progress.total);
            },
            (error) => {
                console.error('Error loading model:', error);
                hideModelSwitchingIndicator();
                
                // 如果加载失败，尝试回到之前的模型
                if (allModels.length > 1) {
                    console.log('Attempting to load fallback model...');
                    // 尝试加载第一个模型作为备用
                    if (currentModelIndex !== 0) {
                        switchToModel(0);
                    }
                }
            }
        );
        
    } catch (error) {
        console.error('Error switching model:', error);
        hideModelSwitchingIndicator();
    }
}

// 显示模型切换指示器（可选功能）
function showModelSwitchingIndicator(modelName) {
    // 创建或显示加载提示
    let indicator = document.getElementById('model-switching-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'model-switching-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-size: 16px;
            z-index: 10000;
            text-align: center;
            backdrop-filter: blur(10px);
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(indicator);
    }
    
    indicator.innerHTML = `
        <div style="margin-bottom: 10px;">
            <i class="fas fa-sync-alt fa-spin"></i>
        </div>
        <div>Loading ${modelName}...</div>
        <div id="loading-progress" style="margin-top: 10px; font-size: 14px; opacity: 0.8;"></div>
    `;
    indicator.style.display = 'block';
    indicator.style.opacity = '1';
}

// 更新加载进度
function updateModelLoadingProgress(progress) {
    const progressElement = document.getElementById('loading-progress');
    if (progressElement) {
        progressElement.textContent = `${Math.round(progress * 100)}%`;
    }
}

// 隐藏模型切换指示器
function hideModelSwitchingIndicator() {
    const indicator = document.getElementById('model-switching-indicator');
    if (indicator) {
        indicator.style.opacity = '0';
        setTimeout(() => {
            indicator.style.display = 'none';
        }, 300);
    }
}

// 获取当前模型信息
function getCurrentModelInfo() {
    if (allModels.length > 0 && currentModelIndex >= 0 && currentModelIndex < allModels.length) {
        return allModels[currentModelIndex];
    }
    return null;
}

// 获取下一个模型信息（用于预览）
function getNextModelInfo() {
    if (allModels.length === 0) return null;
    const nextIndex = ((currentModelIndex + 1) % allModels.length + allModels.length) % allModels.length;
    return allModels[nextIndex];
}

// 获取上一个模型信息（用于预览）
function getPrevModelInfo() {
    if (allModels.length === 0) return null;
    const prevIndex = ((currentModelIndex - 1) % allModels.length + allModels.length) % allModels.length;
    return allModels[prevIndex];
}

animate();