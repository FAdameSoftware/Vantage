import { Button } from "@/components/ui/button";

function App() {
  return (
    <div className="h-screen w-screen bg-background text-foreground overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <p className="text-sm font-mono">Vantage is running.</p>
        <Button variant="outline" size="sm">
          OK
        </Button>
      </div>
    </div>
  );
}

export default App;
