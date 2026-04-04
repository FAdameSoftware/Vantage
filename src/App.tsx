import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";
import { useKeybindings } from "@/hooks/useKeybindings";
import { PermissionDialog } from "@/components/permissions/PermissionDialog";
import { CommandPalette } from "@/components/shared/CommandPalette";
import { PrerequisiteCheck } from "@/components/shared/PrerequisiteCheck";

function App() {
  useKeybindings();

  return (
    <>
      <IDELayout />
      <CommandPalette />
      <PermissionDialog />
      <PrerequisiteCheck />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            backgroundColor: "var(--color-surface-0)",
            color: "var(--color-text)",
            border: "1px solid var(--color-surface-1)",
          },
        }}
      />
    </>
  );
}

export default App;
