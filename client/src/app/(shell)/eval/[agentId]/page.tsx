/* Route: /eval/:agentId (agent eval detail). Thin route entry — the view lives under _components/EvalAgentDetailView. */
import { EvalAgentDetailView } from "./_components/EvalAgentDetailView";

export default function EvalAgentPage() {
  return <EvalAgentDetailView />;
}
