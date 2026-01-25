import { serve } from "bun";

serve({
  port: 5173,
  async fetch(req) {
    const url = new URL(req.url);
    let filePath = url.pathname;

    // Default to index.html for SPA routing
    if (filePath === "/" || !filePath.includes(".")) {
      filePath = "/index.html";
    }

    try {
      const file = Bun.file("./dist" + filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      // Fallback to index.html for SPA routing
      return new Response(Bun.file("./dist/index.html"));
    } catch {
      return new Response(Bun.file("./dist/index.html"));
    }
  },
});

console.log("Static server running on http://localhost:5173");
