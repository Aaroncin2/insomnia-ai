/**
 * Drowsiness Detector Module
 * Calculates EAR (Eye Aspect Ratio) and MAR (Mouth Aspect Ratio)
 * to detect drowsiness and yawning from facial landmarks.
 */

// MediaPipe Face Mesh landmark indices for eyes
// Left eye (right in mirrored video)
const LEFT_EYE = {
  top: [159, 145],     // Upper/lower vertical pair 1
  mid: [158, 153],     // Upper/lower vertical pair 2
  corners: [33, 133],  // Inner/outer corners (horizontal)
};

// Right eye
const RIGHT_EYE = {
  top: [386, 374],
  mid: [385, 380],
  corners: [362, 263],
};

// Mouth landmarks
const MOUTH = {
  top: [13],        // Upper lip center
  bottom: [14],     // Lower lip center
  topInner: [82, 312],   // Additional upper points
  bottomInner: [87, 317], // Additional lower points
  corners: [61, 291],     // Left and right mouth corners
};

// Default thresholds
let config = {
  earThreshold: 0.25,
  earConsecutiveFrames: 20,
  marThreshold: 0.6,
};

// State  
let earBelowCount = 0;
let currentState = 'alert'; // alert | drowsy | sleeping
let yawnDetected = false;
let lastYawnTime = 0;

/**
 * Euclidean distance between two 3D points.
 */
function dist(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate EAR for a single eye.
 * EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
 */
function computeEAR(landmarks, eye) {
  const v1 = dist(landmarks[eye.top[0]], landmarks[eye.top[1]]);
  const v2 = dist(landmarks[eye.mid[0]], landmarks[eye.mid[1]]);
  const h = dist(landmarks[eye.corners[0]], landmarks[eye.corners[1]]);
  
  if (h === 0) return 0.3; // fallback
  return (v1 + v2) / (2.0 * h);
}

/**
 * Calculate MAR (Mouth Aspect Ratio).
 * MAR = vertical_distances / horizontal_distance
 */
function computeMAR(landmarks) {
  // Vertical distances
  const v1 = dist(landmarks[MOUTH.top[0]], landmarks[MOUTH.bottom[0]]);
  const v2 = dist(landmarks[MOUTH.topInner[0]], landmarks[MOUTH.bottomInner[0]]);
  const v3 = dist(landmarks[MOUTH.topInner[1]], landmarks[MOUTH.bottomInner[1]]);
  
  // Horizontal distance
  const h = dist(landmarks[MOUTH.corners[0]], landmarks[MOUTH.corners[1]]);
  
  if (h === 0) return 0;
  return (v1 + v2 + v3) / (3.0 * h);
}

/**
 * Analyze drowsiness from landmarks.
 * @returns {{ ear: number, mar: number, state: string, yawnDetected: boolean }}
 */
export function analyzeDrowsiness(landmarks) {
  const leftEAR = computeEAR(landmarks, LEFT_EYE);
  const rightEAR = computeEAR(landmarks, RIGHT_EYE);
  const ear = (leftEAR + rightEAR) / 2.0;
  
  const mar = computeMAR(landmarks);
  
  // Drowsiness logic
  let stateChanged = false;
  const prevState = currentState;
  
  if (ear < config.earThreshold) {
    earBelowCount++;
    
    if (earBelowCount >= config.earConsecutiveFrames * 2) {
      currentState = 'sleeping';
    } else if (earBelowCount >= config.earConsecutiveFrames) {
      currentState = 'drowsy';
    }
  } else {
    earBelowCount = Math.max(0, earBelowCount - 2); // gradual decay
    if (earBelowCount < config.earConsecutiveFrames / 2) {
      currentState = 'alert';
    }
  }
  
  stateChanged = prevState !== currentState;
  
  // Yawn detection
  const now = Date.now();
  yawnDetected = false;
  if (mar > config.marThreshold && (now - lastYawnTime) > 3000) {
    yawnDetected = true;
    lastYawnTime = now;
  }
  
  return {
    ear: Math.round(ear * 1000) / 1000,
    mar: Math.round(mar * 1000) / 1000,
    leftEAR: Math.round(leftEAR * 1000) / 1000,
    rightEAR: Math.round(rightEAR * 1000) / 1000,
    state: currentState,
    stateChanged,
    yawnDetected,
    eyesClosed: ear < config.earThreshold,
    closedFrames: earBelowCount,
  };
}

/**
 * Update configuration thresholds.
 */
export function updateDrowsinessConfig(newConfig) {
  Object.assign(config, newConfig);
}

/**
 * Reset state (e.g. when stopping detection).
 */
export function resetDrowsinessState() {
  earBelowCount = 0;
  currentState = 'alert';
  yawnDetected = false;
  lastYawnTime = 0;
}

export function getDrowsinessConfig() {
  return { ...config };
}
