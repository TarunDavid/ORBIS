import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCw, ChevronLeft, ChevronRight, Sparkles, Shuffle, CheckCircle2, RotateCcw, Award } from 'lucide-react';
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
  const [masteredIndices, setMasteredIndices] = useState<Set<number>>(new Set());

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
      setMasteredIndices(new Set());
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

  const goNext = useCallback(() => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, flashcards.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);

  const toggleMastered = useCallback((idx: number) => {
    setMasteredIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
        // Auto-advance to next card if not at end
        if (currentIndex < flashcards.length - 1) {
          setTimeout(() => {
            setCurrentIndex(c => (c < flashcards.length - 1 ? c + 1 : c));
            setIsFlipped(false);
          }, 350);
        }
      }
      return next;
    });
  }, [currentIndex, flashcards.length]);

  const shuffleCards = () => {
    if (flashcards.length <= 1) return;
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setMasteredIndices(new Set());
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMastered(currentIndex);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, goNext, goPrev, toggleMastered]);

  const currentCard = flashcards[currentIndex];
  const isCurrentMastered = masteredIndices.has(currentIndex);
  const masteryCount = masteredIndices.size;
  const masteryPercentage = flashcards.length > 0 ? Math.round((masteryCount / flashcards.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-canvas text-[#121316] font-jakarta pb-16">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between gap-2 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="clay-btn bg-white text-[#121316] hover:bg-canvas px-4 py-2 text-sm flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            <span>Back to Chapter</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={shuffleCards}
              disabled={loading || flashcards.length <= 1}
              className="clay-btn bg-white text-[#121316] hover:bg-canvas px-3 py-2 text-sm flex items-center gap-1.5 disabled:opacity-30"
              title="Shuffle cards"
            >
              <Shuffle size={16} />
              <span className="hidden sm:inline">Shuffle</span>
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

          {/* Mastery Progress Bar */}
          {!loading && !error && flashcards.length > 0 && (
            <div className="mt-5 max-w-sm mx-auto">
              <div className="flex items-center justify-between text-xs font-grotesk font-bold uppercase tracking-wider mb-1.5">
                <span className="flex items-center gap-1 text-stone-600">
                  <Award size={14} className="text-amber-500" /> Mastery Progress
                </span>
                <span className="text-emerald-700">{masteryCount} of {flashcards.length} Mastered ({masteryPercentage}%)</span>
              </div>
              <div className="h-3 bg-white border-2 border-[#121316] rounded-full overflow-hidden p-0.5 shadow-sm">
                <div
                  className="h-full bg-mint rounded-full border border-[#121316] transition-all duration-300"
                  style={{ width: `${masteryPercentage}%` }}
                />
              </div>
            </div>
          )}
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
              {flashcards.map((_, i) => {
                const isMastered = masteredIndices.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentIndex(i);
                      setIsFlipped(false);
                    }}
                    title={`Go to Card ${i + 1}${isMastered ? ' (Mastered)' : ''}`}
                    className={`transition-all rounded-full border-2 border-[#121316] ${
                      i === currentIndex 
                        ? 'w-8 h-3.5 bg-gold shadow-sm' 
                        : isMastered
                        ? 'w-3.5 h-3.5 bg-mint'
                        : 'w-3.5 h-3.5 bg-stone-300 hover:bg-stone-400'
                    }`}
                  />
                );
              })}
            </div>

            {/* Flip Card Container */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="cursor-pointer mx-auto max-w-lg perspective-1000 select-none"
            >
              <div
                className="relative w-full min-h-[350px] transition-transform duration-500"
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
                  <div className="w-full flex items-center justify-between">
                    <span className="clay-chip bg-cobalt text-white px-3 py-1 text-xs font-bold">
                      Question {currentIndex + 1}
                    </span>
                    {isCurrentMastered && (
                      <span className="clay-chip bg-mint text-[#121316] px-2.5 py-1 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 size={13} /> Mastered
                      </span>
                    )}
                  </div>

                  <p className="text-xl md:text-2xl font-syne font-bold text-[#121316] leading-relaxed my-auto px-2">
                    {currentCard.front}
                  </p>

                  <div className="flex items-center gap-2 text-stone-500 text-xs font-grotesk font-bold">
                    <RotateCcw size={14} />
                    <span>Tap or press Space to reveal answer</span>
                  </div>
                </div>

                {/* Back Side */}
                <div
                  className="absolute inset-0 clay-card-lg bg-gold p-8 md:p-10 flex flex-col items-center justify-between text-center"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="clay-chip bg-white text-[#121316] px-3 py-1 text-xs font-bold">
                      Answer
                    </span>
                    {isCurrentMastered && (
                      <span className="clay-chip bg-white text-emerald-800 px-2.5 py-1 text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 size={13} /> Mastered
                      </span>
                    )}
                  </div>

                  <p className="text-xl md:text-2xl font-jakarta font-bold text-[#121316] leading-relaxed my-auto px-2">
                    {currentCard.back}
                  </p>

                  <div className="flex items-center gap-2 text-[#121316]/70 text-xs font-grotesk font-bold">
                    <RotateCcw size={14} />
                    <span>Tap or press Space to view question</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Mastery & Flip Action Buttons */}
            <div className="flex items-center justify-center gap-3 mt-6 max-w-lg mx-auto">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMastered(currentIndex);
                }}
                className={`clay-btn px-4 py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all ${
                  isCurrentMastered
                    ? 'bg-stone-200 text-[#121316] hover:bg-stone-300'
                    : 'bg-mint text-[#121316] hover:bg-emerald-400'
                }`}
              >
                <CheckCircle2 size={16} />
                <span>{isCurrentMastered ? 'Mark Unmastered' : 'Got it! (Mastered)'}</span>
              </button>

              <button
                onClick={() => setIsFlipped(!isFlipped)}
                className="clay-btn bg-white text-[#121316] px-4 py-2.5 text-xs sm:text-sm font-bold flex items-center gap-1.5"
              >
                <RotateCw size={14} />
                <span>Flip Card</span>
              </button>
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center justify-center gap-6 mt-6">
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

            {/* Keyboard Shortcuts Helper */}
            <div className="mt-8 text-center text-xs text-stone-500 font-grotesk font-medium flex items-center justify-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-300 rounded text-[10px] font-mono shadow-xs">Space</kbd> Flip
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-300 rounded text-[10px] font-mono shadow-xs">←</kbd>
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-300 rounded text-[10px] font-mono shadow-xs">→</kbd> Navigate
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white border border-stone-300 rounded text-[10px] font-mono shadow-xs">M</kbd> Toggle Mastered
              </span>
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
