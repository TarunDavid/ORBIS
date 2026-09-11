import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Sparkles, MessageCircle, Mic, FileText, Book, PlayCircle, Layers, Brain, Eye, Presentation } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
  subject_name?: string;
  subject_identifier?: string;
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
      const audio = new Audio(`http://localhost:8000${encodeURI(res.data.audio_url)}`);
      audio.play();
    } catch (error) {
      console.error('Voice Assistant Error', error);
      setVoiceTextResponse('Failed to process voice. Please try again.');
    } finally {
      setVoiceProcessing(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center items-center gap-4">
      <div className="clay-spinner"></div>
      <p className="font-grotesk font-bold text-sm tracking-widest text-[#121316] uppercase">Loading Chapter...</p>
    </div>
  );

  if (!chapter) return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-10">
      <div className="clay-card bg-white p-8 max-w-md text-center">
        <p className="font-syne font-bold text-xl mb-4 text-[#121316]">Chapter not found.</p>
        <button onClick={() => navigate(-1)} className="clay-btn bg-cobalt text-white px-6 py-2">
          Go Back
        </button>
      </div>
    </div>
  );

  const getMediaUrl = (filePath?: string) => {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    const base = `http://${window.location.hostname || 'localhost'}:8000`;
    return `${base}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
  };

  const videoResource = chapter.resources.find(r => r.resource_type === 'video');
  const notesResource = chapter.resources.find(r => r.resource_type === 'notes');
  const textbookResource = chapter.resources.find(r => r.resource_type === 'textbook');
  const pptResource = chapter.resources.find(r => r.resource_type === 'ppt' || r.resource_type === 'presentation');

  return (
    <div className="min-h-screen bg-canvas text-[#121316] font-jakarta pb-16">
      <div className="max-w-6xl mx-auto p-4 md:p-6 lg:p-8">
        
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <button 
            onClick={() => navigate(-1)}
            className="clay-btn bg-white text-[#121316] hover:bg-canvas px-4 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            <span>Back to Chapters</span>
          </button>

          <div className="clay-chip bg-mint text-[#121316] px-3.5 py-1 flex items-center gap-2 shadow-sm">
            <span className="neon-dot"></span>
            <span>Offline Ready</span>
          </div>
        </div>

        {/* Title and Badge */}
        <div className="mb-8">
          <div className="inline-block clay-chip bg-gold text-[#121316] px-3 py-1 text-xs mb-2">
            CHAPTER {chapter.order || 1}
          </div>
          <h1 className="text-3xl md:text-5xl font-syne font-extrabold text-[#121316] tracking-tight">
            {chapter.title}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Area */}
          <div className="space-y-8 lg:col-span-2">
            
            {/* Video Player Section */}
            <div className="clay-card-lg bg-white overflow-hidden relative">
              
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
                  onFocused={() => {}}
                />
              )}

              {isDistracted && (
                <div className="absolute inset-0 bg-[#121316]/90 z-40 flex flex-col items-center justify-center text-white p-6 text-center space-y-4 backdrop-blur-sm">
                  <div className="clay-circle bg-lilac text-[#121316] p-4">
                    <Brain size={48} className="animate-pulse" />
                  </div>
                  <h2 className="text-3xl font-syne font-extrabold text-gold">Are you still there?</h2>
                  <p className="text-stone-300 font-jakarta max-w-sm">We noticed you looked away for a while. Let's stay focused on the lesson!</p>
                  <button 
                    onClick={() => {
                      setIsDistracted(false);
                      if (mainVideoRef.current) {
                        mainVideoRef.current.play();
                      }
                    }}
                    className="clay-btn bg-gold text-[#121316] px-6 py-3 font-grotesk font-bold text-sm tracking-wide"
                  >
                    I'm back, resume video!
                  </button>
                </div>
              )}

              <div className="aspect-video bg-[#121316] relative border-b-[3px] border-[#121316]">
                {videoResource ? (
                  <video 
                    ref={mainVideoRef}
                    src={getMediaUrl(videoResource.file_path)}
                    controls 
                    className="w-full h-full object-contain"
                    onPlay={() => setIsDistracted(false)}
                  />
                ) : (
                  <div className="w-full h-full video-placeholder">
                    <div className="video-placeholder-icon">
                      <PlayCircle size={36} className="text-stone-500" />
                    </div>
                    <p className="font-grotesk font-bold text-sm uppercase tracking-wider text-stone-500">No video available yet</p>
                    <p className="font-jakarta text-xs text-stone-600">Sync content from your teacher's device to get started</p>
                  </div>
                )}
              </div>
              
              <div className="p-6 md:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-syne font-extrabold text-[#121316]">{chapter.title}</h2>
                    <p className="text-stone-600 mt-1 flex items-center gap-2 font-grotesk text-sm font-semibold">
                      <PlayCircle size={18} className="text-cobalt" />
                      <span>Interactive Video Lesson</span>
                    </p>
                  </div>

                  <button
                    onClick={() => setFocusModeActive(!focusModeActive)}
                    className={`clay-btn px-4 py-2.5 flex items-center gap-2 text-sm font-grotesk transition-all ${
                      focusModeActive 
                        ? 'bg-cobalt text-white' 
                        : 'bg-canvas text-[#121316] hover:bg-white'
                    }`}
                  >
                    <Eye size={18} />
                    <span>{focusModeActive ? 'Focus Mode ON' : 'Enable Focus Mode'}</span>
                  </button>
                </div>

                {/* Tactical Action Buttons Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <button 
                    onClick={handleSummarize}
                    disabled={isSummarizing}
                    className="clay-btn py-3 px-4 bg-gold text-[#121316] font-grotesk font-bold flex items-center justify-center gap-2 text-sm"
                  >
                    <Sparkles size={18} />
                    <span>{isSummarizing ? 'Summarizing...' : 'Summarize Video'}</span>
                  </button>
                  
                  <button 
                    onClick={() => setShowChatbot(!showChatbot)}
                    className={`clay-btn py-3 px-4 font-grotesk font-bold flex items-center justify-center gap-2 text-sm transition-all ${
                      showChatbot 
                        ? 'bg-lilac text-[#121316] ring-2 ring-[#121316]' 
                        : 'bg-canvas hover:bg-lilac text-[#121316]'
                    }`}
                  >
                    <MessageCircle size={18} />
                    <span>AI Chatbot</span>
                  </button>
                  
                  <button 
                    onClick={handleVoiceAssistantToggle}
                    className={`clay-btn py-3 px-4 font-grotesk font-bold flex items-center justify-center gap-2 text-sm ${
                      isRecording
                        ? 'bg-coral text-white animate-pulse'
                        : 'bg-canvas hover:bg-coral hover:text-white text-[#121316]'
                    }`}
                  >
                    <Mic size={18} />
                    <span>{isRecording ? 'Stop Recording' : voiceProcessing ? 'Processing...' : 'Voice Assistant'}</span>
                  </button>
                </div>
              </div>
            </div>{/* End video card */}

            {/* AI Summary Output */}
            {summary && (
              <div className="clay-card bg-white p-6 md:p-8 relative overflow-hidden border-l-[8px] border-l-cobalt">
                <div className="flex items-center gap-3 mb-4">
                  <div className="clay-circle bg-gold p-2 text-[#121316]">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-syne font-extrabold text-xl text-[#121316]">AI Chapter Summary</h3>
                    <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider">Key Takeaways & Concepts</p>
                  </div>
                </div>
                <div className="prose prose-slate max-w-none text-stone-800 leading-relaxed font-jakarta">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Voice Assistant Response */}
            {(voiceTranscribed || voiceTextResponse) && (
              <div className="clay-card bg-white p-6 md:p-8 relative overflow-hidden border-l-[8px] border-l-coral">
                <div className="flex items-center gap-3 mb-4">
                  <div className="clay-circle bg-coral text-white p-2">
                    <Mic size={20} />
                  </div>
                  <div>
                    <h3 className="font-syne font-extrabold text-xl text-[#121316]">Voice Assistant Response</h3>
                    <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider">Audio Doubt Solver</p>
                  </div>
                </div>
                {voiceTranscribed && (
                  <div className="clay-card-sm bg-canvas p-3 mb-4">
                    <span className="font-grotesk font-bold text-xs uppercase tracking-wide text-coral mr-2">You asked:</span>
                    <span className="text-stone-700 italic font-medium">"{voiceTranscribed}"</span>
                  </div>
                )}
                {voiceTextResponse && (
                  <p className="text-stone-800 leading-relaxed font-jakarta font-medium">{voiceTextResponse}</p>
                )}
              </div>
            )}

            {/* Chatbot UI */}
            {showChatbot && (
              <div className="pt-2">
                <AIChatbot 
                  chapterId={chapterId!} 
                  chapterTitle={chapter?.title}
                  subjectIdentifier={chapter?.subject_identifier}
                  subjectName={chapter?.subject_name}
                />
              </div>
            )}

          </div>{/* End main content column */}

          {/* Sidebar / Resources */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Chapter Resources Box */}
            <div className="clay-card bg-white p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b-2 border-stone-200">
                <h3 className="font-syne font-extrabold text-xl text-[#121316]">Resources</h3>
                <span className="clay-chip bg-canvas text-[#121316] px-2 py-0.5 text-[10px]">OFFLINE FILES</span>
              </div>
              
              <div className="space-y-3">
                {notesResource ? (
                  <a 
                    href={getMediaUrl(notesResource.file_path)} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="clay-card-sm bg-canvas hover:bg-white p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5 group block"
                  >
                    <div className="clay-circle bg-cobalt text-white p-2.5 flex-shrink-0 group-hover:scale-105 transition-transform">
                      <FileText size={22} />
                    </div>
                    <div>
                      <h4 className="font-syne font-bold text-sm text-[#121316]">Chapter Notes</h4>
                      <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider mt-0.5">PDF Document</p>
                    </div>
                  </a>
                ) : (
                  <div className="clay-card-sm bg-stone-100 p-4 flex items-center gap-3 opacity-60">
                    <FileText size={22} className="text-stone-400" />
                    <span className="font-grotesk text-xs uppercase tracking-wide text-stone-500 font-bold">No Notes Available</span>
                  </div>
                )}

                {pptResource ? (
                  <a 
                    href={getMediaUrl(pptResource.file_path)} 
                    target="_blank" 
                    rel="noreferrer" 
                    download
                    className="clay-card-sm bg-canvas hover:bg-white p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5 group block"
                  >
                    <div className="clay-circle bg-coral text-white p-2.5 flex-shrink-0 group-hover:scale-105 transition-transform">
                      <Presentation size={22} />
                    </div>
                    <div>
                      <h4 className="font-syne font-bold text-sm text-[#121316]">Presentation Slides</h4>
                      <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider mt-0.5">PowerPoint / Slides</p>
                    </div>
                  </a>
                ) : (
                  <div className="clay-card-sm bg-stone-100 p-4 flex items-center gap-3 opacity-60">
                    <Presentation size={22} className="text-stone-400" />
                    <span className="font-grotesk text-xs uppercase tracking-wide text-stone-500 font-bold">No Slides Available</span>
                  </div>
                )}

                {textbookResource ? (
                  <a 
                    href={getMediaUrl(textbookResource.file_path)} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="clay-card-sm bg-canvas hover:bg-white p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5 group block"
                  >
                    <div className="clay-circle bg-mint text-[#121316] p-2.5 flex-shrink-0 group-hover:scale-105 transition-transform">
                      <Book size={22} />
                    </div>
                    <div>
                      <h4 className="font-syne font-bold text-sm text-[#121316]">Textbook Excerpt</h4>
                      <p className="font-grotesk text-xs text-stone-500 uppercase tracking-wider mt-0.5">PDF Document</p>
                    </div>
                  </a>
                ) : (
                  <div className="clay-card-sm bg-stone-100 p-4 flex items-center gap-3 opacity-60">
                    <Book size={22} className="text-stone-400" />
                    <span className="font-grotesk text-xs uppercase tracking-wide text-stone-500 font-bold">No Textbook Available</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Practice Section — Neo-Clay Gold Punch Card */}
            <div className="clay-card bg-gold p-6 text-[#121316] relative overflow-hidden">
              <div className="flex items-center justify-between mb-3">
                <span className="clay-chip bg-white text-[#121316] px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider">
                  EXAM DRILL
                </span>
                <span className="text-xl">⚡</span>
              </div>
              
              <h3 className="font-syne font-extrabold text-2xl text-[#121316] mb-1">Practice Time!</h3>
              <p className="font-jakarta text-sm text-[#121316]/80 mb-5 font-medium">
                Test your mastery with AI flashcards or a quick chapter quiz.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/chapters/${chapterId}/flashcards`)}
                  className="clay-btn w-full bg-white text-[#121316] hover:bg-stone-50 py-3 flex items-center justify-center gap-2.5 text-sm font-bold"
                >
                  <Layers size={18} className="text-cobalt" />
                  <span>Flashcards</span>
                </button>
                <button
                  onClick={() => navigate(`/chapters/${chapterId}/quiz`)}
                  className="clay-btn w-full bg-cobalt text-white hover:bg-blue-700 py-3 flex items-center justify-center gap-2.5 text-sm font-bold"
                >
                  <Brain size={18} className="text-gold" />
                  <span>Take Chapter Quiz</span>
                </button>
              </div>
            </div>

          </div>{/* End sidebar */}

        </div>
      </div>
    </div>
  );
};

export default ChapterContent;
