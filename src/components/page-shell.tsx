import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageShell({
  children,
  footer,
  className,
  width = "wide",
}: {
  children: React.ReactNode;
  /** Rendered below the growing content area, pinned to the bottom of the
   *  viewport when the content is too short to fill it on its own. Pass
   *  <SiteFooter /> here instead of as a trailing child. */
  footer?: React.ReactNode;
  className?: string;
  width?: "wide" | "reading";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-col px-5",
        "pb-[max(4rem,calc(env(safe-area-inset-bottom)+3rem))]",
        width === "wide" ? "max-w-[920px]" : "max-w-[660px]",
        className,
      )}
    >
      <div className="flex flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
}

export function BackLink({ to = "/", children = "Back to recipes" }) {
  return (
    <Link
      to={to}
      className="label-mono inline-flex items-center gap-1.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      {children}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-16 border-t border-border pt-6 text-[13px] text-muted-foreground">
      With ❤️ from{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="https://atharva-bhagwat.github.io/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Atharva
      </a>{" "}
      and{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="https://www.yashraut.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Yash
      </a>{" "}
      · Made with{" "}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="https://claude.ai/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Claude
      </a>
      .
    </footer>
  );
}
