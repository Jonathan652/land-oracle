import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration } from "@google/genai";
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
  X,
  Smartphone,
  Search,
  Filter,
  ArrowRight,
  LayoutDashboard,
  FileSearch,
  ShieldAlert,
  Menu,
  MoreVertical,
  Trash2,
  Archive,
  Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType, signUpWithEmail, signInWithEmail, sendVerification } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from './lib/utils';
import { Message, ChatSession, Lawyer } from './types';
import { SYSTEM_INSTRUCTION, MOCK_LAWYERS } from './constants/systemInstructions';
import { generatePDF, generateDOCX } from './lib/documentService';
import { LegalNoticeModal } from './components/LegalNoticeModal';

// --- Oracle Core ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
  const [showHistory, setShowHistory] = useState(false);
  const [freeQuestionsRemaining, setFreeQuestionsRemaining] = useState(2);
  const [voiceMessagesRemaining, setVoiceMessagesRemaining] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isPro, setIsPro] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [isEmailVerifying, setIsEmailVerifying] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [autoTalkBack, setAutoTalkBack] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [premiumReportsCount, setPremiumReportsCount] = useState(() => {
    const saved = localStorage.getItem('land_oracle_premium_reports');
    return saved ? parseInt(saved, 10) : 0;
  });

  // New Features State
  const [isStreamingMode, setIsStreamingMode] = useState(true);
  const [streamingSpeed, setStreamingSpeed] = useState(30); // ms per character
  const [isDocumentMode, setIsDocumentMode] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isHoldingToRecord, setIsHoldingToRecord] = useState(false);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const [showLegalNotice, setShowLegalNotice] = useState(() => {
    return localStorage.getItem('uganda_law_portal_legal_notice_accepted') !== 'true';
  });
  const [verificationSteps, setVerificationSteps] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'lawyers' | 'documents' | 'services'>('chat');

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAcceptLegalNotice = () => {
    localStorage.setItem('uganda_law_portal_legal_notice_accepted', 'true');
    setShowLegalNotice(false);
  };

  const addVerificationStep = (step: string) => {
    setVerificationSteps(prev => [...prev, step]);
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isSpeakingCancelledRef = useRef(false);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    localStorage.setItem('land_oracle_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('land_oracle_premium_reports', premiumReportsCount.toString());
  }, [premiumReportsCount]);

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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    if (!isPro && freeQuestionsRemaining <= 0) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedBlob(audioBlob);
        setAudioPreview(URL.createObjectURL(audioBlob));
        if (timerRef.current) clearInterval(timerRef.current);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Nfuna obuzibu mu kukozesa akazindaalo. (Could not access microphone.)");
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null; // Don't process the blob
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingDuration(0);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    setRecordedBlob(null);
    setAudioPreview(null);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendRecordedAudio = async () => {
    if (recordedBlob) {
      await processAudioMessage(recordedBlob);
      setRecordedBlob(null);
      setAudioPreview(null);
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
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "",
        timestamp: new Date(),
      };
      
      // ADD MESSAGE TO UI BEFORE STREAMING
      const messagesWithPlaceholder = [...updatedMessages, assistantMessage];
      updateSessionMessages(messagesWithPlaceholder);

      const systemPrompt = isDocumentMode 
        ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` 
        : SYSTEM_INSTRUCTION;

      if (isStreamingMode) {
        const stream = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ inlineData: { data: base64Audio, mimeType: 'audio/webm' } }, { text: "Listen and respond in the same language based on the Constitution and Laws of Uganda." }] }],
          config: { 
            systemInstruction: systemPrompt, 
            temperature: 0.4 
          },
        });

        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk.text;
          setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
          
          // Smoother scrolling: only scroll if we're already near the bottom
          const container = document.documentElement;
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          if (isNearBottom) {
            scrollToBottom();
          }
        }
        
        assistantMessage.content = fullText;
        updateSessionMessages([...updatedMessages, assistantMessage]);
        setStreamingContent(prev => {
          const next = { ...prev };
          delete next[assistantMessageId];
          return next;
        });
        speakText(fullText, assistantMessageId);
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ parts: [{ inlineData: { data: base64Audio, mimeType: 'audio/webm' } }, { text: "Listen and respond in the same language based on the Constitution and Laws of Uganda." }] }],
          config: { 
            systemInstruction: systemPrompt, 
            temperature: 0.4 
          },
        });
        assistantMessage.content = response.text || "I apologize.";
        updateSessionMessages([...updatedMessages, assistantMessage]);
        speakText(assistantMessage.content, assistantMessageId);
      }
        
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
    
    // 1. Check if user is logged in
    if (!user) {
      setShowAuthModal(true);
      setVoiceError(language === 'en' ? "Please sign in to use voice features." : "Yingira okusobola okukozesa eddoboozi.");
      return;
    }

    // Ensure AudioContext is initialized/resumed
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    stopSpeaking(); // Stop any current playback
    isSpeakingCancelledRef.current = false;

    // 1. Check Cache First
    if (audioCache[messageId]) {
      playFromBuffer(audioCache[messageId], messageId);
      return;
    }

    setIsAudioLoading(messageId);
    
    try {
      const ttsAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      
      // Clean text for better TTS performance and quality
      const cleanedText = text
        .replace(/#{1,6}\s?/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/>\s?/g, '')
        .replace(/[-+*]\s/g, '')
        .replace(/\n\s*\n/g, '. ') // Double newlines to sentence breaks
        .replace(/\n/g, ' ')
        .trim();

      if (!cleanedText) {
        setIsAudioLoading(null);
        return;
      }

      const response = await ttsAi.models.generateContentStream({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: cleanedText }] }],
        config: { 
          responseModalities: [Modality.AUDIO], 
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: 'Kore' } 
            } 
          } 
        },
      });

      let nextStartTime = audioContextRef.current.currentTime + 0.1;
      const accumulatedSamples: Float32Array[] = [];
      let totalSamplesCount = 0;
      let hasStarted = false;

      for await (const chunk of response) {
        if (isSpeakingCancelledRef.current) break;
        
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          if (part.inlineData?.data) {
            const base64Audio = part.inlineData.data;
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

            accumulatedSamples.push(float32);
            totalSamplesCount += numSamples;

            const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
            audioBuffer.getChannelData(0).set(float32);
            
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContextRef.current.destination);
            
            activeSourcesRef.current.push(source);
            
            const startTime = Math.max(nextStartTime, audioContextRef.current.currentTime);
            source.start(startTime);
            nextStartTime = startTime + audioBuffer.duration;

            if (!hasStarted) {
              setIsSpeaking(messageId);
              setIsAudioLoading(null);
              hasStarted = true;
            }

            source.onended = () => {
              activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
              if (activeSourcesRef.current.length === 0 && !isSpeakingCancelledRef.current) {
                setIsSpeaking(null);
              }
            };
          }
        }
      }

      if (totalSamplesCount > 0 && !isSpeakingCancelledRef.current) {
        const finalBuffer = audioContextRef.current.createBuffer(1, totalSamplesCount, 24000);
        const channelData = finalBuffer.getChannelData(0);
        let offset = 0;
        for (const samples of accumulatedSamples) {
          channelData.set(samples, offset);
          offset += samples.length;
        }
        setAudioCache(prev => ({ ...prev, [messageId]: finalBuffer }));
      }

      // 3. Increment usage in Firestore if not Pro
      if (hasStarted && !isPro) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          const currentUsed = userSnap.exists() ? (userSnap.data().voiceMessagesUsed || 0) : 0;
          await updateDoc(userRef, { voiceMessagesUsed: currentUsed + 1 });
          setVoiceMessagesRemaining(prev => Math.max(0, prev - 1));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        }
      }
    } catch (error: any) { 
      console.error("TTS Error:", error);
      
      let errorMsg = "";
      if (error?.message?.includes("429") || error?.message?.includes("quota")) {
        errorMsg = language === 'en' 
          ? "📢 Voice limit reached for now. You can still read the text below!" 
          : "📢 Eddoboozi liwummuddeko. Kyokka okyasobola okusoma obubaka wansi!";
        setAutoTalkBack(false);
      } else {
        errorMsg = language === 'en' 
          ? "📢 Voice service is temporarily unavailable." 
          : "📢 Eddoboozi terisobola kukola kati.";
      }
      
      setVoiceError(errorMsg);
      setTimeout(() => setVoiceError(null), 5000);
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
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) setIsSpeaking(null);
    };
    activeSourcesRef.current.push(source);
    setIsSpeaking(messageId);
    source.start(0);
  };

  const stopSpeaking = () => {
    isSpeakingCancelledRef.current = true;
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    setIsSpeaking(null);
  };

  const checkVerification = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      setUser(updatedUser);
      if (updatedUser.emailVerified) {
        setIsEmailVerifying(false);
        setVerificationSent(false);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Check for email verification
        const isEmailAuth = firebaseUser.providerData.some(p => p.providerId === 'password');
        if (isEmailAuth && !firebaseUser.emailVerified) {
          setIsEmailVerifying(true);
        } else {
          setIsEmailVerifying(false);
        }

        // Sync with Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const data = userSnap.data();
              setFreeQuestionsRemaining(Math.max(0, 2 - (data.freeQuestionsUsed || 0)));
              setVoiceMessagesRemaining(Math.max(0, 2 - (data.voiceMessagesUsed || 0)));
              setIsPro(data.isPro || false);
            } else {
              // Create new profile
              await setDoc(userRef, {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                freeQuestionsUsed: 0,
                voiceMessagesUsed: 0,
                premiumReportsCount: 0,
                isPro: false,
                createdAt: serverTimestamp()
              });
              setFreeQuestionsRemaining(2);
              setVoiceMessagesRemaining(2);
            }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setIsPro(false);
        setFreeQuestionsRemaining(2); // Reset for guests
        setVoiceMessagesRemaining(0); // Guests can't use voice
        setPremiumReportsCount(0); // Reset report count for guests
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

  const generateLegalDocumentTool: FunctionDeclaration = {
    name: "generateLegalDocument",
    description: "Generates a downloadable legal document (PDF or DOCX) based on the provided content.",
    parameters: {
      type: Type.OBJECT,
      description: "The parameters for document generation.",
      properties: {
        content: {
          type: Type.STRING,
          description: "The full text content of the legal document. Exclude all conversational filler, greetings, and meta-commentary."
        },
        format: {
          type: Type.STRING,
          enum: ["pdf", "docx"],
          description: "The file format for the document."
        },
        title: {
          type: Type.STRING,
          description: "A professional title for the document."
        }
      },
      required: ["content", "format", "title"]
    }
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim() || isLoading) return;
    
    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: messageText, timestamp: new Date() };
    const updatedMessages = [...messages, userMessage];
    updateSessionMessages(updatedMessages);
    
    if (!textOverride) setInput('');
    setIsLoading(true);
    setVerificationSteps([]);

    try {
      addVerificationStep(language === 'en' ? "Analyzing legal intent..." : "Okukebera ekigendererwa...");
      
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "",
        timestamp: new Date(),
      };

      // ADD MESSAGE TO UI BEFORE STREAMING
      const messagesWithPlaceholder = [...updatedMessages, assistantMessage];
      updateSessionMessages(messagesWithPlaceholder);

      const systemPrompt = isDocumentMode 
        ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` 
        : SYSTEM_INSTRUCTION;

      const modelConfig = { 
        systemInstruction: systemPrompt,
        temperature: 0.4,
        maxOutputTokens: 2048,
        tools: [{ functionDeclarations: [generateLegalDocumentTool] }]
      };

      addVerificationStep(language === 'en' ? "Scanning Constitution & Statutes..." : "Okukebera ensengeka y'eggwanga n'amateeka...");
      await new Promise(r => setTimeout(r, 800));
      
      addVerificationStep(language === 'en' ? "Verifying statutory references..." : "Okukakasa ebiwandiiko by'amateeka...");
      await new Promise(r => setTimeout(r, 600));

      if (isStreamingMode) {
        const stream = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: updatedMessages.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
          })),
          config: modelConfig,
        });

        let fullText = "";
        let hasToolCall = false;

        addVerificationStep(language === 'en' ? "Finalizing professional response..." : "Okumaliriza okuddamu...");

        for await (const chunk of stream) {
          if (chunk.functionCalls) {
            hasToolCall = true;
            for (const call of chunk.functionCalls) {
              if (call.name === "generateLegalDocument") {
                const { content, format, title } = call.args as any;
                const url = format === 'pdf' ? generatePDF(content, title) : await generateDOCX(content, title);
                
                const successMsg = language === 'en' 
                  ? `\n\n✅ **Legal Document Generated: ${title}**\n\n[Download ${format.toUpperCase()}](${url})`
                  : `\n\n✅ **Ekiwandiiko ky'amateeka kikoleddwa: ${title}**\n\n[Tikula ${format.toUpperCase()}](${url})`;
                
                fullText += successMsg;
                setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
              }
            }
            continue;
          }

          fullText += chunk.text;
          setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
          
          // Smoother scrolling: only scroll if we're already near the bottom
          const container = document.documentElement;
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
          if (isNearBottom) {
            scrollToBottom();
          }
        }
        
        assistantMessage.content = fullText;
        updateSessionMessages([...updatedMessages, assistantMessage]);
        setStreamingContent(prev => {
          const next = { ...prev };
          delete next[assistantMessageId];
          return next;
        });
        
        if (autoTalkBack && !hasToolCall) {
          speakText(fullText, assistantMessageId);
        }
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: updatedMessages.map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
          })),
          config: modelConfig,
        });

        let fullText = response.text || "";
        let hasToolCall = false;

        if (response.functionCalls) {
          hasToolCall = true;
          for (const call of response.functionCalls) {
            if (call.name === "generateLegalDocument") {
              const { content, format, title } = call.args as any;
              const url = format === 'pdf' ? generatePDF(content, title) : await generateDOCX(content, title);
              
              const successMsg = language === 'en' 
                ? `\n\n✅ **Legal Document Generated: ${title}**\n\n[Download ${format.toUpperCase()}](${url})`
                : `\n\n✅ **Ekiwandiiko ky'amateeka kikoleddwa: ${title}**\n\n[Tikula ${format.toUpperCase()}](${url})`;
              
              fullText = successMsg;
            }
          }
        }

        assistantMessage.content = fullText;
        updateSessionMessages([...updatedMessages, assistantMessage]);
        
        if (autoTalkBack && !hasToolCall) {
          speakText(assistantMessage.content, assistantMessageId);
        }
      }

      if (user && !isPro) {
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          const currentUsed = userSnap.exists() ? (userSnap.data().freeQuestionsUsed || 0) : 0;
          await updateDoc(userRef, { freeQuestionsUsed: currentUsed + 1 });
          setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
        }
      } else if (!user) {
        setFreeQuestionsRemaining(prev => Math.max(0, prev - 1));
      }
    } catch (error: any) {
      console.error(`Oracle Error:`, error);
      const errorMessage = "Nfuna obuzibu mu kukuddamu.";
      const assistantError: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: errorMessage, timestamp: new Date() };
      updateSessionMessages([...updatedMessages, assistantError]);
    }
    setIsLoading(false);
  };

  const quickQuestions = [
    { en: "What are the fundamental rights in the Constitution?", lg: "Biki eby'obuntu ebiri mu nsonga z'eggwanga?" },
    { en: "Explain the process of filing a civil suit in Uganda", lg: "Nnyonnyola enkola y'okuwaaba omusango mu Uganda" },
    { en: "What are the requirements for a valid contract?", lg: "Biki ebyetaagisa endagaano okuba entuufu?" },
    { en: "Draft a formal demand letter for breach of contract", lg: "Kola ebbaluwa ey'okusaba obusasuzi olw'okumenya endagaano" },
  ];

  return (
    <div className="flex h-[100dvh] bg-[#F8FAFC] overflow-hidden font-sans selection:bg-[#C5A059]/20">
      <LegalNoticeModal isOpen={showLegalNotice} onAccept={handleAcceptLegalNotice} />
      
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "bg-[#0B0F1A] text-slate-400 w-72 sm:w-80 flex-shrink-0 flex flex-col transition-all duration-300 border-r border-white/5 z-50 fixed inset-y-0 lg:relative shadow-2xl safe-left",
        !isSidebarOpen && "-translate-x-full lg:-ml-80"
      )}>
        <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C5A059] rounded-xl flex items-center justify-center text-[#0B0F1A] shadow-lg shadow-[#C5A059]/10">
              <Scale size={22} />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-lg leading-tight tracking-tight">Uganda Law Portal</h1>
              <p className="text-[10px] text-[#C5A059] font-bold uppercase tracking-[0.2em]">Legal Information System</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          <button 
            onClick={() => {
              const newSession: ChatSession = {
                id: Date.now().toString(),
                title: language === 'en' ? 'New Inquiry' : 'Okubuuza Okupya',
                messages: [],
                lastUpdated: new Date(),
                category: 'General'
              };
              setSessions(prev => [newSession, ...prev]);
              setCurrentSessionId(newSession.id);
            }}
            className="w-full py-3.5 px-4 bg-[#C5A059] hover:bg-[#B38F48] text-[#0B0F1A] rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#C5A059]/5 transition-all active:scale-[0.98]"
          >
            <MessageSquare size={18} />
            {language === 'en' ? 'New Legal Inquiry' : 'Okubuuza Okupya'}
          </button>

          <div className="space-y-1">
            <p className="px-4 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">Recent Inquiries</p>
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={cn(
                  "group p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3",
                  currentSessionId === session.id ? "bg-white/10 text-white shadow-inner" : "hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", currentSessionId === session.id ? "bg-[#C5A059]" : "bg-slate-700")} />
                  <p className="text-sm font-medium truncate">{session.title}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(language === 'en' ? 'Delete this conversation?' : 'Ggyamu mboozi eno?')) {
                      setSessions(prev => prev.filter(s => s.id !== session.id));
                      if (currentSessionId === session.id) setCurrentSessionId(null);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 transition-all hover:bg-white/10 rounded-lg"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-white/5 bg-black/20 shrink-0">
          {user ? (
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#C5A059] flex items-center justify-center text-[#0B0F1A] font-bold shrink-0 overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} alt="" /> : user.displayName?.[0] || user.email?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user.displayName || user.email.split('@')[0]}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button onClick={() => logout()} className="p-2 hover:text-red-400 transition-colors">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-white/5 transition-all"
            >
              <User size={18} />
              {language === 'en' ? 'Sign In for Pro' : 'Yingira'}
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-auto min-h-[3.5rem] sm:min-h-[4rem] bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-6 shrink-0 z-30 shadow-sm safe-top">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className="p-2.5 sm:p-2 hover:bg-slate-50 rounded-lg text-slate-900 sm:text-slate-500 transition-colors active:scale-95"
              aria-label="Toggle Menu"
            >
              <Menu size={22} className="sm:w-5 sm:h-5" />
            </button>
            <div className="h-6 w-px bg-slate-200 hidden xs:block" />
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1">
              <button 
                onClick={() => setActiveTab('chat')}
                className={cn(
                  "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap",
                  activeTab === 'chat' ? "bg-[#C5A059]/10 text-[#8B6E37]" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {language === 'en' ? 'Legal Inquiry' : 'Okubuuza'}
              </button>
              <button 
                onClick={() => setActiveTab('lawyers')}
                className={cn(
                  "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap",
                  activeTab === 'lawyers' ? "bg-[#C5A059]/10 text-[#8B6E37]" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {language === 'en' ? 'Find Advocate' : 'Noonya Puliida'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={() => setAutoTalkBack(!autoTalkBack)}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg transition-all",
                autoTalkBack ? "text-[#C5A059] bg-[#C5A059]/5" : "text-slate-400 hover:bg-slate-50"
              )}
            >
              {autoTalkBack ? <Volume2 size={18} className="sm:w-5 sm:h-5" /> : <VolumeX size={18} className="sm:w-5 sm:h-5" />}
            </button>
            <button 
              onClick={() => setLanguage(l => l === 'en' ? 'lg' : 'en')}
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[9px] sm:text-[10px] font-bold text-slate-600 transition-all uppercase tracking-[0.1em] border border-slate-200"
            >
              {language === 'en' ? 'EN' : 'LG'}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto relative scroll-smooth bg-[#F8FAFC] custom-scrollbar">
          <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12 sm:px-6">
            <AnimatePresence>
              {voiceError && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50 }}
                  className="fixed bottom-24 sm:bottom-32 left-1/2 -translate-x-1/2 z-[100] bg-[#0B0F1A] text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl shadow-2xl flex items-center gap-2 sm:gap-3 border border-white/10 w-[90%] sm:w-auto"
                >
                  <VolumeX size={16} className="text-[#C5A059] shrink-0" />
                  <span className="text-xs sm:text-sm font-medium truncate">{voiceError}</span>
                </motion.div>
              )}
            </AnimatePresence>


            {activeTab === 'chat' ? (
              <>
                {messages.length === 0 ? (
                  <div className="py-6 sm:py-12 space-y-10 sm:space-y-16">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 sm:space-y-6">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-white rounded-2xl sm:rounded-[2rem] flex items-center justify-center text-[#C5A059] mx-auto mb-4 sm:mb-8 shadow-xl shadow-[#C5A059]/5 border border-slate-100">
                        <Scale size={32} className="sm:w-12 sm:h-12" />
                      </div>
                      <h2 className="text-3xl sm:text-5xl font-display font-bold text-[#0B0F1A] tracking-tight leading-tight">
                        {language === 'en' ? 'Uganda Law Portal' : 'Amateeka ga Uganda'}
                      </h2>
                      <p className="text-base sm:text-xl text-slate-500 max-w-2xl mx-auto font-medium leading-relaxed px-4">
                        {language === 'en' 
                          ? 'Professional statutory guidance, document verification, and legal compliance analysis for the Ugandan jurisdiction.' 
                          : 'Okukulembera mu mateeka, okukakasa ebiwandiiko, n\'okukebera obutuufu bw\'amateeka mu Uganda.'}
                      </p>
                    </motion.div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                      {quickQuestions.map((q, i) => (
                        <motion.button 
                          key={i} 
                          initial={{ opacity: 0, scale: 0.98 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          transition={{ delay: i * 0.1 }} 
                          onClick={() => handleSend(language === 'en' ? q.en : q.lg)} 
                          className="p-5 sm:p-8 text-left bg-white border border-slate-100 rounded-2xl sm:rounded-[2rem] hover:border-[#C5A059]/30 hover:shadow-2xl hover:shadow-[#C5A059]/10 transition-all group flex items-start gap-4 sm:gap-6"
                        >
                          <div className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-400 group-hover:bg-[#0B0F1A] group-hover:text-[#C5A059] transition-all shrink-0 shadow-sm">
                            {i === 0 && <FileSearch size={20} className="sm:w-6 sm:h-6" />}
                            {i === 1 && <ShieldCheck size={20} className="sm:w-6 sm:h-6" />}
                            {i === 2 && <Gavel size={20} className="sm:w-6 sm:h-6" />}
                            {i === 3 && <FileText size={20} className="sm:w-6 sm:h-6" />}
                          </div>
                          <div>
                            <p className="font-display font-bold text-base sm:text-lg text-[#0B0F1A] leading-snug group-hover:text-[#8B6E37] transition-colors mb-1 sm:mb-2">{language === 'en' ? q.en : q.lg}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              {language === 'en' ? 'Start inquiry' : 'Tandika okubuuza'} <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
                            </p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 sm:space-y-10 pb-12">
                    {messages.map((m) => (
                      <motion.div 
                        key={m.id} 
                        initial={{ opacity: 0, y: 10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        className={cn("flex gap-3 sm:gap-5", m.role === 'user' ? "flex-row-reverse" : "flex-row")}
                      >
                        <div className={cn(
                          "w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 shadow-lg", 
                          m.role === 'user' ? "bg-[#0B0F1A] text-white" : "bg-white border border-slate-100 text-[#C5A059]"
                        )}>
                          {m.role === 'user' ? <User size={16} className="sm:w-6 sm:h-6" /> : <Scale size={16} className="sm:w-6 sm:h-6" />}
                        </div>
                        <div className={cn(
                          "max-w-[90%] sm:max-w-[85%] rounded-2xl sm:rounded-[2rem] p-4 sm:p-8 shadow-sm relative group transition-all", 
                          m.role === 'user' ? "bg-[#0B0F1A] text-white rounded-tr-none" : "bg-white border border-slate-100 rounded-tl-none text-slate-800"
                        )}>
                          {m.role === 'assistant' && (
                            <div className="flex items-center gap-2 mb-3 sm:mb-4 text-[9px] sm:text-[10px] font-bold text-[#C5A059] uppercase tracking-[0.2em] border-b border-slate-50 pb-2 sm:pb-3">
                              <ShieldCheck size={12} className="sm:w-3.5 sm:h-3.5" />
                              <span>Verified Statutory Guidance</span>
                            </div>
                          )}
                          <div className="markdown-body prose prose-slate prose-sm max-w-none text-sm sm:text-base">
                            <Markdown remarkPlugins={[remarkGfm]}>
                              {streamingContent[m.id] || m.content}
                            </Markdown>
                          </div>
                          <div className={cn(
                            "text-[9px] sm:text-[10px] mt-4 sm:mt-6 font-bold uppercase tracking-widest opacity-30",
                            m.role === 'user' ? "text-right" : "text-left"
                          )}>
                            {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </>
            ) : activeTab === 'lawyers' ? (
              <div className="py-12 space-y-12">
                <div className="text-center space-y-4">
                  <h2 className="text-2xl sm:text-4xl font-display font-bold text-[#0B0F1A] tracking-tight">{language === 'en' ? 'Verified Legal Advocates' : 'Bapuliida Abakakasiddwa'}</h2>
                  <p className="text-slate-500 text-sm sm:text-lg max-w-xl mx-auto">{language === 'en' ? 'Consult with registered legal professionals for representation and specialized guidance.' : 'Webuuze ku bakugu b\'amateeka abakakasiddwa.'}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {MOCK_LAWYERS.map(lawyer => (
                    <div key={lawyer.id} className="bg-white border border-slate-100 rounded-2xl sm:rounded-[2rem] p-6 sm:p-8 shadow-sm hover:shadow-2xl hover:shadow-[#C5A059]/5 transition-all group">
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-[#0B0F1A] group-hover:text-[#C5A059] transition-all">
                          <User size={32} />
                        </div>
                        {lawyer.verified && (
                          <div className="flex items-center gap-1.5 bg-[#C5A059]/10 text-[#8B6E37] px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-[#C5A059]/20">
                            <ShieldCheck size={14} /> Verified
                          </div>
                        )}
                      </div>
                      <h3 className="font-display font-bold text-xl text-[#0B0F1A] mb-1">{lawyer.name}</h3>
                      <p className="text-sm text-[#C5A059] font-bold mb-2 uppercase tracking-wide">{lawyer.firm}</p>
                      <p className="text-sm text-slate-500 mb-6 leading-relaxed">{lawyer.specialty}</p>
                      <div className="flex items-center justify-between pt-6 border-t border-slate-50">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest">
                          <Map size={14} className="text-[#C5A059]" /> {lawyer.location}
                        </div>
                        <button className="text-[#0B0F1A] font-bold text-sm hover:text-[#C5A059] transition-colors flex items-center gap-2 group/btn">
                          Contact <ArrowRight size={16} className="group-hover/btn:translate-x-1 transition-transform" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Verification Progress Bar */}
          <AnimatePresence>
            {isLoading && verificationSteps.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-24 sm:bottom-32 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4"
              >
                <div className="bg-[#0B0F1A] text-white p-5 rounded-[2rem] shadow-2xl border border-white/10 flex items-center gap-5">
                  <div className="relative w-12 h-12 shrink-0">
                    <div className="absolute inset-0 border-4 border-white/5 rounded-full" />
                    <div className="absolute inset-0 border-4 border-[#C5A059] rounded-full border-t-transparent animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShieldAlert size={20} className="text-[#C5A059]" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#C5A059] uppercase tracking-[0.2em] mb-1">Verification in Progress</p>
                    <p className="text-sm font-medium truncate text-slate-300">{verificationSteps[verificationSteps.length - 1]}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <footer className="p-3 sm:p-8 bg-white border-t border-slate-100 shrink-0 z-30 safe-bottom">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-end gap-2 sm:gap-6">
              <div className="flex-1 relative bg-slate-50 rounded-2xl sm:rounded-[2rem] border border-slate-200 focus-within:border-[#C5A059] focus-within:ring-4 sm:focus-within:ring-8 focus-within:ring-[#C5A059]/5 transition-all">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={language === 'en' ? "Enter legal inquiry..." : "Wandiika ekibuuzo kyo..."}
                  className="w-full bg-transparent border-none focus:ring-0 p-3 sm:p-6 text-sm sm:text-base resize-none min-h-[48px] sm:min-h-[64px] max-h-32 sm:max-h-48 custom-scrollbar font-sans"
                  rows={1}
                />
                <div className="flex items-center justify-between px-3 sm:px-6 pb-2 sm:pb-4">
                  <div className="flex items-center gap-1.5 sm:gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsDocumentMode(!isDocumentMode)}
                      className={cn(
                        "flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-bold uppercase tracking-widest transition-all",
                        isDocumentMode ? "bg-[#C5A059] text-[#0B0F1A] shadow-lg shadow-[#C5A059]/20" : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                      )}
                    >
                      <FileText size={12} className="sm:w-3.5 sm:h-3.5" />
                      <span className="hidden xs:inline">{language === 'en' ? 'Document' : 'Ekiwandiiko'}</span>
                      <span className="xs:hidden">DOC</span>
                    </button>
                    <div className="h-4 sm:h-5 w-px bg-slate-200 mx-0.5 sm:mx-1" />
                    <button 
                      type="button"
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={cn(
                        "p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-all",
                        isRecording ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/20" : "text-slate-400 hover:bg-slate-200"
                      )}
                    >
                      <Mic size={16} className="sm:w-5 sm:h-5" />
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="p-2 sm:p-3.5 bg-[#0B0F1A] text-[#C5A059] rounded-lg sm:rounded-2xl hover:bg-black disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-black/10 active:scale-95"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin sm:w-6 sm:h-6" /> : <Send size={18} className="sm:w-6 sm:h-6" />}
                  </button>
                </div>
              </div>
            </form>
            <p className="text-[8px] sm:text-[10px] text-center text-slate-400 mt-3 sm:mt-6 font-bold uppercase tracking-[0.1em] px-4">
              {language === 'en' 
                ? 'Statutory accuracy is verified against the Constitution and Laws of Uganda.' 
                : 'Obutuufu bw\'amateeka bukakasibwa okusinziira ku nsonga z\'eggwanga n\'amateeka.'}
            </p>
          </div>
        </footer>
      )}
    </main>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B0F1A]/90 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 max-h-[90vh] overflow-y-auto safe-top safe-bottom"
            >
              <div className="p-6 sm:p-10">
                <div className="flex justify-between items-center mb-6 sm:mb-10">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-[#0B0F1A] rounded-xl sm:rounded-2xl flex items-center justify-center text-[#C5A059] shadow-xl">
                      <Scale size={20} className="sm:w-6 sm:h-6" />
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#0B0F1A] tracking-tight">{authMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h2>
                  </div>
                  <button onClick={() => setShowAuthModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-colors"><X size={20} className="sm:w-6 sm:h-6" /></button>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  <button 
                    onClick={signInWithGoogle}
                    className="w-full py-3.5 sm:py-4 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl sm:rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 transition-all shadow-sm active:scale-[0.98] text-sm sm:text-base"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
                    Continue with Google
                  </button>
                  <div className="relative py-4 sm:py-6">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                    <div className="relative flex justify-center text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] bg-white px-4">Or use email</div>
                  </div>
                  <input 
                    type="email" 
                    placeholder="Email Address" 
                    className="w-full p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl text-sm focus:ring-4 sm:focus:ring-8 focus:ring-[#C5A059]/5 focus:border-[#C5A059] transition-all outline-none"
                  />
                  <input 
                    type="password" 
                    placeholder="Password" 
                    className="w-full p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-2xl text-sm focus:ring-4 sm:focus:ring-8 focus:ring-[#C5A059]/5 focus:border-[#C5A059] transition-all outline-none"
                  />
                  <button className="w-full py-4 sm:py-5 bg-[#0B0F1A] text-[#C5A059] rounded-xl sm:rounded-2xl font-bold hover:bg-black transition-all shadow-2xl shadow-black/10 active:scale-[0.98] text-sm sm:text-base">
                    {authMode === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                </div>

                <div className="mt-6 sm:mt-8 text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                    className="text-xs sm:text-sm font-bold text-[#C5A059] hover:text-[#8B6E37] transition-colors"
                  >
                    {authMode === 'signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
