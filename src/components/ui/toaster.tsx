"use client";
import { Toast } from "@base-ui/react/toast";
import { toastManager } from "@/lib/toast";

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 outline-none">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          toast={t}
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-card px-4 py-3 shadow-lg"
        >
          <div className="flex-1 min-w-0">
            {t.title && (
              <Toast.Title className="text-sm font-medium text-destructive">
                {t.title as string}
              </Toast.Title>
            )}
            {t.description && (
              <Toast.Description className="text-xs mt-0.5 text-muted-foreground">
                {t.description as string}
              </Toast.Description>
            )}
          </div>
          <Toast.Close className="text-muted-foreground hover:text-foreground text-base leading-none flex-shrink-0 mt-0.5">
            ×
          </Toast.Close>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <ToastList />
    </Toast.Provider>
  );
}
