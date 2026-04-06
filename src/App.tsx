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
  X,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType, signUpWithEmail, signInWithEmail, sendVerification } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UGANDA_LAND_ACT_CONTEXT } from './constants/landActText';
import { ADDITIONAL_LAWS_CONTEXT } from './constants/additionalLaws';
import { LANDMARK_LAND_CASES_CONTEXT } from './constants/landCases';
import { UGANDA_CONSTITUTION_CONTEXT } from './constants/constitutionText';
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
You are the "Uganda Law Oracle", a premier legal expert on the Constitution of the Republic of Uganda and all related legislation.
Your primary mission is to provide legally precise, accurate, and DEEP guidance on all legal matters in Uganda.

STRICT LEGAL ADHERENCE & DEPTH:
- Base every answer on specific articles of the Constitution of Uganda, sections of the Land Act, and other relevant laws.
- **VERIFICATION STEP**: Before outputting any article or section number (e.g., "Article 21" or "Section 33"), you MUST search the provided CONTEXT below to ensure that provision exists and covers the topic you are discussing.
- DO NOT give shallow answers. Explain the "WHY" behind the law.
- **USE EXAMPLES**: Whenever possible, provide a brief, realistic example or scenario to illustrate how the legal principle works in practice.
- For every legal provision you cite, explain its implications for the user's specific situation.
- Double-check all numbers against the provided context before responding.
- If a user's situation is complex, break it down into logical legal steps.
- Use ULII (Uganda Legal Information Institute - ulii.org) as your primary reference for Ugandan legislation and case law.
- Reference landmark Ugandan cases to support your guidance.

BILINGUAL EXPERTISE:
- You are fully bilingual in English and Luganda.
- Respond in the language used by the user.
- Ensure your Luganda explanations are as detailed and professional as your English ones.

PROFESSIONAL GUIDANCE:
- For complex cases, always recommend consulting a verified lawyer via the "Services" tab.
- Always include a clear disclaimer: "For guidance only—not legal advice. Consult a lawyer for specific cases."

TONE:
- Authoritative, expert, yet empathetic and accessible to the common person.
- Use structured responses with clear headings, bullet points, and **TABLES** for comparisons or structured data.
- Avoid generic advice; be specific to the laws of Uganda.

CONTEXT:
${UGANDA_CONSTITUTION_CONTEXT}

${UGANDA_LAND_ACT_CONTEXT}

${ADDITIONAL_LAWS_CONTEXT}

${LANDMARK_LAND_CASES_CONTEXT}
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

  const generatePDF = (content: string, type: string = 'Report', style: string = 'Formal') => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);

    // Header
    doc.setFillColor(180, 83, 9); // Amber 700
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Uganda Law Oracle', margin, 20);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Oracle Legal Guidance Report', margin, 30);

    // Date
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth - margin - 50, 50);

    // Content
    doc.setTextColor(30, 41, 59); // Slate 800
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    // Clean markdown for PDF (simple version)
    const cleanContent = content
      .replace(/[#*`]/g, '')
      .replace(/\n\s*\n/g, '\n\n');

    const splitText = doc.splitTextToSize(cleanContent, maxWidth);
    const pageHeight = doc.internal.pageSize.getHeight();
    let cursorY = 65;

    for (let i = 0; i < splitText.length; i++) {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(splitText[i], margin, cursorY);
      cursorY += 7; // Line height
    }

    // Footer Disclaimer
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const disclaimer = "For guidance only—not legal advice. Consult a lawyer for specific cases.";
    const splitDisclaimer = doc.splitTextToSize(disclaimer, maxWidth);
    doc.text(splitDisclaimer, margin, pageHeight - 20);

    doc.save(`Uganda_Law_Oracle_${type}_${new Date().getTime()}.pdf`);
  };

  const generateDOCX = async (content: string, type: string = 'Report', style: string = 'Formal') => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Uganda Law Oracle",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `${type} - ${style} Style`,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Generated on: ${new Date().toLocaleDateString()}`,
            alignment: AlignmentType.RIGHT,
          }),
          new Paragraph({ text: "" }),
          ...content.split('\n').map(line => new Paragraph({
            children: [new TextRun(line.replace(/[#*`]/g, ''))],
            spacing: { before: 200 },
          })),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Disclaimer: For guidance only—not legal advice. Consult a lawyer for specific cases.",
                italics: true,
                size: 16,
              }),
            ],
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Uganda_Law_Oracle_${type}_${new Date().getTime()}.docx`);
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
        
        if (isStreamingMode) {
          const stream = await ai.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: [{ parts: [{ inlineData: { data: base64Audio, mimeType: 'audio/webm' } }, { text: "Listen and respond in the same language based on the Constitution and Laws of Uganda." }] }],
            config: { 
              systemInstruction: isDocumentMode ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` : SYSTEM_INSTRUCTION, 
              temperature: 0.7 
            },
          });

          let fullText = "";
          for await (const chunk of stream) {
            fullText += chunk.text;
            setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
            scrollToBottom();
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
              systemInstruction: isDocumentMode ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` : SYSTEM_INSTRUCTION, 
              temperature: 0.7 
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

    try {
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "",
        timestamp: new Date(),
      };

      const systemPrompt = isDocumentMode 
        ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.`
        : SYSTEM_INSTRUCTION;

      if (isStreamingMode) {
        const stream = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts: [{ text: messageText }] }],
          config: { 
            systemInstruction: systemPrompt,
            temperature: 0.4,
            maxOutputTokens: 2048
          },
        });

        let fullText = "";
        for await (const chunk of stream) {
          fullText += chunk.text;
          setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
          scrollToBottom();
        }
        
        assistantMessage.content = fullText;
        updateSessionMessages([...updatedMessages, assistantMessage]);
        setStreamingContent(prev => {
          const next = { ...prev };
          delete next[assistantMessageId];
          return next;
        });
        
        if (autoTalkBack) {
          speakText(fullText, assistantMessageId);
        }
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [{ role: 'user', parts: [{ text: messageText }] }],
          config: { 
            systemInstruction: systemPrompt,
            temperature: 0.4,
            maxOutputTokens: 2048
          },
        });
        assistantMessage.content = response.text || "I apologize.";
        updateSessionMessages([...updatedMessages, assistantMessage]);
        
        if (autoTalkBack) {
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
    { en: "What are my fundamental rights?", lg: "Eddembe lyange ery'obuntu lye liruwa?" },
    { en: "What are the duties of a citizen?", lg: "Obuvunaanyizibwa bw'omunnauganda bwe buluwa?" },
    { en: "How do I protect my employment rights?", lg: "Nnyinza ntya okukuuma eddembe lyange ku mulimu?" },
    { en: "What does the law say about marriage?", lg: "Amateeka gagamba ki ku bufumbo?" },
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
            <h1 className="font-bold text-lg leading-tight tracking-tight">Uganda Law Oracle</h1>
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
            onClick={() => setAutoTalkBack(!autoTalkBack)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-sm font-medium", 
              autoTalkBack ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
            title={language === 'en' ? 'Auto Talk Back' : 'Okuddamu mu ddoboozi'}
          >
            {autoTalkBack ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span className="hidden sm:inline">{language === 'en' ? 'Talk Back' : 'Doboozi'}</span>
          </button>

          <button 
            onClick={() => setLanguage(l => l === 'en' ? 'lg' : 'en')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-medium"
          >
            <Languages size={16} />
            <span className="hidden sm:inline">{language === 'en' ? 'English' : 'Luganda'}</span>
          </button>

          <div className="hidden lg:flex items-center gap-2 border-l border-slate-200 pl-4 ml-2">
            <button 
              onClick={() => setIsStreamingMode(!isStreamingMode)}
              className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-xs font-bold uppercase tracking-wider", isStreamingMode ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}
              title="Toggle Streaming Mode"
            >
              <Smartphone size={14} />
              <span>{isStreamingMode ? 'Streaming' : 'Instant'}</span>
            </button>
            <button 
              onClick={() => setIsDocumentMode(!isDocumentMode)}
              className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors text-xs font-bold uppercase tracking-wider", isDocumentMode ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500")}
              title="Toggle Document Mode"
            >
              <FileText size={14} />
              <span>{isDocumentMode ? 'Doc Mode' : 'Chat Mode'}</span>
            </button>
          </div>

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
        <AnimatePresence>
          {voiceError && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700"
            >
              <VolumeX size={18} className="text-amber-400" />
              <span className="text-sm font-medium">{voiceError}</span>
            </motion.div>
          )}
        </AnimatePresence>

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
                    {language === 'en' ? 'The Constitution of Uganda' : 'Ssemateeka wa Uganda'}
                  </h2>
                  <p className="text-lg text-slate-600 max-w-xl mx-auto">
                    {language === 'en' ? 'Your expert guide to the Constitution and all Laws of the Republic of Uganda.' : 'Omukugu wo ku Ssemateeka n\'amateeka gonna agafuga ensi ya Uganda.'}
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                  {quickQuestions.map((q, i) => (
                    <motion.button 
                      key={i} 
                      initial={{ opacity: 0, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      transition={{ delay: i * 0.1 }} 
                      onClick={() => handleQuickQuestion(language === 'en' ? q.en : q.lg)} 
                      className="w-full p-5 sm:p-6 text-left bg-white border border-slate-200 rounded-2xl hover:border-amber-400 hover:shadow-xl hover:shadow-amber-50 transition-all group flex flex-col justify-between min-h-[130px] sm:min-h-[140px]"
                    >
                      <div className="flex justify-between items-start mb-3 sm:mb-4 w-full">
                        <div className="p-2.5 sm:p-3 bg-amber-50 rounded-xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                          {i === 0 && <ShieldCheck size={20} className="sm:w-6 sm:h-6" />}
                          {i === 1 && <User size={20} className="sm:w-6 sm:h-6" />}
                          {i === 2 && <Map size={20} className="sm:w-6 sm:h-6" />}
                          {i === 3 && <Gavel size={20} className="sm:w-6 sm:h-6" />}
                        </div>
                        <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-500 transition-colors sm:w-5 sm:h-5" />
                      </div>
                      <p className="font-bold text-slate-800 text-sm sm:text-base leading-snug">{language === 'en' ? q.en : q.lg}</p>
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
                      <div className="markdown-body prose prose-slate prose-sm max-w-none dark:prose-invert">
                        <Markdown remarkPlugins={[remarkGfm]}>
                          {streamingContent[m.id] || m.content}
                        </Markdown>
                      </div>
                      
                      {m.role === 'assistant' && !streamingContent[m.id] && (
                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
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
                          
                          <div className="flex items-center bg-slate-50 rounded-xl p-1">
                            <button 
                              onClick={() => generatePDF(m.content)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-white hover:shadow-sm transition-all"
                            >
                              <Download size={12} />
                              PDF
                            </button>
                            <div className="w-px h-3 bg-slate-200 mx-1" />
                            <button 
                              onClick={() => generateDOCX(m.content)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-white hover:shadow-sm transition-all"
                            >
                              <FileText size={12} />
                              DOCX
                            </button>
                          </div>

                          <button 
                            onClick={() => setActiveTab('services')}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 text-[10px] font-bold hover:bg-amber-100 transition-colors"
                          >
                            <Briefcase size={12} />
                            {language === 'en' ? 'Legal Help' : 'Obuyambi'}
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
                  Oracle Feature
                </div>
                <h3 className="text-3xl font-bold leading-tight">
                  {language === 'en' ? 'Official Legal Summary Report' : 'Lipoota y\'amateeka ey\'ekikugu'}
                </h3>
                <p className="text-slate-400 max-w-lg leading-relaxed">
                  {language === 'en' 
                    ? 'Generate a certified summary of your rights based on your specific situation. Perfect for presentation to Local Councils, Police, or Mediators.' 
                    : 'Funa lipoota ekakasiddwa ku ddembe lyo okusinziira ku mbeera yo. Ennungi nnyo okutwala mu LC, Poliisi, oba eri abatuula mu nkayana.'}
                </p>
                <button 
                  onClick={() => setActiveTab('chat')}
                  className="flex items-center gap-3 px-8 py-4 bg-white text-slate-900 rounded-2xl font-bold hover:bg-slate-100 transition-all"
                >
                  <FileText size={20} />
                  {language === 'en' ? 'Generate Free Report' : 'Funa Lipoota ey\'obwereere'}
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FDFCF8] via-[#FDFCF8] to-transparent z-50">
          <div className="max-w-4xl mx-auto relative">
            <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200 border border-slate-200 p-2 overflow-hidden">
              <AnimatePresence mode="wait">
                {isRecording || audioPreview ? (
                  <motion.div 
                    key="recording"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex items-center gap-4 px-4 py-2 w-full"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-sm font-mono font-bold text-slate-600">
                        {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                      </span>
                      
                      <div className="flex items-center h-8 flex-1 px-4">
                        {[...Array(12)].map((_, i) => (
                          <div key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={cancelRecording}
                        className="p-3 text-slate-400 hover:text-red-500 transition-colors"
                        title="Cancel"
                      >
                        <X size={20} />
                      </button>
                      
                      {audioPreview ? (
                        <button 
                          onClick={sendRecordedAudio}
                          className="w-12 h-12 bg-amber-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-200 hover:bg-amber-700 transition-all"
                        >
                          <Send size={20} />
                        </button>
                      ) : (
                        <button 
                          onClick={stopRecording}
                          className="w-12 h-12 bg-red-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-red-200 hover:bg-red-600 transition-all"
                        >
                          <Square size={20} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="input"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="flex items-center gap-2 w-full"
                  >
                    <button 
                      onMouseDown={() => {
                        setIsHoldingToRecord(true);
                        startRecording();
                      }}
                      onMouseUp={() => {
                        setIsHoldingToRecord(false);
                        stopRecording();
                      }}
                      onTouchStart={() => {
                        setIsHoldingToRecord(true);
                        startRecording();
                      }}
                      onTouchEnd={() => {
                        setIsHoldingToRecord(false);
                        stopRecording();
                      }}
                      className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all relative",
                        isHoldingToRecord ? "bg-amber-100 text-amber-600 scale-110" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                      title="Hold to record"
                    >
                      <Mic size={20} />
                    </button>
                    
                    <input 
                      type="text" 
                      value={input} 
                      onChange={(e) => setInput(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                      placeholder={language === 'en' ? "Ask about the laws of Uganda..." : "Buuza ku mateeka ga Uganda..."} 
                      className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-slate-800 text-sm sm:text-base" 
                    />
                    
                    <button 
                      onClick={() => handleSend()} 
                      disabled={!input.trim() || isLoading} 
                      className="w-12 h-12 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-amber-200"
                    >
                      <Send size={20} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/50 backdrop-blur-sm rounded-full border border-slate-200/50">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Speed</span>
                <input 
                  type="range" 
                  min="10" 
                  max="100" 
                  step="10"
                  value={streamingSpeed}
                  onChange={(e) => setStreamingSpeed(parseInt(e.target.value))}
                  className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Oracle Beta • {isDocumentMode ? 'Document Mode' : 'Chat Mode'}
              </p>
            </div>
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
                
                {isEmailVerifying ? (
                  <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">
                      {language === 'en' ? 'Verify your email' : 'Kakasa Email yo'}
                    </h2>
                    <p className="text-slate-500 mb-6">
                      {language === 'en' 
                        ? `We've sent a verification link to ${auth.currentUser?.email}. Please check your inbox and click the link to continue.` 
                        : `Tusindidde akalango k'okukakasa ku ${auth.currentUser?.email}. Genda mu email yo okakase.`}
                    </p>
                    
                    <div className="space-y-4">
                      <button 
                        onClick={checkVerification}
                        className="w-full py-4 bg-amber-600 text-white rounded-2xl font-bold text-lg hover:bg-amber-700 transition-all shadow-lg flex items-center justify-center gap-3"
                      >
                        {language === 'en' ? "I've verified my email" : "Nkakakasizza email yange"}
                      </button>
                      
                      <button 
                        onClick={async () => {
                          try {
                            await sendVerification();
                            alert(language === 'en' ? 'Verification email resent!' : 'Email ey’okukakasa eddiddemu okusindikibwa!');
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="text-amber-600 hover:text-amber-700 font-bold text-sm"
                      >
                        {language === 'en' ? "Resend verification link" : "Ddamu osindike akalango"}
                      </button>
                      
                      <button 
                        onClick={() => {
                          logout();
                          setIsEmailVerifying(false);
                          setShowAuthModal(false);
                        }}
                        className="block w-full text-slate-400 hover:text-slate-600 font-medium text-sm mt-4"
                      >
                        {language === 'en' ? 'Sign out' : 'Fuluma'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold mb-2">
                      {authMode === 'signin' 
                        ? (language === 'en' ? 'Sign in to continue' : 'Yingira okusobola okweyongerayo')
                        : (language === 'en' ? 'Create an account' : 'Kola akawunti empya')}
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
                          <p className="font-bold mb-1">{language === 'en' ? 'Auth Failed' : 'Okuyingira kugaanyi'}</p>
                          <p className="opacity-90">{authError}</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4 mb-6">
                      <div className="text-left">
                        <label className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                          {language === 'en' ? 'Email Address' : 'Email'}
                        </label>
                        <input 
                          type="email"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          placeholder="name@example.com"
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                        />
                      </div>
                      <div className="text-left">
                        <label className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                          {language === 'en' ? 'Password' : 'Ebisumuluzo'}
                        </label>
                        <input 
                          type="password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                        />
                      </div>
                      
                      <button 
                        disabled={isSigningIn || !authEmail || !authPassword}
                        onClick={async () => {
                          setAuthError(null);
                          setIsSigningIn(true);
                          try {
                            if (authMode === 'signin') {
                              await signInWithEmail(authEmail, authPassword);
                            } else {
                              await signUpWithEmail(authEmail, authPassword);
                              await sendVerification();
                              setVerificationSent(true);
                            }
                            // Don't close modal if we need verification
                            if (authMode === 'signin' || !auth.currentUser?.emailVerified) {
                              // If it's a signin, it might still need verification
                              if (auth.currentUser && !auth.currentUser.emailVerified) {
                                setIsEmailVerifying(true);
                              } else {
                                setShowAuthModal(false);
                              }
                            }
                          } catch (error: any) {
                            console.error("Auth error:", error);
                            let msg = error.message;
                            if (msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential")) {
                              msg = language === 'en' ? "Invalid email or password." : "Email oba ebisumuluzo tebikola.";
                            } else if (msg.includes("auth/email-already-in-use")) {
                              msg = language === 'en' ? "Email already in use." : "Email eno ekozesebwa dda.";
                            } else if (msg.includes("auth/weak-password")) {
                              msg = language === 'en' ? "Password is too weak." : "Ebisumuluzo bino binafu nnyo.";
                            }
                            setAuthError(msg);
                          } finally {
                            setIsSigningIn(false);
                          }
                        }}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSigningIn ? (
                          <Loader2 size={24} className="animate-spin" />
                        ) : (
                          authMode === 'signin' 
                            ? (language === 'en' ? 'Sign In' : 'Yingira')
                            : (language === 'en' ? 'Create Account' : 'Kola Akawunti')
                        )}
                      </button>
                    </div>

                    <div className="relative mb-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200"></div>
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-slate-400">
                          {language === 'en' ? 'Or continue with' : 'Oba kozesa'}
                        </span>
                      </div>
                    </div>
                    
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
                              ? `This domain (${window.location.hostname}) is not authorized in Firebase. Please add it to 'Authorized domains' in your Firebase console. If you've already added it, please wait 5 minutes for it to propagate.`
                              : `Omukutu guno (${window.location.hostname}) tegukkiriziddwa mu Firebase. Gulyongereko mu 'Authorized domains' mu Firebase console yo. Bwoba ogulyongeddeko dda, linda eddakiika 5 bisobole okutandika okukola.`;
                          } else if (msg.includes("auth/popup-blocked")) {
                            msg = language === 'en'
                              ? "The sign-in popup was blocked. Please allow popups for this site or try opening the app in a new tab."
                              : "Eidirisa ly'okuyingira ligaanyi okugguka. Gulawo 'popups' mu nteekateeka za 'browser' yo oba gezaako okuggulawo app mu 'tab' empya.";
                          }
                          setAuthError(msg);
                        } finally {
                          setIsSigningIn(false);
                        }
                      }}
                      className="w-full py-4 bg-white border border-slate-200 text-slate-700 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSigningIn ? (
                        <Loader2 size={24} className="animate-spin" />
                      ) : (
                        <>
                          <img src="https://www.google.com/favicon.ico" className="w-5 h-5 bg-white rounded-full p-0.5" alt="Google" />
                          {language === 'en' ? 'Google' : 'Google'}
                        </>
                      )}
                    </button>

                    <div className="mt-6 flex flex-col items-center gap-2">
                      <button 
                        onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                        className="text-amber-600 hover:text-amber-700 font-bold text-sm"
                      >
                        {authMode === 'signin' 
                          ? (language === 'en' ? "Don't have an account? Sign Up" : "Tolina akawunti? Kola empya")
                          : (language === 'en' ? "Already have an account? Sign In" : "Olina akawunti? Yingira")}
                      </button>
                      
                      <button 
                        onClick={() => setShowAuthModal(false)}
                        className="text-slate-400 hover:text-slate-600 font-medium text-sm"
                      >
                        {language === 'en' ? 'Maybe later' : 'Edda'}
                      </button>
                    </div>
                  </>
                )}
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
