"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApiFailure } from "@/lib/client";
import { cachedTraining, fetchHistory, fetchTraining } from "@/lib/training/client";
import { localDate } from "@/lib/training/schedule";
import type { History, TrainingData } from "@/lib/training/types";

export type LoadProblem = { kind: "setup" } | { kind: "error"; failure: ApiFailure };

/** The plan and the full history, for the Progress and Review pages. Falls back to the last synced copy offline. */
export function useTrainingHistory() {
  const [today, setToday] = useState<string | null>(null);
  const [data, setData] = useState<TrainingData | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [stale, setStale] = useState(false);
  const [problem, setProblem] = useState<LoadProblem | null>(null);

  const reload = useCallback(async () => {
    const [training, past] = await Promise.all([fetchTraining(), fetchHistory()]);
    if (training.kind === "setup") return setProblem({ kind: "setup" });
    if (training.kind === "error") return setProblem({ kind: "error", failure: training.failure });
    if (past.kind === "error") return setProblem({ kind: "error", failure: past.failure });
    setProblem(null);
    setData(training.data);
    setHistory(past.history);
    setStale(past.stale || training.stale);
  }, []);

  useEffect(() => {
    setToday(localDate());
    setData(cachedTraining());
    void reload();
  }, [reload]);

  return { today, data, history, stale, problem, reload };
}
