import React, { useState } from 'react';
import { Download, Upload, CheckCircle, AlertCircle, Loader } from 'lucide-react';
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
      // clear the file input
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-800">Local Content Sync</h1>
          <button 
            onClick={() => navigate('/dashboard')}
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Back to Dashboard
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Export / Teacher Mode */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
              <Download size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Teacher / Export Mode</h2>
              <p className="text-slate-600">Download the entire curriculum and media to share with student devices offline.</p>
            </div>
            
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            >
              {isExporting ? <Loader className="animate-spin" size={20} /> : <Download size={20} />}
              <span>{isExporting ? 'Creating .orbis package...' : 'Export to .orbis file'}</span>
            </button>
          </div>

          {/* Import / Student Mode */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <Upload size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Student / Import Mode</h2>
              <p className="text-slate-600">Select an .orbis file provided by your teacher to update your offline curriculum.</p>
            </div>
            
            <div className="w-full relative">
              <input
                type="file"
                accept=".orbis,.zip"
                onChange={handleImport}
                disabled={isImporting}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <button
                disabled={isImporting}
                className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
              >
                {isImporting ? <Loader className="animate-spin" size={20} /> : <Upload size={20} />}
                <span>{isImporting ? 'Importing content...' : 'Select .orbis file to Import'}</span>
              </button>
            </div>

            {importStatus.type && (
              <div className={`w-full p-4 rounded-xl flex items-start space-x-3 text-left ${importStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {importStatus.type === 'success' ? <CheckCircle className="shrink-0 mt-0.5" size={20} /> : <AlertCircle className="shrink-0 mt-0.5" size={20} />}
                <p className="font-medium text-sm">{importStatus.message}</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default SyncScreen;
