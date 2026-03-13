/**
 * Distraction Detector Module
 * Estimates head pose (yaw, pitch, roll) from facial landmarks
 * to detect when the person is looking away from screen.
 */

// Key landmark indices for head pose estimation
// Nose tip, chin, left eye outer, right eye outer, left mouth, right mouth
const POSE_LANDMARKS = {
  noseTip: 1,
  chin: 152,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  leftMouth: 61,
  rightMouth: 291,
  foreheadCenter: 10,
  noseBase: 168,
};

let config = {
  yawThreshold: 25,        // degrees
  pitchThreshold: 20,      // degrees
  consecutiveFrames: 15,
};

let distractionCount = 0;
let currentState = 'focused'; // focused | distracted
let lastState = 'focused';

/**
 * Estimate head yaw and pitch from landmarks using geometric approach.
 * Uses relative positions of nose, eyes, and mouth to approximate angles.
 */
function estimateHeadPose(landmarks) {
  const nose = landmarks[POSE_LANDMARKS.noseTip];
  const chin = landmarks[POSE_LANDMARKS.chin];
  const leftEye = landmarks[POSE_LANDMARKS.leftEyeOuter];
  const rightEye = landmarks[POSE_LANDMARKS.rightEyeOuter];
  const leftMouth = landmarks[POSE_LANDMARKS.leftMouth];
  const rightMouth = landmarks[POSE_LANDMARKS.rightMouth];
  const forehead = landmarks[POSE_LANDMARKS.foreheadCenter];

  // Yaw estimation: compare nose position relative to eye midpoint
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeWidth = Math.abs(rightEye.x - leftEye.x);
  
  if (eyeWidth === 0) return { yaw: 0, pitch: 0, roll: 0 };
  
  // Nose offset from eye midpoint, normalized by eye width
  const yawRatio = (nose.x - eyeMidX) / eyeWidth;
  // Convert to approximate degrees (scale factor ~60-80°)
  const yaw = yawRatio * 70;
  
  // Pitch estimation: vertical position of nose relative to face height
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceHeight === 0) return { yaw, pitch: 0, roll: 0 };
  
  const faceCenterY = (forehead.y + chin.y) / 2;
  const nosePct = (nose.y - faceCenterY) / faceHeight;
  // Nose below center = looking down (positive pitch)
  const pitch = nosePct * 120;
  
  // Roll estimation: angle of the line between eyes
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
  
  return {
    yaw: Math.round(yaw * 10) / 10,
    pitch: Math.round(pitch * 10) / 10,
    roll: Math.round(roll * 10) / 10,
  };
}

/**
 * Analyze distraction from landmarks.
 * @returns {{ yaw, pitch, roll, state: string, stateChanged: boolean }}
 */
export function analyzeDistraction(landmarks) {
  const pose = estimateHeadPose(landmarks);
  
  const isDistracted = Math.abs(pose.yaw) > config.yawThreshold || 
                       Math.abs(pose.pitch) > config.pitchThreshold;
  
  lastState = currentState;
  
  if (isDistracted) {
    distractionCount++;
    if (distractionCount >= config.consecutiveFrames) {
      currentState = 'distracted';
    }
  } else {
    distractionCount = Math.max(0, distractionCount - 2);
    if (distractionCount < config.consecutiveFrames / 2) {
      currentState = 'focused';
    }
  }
  
  return {
    ...pose,
    state: currentState,
    stateChanged: lastState !== currentState,
    isLookingAway: isDistracted,
    distractionFrames: distractionCount,
  };
}

/**
 * Update configuration.
 */
export function updateDistractionConfig(newConfig) {
  Object.assign(config, newConfig);
}

/**
 * Reset state.
 */
export function resetDistractionState() {
  distractionCount = 0;
  currentState = 'focused';
  lastState = 'focused';
}

export function getDistractionConfig() {
  return { ...config };
}
