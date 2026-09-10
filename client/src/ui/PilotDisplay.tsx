import { useEffect, useRef, useState } from 'react';
import type { Character } from '@dawn/simulation';
import portraitModuleUrl from '../../../web/portrait-motion.js?url';
interface MotionController {
  setSource(src: string): void;
  setReducedMotion(value: boolean): void;
  setActive(value: boolean): void;
  destroy(): void;
}
declare global {
  interface Window {
    PortraitMotion?: {
      create(
        canvas: HTMLCanvasElement,
        options: { src: string; reducedMotion: boolean },
      ): MotionController | null;
    };
  }
}
let modulePromise: Promise<void> | null = null;
function loadModule() {
  if (window.PortraitMotion) return Promise.resolve();
  modulePromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = portraitModuleUrl;
    script.onload = () => resolve();
    script.onerror = () => {
      modulePromise = null;
      script.remove();
      reject(new Error('角色动态载入失败，可重试。'));
    };
    document.head.append(script);
  });
  return modulePromise;
}
export function PilotDisplay({
  pilot,
  reducedMotion = false,
}: {
  pilot: Character;
  reducedMotion?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    controller = useRef<MotionController | null>(null);
  const latestReducedMotion = useRef(reducedMotion);
  latestReducedMotion.current = reducedMotion;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const src = `/assets/pilot-${pilot.toLowerCase()}.png`;
  useEffect(() => {
    let disposed = false;
    setReady(false);
    setFailed(false);
    const element = canvas.current;
    if (!element) return;
    const onReady = () => {
        setReady(true);
        setFailed(false);
      },
      onError = () => {
        setReady(false);
        setFailed(true);
      };
    element.addEventListener('portraitmotionready', onReady);
    element.addEventListener('portraitmotionerror', onError);
    void loadModule()
      .then(() => {
        if (disposed) return;
        controller.current =
          window.PortraitMotion?.create(element, {
            src,
            reducedMotion: latestReducedMotion.current,
          }) ?? null;
        if (!controller.current) setFailed(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      element.removeEventListener('portraitmotionready', onReady);
      element.removeEventListener('portraitmotionerror', onError);
      controller.current?.destroy();
      controller.current = null;
    };
  }, [src, attempt]);
  useEffect(() => controller.current?.setReducedMotion(reducedMotion), [reducedMotion]);
  return (
    <div className="pilot-display">
      <img
        src={src}
        alt={pilot === 'Asuka' ? '明日香' : '绫波丽'}
        style={{ opacity: ready ? 0 : 1 }}
      />
      <canvas
        ref={canvas}
        width={512}
        height={768}
        aria-hidden="true"
        style={{ opacity: ready ? 1 : 0 }}
      />
      {failed && (
        <button
          className="text-button"
          style={{ position: 'absolute', bottom: 72, right: 16, zIndex: 2, pointerEvents: 'auto' }}
          onClick={() => setAttempt((value) => value + 1)}
        >
          重试角色动态
        </button>
      )}
    </div>
  );
}
