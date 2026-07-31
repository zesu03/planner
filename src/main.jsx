import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMonitoring } from "./lib/monitoring";

// Start error monitoring before render so early errors are captured. No-op
// (and Sentry never loads) unless VITE_SENTRY_DSN is configured.
initMonitoring();

ReactDOM.createRoot(document.getElementById("root")).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>
);