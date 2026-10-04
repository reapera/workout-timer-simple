"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { announcer } from "./audio";
import { buildTimeline, type Exercise, type Segment } from "./types";

export type TimerStatus = "idle" | "running" | "paused" | "finished";

export type CompletedExercise = { name: string; duration: number };

type Options = {
  exercises: Exercise[];
  onFinish?: (result: { completed: CompletedExercise[]; elapsedSeconds: number }) => void;
};

/**
 * Interval engine for a routine.
 *
 * Timing is anchored to an absolute deadline rather than accumulated ticks, so
 * a slow frame, a throttled background tab, or a long pause can never make the
 * clock drift away from wall time. Every render simply asks "how far is now
 * from the deadline?".
 */
export function useTimer({ exercises, onFinish }: Options) {
  const segments = useMemo(() => buildTimeline(exercises), [exercises]);

  const [status, setStatus] = useState<TimerStatus>("idle");
  const [index, setIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(() => (segments[0]?.seconds ?? 0) * 1000);

  // The tick loop reads the segment from here, not from its closure: an
  // interval set up for the previous segment can fire once more before React
  // re-renders, and must not advance again from a segment already left behind.
  const indexRef = useRef(0);
  const showSegment = useCallback((next: number) => {
    indexRef.current = next;
    setIndex(next);
  }, []);

  const deadlineRef = useRef(0);
  const pausedRemainingRef = useRef(0);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pauseStartedRef = useRef(0);
  const lastBeepRef = useRef(-1);
  const announcedRef = useRef(-1);
  const finishedRef = useRef(false);

  const segment: Segment | null = segments[index] ?? null;

  // Held in a ref so an inline `onFinish` from the caller cannot change
  // `finish`'s identity on every frame and tear down the tick loop.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const elapsedSeconds = useCallback(() => {
    if (!startedAtRef.current) return 0;
    const pausedNow = pauseStartedRef.current ? Date.now() - pauseStartedRef.current : 0;
    return (Date.now() - startedAtRef.current - pausedTotalRef.current - pausedNow) / 1000;
  }, []);

  /** Work segments strictly before `upto` are exercises the user got through. */
  const completedUpTo = useCallback(
    (upto: number): CompletedExercise[] =>
      segments
        .slice(0, upto)
        .filter((item) => item.kind === "work")
        .map((item) => ({
          name: item.exerciseName,
          duration: exercises[item.exerciseIndex]?.duration ?? item.seconds,
        })),
    [segments, exercises],
  );

  const finish = useCallback(
    (upto: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      const result = { completed: completedUpTo(upto), elapsedSeconds: elapsedSeconds() };
      setStatus("finished");
      setRemainingMs(0);
      announcer.say("Workout complete.");
      announcer.beep("done");
      onFinishRef.current?.(result);
    },
    [completedUpTo, elapsedSeconds],
  );

  /* ---------------------------------------------------------------- *
   * Tick loop
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (status !== "running") return;

    const tick = () => {
      const now = Date.now();
      const current = indexRef.current;
      let cursor = current;
      let deadline = deadlineRef.current;

      // Catch up across any segments that elapsed while the tab was throttled.
      while (now >= deadline && cursor < segments.length - 1) {
        cursor += 1;
        deadline += segments[cursor].seconds * 1000;
      }

      if (now >= deadline && cursor >= segments.length - 1) {
        deadlineRef.current = deadline;
        finish(segments.length);
        return;
      }

      if (cursor !== current) {
        deadlineRef.current = deadline;
        lastBeepRef.current = -1;
        showSegment(cursor);
        setRemainingMs(deadline - now);
        return;
      }

      const left = deadline - now;
      setRemainingMs(left);

      // 3-2-1 blips on the way into the next segment.
      const secondsLeft = Math.ceil(left / 1000);
      if (secondsLeft <= 3 && secondsLeft >= 1 && secondsLeft !== lastBeepRef.current) {
        lastBeepRef.current = secondsLeft;
        announcer.beep("tick");
      }
    };

    // setInterval rather than requestAnimationFrame: rAF stops completely in a
    // backgrounded tab, which would freeze the countdown and — far worse —
    // silence every spoken cue the moment the user switches apps mid-set.
    // Background timers are throttled to roughly 1Hz, not stopped, so the
    // workout keeps advancing and announcing while they are away.
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [status, segments, finish, showSegment]);

  /* ---------------------------------------------------------------- *
   * Announcements — one per segment entry
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (status !== "running" || !segment) return;

    // Guarded by segment index rather than by effect deps: resuming from a
    // pause re-runs this effect, and re-announcing would talk over the user
    // every single time they unpause mid-set.
    if (announcedRef.current === index) return;
    announcedRef.current = index;

    if (segment.kind === "prep") {
      announcer.say(`Get ready. ${segment.exerciseName}.`);
    } else if (segment.kind === "work") {
      announcer.say(`${segment.exerciseName}. Go.`);
      announcer.beep("go");
    } else {
      announcer.say("Rest.");
      announcer.beep("done");
    }
  }, [status, index, segment]);

  /* ---------------------------------------------------------------- *
   * Controls
   * ---------------------------------------------------------------- */

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, segments.length - 1));
      lastBeepRef.current = -1;
      deadlineRef.current = Date.now() + segments[clamped].seconds * 1000;
      showSegment(clamped);
      setRemainingMs(segments[clamped].seconds * 1000);
    },
    [segments, showSegment],
  );

  const start = useCallback(() => {
    if (!segments.length) return;
    announcer.unlock();

    finishedRef.current = false;
    startedAtRef.current = Date.now();
    pausedTotalRef.current = 0;
    pauseStartedRef.current = 0;
    lastBeepRef.current = -1;
    announcedRef.current = -1;
    deadlineRef.current = Date.now() + segments[0].seconds * 1000;

    showSegment(0);
    setRemainingMs(segments[0].seconds * 1000);
    setStatus("running");
  }, [segments, showSegment]);

  const pause = useCallback(() => {
    setStatus((current) => {
      if (current !== "running") return current;
      pausedRemainingRef.current = Math.max(0, deadlineRef.current - Date.now());
      pauseStartedRef.current = Date.now();
      announcer.silence();
      return "paused";
    });
  }, []);

  const resume = useCallback(() => {
    setStatus((current) => {
      if (current !== "paused") return current;
      deadlineRef.current = Date.now() + pausedRemainingRef.current;
      pausedTotalRef.current += Date.now() - pauseStartedRef.current;
      pauseStartedRef.current = 0;
      lastBeepRef.current = -1;
      return "running";
    });
  }, []);

  const toggle = useCallback(() => {
    if (status === "running") pause();
    else if (status === "paused") resume();
    else if (status === "idle") start();
  }, [status, pause, resume, start]);

  /** Advance early — treated as "done with this one", not as a miss. */
  const skip = useCallback(() => {
    if (status !== "running" && status !== "paused") return;
    if (index >= segments.length - 1) {
      finish(segments.length);
      return;
    }
    goTo(index + 1);
    if (status === "paused") {
      pausedRemainingRef.current = segments[index + 1].seconds * 1000;
    }
  }, [status, index, segments, goTo, finish]);

  const back = useCallback(() => {
    if (status !== "running" && status !== "paused") return;
    goTo(index - 1);
    if (status === "paused") {
      pausedRemainingRef.current = segments[Math.max(0, index - 1)].seconds * 1000;
    }
  }, [status, index, segments, goTo]);

  /** End the session where it stands; whatever was finished still gets logged. */
  const stop = useCallback(() => {
    announcer.silence();
    finish(index);
  }, [finish, index]);

  const reset = useCallback(() => {
    announcer.silence();
    finishedRef.current = false;
    startedAtRef.current = 0;
    pausedTotalRef.current = 0;
    pauseStartedRef.current = 0;
    announcedRef.current = -1;
    setStatus("idle");
    showSegment(0);
    setRemainingMs((segments[0]?.seconds ?? 0) * 1000);
  }, [segments, showSegment]);

  useEffect(() => () => announcer.silence(), []);

  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const segmentProgress = segment
    ? Math.min(1, Math.max(0, 1 - remainingMs / (segment.seconds * 1000)))
    : 0;

  return {
    status,
    segment,
    segmentIndex: index,
    segmentCount: segments.length,
    remainingSeconds,
    segmentProgress,
    completedCount: segments.slice(0, index).filter((item) => item.kind === "work").length,
    start,
    pause,
    resume,
    toggle,
    skip,
    back,
    stop,
    reset,
  };
}
