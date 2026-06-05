import React from "react"
import { createRoot } from "react-dom/client"
import { BlockedPage } from "./blocked-page"
import "./popup.css"

createRoot(document.getElementById("root")!).render(<BlockedPage />)