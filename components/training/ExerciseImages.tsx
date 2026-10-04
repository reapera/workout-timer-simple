"use client";

import { useEffect, useState } from "react";

/**
 * Start and end position, crossfading back and forth so the picture reads as
 * a movement. With reduced motion it holds still and a tap flips the frame.
 */
export function ExerciseImages({ images, name }: { images: string[]; name: string }) {
  const [frame, setFrame] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (images.length < 2 || still) return;
    const id = window.setInterval(() => setFrame((current) => (current + 1) % images.length), 1400);
    return () => window.clearInterval(id);
  }, [images.length, still]);

  if (!images.length) {
    return (
      <div className="flex aspect-[3/2] w-full items-center justify-center rounded-2xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-6 text-center text-sm text-white/40">
        No picture for this one — follow the steps below.
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setFrame((current) => (current + 1) % images.length)}
      className="relative block aspect-[3/2] w-full overflow-hidden rounded-2xl bg-[var(--color-surface-2)]"
      aria-label={`${name}: showing the ${frame === 0 ? "start" : "end"} position. Tap to switch.`}
    >
      {images.map((src, index) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
            index === frame ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold tracking-[0.15em] text-white/85 uppercase">
        {frame === 0 ? "Start" : "Finish"}
      </span>
    </button>
  );
}

export function ExerciseThumb({ images }: { images: string[] }) {
  if (!images.length) {
    return <div className="h-11 w-16 shrink-0 rounded-lg bg-[var(--color-surface-2)]" aria-hidden="true" />;
  }
  return (
    <img
      src={images[images.length - 1]}
      alt=""
      loading="lazy"
      className="h-11 w-16 shrink-0 rounded-lg bg-[var(--color-surface-2)] object-cover"
    />
  );
}
