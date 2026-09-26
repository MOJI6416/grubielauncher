import { captureConsole } from "./consoleCapture";
import { installHttpTrace } from "./httpTrace";
import { installAppEventTrace } from "./appEvents";

captureConsole();
installHttpTrace();
installAppEventTrace();
