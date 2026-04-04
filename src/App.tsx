import { IDELayout } from "@/components/layout";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <>
      <IDELayout />
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
