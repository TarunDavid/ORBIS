import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCw, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import api from '../api';

interface FlashcardData {
  front: string;
  back: string;
}

const FlashcardScreen = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();

  const [flashcards, setFlashcards] = useState<FlashcardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateFlashcards = async () => {
    setLoading(true);
    setError('');
    try {
      const studentId = localStorage.getItem('student_id');
      const res = await api.post('ai/flashcards/', {
        chapter_id: chapterId,
        student_id: studentId,
        count: 6,
      });
      setFlashcards(res.data.flashcards);
      setCurrentIndex(0);
      setIsFlipped(false);
    } catch (err) {
      console.error('Flashcard generation error', err);
      setError('Failed to generate flashcards. Make sure the AI backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateFlashcards();
  }, [chapterId]);

  const goNext = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
    }
  };

  const currentCard = flashcards[currentIndex];

  return (
    <div className="min-h-screen bg-canvas text-[#121316] font-jakarta pb-16">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="clay-btn bg-white text-[#121316] hover:bg-canvas px-4 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            <span>Back to Chapter</span>
          </button>
          
          <button
            onClick={generateFlashcards}
            disabled={loading}
            className="clay-btn bg-gold text-[#121316] hover:bg-yellow-400 px-4 py-2 text-sm flex items-center gap-2"
          >
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Regenerate</span>
          </button>
        </div>

        {/* Title Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center clay-circle bg-gold text-[#121316] p-3 mb-3 shadow-md">
            <Sparkles size={28} />
          </div>
          <h1 className="text-3xl md:text-5xl font-syne font-extrabold text-[#121316] tracking-tight mb-2">
            Active Recall Flashcards
          </h1>
          <p className="font-grotesk text-xs uppercase tracking-widest text-stone-600 font-bold">
            Tap the card to reveal the answer • On-Device AI Powered
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="clay-card bg-white p-12 flex flex-col items-center justify-center my-10 max-w-lg mx-auto text-center space-y-4">
            <div className="clay-spinner"></div>
            <p className="font-syne font-bold text-lg text-[#121316]">Generating flashcards...</p>
            <p className="font-grotesk text-xs uppercase tracking-wider text-stone-500">Extracting core concepts from chapter content</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="clay-card bg-white p-8 max-w-lg mx-auto border-l-[8px] border-l-coral text-center space-y-4">
            <p className="font-syne font-bold text-lg text-coral">{error}</p>
            <button
              onClick={generateFlashcards}
              className="clay-btn bg-coral text-white px-6 py-2.5 text-sm"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Flashcard Display */}
        {!loading && !error && flashcards.length > 0 && currentCard && (
          <>
            {/* Progress Segment Dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {flashcards.map((_, i) => (
                <div
                  key={i}
                  className={`transition-all ${
                    i === currentIndex 
                      ? 'w-8 h-3 bg-gold border-2 border-[#121316] rounded-full' 
                      : 'w-3 h-3 bg-stone-300 border-2 border-[#121316] rounded-full'
                  }`}
                />
              ))}
            </div>

            {/* Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="cursor-pointer mx-auto max-w-lg perspective-1000 select-none"
            >
              <div
                className="relative w-full min-h-[340px] transition-transform duration-500"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Front Side */}
                <div
                  className="absolute inset-0 clay-card-lg bg-white p-8 md:p-10 flex flex-col items-center justify-between text-center"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className="clay-chip bg-cobalt text-white px-3 py-1 text-xs">
                    Question {currentIndex + 1}
                  </span>
                  <p className="text-xl md:text-2xl font-syne font-bold text-[#121316] leading-relaxed my-auto">
                    {currentCard.front}
                  </p>
                  <span className="clay-chip bg-canvas text-stone-600 px-3 py-1 text-[11px]">
                    Tap to reveal answer 🔄
                  </span>
                </div>

                {/* Back Side */}
                <div
                  className="absolute inset-0 clay-card-lg bg-gold p-8 md:p-10 flex flex-col items-center justify-between text-center"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <span className="clay-chip bg-white text-[#121316] px-3 py-1 text-xs font-bold">
                    Answer
                  </span>
                  <p className="text-xl md:text-2xl font-jakarta font-bold text-[#121316] leading-relaxed my-auto">
                    {currentCard.back}
                  </p>
                  <span className="clay-chip bg-white/80 text-[#121316] px-3 py-1 text-[11px]">
                    Tap to see question 🔄
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-center gap-6 mt-8">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="clay-btn bg-white p-3.5 text-[#121316] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous card"
              >
                <ChevronLeft size={24} />
              </button>
              
              <div className="clay-chip bg-canvas px-5 py-2 text-sm font-bold text-[#121316] tracking-wider">
                {currentIndex + 1} / {flashcards.length}
              </div>
              
              <button
                onClick={goNext}
                disabled={currentIndex === flashcards.length - 1}
                className="clay-btn bg-white p-3.5 text-[#121316] disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next card"
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && !error && flashcards.length === 0 && (
          <div className="clay-card bg-white p-10 max-w-md mx-auto text-center space-y-4">
            <p className="font-syne font-bold text-lg text-stone-700">No flashcards generated yet.</p>
            <button
              onClick={generateFlashcards}
              className="clay-btn bg-gold text-[#121316] px-6 py-2.5 text-sm"
            >
              Generate Flashcards
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default FlashcardScreen;
