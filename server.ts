import express from "express";
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
app.use(express.json());
app.set("trust proxy", 1);

// Institutional Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: "Pro level request limit reached." }
});

app.use("/api/", limiter);

// --- SECURE API ROUTES ---

app.post("/api/gemini", async (req, res) => {
  try {
    const { messages, systemInstruction, model, config, tools } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });

    const genAI = new GoogleGenAI(apiKey);
    
    // HACKATHON STABILITY CHANGE: Defaulting to 'flash' for speed to avoid Vercel 10s timeouts
    const mToUse = "gemini-1.5-flash"; 
    
    const modelInstance = genAI.getGenerativeModel({ model: mToUse, systemInstruction });
    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: m.attachments ? [...m.attachments.map((a: any) => ({ inlineData: { data: a.data, mimeType: a.mimeType } })), { text: m.content }] : [{ text: m.content }]
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    if (res.flushHeaders) res.flushHeaders();

    const result = await modelInstance.generateContentStream({ 
      contents, 
      tools, 
      generationConfig: config || { temperature: 0.1, maxOutputTokens: 8192 } 
    });

    for await (const chunk of result.stream) {
      res.write(`data: ${JSON.stringify({ text: chunk.text(), functionCalls: chunk.functionCalls() })}\n\n`);
    }
    res.end();
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message }); else res.end();
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY missing" });
    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContentStream({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ["AUDIO"] as any, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } as any } });
    res.setHeader("Content-Type", "application/octet-stream");
    for await (const chunk of result.stream) {
      const audioPart = chunk.parts.find(p => p.inlineData);
      if (audioPart?.inlineData?.data) res.write(Buffer.from(audioPart.inlineData.data, 'base64'));
    }
    res.end();
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message }); else res.end();
  }
});

app.post("/api/groq", async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY missing" });
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, ...messages.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1, max_tokens: 4096, stream: false
    });
    res.json({ text: completion.choices[0]?.message?.content || "", toolCalls: completion.choices[0]?.message?.tool_calls || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Deployment-Aware Startup
if (!process.env.VERCEL) {
  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Statum Local Ready: http://localhost:${PORT}`);
  });
}
