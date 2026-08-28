import { AppHosts } from "./app/AppHosts";
import { AppProviders } from "./app/providers/AppProviders";
import { joinFriendWorld } from "./features/launch/joinFriendWorld";
import { runGame } from "./features/launch/runGame";
import { openWhatsNew } from "./features/whatsNew/whatsNewStore";
import { Router } from "./screens/Router";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <AppProviders>
      <div className="flex h-screen w-full flex-col overflow-hidden">
        <Shell runGame={runGame}>
          <Router
            runGame={runGame}
            joinFriendWorld={joinFriendWorld}
            onShowWhatsNew={openWhatsNew}
          />
        </Shell>

        <AppHosts />
      </div>
    </AppProviders>
  );
}

export default App;
