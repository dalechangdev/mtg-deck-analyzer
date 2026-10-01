"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Two clicks to delete: the first arms it, the second deletes. */
export function DeleteSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setDeleting(true);
    const res = await fetch(`/api/prices/searches/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/prices");
      router.refresh();
    } else {
      setDeleting(false);
      setArmed(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onBlur={() => setArmed(false)}
      disabled={deleting}
      className={cn(buttonVariants({ variant: armed ? "destructive" : "outline" }), "disabled:opacity-50")}
    >
      {deleting ? "Deleting…" : armed ? "Confirm delete" : "Delete"}
    </button>
  );
}
