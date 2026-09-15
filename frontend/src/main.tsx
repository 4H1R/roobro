import { RouterProvider } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { getRouter } from "./router"

const rootElement = document.getElementById("app")

if (!rootElement) {
  throw new Error("Missing #app root element")
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>
)
