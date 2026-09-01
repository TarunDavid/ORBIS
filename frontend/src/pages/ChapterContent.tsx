import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Sparkles, MessageCircle, Mic, FileText, Book } from 'lucide-react';
import AIChatbot from '../components/AIChatbot';

interface Resource {
  id: number;
  resource_type: string;
  file_path: string;
}

interface Chapter {
  id: number;
  title: string;
  order: number;
  resources: Resource[];
}

const ChapterContent = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showChatbot, setShowChatbot] = useState(false);

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await api.get(`chapters/${chapterId}/`);
        setChapter(res.data);
      } catch (error) {
        console.error('Error fetching chapter', error);
      } finally {
        setLoading(false);
      }
    };
    fetchChapter();
  }, [chapterId]);

  const handleSummarize = async () => {
    setIsSummarizing(true);
    try {
      const res = await api.post('ai/summarize/', { chapter_id: chapterId });
      setSummary(res.data.summary);
    } catch (error) {
      console.error('Summarize error', error);
      setSummary('Failed to summarize. Check AI backend.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const [isRecording, setIsRecording] = useState(false);
  const [voiceAudio, setVoiceAudio] = useState<string | null>(null);
  const [voiceTranscribed, setVoiceTranscribed] = useState('');
  const [voiceTextResponse, setVoiceTextResponse] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToBackend(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone error', error);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleVoiceAssistantToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const sendAudioToBackend = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'doubt.webm');
    formData.append('chapter_id', chapterId || '');

    setSummary('Processing voice doubt...');
    
    try {
      const res = await api.post('ai/voice/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVoiceTranscribed(res.data.transcribed_text);
      setVoiceTextResponse(res.data.text_response);
      setVoiceAudio(`http://localhost:8080${res.data.audio_url}`);
      setSummary(''); // Clear processing msg
      
      // Auto play audio
      const audio = new Audio(`http://localhost:8080${res.data.audio_url}`);
      audio.play();
    } catch (error) {
      console.error('Voice Assistant Error', error);
      setSummary('Failed to process voice.');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex justify-center items-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  );

  if (!chapter) return <div className="p-10 text-center">Chapter not found.</div>;

  const videoResource = chapter.resources.find(r => r.resource_type === 'video');
  const notesResource = chapter.resources.find(r => r.resource_type === 'notes');
  const textbookResource = chapter.resources.find(r => r.resource_type === 'textbook');

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-slate-500 hover:text-slate-800 transition mb-6 font-medium"
        >
          <ArrowLeft className="mr-2" size={20} /> Back
        </button>

        <h1 className="text-3xl font-extrabold text-slate-800 mb-6">{chapter.title}</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Video Player Placeholder */}
            <div className="bg-black aspect-video rounded-2xl flex items-center justify-center relative overflow-hidden shadow-xl">
              {videoResource ? (
                <video src={videoResource.file_path} controls className="w-full h-full object-cover" />
              ) : (
                <div className="text-white text-center">
                  <PlayCircle size={64} className="mx-auto mb-4 opacity-50" />
                  <p>Mock Video Player Offline</p>
                </div>
              )}
            </div>

            {/* AI Action Row */}
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={handleSummarize}
                disabled={isSummarizing}
                className="flex-1 flex items-center justify-center py-3 px-4 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-semibold rounded-xl transition disabled:opacity-50"
              >
                <Sparkles size={20} className="mr-2" />
                {isSummarizing ? 'Summarizing...' : 'Summarize Video'}
              </button>
              
              <button 
                onClick={() => setShowChatbot(!showChatbot)}
                className="flex-1 flex items-center justify-center py-3 px-4 bg-purple-100 hover:bg-purple-200 text-purple-700 font-semibold rounded-xl transition"
              >
                <MessageCircle size={20} className="mr-2" />
                AI Chatbot
              </button>
              
              <button 
                onClick={handleVoiceAssistantToggle}
                className={`flex-1 flex items-center justify-center py-3 px-4 ${isRecording ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-pink-100 hover:bg-pink-200 text-pink-700'} font-semibold rounded-xl transition`}
              >
                <Mic size={20} className="mr-2" />
                {isRecording ? 'Stop Recording' : 'Voice Assistant'}
              </button>
            </div>

            {/* AI Summary Output */}
            {summary && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100 animate-fade-in-up">
                <div className="flex items-center text-indigo-600 mb-3 font-bold">
                  <Sparkles size={20} className="mr-2" /> AI Summary
                </div>
                <p className="text-slate-700 leading-relaxed">{summary}</p>
              </div>
            )}

            {/* Chatbot UI */}
            {showChatbot && (
               <AIChatbot chapterId={chapterId!} />
            )}

          </div>

          {/* Sidebar / Resources */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-xl font-bold text-slate-800 mb-4">Chapter Resources</h3>
              
              <div className="space-y-4">
                {notesResource ? (
                  <a href={notesResource.file_path} target="_blank" rel="noreferrer" className="flex items-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition group">
                    <div className="bg-blue-100 text-blue-600 p-2 rounded-lg mr-4 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                      <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Chapter Notes</h4>
                      <p className="text-sm text-slate-500">PDF Document</p>
                    </div>
                  </a>
                ) : (
                   <div className="flex items-center p-4 bg-slate-50 rounded-xl opacity-50">
                    <FileText size={24} className="mr-4 text-slate-400" />
                    <span className="text-slate-500 font-medium">No Notes Available</span>
                  </div>
                )}

                {textbookResource ? (
                  <a href={textbookResource.file_path} target="_blank" rel="noreferrer" className="flex items-center p-4 bg-slate-50 hover:bg-slate-100 rounded-xl transition group">
                    <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg mr-4 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                      <Book size={24} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-800">Textbook Excerpt</h4>
                      <p className="text-sm text-slate-500">PDF Document</p>
                    </div>
                  </a>
                ) : (
                  <div className="flex items-center p-4 bg-slate-50 rounded-xl opacity-50">
                    <Book size={24} className="mr-4 text-slate-400" />
                    <span className="text-slate-500 font-medium">No Textbook Available</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-2xl shadow-md text-white">
              <h3 className="font-bold text-lg mb-2">Practice Time!</h3>
              <p className="text-indigo-100 text-sm mb-4">Generate flashcards or a quick quiz based on this chapter.</p>
              <button className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2 rounded-lg font-semibold transition">
                Start Quiz (Mock)
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

// Mock PlayCircle icon if not imported at top
const PlayCircle = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
);

export default ChapterContent;
