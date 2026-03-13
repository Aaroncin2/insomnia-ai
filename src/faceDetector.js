/**
 * Face Detector Module
 * Uses MediaPipe Face Landmarker to detect 468 facial landmarks.
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let isReady = false;

/**
 * Initialize the FaceLandmarker model.
 */
export async function initFaceDetector(onProgress) {
  try {
    if (onProgress) onProgress('Cargando modelos de IA...');
    
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    if (onProgress) onProgress('Inicializando detector facial...');

    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });

    isReady = true;
    if (onProgress) onProgress('Detector listo ✓');
    return true;
  } catch (error) {
    console.error('Error al inicializar FaceLandmarker:', error);
    if (onProgress) onProgress('Error al cargar modelo');
    return false;
  }
}

/**
 * Detect face landmarks from a video frame.
 * @param {HTMLVideoElement} video
 * @param {number} timestamp – performance.now() ms
 * @returns {{ landmarks: Array, transformationMatrix: Float32Array | null } | null}
 */
export function detectFace(video, timestamp) {
  if (!isReady || !faceLandmarker) return null;
  
  try {
    const results = faceLandmarker.detectForVideo(video, timestamp);
    
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      return {
        landmarks: results.faceLandmarks[0],
        transformationMatrix: results.facialTransformationMatrixes?.[0] ?? null,
      };
    }
    return null;
  } catch (e) {
    // occasional timing errors, silently skip
    return null;
  }
}

export function isFaceDetectorReady() {
  return isReady;
}
