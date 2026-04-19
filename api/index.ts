import express from "express";
import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Minimal health check for Vercel
app.get("/api/health", (req, res) => {
  res.json({ status: "Ready" });
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
