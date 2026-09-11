import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css'; // MUST import for math rendering

interface FormulaSheet {
  id: number;
  chapter: number;
  content: string;
  created_at: string;
}

export default function FormulaSheetScreen() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  
  const [sheet, setSheet] = useState<FormulaSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/formula-sheets/?chapter_id=${chapterId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setSheet(data[0]);
        } else {
          setError('No formula sheet found for this chapter.');
        }
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load formula sheet.');
      })
      .finally(() => setLoading(false));
  }, [chapterId]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 relative">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center text-secondary hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-2" />
        Back to Chapter
      </button>

      <div className="bg-surface rounded-2xl shadow-soft p-8 border border-border/50">
        <div className="flex items-center space-x-4 mb-8 pb-6 border-b border-border/50">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Formula Sheet</h1>
            <p className="text-secondary text-sm mt-1">Review key formulas and equations</p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-secondary">Loading formulas...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-error">
            <p>{error}</p>
          </div>
        ) : sheet ? (
          <div className="prose prose-lg dark:prose-invert max-w-none prose-p:text-text-primary prose-headings:text-text-primary prose-strong:text-primary">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {sheet.content}
            </ReactMarkdown>
          </div>
        ) : null}
      </div>
    </div>
  );
}
