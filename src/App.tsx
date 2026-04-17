/**
 * Developed by Musiime Jonathan
 * Statum AI - Trilingual Legal Assistant
 */
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality, Type, FunctionDeclaration, LiveServerMessage } from "@google/genai";
import { generatePDF, generateDOCX } from './lib/documentService';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType, 
  signUpWithEmail, 
  signInWithEmail, 
  sendVerification 
} from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
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
  Star,
  Paperclip,
  Image as ImageIcon,
  File as FileIcon,
  Share2,
  MapPin,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle,
  Camera,
  Copy
} from 'lucide-react';
import { Message, ChatSession, Lawyer } from './types';
import { MOCK_LAWYERS, SYSTEM_INSTRUCTION, LUGANDA_SYSTEM_INSTRUCTION, RUNYANKORE_SYSTEM_INSTRUCTION } from './constants/systemInstructions';

const LegalNoticeModal = React.lazy(() => import('./components/LegalNoticeModal').then(m => ({ default: m.LegalNoticeModal })));
const MarkdownRenderer = React.lazy(() => import('./components/MarkdownRenderer'));

// --- Components ---
const RoadmapComponent = ({ roadmap, language }: { roadmap: any, language: 'en' | 'lg' }) => (
  <div className="my-6 sm:my-8 bg-white border border-slate-200 rounded-2xl sm:rounded-[2rem] overflow-hidden shadow-sm">
    <div className="p-5 sm:p-8 border-b border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-[#C5A059]/10 text-[#C5A059] rounded-lg">
          <MapPin size={20} />
        </div>
        <h3 className="font-serif font-bold text-xl sm:text-2xl text-[#0B0F1A]">{roadmap.title}</h3>
      </div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        {language === 'en' ? 'Statutory Procedural Roadmap' : 'Enkola y\'amateeka ey\'omulala'}
      </p>
    </div>
    <div className="p-5 sm:p-8 space-y-8 relative">
      <div className="absolute left-[31px] sm:left-[43px] top-12 bottom-12 w-0.5 bg-slate-100" />
      {roadmap.steps.map((step: any, idx: number) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1 }}
          className="flex gap-4 sm:gap-6 relative z-10"
        >
          <div className={cn(
            "w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all",
            step.status === 'completed' ? "bg-[#0B0F1A] border-[#0B0F1A] text-[#C5A059]" :
            step.status === 'current' ? "bg-white border-[#C5A059] text-[#C5A059] shadow-lg shadow-[#C5A059]/10" :
            "bg-white border-slate-200 text-slate-300"
          )}>
            {step.status === 'completed' ? <CheckCircle size={14} /> : <span className="text-[10px] font-bold">{idx + 1}</span>}
          </div>
          <div className="flex-1 pt-0.5 sm:pt-1">
            <h4 className={cn(
              "font-serif font-bold text-base sm:text-lg mb-1",
              step.status === 'current' ? "text-[#0B0F1A]" : "text-slate-600"
            )}>{step.title}</h4>
            <p className="text-xs sm:text-sm text-slate-500 leading-relaxed mb-2 font-sans">{step.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

const LegalIntelligenceBadge = () => (
  <div className="flex items-center gap-2 mb-4 sm:mb-6 text-[9px] sm:text-[10px] font-bold text-[#C5A059] uppercase tracking-[0.2em] border-b border-slate-100 pb-3">
    <div className="flex items-center -space-x-1">
      <ShieldCheck size={14} className="sm:w-4 sm:h-4 relative z-10" />
      <Bot size={14} className="sm:w-4 sm:h-4 text-slate-300" />
    </div>
    <span>Statutory Intelligence Verified</span>
    <div className="ml-auto flex items-center gap-1.5">
      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
      <span className="text-slate-400">Live Context Grounding</span>
    </div>
  </div>
);

// --- Oracle Core ---
const getAI = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) console.warn("GEMINI_API_KEY is missing from environment variables.");
  return new GoogleGenAI({ apiKey: key || '' });
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

// --- Components ---
const Waveform = () => (
  <div className="flex items-center gap-1 h-8">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        animate={{
          height: [8, 24, 12, 28, 8],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          delay: i * 0.05,
          ease: "easeInOut"
        }}
        className="w-1 bg-[#C5A059] rounded-full"
      />
    ))}
  </div>
);

const CallOverlay = ({ 
  onClose, 
  isRecording, 
  isSpeaking, 
  language,
  currentVolume,
  transcription,
  assistantResponse,
  isThinking,
  isTranscribing,
  error
}: { 
  onClose: () => void, 
  isRecording: boolean, 
  isSpeaking: boolean, 
  language: string,
  currentVolume: number,
  transcription: string,
  assistantResponse: string,
  isThinking: boolean,
  isTranscribing: boolean,
  error: string | null
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-[#0B0F1A] flex flex-col items-center justify-between p-8 sm:p-12 text-white overflow-hidden"
    >
      <div className="w-full flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest">Live Call</span>
        </div>
        <button onClick={onClose} className="p-4 hover:bg-white/10 rounded-full transition-all">
          <X size={32} />
        </button>
      </div>

      <div className="flex flex-col items-center gap-8 w-full">
        <div className="relative">
          <motion.div 
            animate={{ 
              scale: (isRecording || isSpeaking || isThinking || isTranscribing) 
                ? 1 + (currentVolume / 100) + (isThinking || isTranscribing ? 0.1 : 0) + (isRecording ? 0.05 : 0) 
                : 1,
              opacity: (isRecording || isSpeaking || isThinking || isTranscribing) 
                ? 0.3 + (currentVolume / 200) + (isThinking || isTranscribing ? 0.2 : 0) 
                : 0.2
            }}
            transition={{ type: "spring", stiffness: 100, damping: 10 }}
            className="absolute inset-0 bg-[#C5A059] rounded-full blur-3xl"
          />
          <div className="relative w-40 h-40 sm:w-56 sm:h-56 bg-[#1a1f2e] rounded-full flex items-center justify-center border-4 border-[#C5A059]/30 shadow-2xl">
            <Scale size={80} className={cn(
              "text-[#C5A059] transition-transform duration-200",
              (isRecording || isSpeaking || isThinking || isTranscribing) && "scale-110"
            )} />
          </div>
          
          {/* Waveform visualizer */}
          {(isRecording || isSpeaking) && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-1 h-12">
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{
                    height: [8, 8 + (currentVolume * (1 + Math.sin(i * 0.5)) * 0.8), 8],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.05,
                  }}
                  className="w-1.5 bg-[#C5A059] rounded-full"
                />
              ))}
            </div>
          )}
        </div>
        
        <div className="text-center space-y-4">
          <h2 className="text-4xl sm:text-6xl font-display font-bold tracking-tight">
            Statum AI
          </h2>
          <p className="text-[#C5A059] font-mono font-bold tracking-[0.3em] uppercase text-sm sm:text-lg">
            {isSpeaking ? (language === 'en' ? 'Speaking...' : 'Ayogera...') : 
             isThinking ? (language === 'en' ? 'Connecting...' : 'Ayungibwa...') :
             isTranscribing ? (language === 'en' ? 'Transcribing...' : 'Nkyusa eddoboozi...') :
             isRecording ? (language === 'en' ? 'Listening...' : 'Awuliriza...') : 
             (language === 'en' ? 'Connected' : 'Ayungiddwa')}
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl space-y-8">
        <div className="bg-white/5 rounded-3xl p-6 sm:p-8 backdrop-blur-md border border-white/10 shadow-2xl">
          <div className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-400">
                <AlertTriangle size={20} className="shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
            {transcription && (
              <div className="space-y-2">
                <p className="text-[#C5A059] text-[10px] font-bold uppercase tracking-widest opacity-60">You</p>
                <p className="text-lg sm:text-xl font-medium text-slate-200 line-clamp-2 italic">"{transcription}"</p>
              </div>
            )}
            {assistantResponse && (
              <div className="space-y-2 pt-4 border-t border-white/5">
                <p className="text-[#C5A059] text-[10px] font-bold uppercase tracking-widest opacity-60">Statum AI</p>
                <p className="text-xl sm:text-3xl font-serif font-medium text-white leading-tight italic">
                  {assistantResponse}
                </p>
              </div>
            )}
            {isThinking && !assistantResponse && (
              <div className="flex flex-col items-center py-8 gap-4">
                <Loader2 size={32} className="text-[#C5A059] animate-spin" />
                <p className="text-slate-400 text-sm font-medium">Processing your request...</p>
              </div>
            )}
            {!transcription && !assistantResponse && !isThinking && (
              <p className="text-center text-slate-500 font-medium animate-pulse py-8">
                {language === 'en' ? 'Speak naturally, I am listening...' : 'Yogera mu ngeri ey\'obulijjo, nkuwuliriza...'}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#C5A059]/10 text-[#C5A059] rounded-full border border-[#C5A059]/20">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Statutory Grounding Active</span>
            </div>
            {isRecording && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 rounded-full border border-green-500/20 animate-pulse">
                <Mic size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Mic Active</span>
              </div>
            )}
          </div>
          <button 
            onClick={onClose}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-red-500 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/40 hover:bg-red-600 transition-all active:scale-90 group"
          >
            <Smartphone size={40} className="rotate-[135deg] group-hover:scale-110 transition-transform" />
          </button>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {language === 'en' ? 'End Call' : 'Malawo essimu'}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('uganda_law_oracle_sessions');
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
    const last = localStorage.getItem('uganda_law_oracle_last_session');
    return last || null;
  });

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState<'en' | 'lg' | 'nk'>('en');
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCallMode, setIsCallMode] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [premiumReportsCount, setPremiumReportsCount] = useState(() => {
    const saved = localStorage.getItem('uganda_law_oracle_premium_reports');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [streamingContent, setStreamingContent] = useState<Record<string, string>>({});
  const [showLegalNotice, setShowLegalNotice] = useState(() => {
    return localStorage.getItem('uganda_law_oracle_legal_notice_accepted') !== 'true';
  });
  const [activeTab, setActiveTab] = useState<'chat' | 'lawyers' | 'documents' | 'services'>('chat');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isDocumentMode, setIsDocumentMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{data: string, mimeType: string, name: string}[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [verificationSteps, setVerificationSteps] = useState<string[]>([]);
  const [isStreamingMode, setIsStreamingMode] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    return () => {
      window.removeEventListener('resize', handleResize);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleAcceptLegalNotice = () => {
    localStorage.setItem('uganda_law_oracle_legal_notice_accepted', 'true');
    setShowLegalNotice(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = [...attachedFiles];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        setRecordingError(language === 'en' ? "File too large (max 10MB)" : language === 'lg' ? "Fayiro nnene nnyo (max 10MB)" : "Ebihandiiko nibikira obunene (max 10MB)");
        continue;
      }

      const reader = new FileReader();
      const fileData = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      newFiles.push({
        name: file.name,
        data: fileData,
        mimeType: file.type
      });
    }
    setAttachedFiles(newFiles);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addVerificationStep = (step: string) => {
    setVerificationSteps(prev => [...prev, step]);
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isSpeakingCancelledRef = useRef(false);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    localStorage.setItem('uganda_law_oracle_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('uganda_law_oracle_premium_reports', premiumReportsCount.toString());
  }, [premiumReportsCount]);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('uganda_law_oracle_last_session', currentSessionId);
    }
    scrollToBottom();
  }, [currentSessionId, messages]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: generateId(),
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
      localStorage.removeItem('uganda_law_oracle_sessions');
      localStorage.removeItem('uganda_law_oracle_last_session');
    }
  };

  const updateSessionMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    if (!currentSessionId) {
      const messagesToUse = typeof newMessages === 'function' ? newMessages([]) : newMessages;
      const newSession: ChatSession = {
        id: generateId(),
        title: messagesToUse[0]?.content.substring(0, 30) + '...',
        messages: messagesToUse,
        lastUpdated: new Date()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
    } else {
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          const messagesToUse = typeof newMessages === 'function' ? newMessages(s.messages) : newMessages;
          return { 
            ...s, 
            messages: messagesToUse, 
            lastUpdated: new Date(),
            title: s.messages.length === 0 ? messagesToUse[0]?.content.substring(0, 30) + '...' : s.title
          };
        }
        return s;
      }));
    }
  };

  // --- Recording Logic ---
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isCallMode) {
      setTimeout(() => toggleRecording(), 500);
    }
  }, [isCallMode]);

  const startRecording = async () => {
    if (isRecording || isTranscribing) return;
    if (!isPro && freeQuestionsRemaining <= 0) return;
    setRecordingError(null);
    
    // 1. Aggressive Cleanup of any existing hardware state
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.onerror = null;
      mediaRecorderRef.current.ondataavailable = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.warn("Error stopping previous recorder:", e);
        }
      }
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn("Error stopping previous stream tracks:", e);
      }
      streamRef.current = null;
    }
    
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setRecordingError(language === 'en' ? "Recording not supported in this browser." : language === 'lg' ? "Okukwata eddoboozi tekuwagirwa mu browser eno." : "Okukwata eddoboozi tikurikuhagira browser egi.");
      return;
    }

    let stream: MediaStream | null = null;

    try {
      setRecordingError(null);
      setRecordedBlob(null);
      setAudioPreview(null);
      
      // 2. Request fresh stream every time to avoid "stale" hardware issues
      stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
        'audio/wav'
      ];
      
      const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
      console.log("Starting recording with MimeType:", mimeType);

      const mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType || undefined });
      const actualMimeType = mediaRecorder.mimeType || mimeType || 'audio/webm';
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 120) { // 2 minute limit
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error("MediaRecorder Error:", event.error);
        setRecordingError(language === 'en' ? "Recording error occurred." : language === 'lg' ? "Wabaddewo ekikyamu mu kukwata eddoboozi." : "Wabaho ekikyamu omu kukwata eddoboozi.");
        stopRecording();
      };

      mediaRecorder.onstop = async () => {
        // 3. Release hardware immediately to prevent "war"
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
        if (streamRef.current === stream) {
          streamRef.current = null;
        }
        
        if (audioChunksRef.current.length === 0) {
          console.warn("No audio data captured.");
          const msg = language === 'en' ? "No audio data captured. Please try again." : language === 'lg' ? "Tewali ddoboozi likwatiddwa. Gezaako nate." : "Tihali ddoboozi erikwatirwe. Gezaako nate.";
          if (isCallMode) {
            setVoiceError(msg);
          } else {
            setRecordingError(msg);
          }
          setIsRecording(false);
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        const sizeKB = Math.round(audioBlob.size / 1024);
        console.log("Recording stopped. Blob size:", sizeKB, "KB", "Type:", audioBlob.type);

        // If size is too small, it's likely silence or a hardware glitch
        if (audioBlob.size < 1000) { // Lowered threshold for Call Mode responsiveness
          if (isCallMode) {
            console.log("Statum AI: Audio too short, restarting loop...");
            setIsRecording(false);
            setTimeout(() => {
              if (isCallMode && !isRecording && !isSpeaking && !isTranscribing) {
                toggleRecording();
              }
            }, 1000);
          } else {
            setRecordingError(language === 'en' ? `Audio too short or silent (${sizeKB}KB). Please speak longer.` : language === 'lg' ? `Eddoboozi liyimpitidde nnyo oba tewali ddoboozi (${sizeKB}KB). Gezaako nate.` : `Eddoboozi nirigaba lifwiire nnyo oba tihali ddoboozi (${sizeKB}KB). Gezaako nate.`);
            setIsRecording(false);
          }
          return;
        }

        setRecordedBlob(audioBlob);
        setAudioPreview(URL.createObjectURL(audioBlob));
        if (timerRef.current) clearInterval(timerRef.current);
        
        // Auto-send after stopping
        await processAudioMessage(audioBlob);
      };

      mediaRecorder.start(1000); // 1s chunks for better stability
      setIsRecording(true);

      if (isCallMode) {
        setInput("");
        setStreamingContent({});
      }

      // VAD / Volume Visualizer
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const checkSilence = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
          setCurrentVolume(0);
          return;
        }
        
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setCurrentVolume(average);
        
        if (isCallMode) {
          if (average < 12) { // Increased threshold for better noise tolerance
            if (!silenceTimeoutRef.current) {
              silenceTimeoutRef.current = setTimeout(() => {
                console.log("Statum AI: Silence detected, stopping recording...");
                stopRecording();
              }, 3000); // 3s of silence for better natural pauses
            }
          } else {
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
              silenceTimeoutRef.current = null;
            }
          }
        }
        
        requestAnimationFrame(checkSilence);
      };
      checkSilence();

      // Interruption: If user starts speaking while AI is talking, stop AI
      if (isSpeaking) {
        stopSpeaking();
      }
    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
      }
      
      let errorMsg = language === 'en' 
        ? "Microphone access denied or busy. Please check browser permissions and other apps." 
        : "Akazindaalo kagaanye oba kali mu kukozesebwa. Kakasa nti otaddeko olukusa era tewali pulogulaamu ndala ekakozesa.";
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg += language === 'en' 
          ? " (Permission Denied)" 
          : " (Olukusa lugaanyiddwa)";
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = language === 'en' 
          ? "No microphone found. Please connect one." 
          : "Tewali kazindaalo kazuliddwa. Teekako akazindaalo.";
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMsg = language === 'en'
          ? "Microphone is busy or being used by another app. Please close other apps or refresh."
          : "Akazindaalo kali mu kukozesebwa pulogulaamu endala. Ggalawo pulogulaamu endala oba ddamu ogulewo pulogulaamu eno.";
      }

      // Check if in iframe
      if (window.self !== window.top) {
        errorMsg += language === 'en'
          ? " TIP: Try opening the app in a new tab for better microphone access."
          : " TIP: Gezaako okuggulawo pulogulaamu eno mu tab empya okusobola okukozesa akazindaalo obulungi.";
      }

      setRecordingError(errorMsg);
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
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
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping recorder:", e);
      }
    }
    setIsRecording(false);
  };

  const sendRecordedAudio = async () => {
    if (recordedBlob) {
      await processAudioMessage(recordedBlob);
      setRecordedBlob(null);
      setAudioPreview(null);
    }
  };

  const processAudioMessage = async (audioBlob: Blob) => {
    if (isTranscribing) return;
    
    setIsLoading(true);
    setIsTranscribing(true);
    
    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    const currentUser = user || auth.currentUser;
    if (!currentUser && freeQuestionsRemaining <= 0) {
      setShowAuthModal(true);
      setIsLoading(false);
      setIsTranscribing(false);
      return;
    }

    let mimeType = (audioBlob.type || 'audio/webm').split(';')[0];
    if (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')) {
      mimeType = 'audio/mp4';
    } else if (mimeType.includes('webm')) {
      mimeType = 'audio/webm';
    } else if (mimeType.includes('ogg')) {
      mimeType = 'audio/ogg';
    } else if (mimeType.includes('wav')) {
      mimeType = 'audio/wav';
    } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
      mimeType = 'audio/mp3';
    }

    try {
      if (audioBlob.size > 15 * 1024 * 1024) { // 15MB limit
        throw new Error("Audio file is too large. Please record a shorter message.");
      }

      // 1. Convert blob to base64
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (!result) {
            reject(new Error("Failed to read audio blob"));
            return;
          }
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      if (!base64Audio || base64Audio.length < 100) {
        throw new Error("Audio data is too short or empty.");
      }

      // 2. Create placeholder user message
      const userMessageId = generateId();
      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: language === 'en' ? "Transcribing voice note..." : language === 'lg' ? "Nkyusa eddoboozi mu biwandiiko..." : "Nkuhandiika ebigambo eby'eddoboozi...",
        timestamp: new Date(),
      };
      
      updateSessionMessages(prev => [...prev, userMessage]);

      if (!navigator.onLine) {
        throw new Error("No internet connection.");
      }

      // 4. Transcribe the audio using Gemini with retry logic and timeout
      let transcriptionResponse;
      let retries = 2;
      const transcriptionTimeout = 20000; // 20s timeout

      while (retries >= 0) {
        try {
          const ai = getAI();
          const transcriptionPromise = ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { 
              parts: [
                { inlineData: { data: base64Audio, mimeType: mimeType } }, 
                { text: `You are Statum AI. Transcribe the following audio precisely. 
The user's interface is currently set to ${language === 'en' ? 'English' : language === 'lg' ? 'Luganda' : 'Runyankore'}.
IMPORTANT: If the user is speaking Runyankore (a language from Western Uganda), transcribe it accurately in Runyankore. Do NOT confuse it with Luganda. Runyankore has distinct phonetics and vocabulary (e.g., uses 'r' more frequently where Luganda uses 'l').
Recognize legal terms and names common in Uganda (e.g., 'Amateeka', 'Omushango', 'Endagaano', 'Puliida', 'Eihanga', 'Obuhasirizi').
Return the transcription in the original language spoken. 
If no speech is detected, return '[No speech detected]'.` }
              ] 
            },
            config: {
              temperature: 0.1,
            }
          });

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Transcription timed out")), transcriptionTimeout)
          );

          transcriptionResponse = await Promise.race([transcriptionPromise, timeoutPromise]) as any;
          break; // Success
        } catch (err: any) {
          console.warn(`Transcription attempt ${3 - retries} failed:`, err.message);
          if (retries === 0) throw err;
          retries--;
          await new Promise(r => setTimeout(r, 1500)); // Wait 1.5s before retry
        }
      }

      if (!transcriptionResponse) throw new Error("Transcription failed");

      const transcribedText = transcriptionResponse.text?.trim() || (language === 'en' ? "[Transcription failed]" : language === 'lg' ? "[Okukyusa kulemye]" : "[Okuhandiika kuremwa]");
      setInput(transcribedText);
      
      if (isCallMode) {
        if (transcribedText.includes("[No speech detected]") || transcribedText.length < 2) {
          setVoiceError(language === 'en' ? "I didn't catch that. Please try again." : "Sikiwulidde bulungi. Gezaako nate.");
          setIsTranscribing(false);
          setIsLoading(false);
          updateSessionMessages(prev => prev.filter(m => m.id !== userMessageId));
          return;
        }
      }

      // 5. Update user message with transcribed text
      updateSessionMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, content: transcribedText } : m));
      setIsTranscribing(false);

      // 6. Proceed to generate assistant response
      const assistantMessageId = generateId();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "",
        timestamp: new Date(),
      };
      
      updateSessionMessages(prev => [...prev, assistantMessage]);

      const { SYSTEM_INSTRUCTION } = await import('./constants/systemInstructions');
      const systemPrompt = isDocumentMode 
        ? `${SYSTEM_INSTRUCTION}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` 
        : isCallMode
          ? `${SYSTEM_INSTRUCTION}\n\nINTERACTIVE VOICE MODE: You are on a phone call. BE EXTREMELY BRIEF (1-2 sentences max). Be conversational and professional. NO LISTS. NO BULLET POINTS. Speak naturally like a human on a call. Respond in the same language as the user.`
          : SYSTEM_INSTRUCTION;

      if (isStreamingMode) {
        try {
          const ai = getAI();
          const streamPromise = ai.models.generateContentStream({
            model: "gemini-3-flash-preview",
            contents: { 
              parts: [
                { text: transcribedText }
              ] 
            },
            config: { 
              systemInstruction: systemPrompt, 
              temperature: 0.4 
            },
          });

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Response timed out")), 30000)
          );

          const stream = await Promise.race([streamPromise, timeoutPromise]) as any;

          let fullText = "";
          for await (const chunk of stream) {
            fullText += chunk.text || "";
            setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
            
            const container = document.documentElement;
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            if (isNearBottom) {
              scrollToBottom();
            }
          }
          
          updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: fullText } : m));
          setStreamingContent(prev => {
            const next = { ...prev };
            delete next[assistantMessageId];
            return next;
          });

          // Final check for any remaining text that wasn't caught by the sentence buffer
          if (isCallMode) {
            speakText(fullText, assistantMessageId);
          }
        } catch (err) {
          console.error("Streaming error:", err);
          throw err;
        }
      } else {
        const ai = getAI();
        const responsePromise = ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: { 
            parts: [
              { text: transcribedText }
            ] 
          },
          config: { 
            systemInstruction: systemPrompt, 
            temperature: 0.4 
          },
        });

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Response timed out")), 30000)
        );

        const response = await Promise.race([responsePromise, timeoutPromise]) as any;
        const fullText = response.text || "I apologize.";
        updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: fullText } : m));
        if (isCallMode) {
          speakText(fullText, assistantMessageId);
        }
      }
        
      // Update usage
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
      const debugInfo = `(${mimeType || 'unknown'}, ${Math.round(audioBlob.size / 1024)}KB)`;
      const errorMsg = language === 'en' 
        ? `I had trouble processing your voice note ${debugInfo}. Please ensure you have a stable connection and speak clearly.` 
        : `Nfuna obuzibu mu kuwuliriza eddoboozi lyo ${debugInfo}. Kakasa nti olina yintaneeti eyamaanyi era oyogere bulungi.`;
      const errorMessage: Message = { id: generateId(), role: 'assistant', content: errorMsg, timestamp: new Date() };
      updateSessionMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTranscribing(false);
      
      // Ensure the call loop continues even after errors
      if (isCallMode && !isSpeaking && !isRecording) {
        setTimeout(() => {
          if (isCallMode && !isSpeaking && !isRecording) {
            toggleRecording();
          }
        }, 1500);
      }
    }
  };

  const speakText = async (text: string, messageId: string, onFinished?: () => void) => {
    console.log("Statum AI: Speaking sentence:", text.substring(0, 30) + "...");
    
    // 1. Check if user is logged in or has free questions
    const currentUser = user || auth.currentUser;
    if (!currentUser && freeQuestionsRemaining <= 0) {
      setShowAuthModal(true);
      setVoiceError(language === 'en' ? "Please sign in to use voice features." : language === 'lg' ? "Yingira okusobola okukozesa eddoboozi." : "Yingira okusobola okukozesa eddoboozi.");
      if (onFinished) onFinished();
      return;
    }

    // 2. Check voice quota
    if (!isPro && voiceMessagesRemaining <= 0) {
      setVoiceError(language === 'en' ? "Voice limit reached. Upgrade to Pro for unlimited voice." : language === 'lg' ? "Eddoboozi liweddeko. Gula Pro okusobola okukozesa eddoboozi mu ngeri etaliiko kkomo." : "Eddoboozi rihwireho. Gura Pro okusobola okukozesa eddoboozi n'obusingye.");
      if (onFinished) onFinished();
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
      playFromBuffer(audioCache[messageId], messageId, onFinished);
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
        if (onFinished) onFinished();
        return;
      }

      const response = await ttsAi.models.generateContentStream({
        model: "gemini-3.1-flash-tts-preview",
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
                if (onFinished) onFinished();
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

      // 3. Increment usage if not Pro
      if (hasStarted && !isPro) {
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          try {
            const userSnap = await getDoc(userRef);
            const currentUsed = userSnap.exists() ? (userSnap.data().voiceMessagesUsed || 0) : 0;
            await updateDoc(userRef, { voiceMessagesUsed: currentUsed + 1 });
          } catch (error) {
            console.warn("Failed to sync voice usage to Firestore:", error);
          }
        }
        setVoiceMessagesRemaining(prev => Math.max(0, prev - 1));
      }
    } catch (error: any) { 
      console.error("TTS Error:", error);
      
      let errorMsg = "";
      if (error?.message?.includes("429") || error?.message?.includes("quota")) {
        errorMsg = language === 'en' 
          ? "📢 Voice limit reached for now. You can still read the text below!" 
          : "📢 Eddoboozi liwummuddeko. Kyokka okyasobola okusoma obubaka wansi!";
        setIsCallMode(false);
      } else if (error?.message?.includes("not found") || error?.message?.includes("model")) {
        errorMsg = language === 'en'
          ? "📢 Voice model is updating. Please try again in a moment."
          : "📢 Eddoboozi likyakyusibwamu. Gezaako nate mu kaseera katono.";
      } else if (!navigator.onLine) {
        errorMsg = language === 'en'
          ? "📢 No internet connection for voice features."
          : "📢 Tewali yintaneeti okusobola okuwuliriza eddoboozi.";
      } else {
        errorMsg = language === 'en' 
          ? "📢 Voice service is temporarily unavailable." 
          : "📢 Eddoboozi terisobola kukola kati.";
      }
      
      setVoiceError(errorMsg);
      setTimeout(() => setVoiceError(null), 5000);
      if (onFinished) onFinished();
    } finally {
      setIsAudioLoading(null);
    }
  };

  const playFromBuffer = (buffer: AudioBuffer, messageId: string, onFinished?: () => void) => {
    if (!audioContextRef.current) return;
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsSpeaking(null);
        if (onFinished) onFinished();
      }
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
              setVoiceMessagesRemaining(Math.max(0, 5 - (data.voiceMessagesUsed || 0)));
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
              setVoiceMessagesRemaining(5);
            }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setIsPro(false);
        setFreeQuestionsRemaining(2); // Reset for guests
        setVoiceMessagesRemaining(5); // Guests can use voice
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

  const generateLegalRoadmapTool: FunctionDeclaration = {
    name: "generateLegalRoadmap",
    description: "Generates a visual step-by-step roadmap for a legal process (e.g., land registration, filing a suit).",
    parameters: {
      type: Type.OBJECT,
      description: "The parameters for roadmap generation.",
      properties: {
        title: {
          type: Type.STRING,
          description: "A clear title for the legal process."
        },
        steps: {
          type: Type.ARRAY,
          description: "The steps involved in the process.",
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "Short title of the step." },
              description: { type: Type.STRING, description: "Detailed explanation of what to do." },
              status: { type: Type.STRING, enum: ["completed", "current", "upcoming"], description: "Current status of this step in the context of the user's query." },
              statute: { type: Type.STRING, description: "Optional reference to a specific law or section." }
            },
            required: ["title", "description", "status"]
          }
        }
      },
      required: ["title", "steps"]
    }
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    const currentFiles = [...attachedFiles];
    if (!messageText.trim() && currentFiles.length === 0) return;
    if (isLoading) return;
    
    // Mobile Audio Unlock: Resume context immediately on user click
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();

    const userMessage: Message = { 
      id: generateId(), 
      role: 'user', 
      content: messageText, 
      timestamp: new Date(),
      attachments: currentFiles.length > 0 ? currentFiles : undefined
    };
    const promptMessages = [...messages, userMessage];
    updateSessionMessages(prev => [...prev, userMessage]);
    
    if (!textOverride) {
      setInput('');
    }
    setIsLoading(true);

    const assistantMessageId = generateId();

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY_MISSING");
      }
      const ai = getAI();
      
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: "",
        timestamp: new Date(),
      };

      // ADD MESSAGE TO UI BEFORE STREAMING
      updateSessionMessages(prev => [...prev, assistantMessage]);

      const baseInstruction = language === 'lg' 
        ? LUGANDA_SYSTEM_INSTRUCTION 
        : language === 'nk' 
          ? RUNYANKORE_SYSTEM_INSTRUCTION 
          : SYSTEM_INSTRUCTION;

      const systemPrompt = isDocumentMode 
        ? `${baseInstruction}\n\nSTRICT DOCUMENT MODE: Exclude all conversational text, greetings, and introductions. Start directly with the legal content.` 
        : baseInstruction;

      const modelConfig = { 
        systemInstruction: systemPrompt,
        temperature: 0.2, 
        maxOutputTokens: 8192, 
        tools: [
          ...(isDocumentMode ? [] : [{ googleSearch: {} }]),
          { functionDeclarations: [generateLegalDocumentTool, generateLegalRoadmapTool] }
        ],
        toolConfig: { includeServerSideToolInvocations: true }
      };

      if (!isCallMode) {
        setVerificationSteps([]);
        addVerificationStep(language === 'en' ? "Analyzing statutory intent..." : language === 'lg' ? "Okukebera ekigendererwa..." : "Okushwijuma ekigyendererwa...");
        await new Promise(r => setTimeout(r, 800));
        
        addVerificationStep(language === 'en' ? "Scanning Constitution & Statutory Instruments..." : language === 'lg' ? "Okukebera ensengeka y'eggwanga n'amateeka..." : "Okushwijuma amateeka n'ebihandiiko...");
        await new Promise(r => setTimeout(r, 1000));
        
        addVerificationStep(language === 'en' ? "Cross-referencing ULII Case Law database..." : language === 'lg' ? "Okukakasa ebiwandiiko by'amateeka..." : "Okukakasa ebihandiiko by'amateeka...");
        await new Promise(r => setTimeout(r, 800));

        addVerificationStep(language === 'en' ? "Performing Statutory Compliance Check..." : language === 'lg' ? "Okukakasa obutuufu..." : "Okukakasa obuhame...");
        await new Promise(r => setTimeout(r, 600));
      }

      let retryCount = 0;
      const maxRetries = 4; 
      let success = false;
      let modelToUse = "gemini-3-flash-preview"; // Fast and advanced model (User Primary)

      while (retryCount <= maxRetries && !success) {
        try {
          // FINAL FALLBACK: GROQ (RETRY 4)
          if (retryCount === 4) {
            const groqResponse = await fetch('/api/groq', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: promptMessages,
                systemPrompt: systemPrompt
              })
            });

            if (!groqResponse.ok) {
              const errData = await groqResponse.json();
              throw new Error(errData.error || "Groq backup failed");
            }

            const { text, toolCalls } = await groqResponse.json();
            let finalOutput = text;

            // Handle Groq Tool Calls for documents/roadmaps
            if (toolCalls && toolCalls.length > 0) {
              for (const call of toolCalls) {
                if (call.function?.name === "generateLegalDocument") {
                  const args = JSON.parse(call.function.arguments);
                  const { content, format, title } = args;
                  const url = format === 'pdf' ? await generatePDF(content, title) : await generateDOCX(content, title);
                  const successMsg = language === 'en' 
                    ? `\n\n✅ **Legal Document Generated: ${title}**\n\n[Download ${format.toUpperCase()}](${url})`
                    : `\n\n✅ **Ekiwandiiko kikoleddwa: ${title}**\n\n[Tikula ${format.toUpperCase()}](${url})`;
                  finalOutput += successMsg;
                } else if (call.function?.name === "generateLegalRoadmap") {
                  const args = JSON.parse(call.function.arguments);
                  updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, roadmap: args } : m));
                }
              }
            }

            const groqIndicator = language === 'en' 
              ? "\n\n*(Switched to Backup Engine for better reliability)*" 
              : "\n\n*(Tukyusizza ku 'backup engine' okukuvaako obuzibu)*";
            
            const finalContent = finalOutput + groqIndicator;

            updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: finalContent } : m));
            setStreamingContent(prev => {
              const next = { ...prev };
              delete next[assistantMessageId];
              return next;
            });
            
            if (isCallMode) speakText(finalContent, assistantMessageId);
            success = true;
            break;
          }

          const isFinalRetry = retryCount === maxRetries - 1;
          const currentConfig = isFinalRetry ? {
            systemInstruction: systemPrompt,
            temperature: 0.1,
            maxOutputTokens: 2048,
            tools: [] 
          } : modelConfig;

          const stream = await ai.models.generateContentStream({
            model: modelToUse,
            contents: promptMessages.map(m => {
              const parts: any[] = [];
              if (m.attachments) {
                m.attachments.forEach(a => {
                  parts.push({ inlineData: { data: a.data, mimeType: a.mimeType } });
                });
              }
              parts.push({ text: m.content });
              return {
                role: m.role === 'user' ? 'user' : 'model',
                parts
              };
            }),
            config: currentConfig,
          });

          let fullText = "";

          for await (const chunk of stream) {
            if (chunk.functionCalls && !isFinalRetry) {
              for (const call of chunk.functionCalls) {
                if (call.name === "generateLegalDocument") {
                  const { content, format, title } = call.args as any;
                  const url = format === 'pdf' ? await generatePDF(content, title) : await generateDOCX(content, title);
                  const successMsg = language === 'en' 
                    ? `\n\n✅ **Legal Document Generated: ${title}**\n\n[Download ${format.toUpperCase()}](${url})`
                    : `\n\n✅ **Ekiwandiiko kikoleddwa: ${title}**\n\n[Tikula ${format.toUpperCase()}](${url})`;
                  fullText += successMsg;
                  setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
                } else if (call.name === "generateLegalRoadmap") {
                  const roadmapData = call.args as any;
                  updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, roadmap: roadmapData } : m));
                }
              }
              continue;
            }

            if (chunk.text) {
              fullText += chunk.text;
              setStreamingContent(prev => ({ ...prev, [assistantMessageId]: fullText }));
              
              const container = document.documentElement;
              const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
              if (isNearBottom) {
                scrollToBottom();
              }
            }
          }
          
          updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: fullText } : m));
          setStreamingContent(prev => {
            const next = { ...prev };
            delete next[assistantMessageId];
            return next;
          });
          
          if (isCallMode) {
            speakText(fullText, assistantMessageId);
          }
          success = true;
        } catch (err: any) {
          const errStr = err?.message || String(err);
          console.warn(`Statum Retry [${retryCount+1}/${maxRetries}]:`, errStr);
          if (retryCount < maxRetries) {
            retryCount++;
            
            if (retryCount === 1) {
              // Try the advanced 'Pro' thinking model
              modelToUse = "gemini-3.1-pro-preview"; 
              await new Promise(r => setTimeout(r, 1000));
            } else if (retryCount === 2) {
              // Try the 2.0 version
              modelToUse = "gemini-2.0-flash"; 
              await new Promise(r => setTimeout(r, 1000));
            } else if (retryCount === 3) {
              // Gemini 3 Lite
              modelToUse = "gemini-3.1-flash-lite-preview"; 
            } else if (retryCount === 4) {
              // Final fallback to Groq handled at top of loop
            }

            await new Promise(r => setTimeout(r, 1000 * retryCount));
            continue;
          }
          throw err;
        }
      }

      // Silent Firebase update - never let a counter fail the demo
      if (user && !isPro) {
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then(snap => {
           if (snap.exists()) {
             updateDoc(userRef, { freeQuestionsUsed: (snap.data().freeQuestionsUsed || 0) + 1 }).catch(() => {});
           }
        }).catch(() => {});
      }
    } catch (error: any) {
      console.error(`Oracle Error:`, error);
      const errorStr = error?.message || String(error);
      
      let errorMessage = language === 'en' 
        ? "I'm having trouble replying. Please try again." 
        : language === 'lg' 
          ? "Nfuna obuzibu mu kukuddamu." 
          : "Ninyetegyereza obuzibu omu kukugarukamu.";

      // Check for common cross-device/production errors
      if (errorStr.includes('API_KEY_INVALID') || errorStr.includes('API key not valid')) {
        errorMessage = language === 'en'
          ? "Configuration Error: The Gemini API Key is invalid or missing. Please check your AI Studio Secrets."
          : "Obuzibu mu nteekateeka: API Key ya Gemini tennaba kuteekebwamu bulungi.";
      } else if (errorStr.includes('permission-denied') || errorStr.includes('insufficient permissions')) {
        errorMessage = language === 'en'
          ? "Security Error: Permission denied. If using a shared link, please ensure this domain is added to 'Authorized Domains' in your Firebase Console."
          : "Obuzibu mu bukuumi: Olukusa lugaaniddwa. Kakasa nti domain eno eri mu 'Authorized Domains' mu Firebase.";
      } else if (errorStr.includes('quota') || errorStr.includes('429') || errorStr.includes('overloaded')) {
        errorMessage = language === 'en'
          ? "System Busy: All AI priority lanes are full. Please wait 15 seconds and try again."
          : "Sisitimu ekoye: Lindako katono oddemu ogezeeko.";
      } else {
        // Simple technical tag for better debugging - extracting the core message
        let detail = errorStr;
        try {
          const parsed = JSON.parse(errorStr);
          if (parsed.error?.message) detail = parsed.error.message;
        } catch(e) {}
        errorMessage += `\n\n[Details: ${detail.substring(0, 80)}...]`;
      }

      // UPDATE EXISTING MESSAGE WITH ERROR
      updateSessionMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: errorMessage } : m));
    }
    setIsLoading(false);
  };

  const quickQuestions = [
    { 
      en: "What are the fundamental rights in the Constitution?", 
      lg: "Biki eby'obuntu ebiri mu nsonga z'eggwanga?"
    },
    { 
      en: "Explain the process of filing a civil suit in Uganda", 
      lg: "Nnyonnyola enkola y'okuwaaba omusango mu Uganda"
    },
    { 
      en: "What are the requirements for a valid contract?", 
      lg: "Biki ebyetaagisa endagaano okuba entuufu?"
    },
    { 
      en: "Draft a formal demand letter for breach of contract", 
      lg: "Kola ebbaluwa ey'okusaba obusasuzi olw'okumenya endagaano"
    },
  ];

  return (
    <div className="flex h-[100dvh] bg-[#F8FAFC] overflow-hidden font-sans selection:bg-[#C5A059]/20">
      <React.Suspense fallback={null}>
        {showLegalNotice && (
          <LegalNoticeModal isOpen={showLegalNotice} onAccept={handleAcceptLegalNotice} />
        )}
      </React.Suspense>
      
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
        "bg-[#0B0F1A] text-slate-300 w-72 sm:w-80 flex-shrink-0 flex flex-col transition-all duration-300 border-r border-white/5 z-50 fixed inset-y-0 lg:relative shadow-2xl safe-left",
        !isSidebarOpen && "-translate-x-full lg:-ml-80"
      )}>
        <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C5A059] rounded-xl flex items-center justify-center text-[#0B0F1A] shadow-lg shadow-[#C5A059]/10">
              <Scale size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-bold text-white text-lg leading-tight tracking-tight">Statum AI</h1>
                <div className="px-1.5 py-0.5 bg-[#C5A059] text-[#0B0F1A] text-[8px] font-black rounded uppercase tracking-tighter">Pro</div>
              </div>
              <p className="text-[10px] text-[#C5A059] font-bold uppercase tracking-[0.2em]">Legal Information System</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)} 
            className="lg:hidden p-2 hover:bg-white/5 rounded-lg transition-colors"
            aria-label={language === 'en' ? "Close Sidebar" : language === 'lg' ? "Ggalawo Olubiri" : "Yingira omu mulyango"}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          <button 
            onClick={() => {
              const newSession: ChatSession = {
                id: generateId(),
                title: language === 'en' ? 'New Legal Inquiry' : language === 'lg' ? 'Okubuuza Okupya' : 'Okushaba Okusya',
                messages: [],
                lastUpdated: new Date(),
                category: 'General'
              };
              setSessions(prev => [newSession, ...prev]);
              setCurrentSessionId(newSession.id);
            }}
            className="w-full py-4 px-4 bg-[#C5A059] hover:bg-[#B38F48] text-[#0B0F1A] rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#C5A059]/10 transition-all active:scale-[0.98] border border-[#C5A059]/20"
          >
            <MessageSquare size={18} />
            {language === 'en' ? 'New Legal Inquiry' : language === 'lg' ? 'Okubuuza Okupya' : 'Okushaba Okusya'}
          </button>

          <div className="space-y-1 mb-6">
            <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Legal Intelligence</p>
            <div className="px-4 space-y-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statutory Coverage</span>
                  <span className="text-[10px] font-bold text-[#C5A059]">98.4%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-[#C5A059] w-[98.4%]" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <p className="text-[11px] text-white font-medium">ULII Integration</p>
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Active Connection</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Recent Case Files</p>
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => setCurrentSessionId(session.id)}
                className={cn(
                  "group p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 mx-2",
                  currentSessionId === session.id ? "bg-white/10 text-white shadow-inner border border-white/5" : "hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={14} className={cn(currentSessionId === session.id ? "text-[#C5A059]" : "text-slate-600")} />
                  <p className="text-sm font-medium truncate">{session.title}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(language === 'en' ? 'Delete this conversation?' : language === 'lg' ? 'Ggyamu mboozi eno?' : 'Omuzeho okushaba oku?')) {
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

        <div className="p-4 border-t border-white/5 bg-black/20 shrink-0 space-y-4">
          {!isPro && (
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
                <span className="text-slate-500">{language === 'en' ? 'Voice Messages' : language === 'lg' ? 'Obubaka bw\'eddoboozi' : 'Obubaka bw\'eddoboozi'}</span>
                <span className={cn(voiceMessagesRemaining <= 1 ? "text-red-400" : "text-[#C5A059]")}>
                  {voiceMessagesRemaining} {language === 'en' ? 'Left' : language === 'lg' ? 'Ebisigadde' : 'Ebisigadde'}
                </span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(voiceMessagesRemaining / 5) * 100}%` }}
                  className="h-full bg-[#C5A059]"
                />
              </div>
            </div>
          )}
          {user ? (
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#C5A059] flex items-center justify-center text-[#0B0F1A] font-bold shrink-0 overflow-hidden">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={user.displayName || user.email || "User Profile"} 
                      referrerPolicy="no-referrer"
                    />
                  ) : user.displayName?.[0] || user.email?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user.displayName || user.email.split('@')[0]}</p>
                  <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={() => logout()} 
                className="p-2 hover:text-red-400 transition-colors"
                aria-label={language === 'en' ? "Logout" : language === 'lg' ? "Ffuluma" : "Ffuluma"}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuthModal(true)}
              className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-white/5 transition-all"
            >
              <User size={18} />
              {language === 'en' ? 'Sign In for Pro' : language === 'lg' ? 'Yingira' : 'Yingira'}
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
                {language === 'en' ? 'Legal Inquiry' : language === 'lg' ? 'Okubuuza' : 'Okushaba'}
              </button>
              <button 
                onClick={() => setActiveTab('lawyers')}
                className={cn(
                  "px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-sm font-bold transition-all whitespace-nowrap",
                  activeTab === 'lawyers' ? "bg-[#C5A059]/10 text-[#8B6E37]" : "text-slate-500 hover:bg-slate-50"
                )}
              >
                {language === 'en' ? 'Find Advocate' : language === 'lg' ? 'Noonya Puliida' : 'Sherura Puliida'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <button 
              onClick={async () => {
                // Initialize AudioContext on user gesture
                if (!audioContextRef.current) {
                  audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                }
                if (audioContextRef.current.state === 'suspended') {
                  await audioContextRef.current.resume();
                }
                
                setIsCallMode(!isCallMode);
                if (!isCallMode) {
                  // Start recording automatically when entering call mode
                  setTimeout(() => toggleRecording(), 500);
                } else {
                  stopSpeaking();
                  if (isRecording) stopRecording();
                }
              }}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg transition-all",
                isCallMode ? "text-[#C5A059] bg-[#C5A059]/5" : "text-slate-500 hover:bg-slate-50"
              )}
              aria-label={language === 'en' ? (isCallMode ? "End Call" : "Call Oracle") : (isCallMode ? "Ggyako Eddoboozi" : "Koleeza Eddoboozi")}
              title={language === 'en' ? (isCallMode ? "End Call" : "Call Oracle") : (isCallMode ? "Ggyako Eddoboozi" : "Koleeza Eddoboozi")}
            >
              <Smartphone size={18} className="sm:w-5 sm:h-5" />
            </button>
            <button 
              onClick={() => setLanguage(l => l === 'en' ? 'lg' : l === 'lg' ? 'nk' : 'en')}
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-[9px] sm:text-[10px] font-bold text-slate-600 transition-all uppercase tracking-[0.1em] border border-slate-200"
              aria-label={
                language === 'en' ? "Switch to Luganda" : 
                language === 'lg' ? "Switch to Runyankore" : 
                "Switch to English"
              }
              title={
                language === 'en' ? "Switch to Luganda" : 
                language === 'lg' ? "Switch to Runyankore" : 
                "Switch to English"
              }
            >
              {language === 'en' ? 'EN' : language === 'lg' ? 'LG' : 'NK'}
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
                        {language === 'en' ? 'Statum AI' : 'Statum AI'}
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
                          <div className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl text-slate-500 group-hover:bg-[#0B0F1A] group-hover:text-[#C5A059] transition-all shrink-0 shadow-sm">
                            {i === 0 && <FileSearch size={20} className="sm:w-6 sm:h-6" />}
                            {i === 1 && <ShieldCheck size={20} className="sm:w-6 sm:h-6" />}
                            {i === 2 && <Gavel size={20} className="sm:w-6 sm:h-6" />}
                            {i === 3 && <FileText size={20} className="sm:w-6 sm:h-6" />}
                          </div>
                          <div>
                            <p className="font-display font-bold text-base sm:text-lg text-[#0B0F1A] leading-snug group-hover:text-[#8B6E37] transition-colors mb-1 sm:mb-2">
                              {language === 'en' ? q.en : q.lg}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                              {language === 'en' ? 'Start inquiry' : language === 'lg' ? 'Tandika okubuuza' : 'Tandika okushaba'} <ArrowRight size={10} className="group-hover:translate-x-1 transition-transform" />
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
                          {m.role === 'assistant' && <LegalIntelligenceBadge />}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {m.attachments.map((file, idx) => (
                                <div key={idx} className={cn(
                                  "flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold border",
                                  m.role === 'user' ? "bg-white/10 border-white/20 text-white" : "bg-slate-50 border-slate-100 text-slate-600"
                                )}>
                                  {file.mimeType.startsWith('image/') ? <ImageIcon size={14} /> : <FileIcon size={14} />}
                                  <span className="truncate max-w-[120px]">{file.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={cn(
                            "markdown-body prose prose-slate prose-sm max-w-none text-sm sm:text-base",
                            m.role === 'assistant' && "font-serif"
                          )}>
                            <React.Suspense fallback={<div className="animate-pulse h-20 bg-slate-100 rounded-lg" />}>
                              <MarkdownRenderer content={streamingContent[m.id] || m.content} />
                            </React.Suspense>
                          </div>
                          {m.roadmap && <RoadmapComponent roadmap={m.roadmap} language={language as 'en' | 'lg'} />}
                          <div className="flex items-center justify-between mt-4 sm:mt-6">
                            <div className={cn(
                              "text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-30"
                            )}>
                              {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={async () => {
                                  const text = streamingContent[m.id] || m.content;
                                  try {
                                    await navigator.clipboard.writeText(text);
                                    setCopiedId(m.id);
                                    setTimeout(() => setCopiedId(null), 2000);
                                  } catch (err) {
                                    console.error('Failed to copy text: ', err);
                                  }
                                }}
                                className={cn(
                                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all",
                                  copiedId === m.id 
                                    ? "bg-green-500/10 text-green-600" 
                                    : m.role === 'user' ? "bg-white/10 text-white/60 hover:bg-white/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                )}
                              >
                                {copiedId === m.id ? <CheckCircle size={12} /> : <Copy size={12} />}
                                {copiedId === m.id 
                                  ? (language === 'en' ? 'Copied' : 'Koppiddwa')
                                  : (language === 'en' ? 'Copy' : 'Koppya')}
                              </button>
                              <button 
                                onClick={() => {
                                  const text = streamingContent[m.id] || m.content;
                                  const url = `https://wa.me/?text=${encodeURIComponent(`⚖️ *Statum AI Summary*\n\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}\n\n_Get professional legal guidance at: ${window.location.href}_`)}`;
                                  window.open(url, '_blank');
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-600 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-green-500/20 transition-all"
                              >
                                <Share2 size={12} />
                                {language === 'en' ? 'Share to WhatsApp' : 'Gaba ku WhatsApp'}
                              </button>
                            </div>
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
                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-500 group-hover:bg-[#0B0F1A] group-hover:text-[#C5A059] transition-all">
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
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-widest">
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

        </div>

      {/* Input Area */}
      {activeTab === 'chat' && (
        <footer className="p-3 sm:p-8 bg-white border-t border-slate-100 shrink-0 z-30 safe-bottom">
          <div className="max-w-4xl mx-auto">
            {recordingError && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-3 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs flex items-center gap-2 shadow-sm"
              >
                <ShieldAlert size={16} className="shrink-0" />
                <span className="flex-1">{recordingError}</span>
                <button onClick={() => setRecordingError(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </motion.div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative flex items-end gap-2 sm:gap-6">
              <div className="flex-1 relative bg-slate-50 rounded-2xl sm:rounded-[2rem] border border-slate-200 focus-within:border-[#C5A059] focus-within:ring-4 sm:focus-within:ring-8 focus-within:ring-[#C5A059]/5 transition-all">
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-slate-100">
                    {attachedFiles.map((file, i) => (
                      <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-2 pr-1 shadow-sm group">
                        {file.mimeType.startsWith('image/') ? (
                          <ImageIcon size={16} className="text-[#C5A059]" />
                        ) : (
                          <FileIcon size={16} className="text-blue-500" />
                        )}
                        <span className="text-[10px] font-medium text-slate-600 truncate max-w-[100px]">{file.name}</span>
                        <button 
                          type="button"
                          onClick={() => removeFile(i)}
                          className="p-2 text-slate-500 hover:text-red-500 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                    </button>
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl text-slate-500 hover:bg-slate-200 transition-all"
                    >
                      <Paperclip size={16} className="sm:w-5 sm:h-5" />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      className="hidden" 
                      multiple 
                      accept="image/*,.pdf,.doc,.docx,.txt"
                    />
                    <button 
                      type="button"
                      onClick={() => handleQuickQuestion(language === 'en' ? "What are the common land disputes in Uganda?" : "Biki ebitalo by'ettaka ebiri mu Uganda?")}
                      className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl text-slate-500 hover:bg-slate-200 transition-all font-bold text-[10px]"
                    >
                      {language === 'en' ? 'Common Disputes' : 'Okukaayana'}
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
            <p className="text-[8px] sm:text-[10px] text-center text-slate-500 mt-3 sm:mt-6 font-bold uppercase tracking-[0.1em] px-4">
              {language === 'en' 
                ? 'Statutory accuracy is verified against the Constitution and Laws of Uganda.' 
                : language === 'lg'
                  ? 'Obutuufu bw\'amateeka bukakasibwa okusinziira ku nsonga z\'eggwanga n\'amateeka.'
                  : 'Obuhame bw\'amateeka nibushwijumwa okurugiirira aha nshonga z\'eihanga n\'amateeka ga Uganda.'}
            </p>
          </div>
        </footer>
      )}
    </main>

      <AnimatePresence>
        {isCallMode && (
          <CallOverlay 
            onClose={() => {
              setIsCallMode(false);
              if (isRecording) stopRecording();
            }}
            isRecording={isRecording}
            isSpeaking={!!isSpeaking}
            language={language}
            currentVolume={currentVolume}
            transcription={input || ""}
            assistantResponse={""}
            isThinking={isLoading}
            isTranscribing={isTranscribing}
            error={voiceError}
          />
        )}
      </AnimatePresence>

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
                  <button onClick={() => setShowAuthModal(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-500 transition-colors"><X size={20} className="sm:w-6 sm:h-6" /></button>
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
                    <div className="relative flex justify-center text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] bg-white px-4">Or use email</div>
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
