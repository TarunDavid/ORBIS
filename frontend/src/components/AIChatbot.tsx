import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Loader2 } from 'lucide-react';
import api from '../api';

interface Message {
  sender: 'user' | 'bot';
  text: string;
}

const AIChatbot = ({ chapterId }: { chapterId: string }) => {
  const [messages, setMessages] = useState<Message[]>([
    { sender: 'bot', text: 'Hi! I am your AI tutor. What doubt do you have about this chapter?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const res = await api.post('ai/chat/', { chapter_id: chapterId, message: userMessage });
      setMessages(prev => [...prev, { sender: 'bot', text: res.data.response }]);
    } catch (error) {
      console.error('Chat error', error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Sorry, I am offline or an error occurred.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
      <div className="bg-purple-600 text-white p-4 font-bold flex items-center">
        <Bot className="mr-2" size={24} /> Chapter AI Tutor
      </div>
      
      <div className="flex-1 p-4 overflow-y-auto bg-slate-50 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[80%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.sender === 'user' ? 'bg-indigo-100 text-indigo-600 ml-3' : 'bg-purple-100 text-purple-600 mr-3'}`}>
                {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                {msg.text}
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
                <Loader2 size={16} className="animate-spin text-purple-600 mr-2" /> Thinking...
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
          placeholder="Ask a question..."
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
