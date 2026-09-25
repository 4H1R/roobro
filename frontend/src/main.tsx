import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { getRouter } from "./router"

const rootElement = document.getElementById("app")

if (!rootElement) {
  throw new Error("Missing #app root element")
}

// The build pre-renders the homepage for crawlers and visitors without JS.
// Mount afresh so saved browser preferences (such as dark mode) apply normally.
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>
)
