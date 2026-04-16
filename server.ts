import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Groq Fallback
  app.post("/api/groq", async (req, res) => {
    try {
      const { messages, systemPrompt } = req.body;
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
      }

      const groq = new Groq({ apiKey });

      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: "system", 
            content: `${systemPrompt}\n\nREINFORCEMENT: You are a senior legal strategist for the Republic of Uganda. 
            - Maintain a helpful, precise, and sophisticated expert assistant profile. 
            - Never claim absolute authority; refer to outputs as 'statutory guidance based on current legal documentation'. 
            - FLUENCY: If responding in Luganda or Runyankore, ensure perfect grammar, legal terminology, and cultural nuance (e.g., using 'Puliida' for Advocate, 'Ssabawandiisi' for Registrar).
            - Always include the MANDATORY trilingual disclaimer at the end of every response.` 
          },
          ...messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }))
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 2048,
        stream: false
      });

      res.json({ text: completion.choices[0]?.message?.content || "" });
    } catch (error: any) {
      console.error("Groq API Error:", error);
      res.status(500).json({ error: error.message || "Failed to call Groq API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Statum Server (Hybrid AI Mode) active on http://localhost:${PORT}`);
  });
}

startServer();
