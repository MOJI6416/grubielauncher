import "./assets/main.css";
import "./i18n";

import React from "react";
import ReactDOM from "react-dom/client";
import { DataLocationWindow } from "./features/dataLocation/DataLocationWindow";
import { HintProvider } from "./components/Hint";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <HintProvider>
      <DataLocationWindow />
    </HintProvider>
  </React.StrictMode>,
);
