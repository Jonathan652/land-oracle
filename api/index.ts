import express from "express";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Minimal health check for Vercel
app.get("/api/health", (req, res) => {
  res.json({ status: "Ready" });
});

// --- SECURE GEMINI PROXY ---
app.post("/api/gemini", async (req, res) => {
  try {
    const { model, contents, config } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY missing in server settings." });
    }

    const genAI = new GoogleGenAI({ apiKey });

    // Note: To make it simple and avoid complex stream proxying, we send the full response
    // but the frontend is already built for streaming. We'll simulate a stream for the frontend
    // or just return the full result.
    
    const result = await genAI.models.generateContent({
      model,
      contents,
      config
    });

    const text = result.text || "";
    
    // Extract function calls manually for the proxy response
    const functionCalls = (result as any).functionCalls || [];

    res.json({ text, functionCalls });
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    res.status(500).json({ error: error.message || "Gemini Execution Failed" });
  }
});

// --- THIN PROXY FOR GROQ (BACKUP MODEL) ---
app.post("/api/groq", async (req, res) => {
  try {
    let { messages, systemPrompt } = req.body;
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY missing in Vercel settings." });

    // FIX FOR 413: Prune the massive legal context if it's too long for the proxy 
    // High-level legal instruction usually doesn't need 10MB of text in one turn
    if (systemPrompt && systemPrompt.length > 25000) {
      systemPrompt = systemPrompt.substring(0, 25000) + "... [Pruned for stability]";
    }

    const groq = new Groq({ apiKey });
    
    // Prune message history to last 5 messages to avoid blowing up the payload
    const recentMessages = messages.length > 5 ? messages.slice(-5) : messages;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt }, 
        ...recentMessages.map((m: any) => ({ 
          role: m.role === 'user' ? 'user' : 'assistant', 
          content: m.content 
        }))
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1, 
      stream: false
    });

    res.json({ 
      text: completion.choices[0]?.message?.content || "", 
      toolCalls: completion.choices[0]?.message?.tool_calls || [] 
    });
  } catch (error: any) {
    console.error("Groq Proxy Error:", error);
    res.status(500).json({ error: error.message || "Groq Execution Failed" });
  }
});

export default app;
