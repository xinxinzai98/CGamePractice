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
    script.onerror = () => reject(new Error('Portrait animation module failed'));
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
  const [ready, setReady] = useState(false);
  const src = `/assets/pilot-${pilot.toLowerCase()}.png`;
  useEffect(() => {
    let disposed = false;
    setReady(false);
    const element = canvas.current;
    if (!element) return;
    const onReady = () => setReady(true),
      onError = () => setReady(false);
    element.addEventListener('portraitmotionready', onReady);
    element.addEventListener('portraitmotionerror', onError);
    void loadModule()
      .then(() => {
        if (disposed) return;
        controller.current = window.PortraitMotion?.create(element, { src, reducedMotion }) ?? null;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      element.removeEventListener('portraitmotionready', onReady);
      element.removeEventListener('portraitmotionerror', onError);
      controller.current?.destroy();
      controller.current = null;
    };
  }, [src]);
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
    </div>
  );
}
