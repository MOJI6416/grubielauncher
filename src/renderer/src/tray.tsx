import "./assets/main.css";
import "./i18n";

import React from "react";
import ReactDOM from "react-dom/client";
import { TrayPopup } from "./features/tray/TrayPopup";
import { HintProvider } from "./components/Hint";
import { installUiErrorCapture } from "./utilities/journal";
import { installFocusRingGuard } from "./utilities/focusRingGuard";

installUiErrorCapture();
installFocusRingGuard();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HintProvider>
      <TrayPopup />
    </HintProvider>
  </React.StrictMode>,
);
