import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

async function startServer() {
  const PORT = 3000;

  // Essential for Cloud Run/Nginx environment to identify user IPs for rate limiting
  app.set("trust proxy", 1);

  app.use(express.json());

  // Institutional Rate Limiting: Prevent "Denial of Wallet" attacks
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Increased to 200 for robust testing
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Pro level request limit reached. Please try again in 15 minutes." }
  });

  app.use("/api/", limiter);

  // API Route for Gemini (Direct Backend)
  app.post("/api/gemini", async (req, res) => {
    try {
      const { messages, systemInstruction, model, config, tools } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const genAI = new GoogleGenAI(apiKey);
      const modelInstance = genAI.getGenerativeModel({
        model: model || "gemini-1.5-pro",
        systemInstruction: systemInstruction,
      });

      // Prepare contents for Gemini SDK
      const contents = messages.map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: m.attachments 
          ? [
              ...m.attachments.map((a: any) => ({ inlineData: { data: a.data, mimeType: a.mimeType } })),
              { text: m.content }
            ]
          : [{ text: m.content }]
      }));

      // Set up streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const result = await modelInstance.generateContentStream({
        contents,
        tools,
        generationConfig: config || { temperature: 0.1, maxOutputTokens: 8192 }
      });

      for await (const chunk of result.stream) {
        const text = chunk.text();
        const functionCalls = chunk.functionCalls();
        
        // Output as SSE
        res.write(`data: ${JSON.stringify({ text, functionCalls })}\n\n`);
      }

      res.end();
    } catch (error: any) {
      console.error("Gemini Backend Error:", error);
      res.status(500).json({ error: error.message || "Failed to process legal intelligence request." });
    }
  });

  // API Route for Gemini TTS (Backend Voice)
  app.post("/api/tts", async (req, res) => {
    try {
      const { text } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const genAI = new GoogleGenAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-tts-preview" });

      const result = await model.generateContentStream({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          // Explicitly casting as any to handle non-standard TTS modalities
          responseModalities: ["AUDIO"] as any,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }
            }
          } as any
        }
      });

      res.setHeader("Content-Type", "application/octet-stream");
      
      for await (const chunk of result.stream) {
        const audioPart = chunk.parts.find(p => p.inlineData);
        if (audioPart?.inlineData?.data) {
          const buffer = Buffer.from(audioPart.inlineData.data, 'base64');
          res.write(buffer);
        }
      }

      res.end();
    } catch (error: any) {
      console.error("TTS Backend Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate legal voice." });
    }
  });

  // API Route for Groq Fallback
  app.post("/api/groq", async (req, res) => {
    try {
      const { messages, systemPrompt } = req.body;
      const apiKey = process.env.GROQ_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server." });
      }

      // Clean Gemini-specific search instructions for Groq to avoid confusion
      // Also strip out any remaining disclaimer branding
      const groqSpecificPrompt = systemPrompt
        .replace(/google_search/g, 'internal search')
        .replace(/ULII Live Integration/g, 'General Legal Knowledge')
        .replace(/MANDATORY DISCLAIMER/g, '')
        .replace(/Statum AI/g, 'Statum Legal');

      const groq = new Groq({ apiKey });

      console.log(`Statum: Groq processing started...`);

      // Intent check for tools to prevent unsolicited generation
      const lastUserMessage = messages[messages.length - 1]?.content || "";
      const documentKeywords = ['draft', 'document', 'agreement', 'contract', 'write', 'generate', 'create', 'ekiwandiiko', 'andika', 'okushaba'];
      const userWantsDocument = documentKeywords.some(k => lastUserMessage.toLowerCase().includes(k));

      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: "system", 
            content: `${groqSpecificPrompt}\n\nSTRICT EXPERT COMMAND:
            - IDENTITY: Senior Legal Architect.
            - FORBIDDEN: "As an AI", "language model", "I cannot generate", "manual steps", "copy and paste", "disclaimer", "not legal advice".
            - TOOL USE: Only use document tools if the user explicitly requests a formal draft. For all other inquiries, provide a detailed textual response.
            - TRUTH: You are an Expert Legal Strategy engine with direct document compilation capabilities.
            - OUTPUT: Direct, authoritative, and structured results only.` 
          },
          ...messages.map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content
          }))
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        tools: userWantsDocument ? [
          {
            type: "function",
            function: {
              name: "generateLegalDocument",
              description: "ONLY call this if the user explicitly asks for a formal draft, document, or agreement. Generates PDF or DOCX.",
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
              description: "ONLY call this if the user asks for a 'roadmap' or 'steps' for a process. Generates a visual guide.",
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
        ] : undefined,
        tool_choice: "auto",
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

  if (process.env.VERCEL) {
    console.log("Statum Server (Serverless Mode) initialized.");
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Statum Server (Hybrid AI Mode) active on http://localhost:${PORT}`);
    });
  }
}

startServer();
