import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { bootstrapTokenFromHash } from "./auth.js";
import "./styles/app.css";
import "./styles/chat.css";

bootstrapTokenFromHash();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
