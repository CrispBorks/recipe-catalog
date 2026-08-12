import { Link } from "react-router-dom";
import { ClipboardListIcon, PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useShoppingCount } from "@/lib/shopping-list";

export function SiteHeader() {
  const count = useShoppingCount();

  return (
    <header className="no-print mb-7 border-b border-border pt-9 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="display text-[28px] leading-none font-semibold">
          Card Catalog
        </Link>

        <nav aria-label="Actions" className="flex items-center gap-2">
          <Button asChild>
            <Link to="/add-recipe">
              <PlusIcon />
              Add recipe
            </Link>
          </Button>

          <Button asChild variant="outline" size="icon" className="relative">
            <Link
              to="/shopping-list"
              aria-label={
                count > 0
                  ? `Shopping list, ${count} item${count === 1 ? "" : "s"}`
                  : "Shopping list"
              }
            >
              <ClipboardListIcon />
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] rounded-full bg-status px-1 text-center font-mono text-[10px] leading-[18px] text-status-foreground tabular">
                  {count}
                </span>
              )}
            </Link>
          </Button>

          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
