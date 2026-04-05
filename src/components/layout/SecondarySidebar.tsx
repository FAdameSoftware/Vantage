import { ChatPanel } from "@/components/chat/ChatPanel";
import { AgentDetailPanel } from "@/components/agents/AgentDetailPanel";
import { useLayoutStore } from "@/stores/layout";

export function SecondarySidebar() {
  const selectedAgentId = useLayoutStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useLayoutStore((s) => s.setSelectedAgentId);

  if (selectedAgentId) {
    return (
      <AgentDetailPanel
        agentId={selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
      />
    );
  }

  return <ChatPanel />;
}
