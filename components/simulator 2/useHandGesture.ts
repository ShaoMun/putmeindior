"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import * as tf from "@tensorflow/tfjs";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export type GestureLabel = "idle" | "step" | "run";

export interface HandLandmarks {
  left: NormalizedLandmark[] | null;
  right: NormalizedLandmark[] | null;
}

const EMPTY_LANDMARKS: HandLandmarks = { left: null, right: null };

/** Flatten landmarks to a feature vector (21*3*2 = 126 for both hands, pad if one missing) */
function landmarksToFeatureVector(hands: HandLandmarks): number[] {
  const left = hands.left ?? Array(21).fill({ x: 0, y: 0, z: 0 });
  const right = hands.right ?? Array(21).fill({ x: 0, y: 0, z: 0 });
  const l = left.slice(0, 21).flatMap((p) => [p.x, p.y, p.z]);
  const r = right.slice(0, 21).flatMap((p) => [p.x, p.y, p.z]);
  return [...l, ...r];
}

const CAMERA_DENIED_MSG =
  "Camera access denied or dismissed. Allow camera in your browser to use hand gestures, then click Retry.";

export function useHandGesture() {
  const [landmarks, setLandmarks] = useState<HandLandmarks>(EMPTY_LANDMARKS);
  const [gesture, setGesture] = useState<GestureLabel>("idle");
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const tfModelRef = useRef<tf.LayersModel | null>(null);
  const rafRef = useRef<number>(0);
  const lastGestureTime = useRef(0);

  const retry = useCallback(() => {
    setCameraError(null);
    setRetryCount((c) => c + 1);
  }, []);

  const loadTfModel = useCallback(async () => {
    try {
      const model = await tf.loadLayersModel("/gesture-model/model.json");
      tfModelRef.current = model;
      return true;
    } catch {
      tfModelRef.current = null;
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    setCameraError(null);

    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL },
          numHands: 2,
          runningMode: "VIDEO",
        });
        if (cancelled) return;
        handLandmarkerRef.current = handLandmarker;

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        });
      if (cancelled) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = mediaStream;

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = mediaStream;
      await video.play();
      if (cancelled) return;
      videoRef.current = video;

      await loadTfModel();
      setReady(true);

      const runDetection = (timestamp: number) => {
        if (cancelled || !handLandmarkerRef.current || !videoRef.current) return;
        const detector = handLandmarkerRef.current;
        const video = videoRef.current;
        if (video.readyState < 2) {
          rafRef.current = requestAnimationFrame(runDetection);
          return;
        }
        try {
          const result = detector.detectForVideo(video, timestamp);
          const lm = result.landmarks ?? [];
          const handedness = result.handedness ?? [];
          let left: NormalizedLandmark[] | null = null;
          let right: NormalizedLandmark[] | null = null;
          for (let i = 0; i < lm.length; i++) {
            const name = handedness[i]?.[0]?.categoryName ?? "";
            if (name.toLowerCase() === "left") left = lm[i];
            else if (name.toLowerCase() === "right") right = lm[i];
            else {
              const cx = lm[i].reduce((s, p) => s + p.x, 0) / lm[i].length;
              if (cx < 0.5) left = lm[i];
              else right = lm[i];
            }
          }
          setLandmarks({ left, right });

          const model = tfModelRef.current;
          if (model) {
            const features = landmarksToFeatureVector({ left, right });
            const input = tf.tensor2d([features]);
            const pred = model.predict(input) as tf.Tensor;
            const argMaxTensor = pred.argMax(-1);
            argMaxTensor.data().then((data) => {
              const idx = data[0];
              input.dispose();
              pred.dispose();
              argMaxTensor.dispose();
              const labels: GestureLabel[] = ["idle", "step", "run"];
              const next = labels[idx] ?? "idle";
              const now = Date.now();
              if (next !== "idle" && now - lastGestureTime.current > 300) {
                lastGestureTime.current = now;
                setGesture(next);
              } else if (next === "idle") {
                setGesture("idle");
              }
            }).catch(() => {
              input.dispose();
              pred.dispose();
              argMaxTensor.dispose();
              setGesture("idle");
            });
          } else {
            setGesture("idle");
          }
        } catch (_) {
          setLandmarks(EMPTY_LANDMARKS);
        }
        rafRef.current = requestAnimationFrame(runDetection);
      };
      rafRef.current = requestAnimationFrame(runDetection);
      } catch (err) {
        if (cancelled) return;
        const isPermissionDenied =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
        const msg = err instanceof Error ? err.message : String(err);
        if (isPermissionDenied || /permission dismissed|denied/i.test(msg)) {
          setCameraError(CAMERA_DENIED_MSG);
        } else {
          setCameraError(msg || "Camera unavailable");
        }
        setReady(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      videoRef.current = null;
      handLandmarkerRef.current = null;
      if (tfModelRef.current) {
        tfModelRef.current = null;
      }
    };
  }, [loadTfModel, retryCount]);

  return { landmarks, gesture, ready, cameraError, retry };
}
