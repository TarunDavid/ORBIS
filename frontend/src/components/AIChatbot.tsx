import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import api from '../api';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  translatedText?: string;
}

const formatMath = (text: string) => {
  if (!text) return '';
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, '$$$$$1$$$$')
    .replace(/\\\(([\s\S]*?)\\\)/g, '$$$1$$');
};

interface AIChatbotProps {
  chapterId: string;
  chapterTitle?: string;
  subjectIdentifier?: string;
  subjectName?: string;
}

const AIChatbot = ({ chapterId, chapterTitle, subjectIdentifier, subjectName }: AIChatbotProps) => {
  // Get student from localStorage
  const currentStudentStr = localStorage.getItem('currentStudent');
  const student = currentStudentStr ? JSON.parse(currentStudentStr) : null;
  const studentId = student?.id;
  const studentName = student?.name || student?.first_name || 'there';

  const isKannada = 
    subjectIdentifier === 'kannada' || 
    subjectName?.includes('ಕನ್ನಡ') || 
    /[\u0C80-\u0CFF]/.test(chapterTitle || '');
    
  const isHindi = 
    subjectIdentifier === 'hindi' || 
    subjectName?.includes('हिन्दी') || 
    subjectName?.includes('हिंदी') || 
    /[\u0900-\u097F]/.test(chapterTitle || '');

  const getGreeting = () => {
    if (isKannada) {
      return `ನಮಸ್ಕಾರ, ${studentName}! ನಾನು Orbee, ನಿಮ್ಮ AI ಕನ್ನಡ ಶಿಕ್ಷಕ. ಈ ಅಧ್ಯಾಯದ ಬಗ್ಗೆ ನಿಮಗೆ ಏನಾದರೂ ಸಂದೇಹವಿದೆಯೇ?`;
    }
    if (isHindi) {
      return `नमस्ते, ${studentName}! मैं Orbee हूँ, आपका AI हिन्दी ट्यूटर। क्या आप इस पाठ के बारे में कुछ पूछना चाहते हैं?`;
    }
    return `Hi, ${studentName}! I’m Orbee, your AI tutor. Would you like some help with this chapter?`;
  };

  const [messages, setMessages] = useState<Message[]>([
    { sender: 'bot', text: getGreeting() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      if (!studentId || !chapterId) return;
      try {
        const res = await api.get(`chat-sessions/?student_id=${studentId}&chapter_id=${chapterId}`);
        if (res.data.results && res.data.results.length > 0) {
          const latestSession = res.data.results[0]; // Assuming ordered by -created_at
          setSessionId(latestSession.id);
          if (latestSession.messages && latestSession.messages.length > 0) {
            const history = latestSession.messages.map((m: any) => ({
              sender: m.role === 'user' ? 'user' : 'bot',
              text: m.content
            }));
            setMessages([
              { 
                sender: 'bot', 
                text: isKannada 
                  ? 'ಸ್ವಾಗತ! ನಮ್ಮ ಹಿಂದಿನ ಸಂಭಾಷಣೆ ಇಲ್ಲಿದೆ.' 
                  : isHindi 
                  ? 'पुनः स्वागत है! यह रही हमारी पिछली बातचीत।' 
                  : 'Welcome back! Here is our previous chat.' 
              },
              ...history
            ]);
          }
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };
    loadHistory();
  }, [chapterId, studentId, isKannada, isHindi]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input;
    setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('ai/chat/', { 
        chapter_id: chapterId, 
        message: userMessage,
        student_id: studentId,
        session_id: sessionId
      });
      
      const translatedMsg = res.data.translated_message;
      if (translatedMsg) {
        setMessages(prev => {
          const updated = [...prev];
          for (let idx = updated.length - 1; idx >= 0; idx--) {
            if (updated[idx].sender === 'user' && updated[idx].text === userMessage && !updated[idx].translatedText) {
              updated[idx] = { ...updated[idx], translatedText: translatedMsg };
              break;
            }
          }
          return [...updated, { sender: 'bot', text: res.data.response }];
        });
      } else {
        setMessages(prev => [...prev, { sender: 'bot', text: res.data.response }]);
      }

      if (res.data.session_id && !sessionId) {
        setSessionId(res.data.session_id);
      }
    } catch (error) {
      console.error('Chat error', error);
      setMessages(prev => [...prev, { 
        sender: 'bot', 
        text: isKannada 
          ? 'ಕ್ಷಮಿಸಿ, ಸಂಪರ್ಕ ಸಾಧಿಸಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ ಅಥವಾ ದೋಷ ಸಂಭವಿಸಿದೆ.' 
          : isHindi 
          ? 'क्षमा करें, कनेक्शन में समस्या है या कोई त्रुटि हुई।' 
          : 'Sorry, I am offline or an error occurred.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
      <div className="bg-purple-600 text-white p-4 font-bold flex items-center justify-between">
        <div className="flex items-center">
          <Bot className="mr-2" size={24} />
          <span>Orbee</span>
          {isKannada && <span className="ml-2 text-xs bg-purple-700/80 text-purple-100 px-2 py-0.5 rounded-full font-medium">ಕನ್ನಡ AI</span>}
          {isHindi && <span className="ml-2 text-xs bg-purple-700/80 text-purple-100 px-2 py-0.5 rounded-full font-medium">हिन्दी AI</span>}
        </div>
        {sessionId && <span className="text-xs bg-purple-500 px-2 py-1 rounded">History Synced</span>}
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.sender === 'user' ? 'bg-indigo-100 text-indigo-600 ml-3' : 'bg-purple-100 text-purple-600 mr-3'}`}>
                {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none prose prose-sm prose-purple max-w-none'}`}>
                {msg.sender === 'user' ? (
                  <div>
                    <div>{msg.text}</div>
                    {msg.translatedText && (
                      <div className="mt-2 pt-1.5 border-t border-indigo-400/40 text-xs text-indigo-100 flex items-start gap-1">
                        <span className="opacity-80 whitespace-nowrap">
                          🔄 {isKannada ? 'ಕನ್ನಡಕ್ಕೆ ಅನುವಾದ:' : isHindi ? 'हिन्दी में अनुवाद:' : 'Translated:'}
                        </span>
                        <span className="font-medium text-white">{msg.translatedText}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {formatMath(msg.text)}
                  </ReactMarkdown>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex flex-row max-w-[80%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-600 mr-3 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="p-3 rounded-2xl bg-white border border-slate-200 text-slate-700 rounded-tl-none flex items-center">
                <Loader2 size={16} className="animate-spin text-purple-600 mr-2" /> 
                <span className="text-sm font-medium">
                  {isKannada ? 'ಯೋಚಿಸುತ್ತಿದೆ...' : isHindi ? 'सोच रहा हूँ...' : 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex items-center">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isKannada 
              ? "ಪ್ರಶ್ನೆ ಕೇಳಿ... (ಕನ್ನಡ ಅಥವಾ English)" 
              : isHindi 
              ? "प्रश्न पूछें... (हिन्दी या English)" 
              : "Ask a question..."
          }
          className="flex-1 bg-slate-100 border-none rounded-l-xl py-3 px-4 focus:ring-2 focus:ring-purple-500 outline-none"
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim()}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white p-3 rounded-r-xl transition flex items-center justify-center"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default AIChatbot;
