import * as React from "react";
import { CopyIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BackLink, PageShell, SiteFooter } from "@/components/page-shell";
import { formatAmount } from "@/lib/units";
import {
  clearAll,
  clearChecked,
  groupByRecipe,
  listAsText,
  removeItem,
  restore,
  setChecked,
  snapshot,
  useShoppingList,
} from "@/lib/shopping-list";
import { cn } from "@/lib/utils";

export function ShoppingListPage() {
  const list = useShoppingList();
  const empty = list.length === 0;
  const checkedCount = list.filter((item) => item.checked).length;

  React.useEffect(() => {
    document.title = "Shopping list — Recipe Catalog";
  }, []);

  /** Every destructive edit is reversible for a few seconds — cheaper than a
   *  confirmation dialog for anything short of wiping the whole list. */
  const withUndo = (message: string, run: () => void) => {
    const before = snapshot();
    run();
    toast(message, {
      action: { label: "Undo", onClick: () => restore(before) },
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listAsText(list));
      toast.success("List copied to clipboard");
    } catch {
      toast.error("Couldn't copy — select and copy the list manually");
    }
  };

  const share = async () => {
    const text = listAsText(list);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shopping List", text });
        return;
      } catch {
        return; /* the user dismissed the share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Sharing isn't supported here — list copied instead");
    } catch {
      toast.error("Copy the list manually from the panel");
    }
  };

  return (
    <PageShell width="reading">
      <div className="pt-9 pb-5">
        <BackLink />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h1 className="display text-[30px] leading-none font-semibold">
          Shopping list
        </h1>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={empty}>
              <Trash2Icon />
              Clear all
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear the whole list?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes all {list.length} item{list.length === 1 ? "" : "s"},
                including the ones you haven't ticked off yet.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep the list</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => withUndo("Shopping list cleared", clearAll)}
              >
                Clear it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {empty ? (
        <p className="mt-8 rounded-md border border-dashed border-border p-8 text-center text-[15px] text-muted-foreground">
          Your list is empty. Add ingredients from any recipe.
        </p>
      ) : (
        <div className="mt-2">
          {[...groupByRecipe(list)].map(([recipeTitle, items]) => (
            <section key={recipeTitle}>
              <h2 className="label-mono pt-5 pb-1 text-muted-foreground">
                {recipeTitle}
              </h2>
              <ul>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-b border-dashed border-border py-2.5"
                  >
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        setChecked(item.id, checked === true)
                      }
                      aria-label={`Mark ${item.name} purchased`}
                    />
                    <span className="meta-mono min-w-[76px] text-muted-foreground">
                      {formatAmount(item.qty, item.unit)} {item.unit}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[15px]",
                        item.checked && "text-muted-foreground line-through",
                      )}
                    >
                      {item.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        withUndo(`Removed ${item.name}`, () => removeItem(item.id))
                      }
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={share} disabled={empty}>
          <SendIcon />
          Send to Reminders
        </Button>
        <Button variant="outline" onClick={copy} disabled={empty}>
          <CopyIcon />
          Copy list
        </Button>
        {/* Nothing starts checked, so this only appears once there's something
            for it to remove. */}
        {checkedCount > 0 && (
          <Button
            variant="outline"
            onClick={() =>
              withUndo(
                `Removed ${checkedCount} checked item${checkedCount === 1 ? "" : "s"}`,
                clearChecked,
              )
            }
          >
            Remove checked
          </Button>
        )}
      </div>

      <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">macOS/iOS tip:</strong> Add
        the{" "}
        <a
          className="underline underline-offset-2 hover:text-foreground"
          href="https://www.icloud.com/shortcuts/47c17ffa11004144b3b700fd13896803"
          target="_blank"
          rel="noopener noreferrer"
        >
          Shopping List
        </a>{" "}
        shortcut, then pick it from the Share Sheet when you tap{" "}
        <em>Send to Reminders</em> — it'll add each ingredient as its own entry,
        grouped by recipe in the Reminders app.
      </p>

      <SiteFooter />
    </PageShell>
  );
}
