export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioBuffer?: AudioBuffer;
  attachments?: Attachment[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastUpdated: Date;
  category?: 'General' | 'Dispute' | 'Title' | 'Lease' | 'Succession';
}

export interface Lawyer {
  id: string;
  name: string;
  firm: string;
  specialty: string;
  location: string;
  rating: number;
  verified: boolean;
}
