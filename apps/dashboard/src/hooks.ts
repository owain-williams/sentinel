import { useEffect, useState } from "react";

export function useFetch<T>(
  url: string,
  refreshMs = 0,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setData(json as T);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    }

    void load();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (refreshMs > 0) {
      interval = setInterval(load, refreshMs);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [url, refreshMs]);

  return { data, loading, error };
}
