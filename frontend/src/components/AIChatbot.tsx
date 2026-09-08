import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot } from 'lucide-react';
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
          const latestSession = res.data.results[0];
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
    <div className="clay-card-lg bg-white overflow-hidden flex flex-col h-[520px]">
      
      {/* Header */}
      <div className="bg-lilac text-[#121316] p-4 font-bold flex items-center justify-between border-b-[3px] border-[#121316]">
        <div className="flex items-center gap-2">
          <div className="clay-circle bg-white text-[#121316] p-1.5 shadow-sm">
            <Bot size={20} />
          </div>
          <span className="font-syne font-extrabold text-lg">Orbee</span>
          {isKannada && (
            <span className="clay-chip bg-white text-[#121316] px-2.5 py-0.5 text-[10px]">ಕನ್ನಡ AI</span>
          )}
          {isHindi && (
            <span className="clay-chip bg-white text-[#121316] px-2.5 py-0.5 text-[10px]">हिन्दी AI</span>
          )}
        </div>
        
        {sessionId && (
          <span className="clay-chip bg-gold text-[#121316] px-2 py-0.5 text-[10px]">HISTORY SYNCED</span>
        )}
      </div>
      
      {/* Messages area */}
      <div className="flex-1 p-4 overflow-y-auto bg-canvas space-y-4 font-jakarta">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] gap-2.5 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              
              <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 border-[#121316] flex items-center justify-center ${
                msg.sender === 'user' ? 'bg-cobalt text-white' : 'bg-lilac text-[#121316]'
              }`}>
                {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className={`p-3.5 rounded-2xl border-2 border-[#121316] text-sm leading-relaxed ${
                msg.sender === 'user' 
                  ? 'bg-cobalt text-white font-medium rounded-tr-none shadow-sm' 
                  : 'bg-white text-[#121316] rounded-tl-none shadow-sm'
              }`}>
                {msg.sender === 'user' ? (
                  <div>
                    <div>{msg.text}</div>
                    {msg.translatedText && (
                      <div className="mt-2 pt-1.5 border-t border-white/30 text-xs text-white/90 flex items-start gap-1 font-normal">
                        <span className="opacity-90 whitespace-nowrap font-bold">
                          🔄 {isKannada ? 'ಕನ್ನಡಕ್ಕೆ ಅನುವಾದ:' : isHindi ? 'हिन्दी में अनुवाद:' : 'Translated:'}
                        </span>
                        <span>{msg.translatedText}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="prose prose-sm prose-slate max-w-none text-[#121316]">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                      {formatMath(msg.text)}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex flex-row items-center gap-2.5 max-w-[80%]">
              <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 border-[#121316] bg-lilac text-[#121316] flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div className="p-3 rounded-2xl rounded-tl-none bg-white border-2 border-[#121316] text-[#121316] flex items-center gap-2 shadow-sm">
                <div className="clay-spinner w-4 h-4 border-2 border-[#121316] border-t-lilac"></div> 
                <span className="font-grotesk text-xs uppercase font-bold tracking-wider">
                  {isKannada ? 'ಯೋಚಿಸುತ್ತಿದೆ...' : isHindi ? 'सोच रहा हूँ...' : 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="p-3 bg-white border-t-[3px] border-[#121316] flex items-center gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isKannada 
              ? "ಪ್ರಶ್ನೆ ಕೇಳಿ... (ಕನ್ನಡ ಅಥವಾ English)" 
              : isHindi 
              ? "प्रश्न पूछें... (हिन्दी या English)" 
              : "Ask Orbee a question..."
          }
          className="clay-input flex-1 py-2.5 px-4 text-sm font-jakarta text-[#121316]"
        />
        <button 
          type="submit" 
          disabled={loading || !input.trim()}
          className="clay-btn bg-lilac hover:bg-purple-300 text-[#121316] p-2.5 flex items-center justify-center disabled:opacity-40"
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default AIChatbot;
