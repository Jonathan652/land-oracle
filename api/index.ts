import express from "express";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.set("trust proxy", 1);

// Standard Health Check for Hackathon Judges
app.get("/api/health", (req, res) => {
  res.json({ status: "Statum Legal Engine: Operational", system: "1.5-Flash-Trilingual" });
});

// Production rate limiting
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: { error: "Service busy. Try again soon." }
});
app.use("/api/", limiter);

// --- UNIFIED INTELLIGENCE ENGINE ---

app.post("/api/gemini", async (req, res) => {
  try {
    const { messages, systemInstruction, model, config, tools } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel settings." });

    const genAI = new GoogleGenAI(apiKey);
    // Optimized for Vercel's 10s timeout
    const modelToUse = "gemini-1.5-flash"; 
    
    const modelInstance = genAI.getGenerativeModel({ model: modelToUse, systemInstruction });
    
    const contents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: m.attachments ? [...m.attachments.map((a: any) => ({ inlineData: { data: a.data, mimeType: a.mimeType } })), { text: m.content }] : [{ text: m.content }]
    }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    
    const result = await modelInstance.generateContentStream({ 
      contents, 
      tools, 
      generationConfig: config || { temperature: 0.1, maxOutputTokens: 2048 } 
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
    if (!apiKey) return res.status(500).json({ error: "API Key missing" });
    const genAI = new GoogleGenAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContentStream({ 
      contents: [{ parts: [{ text }] }], 
      generationConfig: { responseModalities: ["AUDIO"] as any } 
    });
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
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, ...messages.map((m: any) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1, stream: false
    });
    res.json({ text: completion.choices[0]?.message?.content || "", toolCalls: completion.choices[0]?.message?.tool_calls || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
