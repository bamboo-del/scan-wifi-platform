import { useCallback, useEffect, useState } from "react";

export type AsyncResource<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: Error };

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("加载失败，请稍后重试");
}

export function useAsyncResource<T>(loader: () => Promise<T>): {
  resource: AsyncResource<T>;
  reload: () => void;
} {
  const [resource, setResource] = useState<AsyncResource<T>>({
    status: "loading",
    data: null,
    error: null,
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setResource({ status: "loading", data: null, error: null });
    void loader()
      .then((data) => {
        if (active) setResource({ status: "success", data, error: null });
      })
      .catch((error: unknown) => {
        if (active) setResource({ status: "error", data: null, error: toError(error) });
      });
    return () => {
      active = false;
    };
  }, [loader, revision]);

  const reload = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  return { resource, reload };
}
