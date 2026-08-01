"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";

/**
 * One QueryClient per browser session, created inside state so a re-render
 * never swaps the cache out from under the tree.
 *
 * The retry rule is the part worth reading. A 4xx from this API is a decision —
 * the workspace is not permitted to see that record, or the record does not
 * exist — and retrying it three times only delays telling the user. A 5xx or a
 * dropped connection is worth one more attempt.
 */
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(makeClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
