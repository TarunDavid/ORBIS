import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import TeacherHeader from '../../components/TeacherHeader';
import {
  Upload, FileText, Film, Presentation, BookOpen,
  CheckCircle, AlertCircle, X,
} from 'lucide-react';

interface GradeData {
  id: number;
  name: string;
  subjects: {
    id: number;
    name: string;
    identifier: string;
    chapters: { id: number; title: string; order: number }[];
  }[];
}

const CONTENT_TYPE_OPTIONS = [
  { value: 'video', label: 'Video', icon: Film, accept: '.mp4,.mkv,.webm,.avi,.mov' },
  { value: 'notes', label: 'Notes (PDF)', icon: FileText, accept: '.pdf,.doc,.docx' },
  { value: 'ppt', label: 'Presentation', icon: Presentation, accept: '.ppt,.pptx,.odp,.key' },
  { value: 'textbook', label: 'Textbook', icon: BookOpen, accept: '.pdf' },
];

interface UploadResult {
  filename: string;
  success: boolean;
  error?: string;
}

const ContentUpload = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [grades, setGrades] = useState<GradeData[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null);
  const [contentType, setContentType] = useState('video');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    fetchSubjectsChapters();
  }, []);

  const fetchSubjectsChapters = async () => {
    try {
      const res = await api.get('teacher/subjects-chapters/');
      setGrades(res.data);
      // Auto-select first grade
      if (res.data.length > 0) {
        setSelectedGradeId(res.data[0].id);
      }
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate('/teacher');
      }
    }
  };

  const selectedGrade = grades.find(g => g.id === selectedGradeId);
  const selectedSubject = selectedGrade?.subjects.find(s => s.id === selectedSubjectId);
  const chapters = selectedSubject?.chapters || [];
  const currentContentType = CONTENT_TYPE_OPTIONS.find(c => c.value === contentType)!;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
      setResults([]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const handleUpload = async () => {
    if (!selectedSubjectId || !selectedChapterId || files.length === 0) return;

    setUploading(true);
    setProgress(0);
    setError('');
    setResults([]);

    const uploadResults: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subject_id', selectedSubjectId.toString());
      formData.append('chapter_id', selectedChapterId.toString());
      formData.append('content_type', contentType);

      try {
        await api.post('teacher/content/upload/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            const fileProgress = progressEvent.total
              ? (progressEvent.loaded / progressEvent.total) * 100
              : 0;
            // Combined progress across all files
            const overallProgress = ((i / files.length) * 100) + (fileProgress / files.length);
            setProgress(Math.round(overallProgress));
          },
        });
        uploadResults.push({ filename: file.name, success: true });
      } catch (err: any) {
        const msg = err?.response?.data?.results?.[0]?.error || err?.response?.data?.error || 'Upload failed';
        uploadResults.push({ filename: file.name, success: false, error: msg });
      }
    }

    setProgress(100);
    setResults(uploadResults);
    setUploading(false);

    // Clear files if all succeeded
    if (uploadResults.every(r => r.success)) {
      setTimeout(() => {
        setFiles([]);
        setProgress(0);
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <TeacherHeader />

      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight mb-2">
          Upload Content
        </h1>
        <p className="text-on-surface-variant font-jakarta mb-8">
          Add videos, notes, and presentations to your curriculum
        </p>

        {/* Configuration */}
        <div className="clay-card bg-white p-6 mb-6">
          <h3 className="font-syne text-lg font-bold text-structural mb-4">Content Details</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Grade */}
            <div className="space-y-1.5">
              <label className="label-text text-[10px] text-on-surface-variant">Grade</label>
              <select
                value={selectedGradeId || ''}
                onChange={(e) => {
                  setSelectedGradeId(Number(e.target.value));
                  setSelectedSubjectId(null);
                  setSelectedChapterId(null);
                }}
                className="clay-select w-full px-4 py-2.5 text-sm"
                id="upload-grade-select"
              >
                <option value="">Select Grade</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <label className="label-text text-[10px] text-on-surface-variant">Subject</label>
              <select
                value={selectedSubjectId || ''}
                onChange={(e) => {
                  setSelectedSubjectId(Number(e.target.value));
                  setSelectedChapterId(null);
                }}
                className="clay-select w-full px-4 py-2.5 text-sm"
                disabled={!selectedGradeId}
                id="upload-subject-select"
              >
                <option value="">Select Subject</option>
                {selectedGrade?.subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Chapter */}
            <div className="space-y-1.5">
              <label className="label-text text-[10px] text-on-surface-variant">Chapter</label>
              <select
                value={selectedChapterId || ''}
                onChange={(e) => setSelectedChapterId(Number(e.target.value))}
                className="clay-select w-full px-4 py-2.5 text-sm"
                disabled={!selectedSubjectId}
                id="upload-chapter-select"
              >
                <option value="">Select Chapter</option>
                {chapters.map(ch => (
                  <option key={ch.id} value={ch.id}>Ch {ch.order}: {ch.title}</option>
                ))}
              </select>
            </div>

            {/* Content Type */}
            <div className="space-y-1.5">
              <label className="label-text text-[10px] text-on-surface-variant">Content Type</label>
              <select
                value={contentType}
                onChange={(e) => {
                  setContentType(e.target.value);
                  setFiles([]);
                }}
                className="clay-select w-full px-4 py-2.5 text-sm"
                id="upload-type-select"
              >
                {CONTENT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Drag & Drop Zone */}
        <div
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`upload-dropzone ${isDragging ? 'upload-dropzone-active' : ''}`}
          id="upload-dropzone"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={currentContentType.accept}
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />
          <div className={`w-16 h-16 clay-circle ${isDragging ? 'bg-cobalt' : 'bg-canvas'} flex items-center justify-center mb-4`}>
            <Upload size={28} className={isDragging ? 'text-white' : 'text-on-surface-variant'} />
          </div>
          <p className="font-syne text-lg font-bold text-structural">
            {isDragging ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="text-on-surface-variant text-sm font-jakarta mt-1">
            or click to browse · Accepts {currentContentType.accept}
          </p>
        </div>

        {/* Selected Files List */}
        {files.length > 0 && (
          <div className="clay-card bg-white p-6 mt-4">
            <h3 className="font-syne text-base font-bold text-structural mb-3 flex items-center gap-2">
              <FileText size={16} />
              Selected Files ({files.length})
            </h3>
            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-canvas rounded-clay-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <currentContentType.icon size={16} className="text-cobalt flex-shrink-0" />
                    <span className="font-jakarta text-sm text-structural truncate">{file.name}</span>
                    <span className="text-on-surface-variant text-xs flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="text-on-surface-variant hover:text-coral transition-colors p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Upload Button + Progress */}
            <div className="mt-4">
              {uploading ? (
                <div className="space-y-3">
                  <div className="w-full h-4 bg-canvas rounded-full border-2 border-structural overflow-hidden">
                    <div
                      className="h-full bg-cobalt transition-all duration-300 rounded-full"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <p className="text-center font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">
                    Uploading... {progress}%
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleUpload}
                  disabled={!selectedSubjectId || !selectedChapterId || files.length === 0}
                  className="clay-btn bg-cobalt text-white w-full py-3 text-sm flex items-center justify-center gap-2"
                  id="upload-submit-btn"
                >
                  <Upload size={16} />
                  Upload {files.length} file{files.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Upload Results */}
        {results.length > 0 && (
          <div className="clay-card bg-white p-6 mt-4">
            <h3 className="font-syne text-base font-bold text-structural mb-3">Upload Results</h3>
            <div className="space-y-2">
              {results.map((result, i) => (
                <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-clay-sm ${result.success ? 'bg-mint/10' : 'bg-coral/10'}`}>
                  {result.success ? (
                    <CheckCircle size={16} className="text-mint flex-shrink-0" />
                  ) : (
                    <AlertCircle size={16} className="text-coral flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="font-jakarta text-sm text-structural">{result.filename}</span>
                    {result.error && (
                      <p className="text-coral text-xs mt-0.5">{result.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="clay-card bg-coral/10 border-coral p-4 mt-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-coral flex-shrink-0" />
            <span className="text-coral text-sm font-jakarta">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentUpload;
