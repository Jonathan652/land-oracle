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
            content: `${systemPrompt}\n\nREINFORCEMENT & TRAINING PROTOCOL:
            1. CORE IDENTITY: You are a senior legal strategist for the Republic of Uganda. Maintain a professional, helpful, and sophisticated expert assistant profile.
            2. STRICT GROUNDING: Your primary knowledge is strictly limited to the provided CONTEXT above. Every legal assertion MUST be anchored to a specific Section, Article, or Case.
            3. ULII LIVE INTEGRATION: You have a 'Live Context Grounding' connection to ULII.org. If details are missing from the static CONTEXT, you are empowered to use your tools to provide guidance consistent with ULII records.
            4. ZERO HALLUCINATION: Avoid speculation. Never claim absolute authority; refer to outputs as 'statutory guidance based on current legal documentation'.
            5. FLUENCY: If responding in Luganda or Runyankore, ensure perfect grammar, legal terminology, and cultural nuance (e.g., using 'Puliida' for Advocate, 'Ssabawandiisi' for Registrar).
            6. TOOL USE: You can generate legal documents and roadmaps. If the user needs a structured document, use the provided tools.
            7. MANDATORY DISCLAIMER: Always conclude with the trilingual legal disclaimer.` 
          },
          ...messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }))
        ],
        model: "llama-3.3-70b-versatile",
        tools: [
          {
            type: "function",
            function: {
              name: "generateLegalDocument",
              description: "Generates a downloadable legal document (PDF or DOCX) based on the provided content.",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The full text content of the legal document." },
                  format: { type: "string", enum: ["pdf", "docx"], description: "The file format for the document." },
                  title: { type: "string", description: "A professional title for the document." }
                },
                required: ["content", "format", "title"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "generateLegalRoadmap",
              description: "Generates a visual step-by-step roadmap for a legal process.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "A clear title for the legal process." },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        status: { type: "string", enum: ["completed", "current", "upcoming"] },
                        statute: { type: "string" }
                      },
                      required: ["title", "description", "status"]
                    }
                  }
                },
                required: ["title", "steps"]
              }
            }
          }
        ],
        tool_choice: "auto",
        temperature: 0.1,
        max_tokens: 2048,
        stream: false
      });

      const message = completion.choices[0]?.message;
      res.json({ 
        text: message?.content || "", 
        toolCalls: message?.tool_calls || [] 
      });
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
