import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Sparkles, MessageCircle, Mic, FileText, Book, PlayCircle, Layers, Brain, Eye } from 'lucide-react';
import AIChatbot from '../components/AIChatbot';
import AttentionTracker from '../components/AttentionTracker';

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
  const [focusModeActive, setFocusModeActive] = useState(false);
  const [isDistracted, setIsDistracted] = useState(false);
  const mainVideoRef = useRef<HTMLVideoElement>(null);

  const updateProgress = async (fields: { video_watched?: boolean, notes_viewed?: boolean, summary_generated?: boolean }) => {
    const studentStr = localStorage.getItem('currentStudent');
    if (!studentStr) return;
    const studentId = JSON.parse(studentStr).id;
    try {
      await api.post('progress/update_progress/', {
        student_id: studentId,
        chapter_id: chapterId,
        ...fields
      });
    } catch (e) {
      console.error('Failed to update progress', e);
    }
  };

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await api.get(`chapters/${chapterId}/`);
        setChapter(res.data);
        updateProgress({ video_watched: true, notes_viewed: true });
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
      const studentStr = localStorage.getItem('currentStudent');
      const studentId = studentStr ? JSON.parse(studentStr).id : null;
      const res = await api.post('ai/summarize/', {
        chapter_id: chapterId,
        student_id: studentId,
      });
      setSummary(res.data.summary);
      updateProgress({ summary_generated: true });
    } catch (error) {
      console.error('Summarize error', error);
      setSummary('Failed to summarize. Check AI backend.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // Voice Assistant State
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscribed, setVoiceTranscribed] = useState('');
  const [voiceTextResponse, setVoiceTextResponse] = useState('');
  const [voiceProcessing, setVoiceProcessing] = useState(false);
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

    setVoiceProcessing(true);
    setVoiceTranscribed('');
    setVoiceTextResponse('');

    try {
      const res = await api.post('ai/voice/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVoiceTranscribed(res.data.transcribed_text);
      setVoiceTextResponse(res.data.text_response);

      // Auto play audio
      const audio = new Audio(`http://localhost:8080${res.data.audio_url}`);
      audio.play();
    } catch (error) {
      console.error('Voice Assistant Error', error);
      setVoiceTextResponse('Failed to process voice. Please try again.');
    } finally {
      setVoiceProcessing(false);
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
          <div className="max-w-7xl mx-auto space-y-8 lg:col-span-2">
        
        {/* Video Player Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
          
          {focusModeActive && (
            <AttentionTracker 
              isActive={focusModeActive}
              onDistracted={() => {
                if (!isDistracted) {
                  setIsDistracted(true);
                  if (mainVideoRef.current) {
                    mainVideoRef.current.pause();
                  }
                }
              }}
              onFocused={() => {
                // If they were distracted, they must manually click 'Resume' 
                // so we don't automatically un-pause the video here, 
                // but we could clear the distracted state if we wanted.
              }}
            />
          )}

          {isDistracted && (
            <div className="absolute inset-0 bg-black bg-opacity-80 z-40 flex flex-col items-center justify-center text-white space-y-4">
              <Brain size={64} className="text-indigo-400 animate-pulse" />
              <h2 className="text-3xl font-bold">Are you still there?</h2>
              <p className="text-slate-300">We noticed you looked away for a while.</p>
              <button 
                onClick={() => {
                  setIsDistracted(false);
                  if (mainVideoRef.current) {
                    mainVideoRef.current.play();
                  }
                }}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-colors"
              >
                I'm back, resume video!
              </button>
            </div>
          )}

          <div className="aspect-video bg-black relative">
            <video 
              ref={mainVideoRef}
              src={videoResource ? videoResource.file_path : ''} 
              controls 
              className="w-full h-full object-contain"
              onPlay={() => setIsDistracted(false)}
            />
          </div>
          
          <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-3xl font-extrabold text-slate-800">{chapter.title}</h2>
              <p className="text-slate-500 mt-2 flex items-center space-x-2">
                <PlayCircle size={18} />
                <span>Video Lesson</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setFocusModeActive(!focusModeActive)}
                className={`flex items-center space-x-2 px-5 py-3 rounded-xl font-semibold transition-all shadow-sm ${
                  focusModeActive ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                }`}
              >
                <Eye size={20} />
                <span>{focusModeActive ? 'Focus Mode On' : 'Enable Focus Mode'}</span>
              </button>
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
                className={`flex-1 flex items-center justify-center py-3 px-4 ${
                  isRecording
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-pink-100 hover:bg-pink-200 text-pink-700'
                } font-semibold rounded-xl transition`}
              >
                <Mic size={20} className="mr-2" />
                {isRecording ? 'Stop Recording' : voiceProcessing ? 'Processing...' : 'Voice Assistant'}
              </button>
            </div>
          </div>
        </div>{/* End video card */}

            {/* AI Summary Output */}
            {summary && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
                <div className="flex items-center text-indigo-600 mb-3 font-bold">
                  <Sparkles size={20} className="mr-2" /> AI Summary
                </div>
                <p className="text-slate-700 leading-relaxed">{summary}</p>
              </div>
            )}

            {/* Voice Assistant Response */}
            {(voiceTranscribed || voiceTextResponse) && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-pink-100">
                <div className="flex items-center text-pink-600 mb-3 font-bold">
                  <Mic size={20} className="mr-2" /> Voice Assistant
                </div>
                {voiceTranscribed && (
                  <p className="text-slate-500 text-sm mb-2">
                    <span className="font-medium">You said:</span> "{voiceTranscribed}"
                  </p>
                )}
                {voiceTextResponse && (
                  <p className="text-slate-700 leading-relaxed">{voiceTextResponse}</p>
                )}
              </div>
            )}

            {/* Chatbot UI */}
            {showChatbot && (
               <AIChatbot chapterId={chapterId!} />
            )}

          </div>{/* End main content column */}

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
            
            {/* Practice Section — Wired to real pages */}
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-2xl shadow-md text-white">
              <h3 className="font-bold text-lg mb-2">Practice Time!</h3>
              <p className="text-indigo-100 text-sm mb-4">
                Generate flashcards or take a quiz based on this chapter.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/chapters/${chapterId}/flashcards`)}
                  className="w-full flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2.5 rounded-lg font-semibold transition"
                >
                  <Layers size={18} />
                  Flashcards
                </button>
                <button
                  onClick={() => navigate(`/chapters/${chapterId}/quiz`)}
                  className="w-full flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm py-2.5 rounded-lg font-semibold transition"
                >
                  <Brain size={18} />
                  Take Quiz
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ChapterContent;
