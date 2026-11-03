import "./assets/main.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { VoiceOverlay } from "./features/voice/VoiceOverlay";
import { installMotionPreference } from "@/lib/motionPreference";

installMotionPreference();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <VoiceOverlay />
  </React.StrictMode>,
);
