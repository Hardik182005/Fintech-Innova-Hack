import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/lib/providers";

/**
 * Everything inside this route group is the signed-in product: the sidebar,
 * the workspace bar, and a screen. The marketing site at `/` deliberately sits
 * outside it and keeps its own layout — and, because the query client is
 * mounted here rather than at the root, none of its machinery ships with the
 * public page.
 */
export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
