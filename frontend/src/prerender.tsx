import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { renderToString } from "react-dom/server"

import { getRouter } from "./router"

export async function renderHomePage() {
  const router = getRouter(createMemoryHistory({ initialEntries: ["/"] }))
  await router.load()
  return renderToString(<RouterProvider router={router} />)
}
