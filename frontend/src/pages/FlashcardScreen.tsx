import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCw, ChevronLeft, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
      <div className="max-w-3xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-500 hover:text-slate-800 transition font-medium"
          >
            <ArrowLeft className="mr-2" size={20} /> Back to Chapter
          </button>
          <button
            onClick={generateFlashcards}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 font-semibold rounded-xl transition disabled:opacity-50"
          >
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
            Regenerate
          </button>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">
            <Sparkles className="inline mr-2 text-amber-500" size={28} />
            Flashcards
          </h1>
          <p className="text-slate-500">Tap a card to reveal the answer</p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={48} className="animate-spin text-amber-500 mb-4" />
            <p className="text-slate-600 font-medium">Generating flashcards from chapter content...</p>
            <p className="text-slate-400 text-sm mt-1">This may take a moment</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-red-600 font-medium">{error}</p>
            <button
              onClick={generateFlashcards}
              className="mt-4 px-6 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold rounded-xl transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Flashcard Display */}
        {!loading && !error && flashcards.length > 0 && currentCard && (
          <>
            {/* Progress */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {flashcards.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === currentIndex ? 'w-8 bg-amber-500' : 'w-2 bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Card */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="cursor-pointer perspective-1000 mx-auto max-w-lg"
            >
              <div
                className={`relative w-full min-h-[280px] transition-transform duration-500 transform-style-preserve-3d ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.5s ease',
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 bg-white rounded-3xl shadow-xl border border-amber-100 p-8 flex flex-col items-center justify-center text-center"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-4">
                    Question
                  </span>
                  <p className="text-xl font-semibold text-slate-800 leading-relaxed">
                    {currentCard.front}
                  </p>
                  <span className="mt-6 text-sm text-slate-400">Tap to reveal answer</span>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-500 rounded-3xl shadow-xl p-8 flex flex-col items-center justify-center text-center"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <span className="text-xs font-bold text-amber-100 uppercase tracking-wider mb-4">
                    Answer
                  </span>
                  <p className="text-xl font-semibold text-white leading-relaxed">
                    {currentCard.back}
                  </p>
                  <span className="mt-6 text-sm text-amber-200">Tap to see question</span>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={24} className="text-slate-600" />
              </button>
              <span className="text-slate-600 font-semibold">
                {currentIndex + 1} / {flashcards.length}
              </span>
              <button
                onClick={goNext}
                disabled={currentIndex === flashcards.length - 1}
                className="p-3 bg-white rounded-xl shadow-sm hover:shadow-md transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={24} className="text-slate-600" />
              </button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && !error && flashcards.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-500 mb-4">No flashcards yet.</p>
            <button
              onClick={generateFlashcards}
              className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition"
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
