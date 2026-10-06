import "./assets/main.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { VoiceOverlay } from "./features/voice/VoiceOverlay";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <VoiceOverlay />
  </React.StrictMode>,
);
