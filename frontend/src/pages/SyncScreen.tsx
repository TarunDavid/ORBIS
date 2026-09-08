import React, { useState } from 'react';
import { Download, Upload, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SyncScreen = () => {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await api.get('sync/export/', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'curriculum_sync.orbis');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed', error);
      alert('Failed to export curriculum.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    setIsImporting(true);
    setImportStatus({ type: null, message: '' });
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await api.post('sync/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportStatus({ type: 'success', message: response.data.message || 'Successfully synchronized curriculum!' });
    } catch (error: any) {
      console.error('Import failed', error);
      setImportStatus({ type: 'error', message: error.response?.data?.error || 'Failed to import curriculum.' });
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12 text-[#121316] font-jakarta pb-16">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="clay-chip bg-mint text-[#121316] px-3 py-1 text-xs inline-flex items-center gap-2 mb-2">
              <span className="neon-dot"></span>
              <span>PEER-TO-PEER DATA SYNC</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-syne font-extrabold text-[#121316] tracking-tight">
              Local Content Sync
            </h1>
          </div>
          
          <button 
            onClick={() => navigate('/dashboard')}
            className="clay-btn bg-white text-[#121316] hover:bg-canvas px-4 py-2 text-sm flex items-center gap-2 self-start sm:self-auto"
          >
            <ArrowLeft size={18} />
            <span>Back to Dashboard</span>
          </button>
        </div>

        {/* Sync Action Cards */}
        <div className="grid md:grid-cols-2 gap-8 pt-4">
          
          {/* Export / Teacher Mode */}
          <div className="clay-card-lg bg-white p-8 md:p-10 flex flex-col items-center text-center space-y-6 relative overflow-hidden">
            <div className="clay-circle bg-cobalt text-white p-4 shadow-md">
              <Download size={36} />
            </div>
            
            <div>
              <span className="clay-chip bg-canvas text-[#121316] px-3 py-1 text-[11px] mb-2 inline-block">
                TEACHER MODE
              </span>
              <h2 className="text-2xl font-syne font-extrabold text-[#121316] mb-2">Export Curriculum</h2>
              <p className="text-stone-600 text-sm leading-relaxed">
                Bundle the complete curriculum, video lessons, and media into an offline <code className="font-grotesk font-bold bg-canvas px-1.5 py-0.5 rounded border border-[#121316]">.orbis</code> package to share via USB or Wi-Fi Direct.
              </p>
            </div>
            
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="clay-btn w-full py-3.5 px-6 bg-cobalt text-white hover:bg-blue-700 flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <div className="clay-spinner w-5 h-5 border-2 border-white border-t-gold"></div>
                  <span>Creating .orbis package...</span>
                </>
              ) : (
                <>
                  <Download size={20} />
                  <span>Export to .orbis File</span>
                </>
              )}
            </button>
          </div>

          {/* Import / Student Mode */}
          <div className="clay-card-lg bg-white p-8 md:p-10 flex flex-col items-center text-center space-y-6 relative overflow-hidden">
            <div className="clay-circle bg-gold text-[#121316] p-4 shadow-md">
              <Upload size={36} />
            </div>
            
            <div>
              <span className="clay-chip bg-canvas text-[#121316] px-3 py-1 text-[11px] mb-2 inline-block">
                STUDENT MODE
              </span>
              <h2 className="text-2xl font-syne font-extrabold text-[#121316] mb-2">Import Curriculum</h2>
              <p className="text-stone-600 text-sm leading-relaxed">
                Load a <code className="font-grotesk font-bold bg-canvas px-1.5 py-0.5 rounded border border-[#121316]">.orbis</code> package provided by your teacher or peer to instantly update your local offline library.
              </p>
            </div>
            
            <div className="w-full relative">
              <input
                type="file"
                accept=".orbis,.zip"
                onChange={handleImport}
                disabled={isImporting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
              />
              <button
                disabled={isImporting}
                className="clay-btn w-full py-3.5 px-6 bg-gold text-[#121316] hover:bg-yellow-400 flex items-center justify-center gap-2 text-sm tracking-wide disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <div className="clay-spinner w-5 h-5 border-2 border-[#121316] border-t-white"></div>
                    <span>Importing Content...</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    <span>Select .orbis File</span>
                  </>
                )}
              </button>
            </div>

            {importStatus.type && (
              <div className={`w-full p-4 rounded-xl border-2 border-[#121316] flex items-start gap-3 text-left ${
                importStatus.type === 'success' 
                  ? 'bg-mint/30 text-[#121316]' 
                  : 'bg-coral/20 text-coral'
              }`}>
                {importStatus.type === 'success' ? (
                  <CheckCircle className="shrink-0 mt-0.5 text-emerald-700" size={20} />
                ) : (
                  <AlertCircle className="shrink-0 mt-0.5 text-coral" size={20} />
                )}
                <p className="font-grotesk font-bold text-xs uppercase tracking-wide">{importStatus.message}</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default SyncScreen;
