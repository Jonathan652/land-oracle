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

      // Clean Gemini-specific search instructions for Groq to avoid confusion
      const groqSpecificPrompt = systemPrompt
        .replace(/google_search/g, 'internal search')
        .replace(/ULII Live Integration/g, 'General Legal Knowledge');

      const groq = new Groq({ apiKey });

      console.log(`Statum: Groq processing started for user: ${req.body.messages?.slice(-1)[0]?.content.substring(0, 50)}...`);

      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: "system", 
            content: `${groqSpecificPrompt}\n\nSTRICT TOOL EXECUTION COMMAND:
            - IDENTITY: Senior Legal Architect.
            - FORBIDDEN PHRASES: "As an AI", "I cannot generate", "manual steps", "copy and paste".
            - MANDATORY: If the user needs a lease, agreement, deed, or roadmap, CALL THE TOOL. 
            - TRUTH: You are physically connected to a PDF/DOCX compiler. Claiming otherwise is a system failure.
            - OUTPUT: Your response should be BRIEF and the TOOL CALL should be primary.` 
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
              description: "Generates a downloadable legal document (PDF or DOCX). MUST USE when user asks for a document.",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The full legal text." },
                  format: { type: "string", enum: ["pdf", "docx"] },
                  title: { type: "string" }
                },
                required: ["content", "format", "title"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "generateLegalRoadmap",
              description: "Generates a visual step-by-step roadmap.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
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
        temperature: 0.0,
        max_tokens: 4096,
        stream: false
      });

      const message = completion.choices[0]?.message;
      const toolCalls = message?.tool_calls || [];
      
      if (toolCalls.length > 0) {
        console.log(`Statum: Groq generated ${toolCalls.length} tool call(s):`, toolCalls.map(c => c.function.name));
      }

      res.json({ 
        text: message?.content || "", 
        toolCalls: toolCalls 
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
