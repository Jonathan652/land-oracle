import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  MessageSquare, 
  Send, 
  Scale, 
  Info, 
  Languages, 
  History,
  User,
  Bot,
  ChevronRight,
  ShieldCheck,
  Map,
  BookOpen,
  Gavel,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Loader2,
  FileText,
  Briefcase,
  Download,
  ExternalLink,
  CheckCircle2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UGANDA_LAND_ACT_CONTEXT } from './constants/landActText';
import { cn } from './lib/utils';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioBuffer?: AudioBuffer; // Cache the processed audio
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: Date;
}

interface Lawyer {
  id: string;
  name: string;
  firm: string;
  specialty: string;
  location: string;
  rating: number;
  verified: boolean;
}

// --- Oracle Core ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const SYSTEM_INSTRUCTION = `
You are the "Luganda Land Oracle", a premier legal expert on the Uganda Land Act (Chapter 236).
Your primary mission is to provide legally precise, accurate, and accessible guidance on land matters in Uganda.

STRICT LEGAL ADHERENCE:
- You must base every answer on the specific sections of the Uganda Land Act provided in the context.
- Be precise with terminology: distinguish clearly between "Mailo", "Freehold", "Leasehold", and "Customary" tenures.
- Accurately define "Lawful Occupant" and "Bona fide Occupant" per Section 29.
- Emphasize that a tenant by occupancy can ONLY be evicted for non-payment of ground rent, and only by a court order (Section 33).
- Highlight the absolute requirement for spousal consent for any transaction involving family land (Section 39 & 40).
- Note that non-citizens cannot own Mailo or Freehold land and are limited to 99-year leases (Section 41).
- Mention the protection of rights for women, children, and persons with disabilities (Section 27).

BILINGUAL EXPERTISE:
- You are fully bilingual in English and Luganda.
- Respond in the language used by the user.
- In Luganda, use respectful and culturally appropriate legal terminology (e.g., "Busuulu" for ground rent, "Kibanja" for tenancy by occupancy where appropriate).

PROFESSIONAL GUIDANCE:
- For complex cases, always recommend consulting a verified lawyer via the "Services" tab.
- Always include a clear disclaimer: "This guidance is based on the Uganda Land Act but does not constitute formal legal advice. Please consult a qualified lawyer for specific legal actions."

TONE:
- Authoritative, expert, yet empathetic and accessible to the common person.
- Use structured responses with clear headings.

CONTEXT:
${UGANDA_LAND_ACT_CONTEXT}
`;

const MOCK_LAWYERS: Lawyer[] = [
  { id: '1', name: 'Adv. Namukasa Sarah', firm: 'Justice Land Advocates', specialty: 'Land Disputes & Mediation', location: 'Kampala, Central', rating: 4.9, verified: true },
  { id: '2', name: 'Adv. Okello John', firm: 'Northern Rights Legal', specialty: 'Customary Tenure & Titles', location: 'Gulu, Northern', rating: 4.7, verified: true },
  { id: '3', name: 'Adv. Musoke Peter', firm: 'Mailo Land Experts', specialty: 'Mailo & Freehold Conversion', location: 'Masaka, Central', rating: 4.8, verified: true },
];

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('land_oracle_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((s: any) => ({
          ...s,
          lastUpdated: new Date(s.lastUpdated),
          messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }))
        }));
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    const last = localStorage.getItem('land_oracle_last_session');
    return last || null;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState<'en' | 'lg'>('en');
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState<string | null>(null);
  const [audioCache, setAudioCache] = useState<Record<string, AudioBuffer>>({});
  const [activeTab, setActiveTab] = useState<'chat' | 'services'>('chat');
  const [showHistory, setShowHistory] = useState(false);
  const [freeQuestionsRemaining, setFreeQuestionsRemaining] = useState(2);
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    localStorage.setItem('land_oracle_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('land_oracle_last_session', currentSessionId);
    }
    scrollToBottom();
  }, [currentSessionId, messages]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: Date.now().toString(),
      title: language === 'en' ? 'New Conversation' : 'Mboozi Mpya',
      messages: [],
      lastUpdated: new Date()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setShowHistory(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(language === 'en' ? 'Delete this conversation?' : 'Ggyamu mboozi eno?')) {
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
        setCurrentSessionId(null);
      }
    }
  };

  const clearAllHistory = () => {
    if (window.confirm(language === 'en' ? 'Clear all chat history?' : 'Ggyamu ebyafaayo byonna?')) {
      setSessions([]);
      setCurrentSessionId(null);
      localStorage.removeItem('land_oracle_sessions');
      localStorage.removeItem('land_oracle_last_session');
    }
  };

  const updateSessionMessages = (newMessages: Message[]) => {
    if (!currentSessionId) {
      const newSession: ChatSession = {
        id: Date.now().toString(),
        title: newMessages[0]?.content.substring(0, 30) + '...',
        messages: newMessages,
        lastUpdated: new Date()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
    } else {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId 
          ? { 
              ...s, 
              messages: newMessages, 
              lastUpdated: new Date(),
              title: s.messages.length === 0 ? newMessages[0]?.content.substring(0, 30) + '...' : s.title
            } 
          : s
      ));
    }
  };

  // --- Recording Logic ---
  const startRecording = async () => {
    if (!isPro && freeQuestionsRemaining <= 0) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudioMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Nfuna obuzibu mu kukozesa akazindaalo. (Could not access microphone.)");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudioMessage = async (audioBlob: Blob) => {
    setIsLoading(true);
    
    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    if (!user && freeQuestionsRemaining <= 0) {
      setShowAuthModal(true);
      setIsLoading(false);
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64Audio = (reader.result as string).split(',')[1];
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: language === 'en' ? "[Audio Message]" : "[Bubaka bwa ddoboozi]",
        timestamp: new Date(),
      };
      const updatedMessages = [...messages, userMessage];
      updateSessionMessages(updatedMessages);

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ inlineData: { data: base64Audio, mimeType: 'audio/webm' } }, { text: "Listen and respond in the same language based on the Land Act." }] }],
          config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 },
        });

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.text || "I apologize, I couldn't process that request.",
          timestamp: new Date(),
        };
        const finalMessages = [...updatedMessages, assistantMessage];
        updateSessionMessages(finalMessages);
        speakText(assistantMessage.content, assistantMessage.id);
        
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          try {
            const userSnap = await getDoc(userRef);
            const currentUsed = userSnap.exists() ? (userSnap.data().freeQuestionsUsed || 0) : 0;
            await updateDoc(userRef, { freeQuestionsUsed: currentUsed + 1 });
            setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
          }
        } else {
          setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
        }
      } catch (error) {
        console.error("Voice Processing Error:", error);
        const errorMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: "Nfuna obuzibu mu kuwuliriza eddoboozi lyo.", timestamp: new Date() };
        updateSessionMessages([...updatedMessages, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    };
  };

  // --- TTS Logic ---
  const speakText = async (text: string, messageId: string) => {
    if (isSpeaking === messageId) { stopSpeaking(); return; }
    
    // Ensure AudioContext is initialized/resumed
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    stopSpeaking(); // Stop any current playback

    // 1. Check Cache First
    if (audioCache[messageId]) {
      playFromBuffer(audioCache[messageId], messageId);
      return;
    }

    setIsAudioLoading(messageId);
    
    try {
      const ttsAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      const response = await ttsAi.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say this clearly: ${text}` }] }],
        config: { 
          responseModalities: ["AUDIO" as any], 
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: 'Kore' } 
            } 
          } 
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const dataView = new DataView(bytes.buffer);
        const numSamples = Math.floor(len / 2);
        const float32 = new Float32Array(numSamples);
        
        for (let i = 0; i < numSamples; i++) {
          float32[i] = dataView.getInt16(i * 2, true) / 32768;
        }

        const audioBuffer = audioContextRef.current!.createBuffer(1, float32.length, 24000);
        audioBuffer.getChannelData(0).set(float32);
        
        // Save to cache
        setAudioCache(prev => ({ ...prev, [messageId]: audioBuffer }));
        
        playFromBuffer(audioBuffer, messageId);
      } else {
        throw new Error("No audio data received.");
      }
    } catch (error: any) { 
      console.error("TTS Error:", error);
      
      // Friendly Quota Error
      if (error?.message?.includes("429") || error?.message?.includes("quota")) {
        alert(language === 'en' 
          ? "📢 You've reached your daily limit (10) for voice messages. Please try again tomorrow or upgrade your plan." 
          : "📢 Okozesezza nnyo eddoboozi lya Oracle leero (10). Gezaako enkya oba kyusaamu mu nteekateeka yo.");
      } else {
        alert(language === 'en' 
          ? `Oracle Voice Error: ${error.message || 'Unknown error'}` 
          : `Obuzibu mu ddoboozi: ${error.message || 'Obuzibu obutamanyiddwa'}`);
      }
    } finally {
      setIsAudioLoading(null);
    }
  };

  const playFromBuffer = (buffer: AudioBuffer, messageId: string) => {
    if (!audioContextRef.current) return;
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      if (isSpeaking === messageId) setIsSpeaking(null);
    };
    currentSourceRef.current = source;
    setIsSpeaking(messageId);
    source.start(0);
  };

  const stopSpeaking = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    setIsSpeaking(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Sync with Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setFreeQuestionsRemaining(Math.max(0, 2 - (data.freeQuestionsUsed || 0)));
            setIsPro(data.isPro || false);
          } else {
            // Create new profile
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
              freeQuestionsUsed: 0,
              isPro: false,
              createdAt: serverTimestamp()
            });
            setFreeQuestionsRemaining(2);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setIsPro(false);
        setFreeQuestionsRemaining(2); // Reset for guests (local storage handles guest sessions)
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!process.env.GEMINI_API_KEY) {
      console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
      const warningMessage: Message = {
        id: 'api-warning',
        role: 'assistant',
        content: language === 'en' 
          ? "⚠️ **Developer Note:** The Gemini API Key is missing. If you have deployed this to Vercel, please add `GEMINI_API_KEY` to your Environment Variables in the Vercel Dashboard."
          : "⚠️ **Okulabula:** Gemini API Key ebula. Oba ogikozesezza ku Vercel, yongeramu `GEMINI_API_KEY` mu Environment Variables ku Vercel Dashboard.",
        timestamp: new Date()
      };
      if (messages.length === 0) {
        updateSessionMessages([warningMessage]);
      }
    }
  }, [language]);

  const handleQuickQuestion = (text: string) => {
    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    
    handleSend(text);
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim() || isLoading) return;
    
    if (!user && freeQuestionsRemaining <= 0) {
      setShowAuthModal(true);
      return;
    }

    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: messageText, timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    updateSessionMessages(updatedMessages);
    
    if (!textOverride) setInput('');
    setIsLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: messageText }] }],
        config: { systemInstruction: SYSTEM_INSTRUCTION, temperature: 0.7 },
      });
      const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.text || "I apologize.", timestamp: new Date() };
      updateSessionMessages([...updatedMessages, assistantMessage]);
      speakText(assistantMessage.content, assistantMessage.id);
      
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          const currentUsed = userSnap.exists() ? (userSnap.data().freeQuestionsUsed || 0) : 0;
          await updateDoc(userRef, { freeQuestionsUsed: currentUsed + 1 });
          setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        }
      } else {
        setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
      }
    } catch (error: any) {
      console.error("Oracle Error Details:", error);
      let errorMessage = "Nfuna obuzibu mu kukuddamu.";
      if (error?.message?.includes("API_KEY_INVALID")) {
        errorMessage = "Oracle settings tezikola. Genda mu Settings okyusemu.";
      } else if (error?.message?.includes("quota")) {
        errorMessage = "Okozesezza nnyo Oracle leero. Gezaako enkya.";
      }
      const assistantError: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: errorMessage, timestamp: new Date() };
      updateSessionMessages([...updatedMessages, assistantError]);
    } finally { setIsLoading(false); }
  };

  const quickQuestions = [
    { en: "What are the types of land tenure?", lg: "Ebika by'ettaka mu Uganda bye biruwa?" },
    { en: "Can a woman own land?", lg: "Omukazi asobola okuba n'ettaka?" },
    { en: "What is a bona fide occupant?", lg: "Bona fide occupant kitegeeza ki?" },
    { en: "How do I resolve a land dispute?", lg: "Ngonjoola ntya enkayana z'ettaka?" },
  ];

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-slate-900 font-sans selection:bg-amber-100">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-200">
            <Scale size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight">Luganda Land Oracle</h1>
            <p className="text-[10px] text-amber-700 font-medium uppercase tracking-widest">By Jonathan Musiime</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex bg-slate-100 p-1 rounded-xl mr-2">
            <button 
              onClick={() => setActiveTab('chat')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'chat' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <MessageSquare size={16} className="inline mr-2" />
              {language === 'en' ? 'Oracle' : 'Oracle'}
            </button>
            <button 
              onClick={() => setActiveTab('services')}
              className={cn("px-4 py-1.5 rounded-lg text-sm font-medium transition-all", activeTab === 'services' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <Briefcase size={16} className="inline mr-2" />
              {language === 'en' ? 'Services' : 'Emirimu'}
            </button>
          </div>
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium", showHistory ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}
            title={language === 'en' ? 'Chat History' : 'Ebyafaayo'}
          >
            <History size={16} />
          </button>
          <button 
            onClick={() => setLanguage(l => l === 'en' ? 'lg' : 'en')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            <Languages size={16} />
            <span className="hidden sm:inline">{language === 'en' ? 'English' : 'Luganda'}</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 text-sm font-medium">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-5 h-5 rounded-full" alt="" />
                ) : (
                  <User size={16} />
                )}
                <span className="hidden sm:inline truncate max-w-[100px]">{user.displayName || user.email}</span>
              </div>
              <button 
                onClick={() => logout()}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                title={language === 'en' ? 'Logout' : 'Fuluma'}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-600 text-white hover:bg-amber-700 transition-colors text-sm font-medium shadow-sm"
            >
              <User size={16} />
              <span>{language === 'en' ? 'Sign In' : 'Yingira'}</span>
            </button>
          )}
        </div>
      </nav>

      <main className="pt-20 pb-32 max-w-4xl mx-auto px-4 relative">
        {/* History Sidebar/Overlay */}
        <AnimatePresence>
          {showHistory && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="fixed inset-y-0 left-0 w-full md:w-80 bg-white shadow-2xl z-[60] border-r border-slate-200 p-6 pt-20 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-xl">{language === 'en' ? 'Chat History' : 'Ebyafaayo'}</h3>
                <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
              </div>

              <button 
                onClick={createNewSession}
                className="w-full py-3 px-4 bg-amber-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 mb-6 shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all"
              >
                <MessageSquare size={18} />
                {language === 'en' ? 'New Chat' : 'Mboozi Mpya'}
              </button>

              <div className="space-y-2">
                {sessions.map(session => (
                  <div 
                    key={session.id}
                    onClick={() => { setCurrentSessionId(session.id); setShowHistory(false); }}
                    className={cn(
                      "p-4 rounded-2xl cursor-pointer transition-all group border",
                      currentSessionId === session.id ? "bg-amber-50 border-amber-200" : "bg-white border-transparent hover:bg-slate-50"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className={cn("font-semibold truncate", currentSessionId === session.id ? "text-amber-900" : "text-slate-700")}>
                          {session.title}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {session.lastUpdated.toLocaleDateString()} • {session.messages.length} {language === 'en' ? 'messages' : 'bubaka'}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => deleteSession(session.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {sessions.length > 0 && (
                <button 
                  onClick={clearAllHistory}
                  className="w-full mt-8 py-2 text-xs text-slate-400 hover:text-red-500 transition-colors font-medium"
                >
                  {language === 'en' ? 'Clear All History' : 'Ggyamu byonna'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {activeTab === 'chat' ? (
          <>
            {messages.length === 0 ? (
              <div className="py-12 space-y-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4">
                  <h2 className="text-4xl font-bold text-slate-900 tracking-tight">
                    {language === 'en' ? 'Welcome to the Land Oracle' : 'Sanyuka okujja eri Oracle w\'ettaka'}
                  </h2>
                  <p className="text-lg text-slate-600 max-w-xl mx-auto">
                    {language === 'en' ? 'Ask any question about the Uganda Land Act in Luganda or English.' : 'Buuza ekibuuzo kyonna ku tteeka ly\'ettaka mu Uganda mu Luganda oba mu Lungereza.'}
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quickQuestions.map((q, i) => (
                    <motion.button key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} onClick={() => handleQuickQuestion(language === 'en' ? q.en : q.lg)} className="p-6 text-left bg-white border border-slate-200 rounded-2xl hover:border-amber-400 hover:shadow-xl hover:shadow-amber-50 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                          {i === 0 && <Map size={20} />}
                          {i === 1 && <ShieldCheck size={20} />}
                          {i === 2 && <BookOpen size={20} />}
                          {i === 3 && <Gavel size={20} />}
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
                      </div>
                      <p className="font-semibold text-slate-800">{language === 'en' ? q.en : q.lg}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((m) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-4", m.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                    <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm", m.role === 'user' ? "bg-slate-800 text-white" : "bg-amber-600 text-white")}>
                      {m.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                    </div>
                    <div className={cn("max-w-[85%] rounded-3xl p-5 shadow-sm relative group", m.role === 'user' ? "bg-slate-800 text-white rounded-tr-none" : "bg-white border border-slate-200 rounded-tl-none text-slate-800")}>
                      <div className="prose prose-slate prose-sm max-w-none dark:prose-invert">
                        <Markdown>{m.content}</Markdown>
                      </div>
                      
                      {m.role === 'assistant' && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                          <button 
                            onClick={() => speakText(m.content, m.id)} 
                            disabled={isAudioLoading === m.id}
                            className={cn(
                              "p-2 rounded-xl transition-all flex items-center justify-center", 
                              isSpeaking === m.id ? "bg-amber-100 text-amber-600" : "bg-slate-50 text-slate-400 hover:text-amber-600",
                              isAudioLoading === m.id && "animate-pulse"
                            )}
                          >
                            {isAudioLoading === m.id ? <Loader2 size={18} className="animate-spin" /> : (isSpeaking === m.id ? <VolumeX size={18} /> : <Volume2 size={18} />)}
                          </button>
                          <button 
                            onClick={() => alert(language === 'en' ? 'Premium Report generation requires a small fee (UGX 5,000 via Mobile Money).' : 'Okufuna lipoota eno kyetagisa okusasula (UGX 5,000 okuyita mu Mobile Money).')}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-xs font-bold hover:bg-amber-100 transition-colors"
                          >
                            <Download size={14} />
                            {language === 'en' ? 'Premium Report' : 'Lipoota ey\'enjawulo'}
                          </button>
                          <button 
                            onClick={() => setActiveTab('services')}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-colors"
                          >
                            <Briefcase size={14} />
                            {language === 'en' ? 'Talk to Lawyer' : 'Manya Munnamateeka'}
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && <div className="flex gap-4"><div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center animate-pulse"><Bot size={20} /></div><div className="bg-white border border-slate-200 rounded-3xl rounded-tl-none p-5 flex gap-1"><span className="w-2 h-2 bg-amber-300 rounded-full animate-bounce" /><span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" /><span className="w-2 h-2 bg-amber-500 rounded-full animate-bounce" /></div></div>}
                <div ref={messagesEndRef} />
              </div>
            )}
          </>
        ) : (
          <div className="space-y-8 py-4">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-slate-900">
                {language === 'en' ? 'Professional Services' : 'Emirimu gy\'abakugu'}
              </h2>
              <p className="text-slate-600">
                {language === 'en' ? 'Connect with verified land legal experts across Uganda.' : 'Kwatagana n\'abakugu b\'ettaka abakakasiddwa mu Uganda yonna.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {MOCK_LAWYERS.map((lawyer) => (
                <div key={lawyer.id} className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row gap-6 items-start md:items-center hover:shadow-xl hover:shadow-amber-50 transition-all">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 shrink-0">
                    <User size={32} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-lg text-slate-900">{lawyer.name}</h3>
                      {lawyer.verified && <CheckCircle2 size={16} className="text-amber-600" />}
                    </div>
                    <p className="text-sm text-amber-700 font-semibold">{lawyer.firm}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Gavel size={12} /> {lawyer.specialty}</span>
                      <span className="flex items-center gap-1"><Map size={12} /> {lawyer.location}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => alert(language === 'en' ? 'Redirecting to secure consultation portal...' : 'Tukutwala ku mulyo ogw\'okuteesa...')}
                      className="px-6 py-2.5 bg-amber-600 text-white rounded-2xl font-bold text-sm hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
                    >
                      {language === 'en' ? 'Book Consultation' : 'Teesa naye'}
                    </button>
                    <p className="text-[10px] text-center text-slate-400 font-medium">Fee: UGX 50,000 / Session</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden">
              <div className="relative z-10 space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-amber-600 rounded-full text-xs font-bold uppercase tracking-widest">
                  Premium Feature
                </div>
                <h3 className="text-3xl font-bold leading-tight">
                  {language === 'en' ? 'Official Legal Summary Report' : 'Lipoota y\'amateeka ey\'ekikugu'}
                </h3>
                <p className="text-slate-400 max-w-lg leading-relaxed">
                  {language === 'en' 
                    ? 'Generate a certified summary of your rights based on your specific situation. Perfect for presentation to Local Councils, Police, or Mediators.' 
                    : 'Funa lipoota ekakasiddwa ku ddembe lyo okusinziira ku mbeera yo. Ennungi nnyo okutwala mu LC, Poliisi, oba eri abatuula mu nkayana.'}
                </p>
                <button className="flex items-center gap-3 px-8 py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all">
                  <FileText size={20} />
                  {language === 'en' ? 'Generate Report (UGX 5,000)' : 'Funa Lipoota (UGX 5,000)'}
                </button>
              </div>
              <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-600/20 rounded-full blur-3xl" />
            </div>
          </div>
        )}

        <footer className="mt-20 pb-12 border-t border-slate-100 text-center">
          <div className="pt-8 space-y-2">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">
              {language === 'en' ? 'Designed & Developed by' : 'Kyakoleddwa era nekiyiiyizibwa'}
            </p>
            <p className="text-xl font-bold text-slate-800 tracking-tight">Jonathan Musiime</p>
          </div>
          <div className="flex justify-center gap-2 mt-6">
            <div className="w-1 h-1 rounded-full bg-amber-300" />
            <div className="w-1 h-1 rounded-full bg-amber-400" />
            <div className="w-1 h-1 rounded-full bg-amber-500" />
          </div>
        </footer>
      </main>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FDFCF8] via-[#FDFCF8] to-transparent">
          <div className="max-w-4xl mx-auto relative">
            {!isPro && freeQuestionsRemaining <= 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-600 rounded-2xl flex items-center justify-center shrink-0">
                    <Scale size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold">{language === 'en' ? 'Free Limit Reached' : 'Obuyambi obw\'obwereere buweddeyo'}</h4>
                    <p className="text-xs text-slate-400">{language === 'en' ? 'Upgrade to Oracle Pro for unlimited questions.' : 'Funa Oracle Pro okubuuza ebibuuzo ebirala.'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPro(true)}
                  className="px-6 py-3 bg-white text-slate-900 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all w-full md:w-auto"
                >
                  {language === 'en' ? 'Upgrade to Pro (UGX 20,000)' : 'Funa Pro (UGX 20,000)'}
                </button>
              </motion.div>
            ) : (
              <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-slate-200 p-2 flex items-center gap-2">
                <button onClick={isRecording ? stopRecording : startRecording} className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative overflow-hidden", isRecording ? "bg-red-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-slate-200")}>
                  {isRecording ? <Square size={20} /> : <Mic size={20} />}
                  {isRecording && <motion.div initial={{ scale: 0 }} animate={{ scale: 2 }} className="absolute inset-0 bg-red-400/20 rounded-full" />}
                </button>
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={language === 'en' ? "Ask about land rights..." : "Buuza ku tteeka..."} className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-slate-800" />
                <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="w-12 h-12 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-amber-200"><Send size={20} /></button>
              </div>
            )}
            
            {!isPro && freeQuestionsRemaining > 0 && (
              <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">
                {language === 'en' 
                  ? `${freeQuestionsRemaining} free questions remaining today` 
                  : `Osigazza ebibuuzo ${freeQuestionsRemaining} eby'obwereere leero`}
              </p>
            )}
            {isPro && (
              <p className="text-[10px] text-center text-amber-600 mt-3 font-bold uppercase tracking-widest">
                Oracle Pro Active • Unlimited Access
              </p>
            )}
            <p className="text-[10px] text-center text-slate-400 mt-3 font-medium">
              {language === 'en' 
                ? 'Developed by Jonathan Musiime • Based on Uganda Land Act Cap 236' 
                : 'Kyakoleddwa Jonathan Musiime • Okusinziira ku tteeka ly\'ettaka mu Uganda Cap 236'}
            </p>
          </div>
        </div>
      )}
      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck size={32} />
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  {language === 'en' ? 'Sign in to continue' : 'Yingira okusobola okweyongerayo'}
                </h2>
                <p className="text-slate-500 mb-6">
                  {language === 'en' 
                    ? 'You have used your 2 free questions. Sign in to get unlimited access to the Oracle.' 
                    : 'Okozesezza ebibuuzo byo 2 eby’obwereere. Yingira okusobola okukozesa Oracle mu ngeri etaliiko kkomo.'}
                </p>

                {authError && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-start gap-3 text-left">
                    <Info size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold mb-1">{language === 'en' ? 'Sign-in Failed' : 'Okuyingira kugaanyi'}</p>
                      <p className="opacity-90">{authError}</p>
                    </div>
                  </div>
                )}
                
                <button 
                  disabled={isSigningIn}
                  onClick={async () => {
                    setAuthError(null);
                    setIsSigningIn(true);
                    try {
                      await signInWithGoogle();
                      setShowAuthModal(false);
                    } catch (error: any) {
                      console.error("Sign in error:", error);
                      let msg = error.message;
                      if (msg.includes("auth/unauthorized-domain")) {
                        msg = language === 'en' 
                          ? "This domain is not authorized in Firebase. Please add it to 'Authorized domains' in your Firebase console."
                          : "Omukutu guno tegukkiriziddwa mu Firebase. Gulyongereko mu 'Authorized domains' mu Firebase console yo.";
                      } else if (msg.includes("auth/popup-blocked")) {
                        msg = language === 'en'
                          ? "The sign-in popup was blocked. Please allow popups for this site in your browser settings."
                          : "Eidirisa ly'okuyingira ligaanyi okugguka. Gulawo 'popups' mu nteekateeka za 'browser' yo.";
                      }
                      setAuthError(msg);
                    } finally {
                      setIsSigningIn(false);
                    }
                  }}
                  className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold text-lg hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSigningIn ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <>
                      <img src="https://www.google.com/favicon.ico" className="w-5 h-5 bg-white rounded-full p-0.5" alt="Google" />
                      {language === 'en' ? 'Sign in with Google' : 'Yingira ne Google'}
                    </>
                  )}
                </button>
                
                <button 
                  onClick={() => setShowAuthModal(false)}
                  className="mt-4 text-slate-400 hover:text-slate-600 font-medium text-sm"
                >
                  {language === 'en' ? 'Maybe later' : 'Edda'}
                </button>
              </div>
              <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  {language === 'en' 
                    ? 'By signing in, you agree to our Terms of Service and Privacy Policy.' 
                    : 'Bw’oyingira, oba okkirizza amateeka gaffe n’enkola y’obukuumi.'}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
