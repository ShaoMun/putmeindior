"use client";

import { useEffect, useRef } from "react";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { HandLandmarks } from "./useHandGesture";

/** MediaPipe hand landmark connections (indices) for 21-point hand model */
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  flipX: boolean,
  offsetX: number,
  offsetY: number,
  scale: number,
  width: number,
  height: number
) {
  const x = (p: NormalizedLandmark) => {
    const nx = flipX ? 1 - p.x : p.x;
    return offsetX + nx * scale * width;
  };
  const y = (p: NormalizedLandmark) => offsetY + p.y * scale * height;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [i, j] of HAND_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b) continue;
    ctx.moveTo(x(a), y(a));
    ctx.lineTo(x(b), y(b));
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(x(p), y(p), 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

interface VirtualHandsOverlayProps {
  landmarks: HandLandmarks;
}

export default function VirtualHandsOverlay({ landmarks }: VirtualHandsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!landmarks.left && !landmarks.right)) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio ?? 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }
    ctx.clearRect(0, 0, w, h);

    const zoneH = h * 0.35;
    const zoneW = w * 0.45;
    const scale = 0.5;

    if (landmarks.left && landmarks.left.length >= 21) {
      drawHand(
        ctx,
        landmarks.left,
        true,
        w * 0.08,
        h - zoneH,
        scale,
        zoneW,
        zoneH
      );
    }
    if (landmarks.right && landmarks.right.length >= 21) {
      drawHand(
        ctx,
        landmarks.right,
        false,
        w - w * 0.08 - zoneW,
        h - zoneH,
        scale,
        zoneW,
        zoneH
      );
    }
  }, [landmarks]);

  return (
    <canvas
      ref={canvasRef}
      className="hands-layer"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
      width={800}
      height={600}
      aria-hidden
    />
  );
}
